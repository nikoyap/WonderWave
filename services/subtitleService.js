'use strict';

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        new Error(`Unable to start ${command}: ${error.message}`),
      );
    });

    child.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            [
              `Subtitle command failed with exit code ${exitCode}.`,
              stderr.trim(),
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        );

        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveRunDir(context, projectRoot) {
  const candidates = [
    context?.run?.runDirectory,
    context?.runDir,
    context?.outputDir,
    context?.projectDir,
    context?.paths?.runDir,
    context?.paths?.outputDir,
    context?.paths?.projectDir,
    context?.project?.runDir,
    context?.project?.outputDir,
    context?.project?.directory,
    context?.project?.path,
    context?.run?.runDir,
    context?.run?.outputDir,
    context?.run?.directory,
    context?.run?.path,
    context?.config?.runDir,
    context?.config?.outputDir,
  ].filter(Boolean);

  if (candidates.length > 0) {
    return path.resolve(candidates[0]);
  }

  const narrationPath = context?.outputs?.narration?.audioPath;

  if (narrationPath && path.isAbsolute(narrationPath)) {
    return path.resolve(
      path.dirname(narrationPath),
      '..',
      '..',
    );
  }

  if (context?.taskId) {
    return path.join(
      projectRoot,
      'output',
      String(context.taskId),
      'latest',
    );
  }

  throw new Error(
    `Subtitle Service could not determine the run directory. Context keys: ${
      Object.keys(context || {}).join(', ')
    }`,
  );
}

async function findNarrationPath(context, runDir) {
  const candidates = [
    context?.outputs?.narration?.audioPath,
    context?.outputs?.assets?.audio?.localPath,
    context?.outputs?.assets?.narration?.localPath,
    path.join(runDir, 'assets', 'audio', 'narration.mp3'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolutePath = path.isAbsolute(candidate)
      ? candidate
      : path.join(runDir, candidate);

    if (await fileExists(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error(
    `Unable to locate narration audio inside ${runDir}.`,
  );
}

async function execute(context) {
  const projectRoot =
    context?.projectRoot || path.resolve(__dirname, '..');

  const runDir = resolveRunDir(context, projectRoot);

  const pythonPath =
    process.env.WHISPER_PYTHON ||
    path.join(projectRoot, '.venv', 'bin', 'python');

  const scriptPath = path.join(
    projectRoot,
    'scripts',
    'generate_subtitles.py',
  );

  const audioPath = await findNarrationPath(context, runDir);
  const outputDir = path.join(runDir, 'assets', 'subtitles');

  await fs.mkdir(outputDir, {
    recursive: true,
  });

  if (!(await fileExists(pythonPath))) {
    throw new Error(
      `Whisper Python executable was not found: ${pythonPath}`,
    );
  }

  if (!(await fileExists(scriptPath))) {
    throw new Error(
      `Subtitle script was not found: ${scriptPath}`,
    );
  }

  console.log(`[subtitles] Run directory: ${runDir}`);
  console.log(`[subtitles] Audio: ${audioPath}`);
  console.log(`[subtitles] Output: ${outputDir}`);

  const result = await runCommand(
    pythonPath,
    [
      scriptPath,
      '--audio',
      audioPath,
      '--output-dir',
      outputDir,
      '--model',
      process.env.WHISPER_MODEL || 'small',
      '--device',
      process.env.WHISPER_DEVICE || 'cpu',
      '--compute-type',
      process.env.WHISPER_COMPUTE_TYPE || 'int8',
      '--language',
      process.env.WHISPER_LANGUAGE || 'en',
    ],
    {
      cwd: projectRoot,
    },
  );

  const outputLines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const finalLine = outputLines.at(-1);

  if (!finalLine) {
    throw new Error(
      'Subtitle generator returned no result.',
    );
  }

  let transcription;

  try {
    transcription = JSON.parse(finalLine);
  } catch {
    throw new Error(
      `Unable to parse subtitle result:\n${result.stdout}`,
    );
  }

  const output = {
    directory: path.relative(runDir, outputDir),
    srtPath: path.relative(runDir, transcription.srt),
    assPath: path.relative(runDir, transcription.ass),
    jsonPath: path.relative(runDir, transcription.json),
    duration: transcription.duration,
    segmentCount: transcription.segmentCount,
    language: transcription.language,
    model: process.env.WHISPER_MODEL || 'small',
  };

  context.outputs = context.outputs || {};
  context.outputs.subtitles = output;

  console.log(
    `[subtitles] Generated ${output.segmentCount} segments.`,
  );

  return context;
}

module.exports = {
  name: 'subtitles',
  execute,
}

function wrapCaption(text, maxCharsPerLine = 28) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join('\\N');
}
;
