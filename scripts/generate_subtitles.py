#!/usr/bin/env python3

import argparse
import json
import os
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1_000)

    return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"


def ass_timestamp(seconds: float) -> str:
    centiseconds = max(0, round(seconds * 100))
    hours, centiseconds = divmod(centiseconds, 360_000)
    minutes, centiseconds = divmod(centiseconds, 6_000)
    secs, centiseconds = divmod(centiseconds, 100)

    return f"{hours}:{minutes:02}:{secs:02}.{centiseconds:02}"


def escape_ass_text(text: str) -> str:
    return (
        text.replace("\\", r"\\")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("\n", r"\N")
    )

def wrap_caption(text: str, max_chars_per_line: int = 32) -> str:
    words = " ".join(str(text or "").split()).split(" ")

    lines: list[str] = []
    current = ""

    for word in words:
        if not word:
            continue

        candidate = f"{current} {word}".strip()

        if len(candidate) <= max_chars_per_line:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return r"\N".join(lines)
def write_srt(segments: list[dict], output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8") as file:
        for index, segment in enumerate(segments, start=1):
            file.write(f"{index}\n")
            file.write(
                f"{srt_timestamp(segment['start'])} --> "
                f"{srt_timestamp(segment['end'])}\n"
            )
            file.write(f"{segment['text']}\n\n")

def write_ass(segments: list[dict], output_path: Path) -> None:
    header = """[Script Info]
Title: WonderWave Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,54,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,100,100,240,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    with output_path.open("w", encoding="utf-8") as file:
        file.write(header)

        for segment in segments:
            text = wrap_caption(
                escape_ass_text(segment["text"]),
                max_chars_per_line=26,
            )

            file.write(
                "Dialogue: 0,"
                f"{ass_timestamp(segment['start'])},"
                f"{ass_timestamp(segment['end'])},"
                f"Default,,0,0,0,,{text}\n"
            )

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate subtitle files using faster-whisper."
    )
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="en")

    args = parser.parse_args()

    audio_path = Path(args.audio).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not audio_path.is_file():
        print(
            f"Audio file does not exist: {audio_path}",
            file=sys.stderr,
        )
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
    )

    whisper_segments, info = model.transcribe(
        str(audio_path),
        language=args.language,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
    )

    segments: list[dict] = []

    for segment in whisper_segments:
        text = segment.text.strip()

        if not text:
            continue

        words = []

        if segment.words:
            for word in segment.words:
                words.append(
                    {
                        "word": word.word.strip(),
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "probability": round(word.probability, 4),
                    }
                )

        segments.append(
            {
                "index": len(segments) + 1,
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text,
                "words": words,
            }
        )

    if not segments:
        print("Whisper returned no subtitle segments.", file=sys.stderr)
        return 1

    srt_path = output_dir / "subtitles.srt"
    ass_path = output_dir / "subtitles.ass"
    json_path = output_dir / "subtitles.json"

    write_srt(segments, srt_path)
    write_ass(segments, ass_path)

    metadata = {
        "audio": str(audio_path),
        "language": info.language,
        "languageProbability": round(info.language_probability, 4),
        "duration": round(info.duration, 3),
        "durationAfterVad": round(info.duration_after_vad, 3),
        "model": args.model,
        "device": args.device,
        "computeType": args.compute_type,
        "segmentCount": len(segments),
        "segments": segments,
    }

    with json_path.open("w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2, ensure_ascii=False)

    result = {
        "srt": str(srt_path),
        "ass": str(ass_path),
        "json": str(json_path),
        "duration": metadata["duration"],
        "segmentCount": len(segments),
        "language": metadata["language"],
    }

    print(json.dumps(result))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
