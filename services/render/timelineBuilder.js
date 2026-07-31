'use strict';

const path = require('node:path');
const { runCommand } = require('./ffmpeg');

function buildXfadeGraph(sceneCount, clipDurationSeconds, transitionSeconds) {
  if (sceneCount === 1) {
    return {
      filterComplex: null,
      outputLabel: null,
    };
  }

  const filters = [];
  let previousLabel = '[0:v]';

  for (let index = 1; index < sceneCount; index += 1) {
    const outputLabel = `[v${index}]`;
    const offset = (
      index * (clipDurationSeconds - transitionSeconds)
    ).toFixed(3);

    filters.push(
      `${previousLabel}[${index}:v]xfade=` +
      `transition=fade:duration=${transitionSeconds.toFixed(3)}:` +
      `offset=${offset}${outputLabel}`,
    );

    previousLabel = outputLabel;
  }

  return {
    filterComplex: filters.join(';'),
    outputLabel: previousLabel,
  };
}

async function buildTimeline(options) {
  const {
    scenePaths,
    outputPath,
    clipDurationSeconds,
    transitionSeconds = 0.5,
    fps = 30,
    logger,
  } = options;

  if (scenePaths.length === 0) {
    throw new Error('Timeline Builder received no scene clips.');
  }

  if (scenePaths.length === 1) {
    await runCommand(
      'ffmpeg',
      [
        '-y',
        '-i', scenePaths[0],
        '-an',
        '-c:v', 'copy',
        outputPath,
      ],
      {
        logger,
        label: 'Build single-scene timeline',
      },
    );

    return outputPath;
  }

  const args = ['-y'];

  for (const scenePath of scenePaths) {
    args.push('-i', scenePath);
  }

  const graph = buildXfadeGraph(
    scenePaths.length,
    clipDurationSeconds,
    transitionSeconds,
  );

  args.push(
    '-filter_complex', graph.filterComplex,
    '-map', graph.outputLabel,
    '-an',
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    outputPath,
  );

  logger?.info?.('Building scene timeline.', {
    sceneCount: scenePaths.length,
    transitionSeconds,
    outputPath,
  });

  await runCommand('ffmpeg', args, {
    logger,
    label: 'Build timeline',
  });

  return outputPath;
}

module.exports = {
  buildTimeline,
};
