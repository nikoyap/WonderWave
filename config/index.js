'use strict';

const path = require('path');

function parseNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function loadConfig() {
  const projectRoot = path.resolve(
    __dirname,
    '..'
  );

  return {
    environment:
      process.env.NODE_ENV || 'development',

    projectRoot,

    outputRoot:
      process.env.WONDERWAVE_OUTPUT_ROOT ||
      path.join(projectRoot, 'output'),

    clickup: {
      apiToken:
        process.env.CLICKUP_API_TOKEN || '',

      apiBase:
        process.env.CLICKUP_API_BASE ||
        'https://api.clickup.com/api/v2',
    },

    ffmpeg: {
      executable:
        process.env.FFMPEG_PATH ||
        'ffmpeg',

      ffprobeExecutable:
        process.env.FFPROBE_PATH ||
        'ffprobe',
    },

    kokoro: {
      executable:
        process.env.KOKORO_EXECUTABLE ||
        path.join(
          projectRoot,
          '.venv-kokoro',
          'bin',
          'kokoro-tts'
        ),

      modelPath:
        process.env.KOKORO_MODEL_PATH ||
        path.join(
          projectRoot,
          'models',
          'kokoro',
          'kokoro-v1.0.onnx'
        ),

      voicesPath:
        process.env.KOKORO_VOICES_PATH ||
        path.join(
          projectRoot,
          'models',
          'kokoro',
          'voices-v1.0.bin'
        ),

      voice:
        process.env.KOKORO_VOICE ||
        'am_adam',

      language:
        process.env.KOKORO_LANGUAGE ||
        'en-us',

      speed: parseNumber(
        process.env.KOKORO_SPEED,
        1
      ),

      format:
        process.env.KOKORO_FORMAT ||
        'mp3',
    },

assets: {
  requestTimeoutMs: parseNumber(
    process.env.ASSET_REQUEST_TIMEOUT_MS,
    120000
  ),

  maximumFileSizeBytes: parseNumber(
    process.env.ASSET_MAX_FILE_SIZE_BYTES,
    50 * 1024 * 1024
  ),

  requireThumbnail:
    process.env.REQUIRE_THUMBNAIL !== 'false',

  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
},
  
  pipeline: {
      rendererVersion:
        process.env.RENDERER_VERSION ||
        '3.2.0',

      continueFromExisting:
        process.env.CONTINUE_EXISTING_RUN ===
        'true',
    },
  };
}

module.exports = {
  loadConfig,
};
