'use strict';

const { spawn } = require('node:child_process');

function runCommand(command, args, options = {}) {
  const {
    cwd,
    logger,
    label = command,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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
      reject(new Error(`${label} could not start: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      if (logger?.error) {
        logger.error(`${label} failed.`, {
          command,
          code,
          stderr: stderr.slice(-4000),
        });
      }

      reject(
        new Error(
          `${label} failed with exit code ${code}.\n${stderr.slice(-4000)}`,
        ),
      );
    });
  });
}

async function probeDuration(filePath, options = {}) {
  const { stdout } = await runCommand(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    {
      ...options,
      label: `ffprobe ${filePath}`,
    },
  );

  const duration = Number.parseFloat(stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine media duration: ${filePath}`);
  }

  return duration;
}

module.exports = {
  probeDuration,
  runCommand,
};
