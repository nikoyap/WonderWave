'use strict';

const {
  persistContext,
} = require('./persistContext');

const {
  updateRunMetadata,
} = require('../services/runService');

async function runStage({
  context,
  name,
  execute,
}) {
  if (
    typeof execute !== 'function'
  ) {
    throw new Error(
      `Stage "${name}" has no execute function.`
    );
  }

  context.currentStage = name;

  const startedAt = Date.now();

  await context.logger.info(
    `Stage started: ${name}`
  );

  await updateRunMetadata(
    context.run,
    {
      status: 'processing',
      currentStage: name,
    }
  );

  try {
    const result =
      await execute(context);

    if (
      result &&
      result !== context
    ) {
      throw new Error(
        `Stage "${name}" returned a different context object.`
      );
    }

    const durationSeconds =
      Number(
        (
          (Date.now() - startedAt) /
          1000
        ).toFixed(3)
      );

    context.completedStages.push({
      name,
      completedAt:
        new Date().toISOString(),
      durationSeconds,
    });

    context.currentStage = null;

    await persistContext(context);

    await context.logger.info(
      `Stage completed: ${name}`,
      {
        durationSeconds,
      }
    );

    return context;
  } catch (error) {
    const durationSeconds =
      Number(
        (
          (Date.now() - startedAt) /
          1000
        ).toFixed(3)
      );

    context.errors.push({
      stage: name,
      message: error.message,
      stack: error.stack,
      occurredAt:
        new Date().toISOString(),
      durationSeconds,
    });

    await persistContext(context);

    await context.logger.error(
      `Stage failed: ${name}`,
      error
    );

    throw error;
  }
}

module.exports = {
  runStage,
};
