'use strict';

const fs = require('fs/promises');
const path = require('path');

const {
  fetchClickUpTask,
  getTaskDescription,
} = require('../services/clickupService');

const {
  extractAutomationPayload,
  normalizePayload,
} = require('../services/payloadService');

const {
  createRun,
  appendRunLog,
} = require('../services/runService');

const {
  createLogger,
} = require('../core/logger');

const {
  persistContext,
} = require('../core/persistContext');

async function initializeProject(
  context
) {
  const {
    taskId,
    config,
  } = context;

  if (
    !config.clickup.apiToken
  ) {
    throw new Error(
      'CLICKUP_API_TOKEN is not configured.'
    );
  }

  console.log(
    `Fetching ClickUp task ${taskId}...`
  );

  const task =
  await fetchClickUpTask(
    taskId,
    config.clickup.apiToken,
    config.clickup.apiBase
  );

  const description =
    getTaskDescription(task);

  const automationPayload =
    extractAutomationPayload(
      description
    );

  const manifest =
    normalizePayload(
      automationPayload,
      taskId
    );

  const run =
    await createRun({
      outputRoot:
        config.outputRoot,

      taskId,

      scriptVersion:
        automationPayload
          .script_version ?? null,

      rendererVersion:
        config.pipeline
          .rendererVersion,
    });

  context.task = task;
  context.automationPayload =
    automationPayload;
  context.manifest = manifest;
  context.run = run;

  context.logger =
    createLogger({
      logPath: run.logPath,
      taskId,
      runName: run.runName,
    });

  // Prevent duplicate initialization text
  // from being lost or overwritten.
  await appendRunLog(
    run,
    `Pipeline ID: ${context.pipelineId}`
  );

  await context.logger.info(
    'Project initialized.',
    {
      taskName:
        task.name || null,

      scenes:
        manifest.scenes.length,

      targetDurationSeconds:
        manifest.video
          .targetDurationSeconds,
    }
  );

  await persistContext(context);

  return context;
}

module.exports = {
  initializeProject,
};
