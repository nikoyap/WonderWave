#!/usr/bin/env node

'use strict';

const path = require('path');

const {
  createRun,
  appendRunLog,
  updateRunMetadata,
  markRunCompleted,
  markRunFailed,
} = require('../services/runService');

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    throw new Error(
      'Usage: node scripts/testRunService.js TASK_ID'
    );
  }

  const outputRoot = path.resolve(
    process.cwd(),
    'output'
  );

  const run = await createRun({
    outputRoot,
    taskId,
    scriptVersion: 1,
    rendererVersion: '3.2.0',
  });

  console.log(`Created ${run.runName}`);
  console.log(`Run directory: ${run.runDirectory}`);

  try {
    await appendRunLog(
      run,
      'Testing run-folder initialization.'
    );

    await updateRunMetadata(run, {
      status: 'processing',
    });

    await appendRunLog(
      run,
      'Folder structure created successfully.'
    );

    const result = await markRunCompleted(run, {
      testMode: true,
    });

    console.log('\nRun completed.');
    console.log(
      `Latest directory: ${result.latestDirectory}`
    );
  } catch (error) {
    await markRunFailed(run, error);
    throw error;
  }
}

main().catch((error) => {
  console.error('\nRun test failed.');
  console.error(error.message);
  process.exit(1);
});
