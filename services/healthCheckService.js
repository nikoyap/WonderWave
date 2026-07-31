'use strict';

const fs = require('fs/promises');
const path = require('path');

async function execute(context) {
  const outputPath = path.join(
    context.run.runDirectory,
    'health-check.txt'
  );

  const message = [
    'WonderWave pipeline health check',
    `Pipeline: ${context.pipelineId}`,
    `Task: ${context.taskId}`,
    `Run: ${context.run.runName}`,
    `Created: ${new Date().toISOString()}`,
  ].join('\n');

  await fs.writeFile(
    outputPath,
    `${message}\n`,
    'utf8'
  );

  context.outputs.healthCheck = {
    success: true,

    path: path.relative(
      context.run.runDirectory,
      outputPath
    ),
  };

  return context;
}

module.exports = {
  name: 'health-check',
  execute,
};
