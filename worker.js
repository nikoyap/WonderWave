#!/usr/bin/env node

'use strict';

const {
  loadConfig,
} = require('./config');

const {
  createContext,
} = require('./core/createContext');

const {
  executePipeline,
} = require('./pipeline/executePipeline');

const narrationService =
  require('./services/narrationService');

const assetService =
  require('./services/assetService');

const subtitleService = require('./services/subtitleService');

const renderService = require('./services/renderService');

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    throw new Error(
      [
        'Missing ClickUp task ID.',
        '',
        'Usage:',
        'node worker.js TASK_ID',
      ].join('\n')
    );
  }

  const config = loadConfig();

  const context = createContext({
    taskId,
    config,
  });

  const services = [
    narrationService,
    assetService,
    subtitleService,
    renderService,
  ];

  const result =
    await executePipeline({
      context,
      services,
    });

  console.log(
    '\nWonderWave pipeline completed.'
  );

  console.log(`Task: ${result.taskId}`);
  console.log(`Run: ${result.run.runName}`);
  console.log(
    `Stages: ${result.completedStages.length}`
  );
  console.log(
    `Directory: ${result.run.runDirectory}`
  );
  console.log(
    `Latest: ${result.run.taskDirectory}/latest`
  );
}

main().catch((error) => {
  console.error(
    '\nWonderWave pipeline failed.'
  );

  console.error(
    error.stack || error.message
  );

  process.exit(1);
});
