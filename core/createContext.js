'use strict';

const { randomUUID } = require('crypto');

function createContext({
  taskId,
  config,
}) {
  if (!taskId) {
    throw new Error(
      'taskId is required.'
    );
  }

  if (!config) {
    throw new Error(
      'config is required.'
    );
  }

  return {
    pipelineId: randomUUID(),

    taskId,

    startedAt:
      new Date().toISOString(),

    completedAt: null,

    config,

    task: null,

    automationPayload: null,

    manifest: null,

    run: null,

    logger: null,

    currentStage: null,

    completedStages: [],

    outputs: {},

    errors: [],
  };
}

module.exports = {
  createContext,
};
