'use strict';

const fs = require('fs/promises');
const path = require('path');

async function writeJsonAtomic(
  filePath,
  value
) {
  const temporaryPath =
    `${filePath}.tmp`;

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(value, null, 2),
    'utf8'
  );

  await fs.rename(
    temporaryPath,
    filePath
  );
}

function createSerializableContext(
  context
) {
  return {
    pipelineId:
      context.pipelineId,

    taskId:
      context.taskId,

    startedAt:
      context.startedAt,

    completedAt:
      context.completedAt,

    currentStage:
      context.currentStage,

    completedStages:
      context.completedStages,

    outputs:
      context.outputs,

    errors:
      context.errors,
  };
}

async function persistContext(context) {
  if (!context.run?.runDirectory) {
    throw new Error(
      'Cannot persist context without a run directory.'
    );
  }

  if (context.manifest) {
    await writeJsonAtomic(
      path.join(
        context.run.runDirectory,
        'manifest.json'
      ),
      context.manifest
    );
  }

  if (context.automationPayload) {
    await writeJsonAtomic(
      path.join(
        context.run.runDirectory,
        'automation.json'
      ),
      context.automationPayload
    );
  }

  await writeJsonAtomic(
    path.join(
      context.run.runDirectory,
      'pipeline.json'
    ),
    createSerializableContext(context)
  );
}

module.exports = {
  persistContext,
  writeJsonAtomic,
};
