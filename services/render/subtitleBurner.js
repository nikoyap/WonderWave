'use strict';

const { runCommand } = require('./ffmpeg');

function escapeSubtitlePath(filePath) {
  return filePath
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

async function burnSubtitles(options) {
  const {
    inputPath,
    subtitlePath,
    outputPath,
    logger,
  } = options;

  const escapedSubtitlePath = escapeSubtitlePath(subtitlePath);
  const filter = `ass='${escapedSubtitlePath}'`;

  logger?.info?.('Burning subtitles.', {
    inputPath,
    subtitlePath,
    outputPath,
  });

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-i', inputPath,
      '-vf', filter,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ],
    {
      logger,
      label: 'Burn subtitles',
    },
  );

  return outputPath;
}

module.exports = {
  burnSubtitles,
};
