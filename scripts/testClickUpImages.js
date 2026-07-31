require('dotenv').config({
  path: '/opt/wonderwave/.env',
});

const path = require('node:path');

const {
  waitForTaskImages,
} = require(
  '../services/clickupService'
);

const {
  prepareClickUpImages,
} = require(
  '../services/imageService'
);

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    throw new Error(
      'Usage: node scripts/testClickUpImages.js <clickup-task-id>'
    );
  }

  const projectsDir =
    process.env.PROJECTS_DIR ||
    '/opt/wonderwave/projects';

  const projectDir = path.join(
    projectsDir,
    String(taskId)
      .toLowerCase()
      .replace(
        /[^a-z0-9-_]+/g,
        '-'
      )
  );

  const clickupResult =
    await waitForTaskImages(
      taskId
    );

  const result =
    await prepareClickUpImages({
      projectDir,
      attachments:
        clickupResult.attachments,
    });

  console.log(
    JSON.stringify(
      {
        success: true,
        taskId,
        projectDir,
        imageCount:
          result.imageCount,
        manifestPath:
          result.manifestPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error.stack || error
  );

  process.exit(1);
});
