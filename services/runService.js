'use strict';

const fs = require('fs/promises');
const path = require('path');

const RUN_PATTERN = /^run-(\d{3})$/;

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listExistingRuns(taskDirectory) {
  if (!(await pathExists(taskDirectory))) {
    return [];
  }

  const entries = await fs.readdir(taskDirectory, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = entry.name.match(RUN_PATTERN);

      if (!match) {
        return null;
      }

      return {
        name: entry.name,
        number: Number(match[1]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

function formatRunName(runNumber) {
  return `run-${String(runNumber).padStart(3, '0')}`;
}

async function createRunDirectories(runDirectory) {
  const directories = [
    runDirectory,
    path.join(runDirectory, 'assets'),
    path.join(runDirectory, 'assets', 'audio'),
    path.join(runDirectory, 'assets', 'images'),
    path.join(runDirectory, 'assets', 'subtitles'),
    path.join(runDirectory, 'assets', 'thumbnail'),
    path.join(runDirectory, 'render'),
    path.join(runDirectory, 'final'),
  ];

  for (const directory of directories) {
    await fs.mkdir(directory, {
      recursive: true,
    });
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(
    filePath,
    JSON.stringify(value, null, 2),
    'utf8'
  );
}

async function createRun({
  outputRoot,
  taskId,
  scriptVersion = null,
  rendererVersion = '3.2.0',
}) {
  if (!taskId) {
    throw new Error('taskId is required.');
  }

  const taskDirectory = path.resolve(outputRoot, taskId);
  const logsDirectory = path.join(taskDirectory, 'logs');

  await fs.mkdir(logsDirectory, {
    recursive: true,
  });

  const existingRuns = await listExistingRuns(taskDirectory);

  const runNumber =
    existingRuns.length > 0
      ? existingRuns[existingRuns.length - 1].number + 1
      : 1;

  const runName = formatRunName(runNumber);
  const runDirectory = path.join(taskDirectory, runName);

  await createRunDirectories(runDirectory);

  const startedAt = new Date().toISOString();

  const runMetadata = {
    run: runNumber,
    runName,
    taskId,
    status: 'initialized',
    startedAt,
    completedAt: null,
    failedAt: null,
    failureReason: null,
    rendererVersion,
    scriptVersion,
  };

  await writeJson(
    path.join(runDirectory, 'run.json'),
    runMetadata
  );

  const logPath = path.join(
    logsDirectory,
    `${runName}.log`
  );

  await fs.writeFile(
    logPath,
    `[${startedAt}] Run initialized\n`,
    'utf8'
  );

  return {
    runNumber,
    runName,
    taskDirectory,
    runDirectory,
    logsDirectory,
    logPath,
    metadataPath: path.join(runDirectory, 'run.json'),
  };
}

async function appendRunLog(run, message) {
  const timestamp = new Date().toISOString();

  await fs.appendFile(
    run.logPath,
    `[${timestamp}] ${message}\n`,
    'utf8'
  );
}

async function updateRunMetadata(run, updates) {
  const raw = await fs.readFile(
    run.metadataPath,
    'utf8'
  );

  const current = JSON.parse(raw);

  const updated = {
    ...current,
    ...updates,
  };

  await writeJson(run.metadataPath, updated);

  return updated;
}

async function copyDirectory(source, destination) {
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
  });
}

async function replaceLatest(run) {
  const latestDirectory = path.join(
    run.taskDirectory,
    'latest'
  );

  const temporaryLatest = path.join(
    run.taskDirectory,
    '.latest-temp'
  );

  await fs.rm(temporaryLatest, {
    recursive: true,
    force: true,
  });

  await copyDirectory(
    run.runDirectory,
    temporaryLatest
  );

  await fs.rm(latestDirectory, {
    recursive: true,
    force: true,
  });

  await fs.rename(
    temporaryLatest,
    latestDirectory
  );

  return latestDirectory;
}

async function markRunCompleted(run, extraMetadata = {}) {
  const completedAt = new Date().toISOString();

  const metadata = await updateRunMetadata(run, {
    status: 'completed',
    completedAt,
    failedAt: null,
    failureReason: null,
    ...extraMetadata,
  });

  await appendRunLog(run, 'Run completed successfully.');

  const latestDirectory = await replaceLatest(run);

  return {
    metadata,
    latestDirectory,
  };
}

async function markRunFailed(run, error) {
  const failedAt = new Date().toISOString();

  const failureReason =
    error instanceof Error
      ? error.message
      : String(error);

  const metadata = await updateRunMetadata(run, {
    status: 'failed',
    failedAt,
    failureReason,
  });

  await appendRunLog(
    run,
    `Run failed: ${failureReason}`
  );

  return metadata;
}

module.exports = {
  createRun,
  appendRunLog,
  updateRunMetadata,
  markRunCompleted,
  markRunFailed,
};
