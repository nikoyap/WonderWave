'use strict';

const fs = require('fs/promises');

function serializeDetails(details) {
  if (
    details === undefined ||
    details === null
  ) {
    return '';
  }

  if (details instanceof Error) {
    return JSON.stringify({
      name: details.name,
      message: details.message,
      stack: details.stack,
    });
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function createLogger({
  logPath = null,
  taskId = null,
  runName = null,
}) {
  async function write(
    level,
    message,
    details
  ) {
    const timestamp =
      new Date().toISOString();

    const prefix = [
      timestamp,
      level.toUpperCase(),
      taskId ? `task=${taskId}` : null,
      runName ? `run=${runName}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    const serialized =
      serializeDetails(details);

    const line =
      `[${prefix}] ${message}` +
      (serialized
        ? ` ${serialized}`
        : '');

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (logPath) {
      await fs.appendFile(
        logPath,
        `${line}\n`,
        'utf8'
      );
    }
  }

  return {
    info(message, details) {
      return write(
        'info',
        message,
        details
      );
    },

    warn(message, details) {
      return write(
        'warn',
        message,
        details
      );
    },

    error(message, details) {
      return write(
        'error',
        message,
        details
      );
    },

    debug(message, details) {
      return write(
        'debug',
        message,
        details
      );
    },
  };
}

module.exports = {
  createLogger,
};
