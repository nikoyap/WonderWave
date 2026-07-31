'use strict';

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command failed with exit code ${code}\n` +
            `${stderr || stdout}`
          )
        );

        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

async function probeDuration(
  ffprobeExecutable,
  audioPath
) {
  const result = await runCommand(
    ffprobeExecutable,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]
  );

  const durationSeconds = Number(
    result.stdout.trim()
  );

  if (!Number.isFinite(durationSeconds)) {
    throw new Error(
      `Unable to determine narration duration: ${result.stdout}`
    );
  }

  return Number(durationSeconds.toFixed(3));
}

async function execute(context) {
  const {
    config,
    manifest,
    run,
    logger,
  } = context;

  const rawScript = manifest?.narration?.script;

if (
  typeof rawScript !== 'string' ||
  !rawScript.trim()
) {
  throw new Error(
    'Manifest narration script is empty.'
  );
}

/*
 * Modern payloads already contain the clean narration text.
 * Older payloads may contain a full AI response with
 * "Final Narration" and "Scene JSON" sections.
 */
const narrationMatch = rawScript.match(
  /Final Narration\s*:?\s*([\s\S]*?)\s*Scene JSON/i
);

const script = narrationMatch
  ? narrationMatch[1].trim()
  : rawScript.trim();

if (!script) {
  throw new Error(
    'The extracted narration is empty.'
  );
}

const wordCount =
  script.split(/\s+/).filter(Boolean).length;

if (wordCount > 220) {
  throw new Error(
    `Narration too long: ${wordCount} words.`
  );
}

 

  const audioDirectory = path.join(
    run.runDirectory,
    'assets',
    'audio'
  );

  const inputPath = path.join(
    audioDirectory,
    'narration.txt'
  );

  const outputPath = path.join(
    audioDirectory,
    'narration.mp3'
  );

  await fs.mkdir(audioDirectory, {
    recursive: true,
  });

  await fs.writeFile(
    inputPath,
    `${script.trim()}\n`,
    'utf8'
  );

  await logger.info(
    'Generating narration.',
    {
      provider: 'kokoro',
      voice: config.kokoro.voice,
      language: config.kokoro.language,
      speed: config.kokoro.speed,
    }
  );

  await runCommand(
    config.kokoro.executable,
    [
      inputPath,
      outputPath,

      '--model',
      config.kokoro.modelPath,

      '--voices',
      config.kokoro.voicesPath,

      '--voice',
      config.kokoro.voice,

      '--lang',
      config.kokoro.language,

      '--speed',
      String(config.kokoro.speed),

      '--format',
      config.kokoro.format,
    ]
  );

  const stats =
    await fs.stat(outputPath);

  if (stats.size === 0) {
    throw new Error(
      'Kokoro created an empty narration file.'
    );
  }

  const durationSeconds =
    await probeDuration(
      config.ffmpeg.ffprobeExecutable,
      outputPath
    );

  const relativeAudioPath =
    path.relative(
      run.runDirectory,
      outputPath
    );

  const relativeInputPath =
    path.relative(
      run.runDirectory,
      inputPath
    );

  manifest.narration = {
    ...manifest.narration,

    provider: 'kokoro',

    voice:
      config.kokoro.voice,

    language:
      config.kokoro.language,

    speed:
      config.kokoro.speed,

    format:
      config.kokoro.format,

    inputTextPath:
      relativeInputPath,

    audioPath:
      relativeAudioPath,

    durationSeconds,

    sizeBytes:
      stats.size,

    generatedAt:
      new Date().toISOString(),
  };

  context.outputs.narration = {
    provider: 'kokoro',
    audioPath: relativeAudioPath,
    durationSeconds,
    sizeBytes: stats.size,
  };

  await logger.info(
    'Narration generated.',
    context.outputs.narration
  );

  return context;
}

module.exports = {
  name: 'narration',
  execute,
};
