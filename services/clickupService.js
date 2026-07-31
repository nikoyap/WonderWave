'use strict';

async function fetchClickUpTask(
  taskId,
  apiToken,
  apiBase = 'https://api.clickup.com/api/v2'
) {
  if (!taskId) {
    throw new Error(
      'ClickUp task ID is required.'
    );
  }

  if (!apiToken) {
    throw new Error(
      'ClickUp API token is required.'
    );
  }

  const url =
    `${apiBase}/task/${encodeURIComponent(taskId)}`;

  const response = await fetch(url, {
    method: 'GET',

    headers: {
      Authorization: apiToken,
      Accept: 'application/json',
    },
  });

  const responseText =
    await response.text();

  let responseBody;

  try {
    responseBody = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    const message =
      typeof responseBody === 'object'
        ? responseBody?.err ||
          responseBody?.error ||
          JSON.stringify(responseBody)
        : responseBody;

    throw new Error(
      `ClickUp request failed ` +
      `(${response.status} ${response.statusText}): ` +
      `${message || 'Unknown error'}`
    );
  }

  return responseBody;
}

function getTaskDescription(task) {
  if (!task || typeof task !== 'object') {
    throw new Error(
      'A valid ClickUp task object is required.'
    );
  }

  if (
    typeof task.description === 'string' &&
    task.description.trim()
  ) {
    return task.description;
  }

  if (
    typeof task.text_content === 'string' &&
    task.text_content.trim()
  ) {
    return task.text_content;
  }

  throw new Error(
    'The ClickUp task has no usable description.'
  );
}

function getImageAttachments(task) {
  const attachments = Array.isArray(task?.attachments)
    ? task.attachments
    : [];

  return attachments.filter((attachment) => {
    const mimeType =
      attachment?.mimetype ||
      attachment?.mime_type ||
      '';

    const filename =
      attachment?.title ||
      attachment?.name ||
      attachment?.filename ||
      '';

    return (
      mimeType.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif)$/i.test(filename)
    );
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
}

async function waitForTaskImages(
  taskId,
  options = {}
) {
  const apiToken =
    options.apiToken ||
    process.env.CLICKUP_API_TOKEN;

  const apiBase =
    options.apiBase ||
    process.env.CLICKUP_API_BASE ||
    'https://api.clickup.com/api/v2';

  const intervalMs =
    Number(options.intervalMs) ||
    Number(process.env.CLICKUP_IMAGE_POLL_INTERVAL_MS) ||
    15000;

  const timeoutMs =
    Number(options.timeoutMs) ||
    Number(process.env.CLICKUP_IMAGE_WAIT_TIMEOUT_MS) ||
    600000;

  const minimumImages =
    Number(options.minimumImages) ||
    Number(process.env.CLICKUP_MINIMUM_IMAGES) ||
    1;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const task = await fetchClickUpTask(
      taskId,
      apiToken,
      apiBase
    );

    const attachments =
      getImageAttachments(task);

    console.log(
      `[ClickUp Service] Found ${attachments.length} image attachment(s) for task ${taskId}`
    );

    if (attachments.length >= minimumImages) {
      return {
        task,
        attachments,
      };
    }

    console.log(
      `[ClickUp Service] Waiting ${intervalMs / 1000}s for ClickUp images`
    );

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for at least ${minimumImages} image attachment(s) on ClickUp task ${taskId}.`
  );
}

async function updateTaskStatus(
    taskId,
    status
) {
    const apiBase =
        'https://api.clickup.com/api/v2';

    const response =
        await fetch(
            `${apiBase}/task/${taskId}`,
            {
                method: 'PUT',

                headers: {
                    Authorization:
                        process.env.CLICKUP_API_TOKEN,

                    'Content-Type':
                        'application/json'
                },

                body: JSON.stringify({
                    status
                })
            }
        );

    if (!response.ok) {
        const text =
            await response.text();

        throw new Error(
            `ClickUp status update failed: ${response.status} ${text}`
        );
    }

    return await response.json();
}

module.exports = {
  fetchClickUpTask,
  getTaskDescription,
   getImageAttachments,
  waitForTaskImages,
      updateTaskStatus

};
