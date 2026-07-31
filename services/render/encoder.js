'use strict';

const { runCommand } = require('./ffmpeg');

async function encodeFinal(options) {
  const {
    videoPath,
    audioPath,
    outputPath,
    logger,
  } = options;

  logger?.info?.('Encoding final YouTube Short.', {
    videoPath,
    audioPath,
    outputPath,
  });

  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ],
    {
      logger,
      label: 'Encode final video',
    },
  );

  return outputPath;
}

module.exports = {
  encodeFinal,
};
