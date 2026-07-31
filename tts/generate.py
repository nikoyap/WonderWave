#!/usr/bin/env python3

import argparse
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24000


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Generate WonderWave narration using Kokoro TTS."
    )

    parser.add_argument(
        "input_file",
        help="Path to the source text file.",
    )

    parser.add_argument(
        "output_file",
        help="Path where the generated WAV file will be saved.",
    )

    parser.add_argument(
        "--voice",
        default="af_heart",
        help="Kokoro voice ID. Default: af_heart",
    )

    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Speech speed. Default: 1.0",
    )

    parser.add_argument(
        "--language",
        default="a",
        help="Kokoro language code. Default: a for American English",
    )

    return parser.parse_args()


def main():
    args = parse_arguments()

    input_path = Path(args.input_file).resolve()
    output_path = Path(args.output_file).resolve()

    if not input_path.is_file():
        print(
            f"Input file does not exist: {input_path}",
            file=sys.stderr,
        )
        return 1

    text = input_path.read_text(encoding="utf-8").strip()

    if not text:
        print(
            f"Input file is empty: {input_path}",
            file=sys.stderr,
        )
        return 1

    if args.speed <= 0:
        print(
            "Speech speed must be greater than zero.",
            file=sys.stderr,
        )
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[TTS] Loading Kokoro pipeline")
    print(f"[TTS] Voice: {args.voice}")
    print(f"[TTS] Speed: {args.speed}")
    print(f"[TTS] Input: {input_path}")
    print(f"[TTS] Output: {output_path}")

    pipeline = KPipeline(lang_code=args.language)

    generator = pipeline(
        text,
        voice=args.voice,
        speed=args.speed,
        split_pattern=r"\n+",
    )

    audio_segments = []

    for index, (_, _, audio) in enumerate(generator, start=1):
        if audio is None:
            continue

        audio_array = np.asarray(audio, dtype=np.float32)

        if audio_array.size == 0:
            continue

        audio_segments.append(audio_array)

        print(
            f"[TTS] Generated segment {index}: "
            f"{audio_array.size} samples"
        )

    if not audio_segments:
        print(
            "Kokoro did not generate any audio.",
            file=sys.stderr,
        )
        return 1

    narration = np.concatenate(audio_segments)

    sf.write(
        output_path,
        narration,
        SAMPLE_RATE,
        subtype="PCM_16",
    )

    duration_seconds = len(narration) / SAMPLE_RATE

    print("[TTS] Narration generated successfully")
    print(f"[TTS] Duration: {duration_seconds:.2f} seconds")
    print(f"[TTS] Samples: {len(narration)}")
    print(f"[TTS] Sample rate: {SAMPLE_RATE} Hz")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(
            f"[TTS] Fatal error: {error}",
            file=sys.stderr,
        )
        raise
