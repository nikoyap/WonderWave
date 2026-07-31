'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { runCommand } = require('./ffmpeg');

const {
  createMotionFilter,
} = require('../../config/motionPresets');


async function buildScenes(options) {
  const {
  imagePaths,
  outputDir,
  clipDurationSeconds,
  width = 1080,
  height = 1920,
  fps = 30,
  tone = 'educational',
  motion = null,
  sceneMotions = [],
  logger,
} = options;

  if (
    !Array.isArray(imagePaths) ||
    imagePaths.length === 0
  ) {
    throw new Error(
      'Scene Builder received no image paths.',
    );
  }

  if (
    !Number.isFinite(clipDurationSeconds) ||
    clipDurationSeconds <= 0
  ) {
    throw new Error(
      `Invalid scene duration: ${clipDurationSeconds}`,
    );
  }

  await fs.rm(
    outputDir,
    {
      recursive: true,
      force: true,
    },
  );

  await fs.mkdir(
    outputDir,
    {
      recursive: true,
    },
  );

  const scenePaths = [];

  for (
    let index = 0;
    index < imagePaths.length;
    index += 1
  ) {
    const imagePath = imagePaths[index];

    const sceneNumber = String(
      index + 1,
    ).padStart(2, '0');

    const outputPath = path.join(
      outputDir,
      `scene-${sceneNumber}.mp4`,
    );

    const requestedSceneMotion =
  Array.isArray(sceneMotions)
    ? sceneMotions[index]
    : null;

const {
  selectedMotion,
  filter: baseMotionFilter,
} = createMotionFilter({
  motion:
    requestedSceneMotion ||
    motion ||
    null,
  tone,
  duration: clipDurationSeconds,
  fps,
  width,
  height,
});

const filter = [
  baseMotionFilter,
  'setsar=1',
  'format=yuv420p',
].join(',');

    logger?.info?.(
      `Rendering scene ${index + 1}.`,
      {
        imagePath,
        outputPath,
        durationSeconds:
          clipDurationSeconds,
tone,
requestedMotion:
  requestedSceneMotion ||
  motion ||
  null,
selectedMotion,        
filter,
      },
    );

    await runCommand(
      'ffmpeg',
      [
        '-y',
        '-loop', '1',
        '-framerate', String(fps),
        '-i', imagePath,
        '-vf', filter,
        '-t',
        clipDurationSeconds.toFixed(3),
        '-an',
        '-r', String(fps),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath,
      ],
      {
        logger,
        label:
          `Render scene ${index + 1}`,
      },
    );

    scenePaths.push(outputPath);
  }

  return scenePaths;
}

module.exports = {
  buildScenes,
};
