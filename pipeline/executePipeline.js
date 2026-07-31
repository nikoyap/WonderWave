'use strict';

const {
  runStage,
} = require('../core/runStage');

const {
  initializeProject,
} = require('./initializeProject');

const {
  markRunCompleted,
  markRunFailed,
} = require('../services/runService');

async function executePipeline({
  context,
  services = [],
}) {
  try {
    await initializeProject(context);

    for (const service of services) {
      if (
        !service ||
        typeof service.execute !==
          'function'
      ) {
        throw new Error(
          'Invalid pipeline service.'
        );
      }

      const stageName =
        service.name ||
        service.serviceName ||
        'unnamed-service';

      await runStage({
        context,
        name: stageName,
        execute: service.execute,
      });
    }

    context.completedAt =
      new Date().toISOString();

    await context.logger.info(
      'Pipeline completed successfully.'
    );

    await markRunCompleted(
      context.run,
      {
        pipelineId:
          context.pipelineId,

        completedStages:
          context.completedStages,

        outputs:
          context.outputs,
      }
    );

    return context;
  } catch (error) {
    if (context.run) {
      try {
        await markRunFailed(
          context.run,
          error
        );
      } catch (metadataError) {
        console.error(
          'Unable to update failed-run metadata:',
          metadataError
        );
      }
    }

    throw error;
  }
}

module.exports = {
  executePipeline,
};
