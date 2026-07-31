'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { probeDuration } = require('./render/ffmpeg');
const { buildScenes } = require('./render/sceneBuilder');
const { buildTimeline } = require('./render/timelineBuilder');
const { burnSubtitles } = require('./render/subtitleBurner');
const { encodeFinal } = require('./render/encoder');

function resolveRunDir(context) {
  const runDirectory =
    context?.run?.runDirectory ||
    context?.runDirectory ||
    context?.runDir ||
    context?.paths?.runDirectory ||
    context?.paths?.runDir;

  if (!runDirectory) {
    throw new Error(
      'Render Service could not determine the active run directory.',
    );
  }

  return path.resolve(runDirectory);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveOutputPath(runDir, outputPath, fallbackPath) {
  const resolvedValue = outputPath || fallbackPath;

  if (!resolvedValue) {
    throw new Error('Could not resolve an output path.');
  }

  return path.isAbsolute(resolvedValue)
    ? path.normalize(resolvedValue)
    : path.join(runDir, resolvedValue);
}

async function resolveImagePaths(runDir, context) {
  const configuredScenes =
    context?.manifest?.scenes ||
    context?.automationPayload?.scenes ||
    context?.task?.scenes;

  const expectedCount = Array.isArray(configuredScenes)
    ? configuredScenes.length
    : Number(
      context?.manifest?.sceneCount ||
      context?.automationPayload?.sceneCount ||
      context?.task?.sceneCount ||
      0,
    );

  const imagesDir = path.join(
    runDir,
    'assets',
    'images',
  );

  if (!(await pathExists(imagesDir))) {
    throw new Error(
      `Scene image directory not found: ${imagesDir}`,
    );
  }

  const entries = await fs.readdir(imagesDir);

  const imagePaths = entries
    .filter((name) =>
      /^scene-\d+\.(png|jpg|jpeg|webp)$/i.test(name),
    )
    .sort((a, b) =>
      a.localeCompare(
        b,
        undefined,
        { numeric: true },
      ),
    )
    .map((name) =>
      path.join(imagesDir, name),
    );

  if (imagePaths.length === 0) {
    throw new Error(
      `No scene images found in ${imagesDir}`,
    );
  }

  if (
    expectedCount > 0 &&
    imagePaths.length < expectedCount
  ) {
    throw new Error(
      `Expected ${expectedCount} scene images but found ${imagePaths.length}.`,
    );
  }

  return expectedCount > 0
    ? imagePaths.slice(0, expectedCount)
    : imagePaths;
}

async function execute(context) {
  if (!context || typeof context !== 'object') {
    throw new Error(
      'Render Service requires a valid context object.',
    );
  }

  const runDir = resolveRunDir(context);

  const logger = context.logger;

  const narrationOutput =
    context?.outputs?.narration?.audioPath ||
    'assets/audio/narration.mp3';

  const subtitleOutput =
    context?.outputs?.subtitles?.assPath ||
    context?.outputs?.subtitles?.subtitlePath ||
    'assets/subtitles/subtitles.ass';

  const audioPath = resolveOutputPath(
    runDir,
    narrationOutput,
    'assets/audio/narration.mp3',
  );

  const subtitlePath = resolveOutputPath(
    runDir,
    subtitleOutput,
    'assets/subtitles/subtitles.ass',
  );

  if (!(await pathExists(audioPath))) {
    throw new Error(
      `Narration audio not found: ${audioPath}`,
    );
  }

  if (!(await pathExists(subtitlePath))) {
    throw new Error(
      `ASS subtitle file not found: ${subtitlePath}`,
    );
  }

  const imagePaths = await resolveImagePaths(
  runDir,
  context,
);


const automationData =
  context?.automationPayload ||
  context?.manifest ||
  context?.task ||
  {};

const tone =
  automationData.tone ||
  "educational";

const motion =
  automationData.motion ||
  null;

const sceneMotions =
  Array.isArray(automationData.scenes)
    ? automationData.scenes.map(
        scene => scene.motion || null
      )
    : [];

  const audioDurationSeconds =
    await probeDuration(
      audioPath,
      { logger },
    );

  const width = 1080;
  const height = 1920;
  const fps = 30;

  const transitionSeconds =
    imagePaths.length > 1
      ? 0.5
      : 0;

  const clipDurationSeconds = (
    audioDurationSeconds +
    (
      (imagePaths.length - 1) *
      transitionSeconds
    )
  ) / imagePaths.length;

  const renderRoot = path.join(
    runDir,
    'render',
  );

  const scenesDir = path.join(
    renderRoot,
    'scenes',
  );

  const timelinePath = path.join(
    renderRoot,
    'timeline.mp4',
  );

  const subtitledPath = path.join(
    renderRoot,
    'subtitled.mp4',
  );

  const finalDir = path.join(
    runDir,
    'final',
  );

  const finalPath = path.join(
    finalDir,
    'wonderwave.mp4',
  );

  await fs.mkdir(
    renderRoot,
    { recursive: true },
  );

  await fs.mkdir(
    finalDir,
    { recursive: true },
  );

  logger?.info?.(
    'Starting Phase 1 video render.',
    {
      runDir,
      audioPath,
      subtitlePath,
      sceneCount: imagePaths.length,
      audioDurationSeconds,
      clipDurationSeconds,
      transitionSeconds,
      resolution: `${width}x${height}`,
      fps,
    },
  );

  const scenePaths =
  await buildScenes({
    imagePaths,
    outputDir: scenesDir,
    clipDurationSeconds,
    width,
    height,
    fps,
    tone,
    motion,
    sceneMotions,
    logger,
  });

  await buildTimeline({
    scenePaths,
    outputPath: timelinePath,
    clipDurationSeconds,
    transitionSeconds,
    fps,
    logger,
  });

  await burnSubtitles({
    inputPath: timelinePath,
    subtitlePath,
    outputPath: subtitledPath,
    logger,
  });

  await encodeFinal({
    videoPath: subtitledPath,
    audioPath,
    outputPath: finalPath,
    logger,
  });

  if (!(await pathExists(finalPath))) {
    throw new Error(
      `Final video was not created: ${finalPath}`,
    );
  }

  const finalStats = await fs.stat(
    finalPath,
  );

  context.outputs =
    context.outputs || {};

  context.outputs.render = {
    videoPath: path.relative(
      runDir,
      finalPath,
    ),
    timelinePath: path.relative(
      runDir,
      timelinePath,
    ),
    subtitledPath: path.relative(
      runDir,
      subtitledPath,
    ),
    sceneClipPaths: scenePaths.map(
      (scenePath) =>
        path.relative(
          runDir,
          scenePath,
        ),
    ),
    width,
    height,
    fps,
    audioDurationSeconds,
    clipDurationSeconds,
    transitionSeconds,
    sceneCount: imagePaths.length,
    sizeBytes: finalStats.size,
  };

  logger?.info?.(
    'Phase 1 video render completed.',
    {
      videoPath:
        context.outputs.render.videoPath,
      sizeBytes:
        finalStats.size,
    },
  );

  return context;
}

module.exports = {
  name: 'render',
  execute,
};
