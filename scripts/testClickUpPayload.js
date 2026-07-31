#!/usr/bin/env node

'use strict';

const fs = require('fs/promises');
const path = require('path');

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
const JSON_MARKER = 'AUTOMATION JSON:';

function extractAutomationJson(description) {
  if (!description || typeof description !== 'string') {
    throw new Error('The ClickUp task description is empty.');
  }

  const markerIndex = description.indexOf(JSON_MARKER);

  if (markerIndex === -1) {
    throw new Error(
      `The task description does not contain "${JSON_MARKER}".`
    );
  }

  let jsonText = description
    .slice(markerIndex + JSON_MARKER.length)
    .trim();

  // Allow the AI Agent to optionally wrap the JSON in a Markdown code block.
  jsonText = jsonText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `The AUTOMATION JSON could not be parsed: ${error.message}`
    );
  }
}

function validatePayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload is not a JSON object.');
    return errors;
  }

  if (payload.project !== 'WonderWave') {
    errors.push(
      `Expected project "WonderWave", received "${payload.project}".`
    );
  }

  if (!payload.voiceover_script) {
    errors.push('Missing voiceover_script.');
  }

  if (!Array.isArray(payload.scenes) || payload.scenes.length === 0) {
    errors.push('Missing or empty scenes array.');
  }

  if (Array.isArray(payload.scenes)) {
    payload.scenes.forEach((scene, index) => {
      const label = scene.scene_number ?? index + 1;

      if (!Number.isFinite(scene.start_seconds)) {
        errors.push(`Scene ${label}: invalid start_seconds.`);
      }

      if (!Number.isFinite(scene.end_seconds)) {
        errors.push(`Scene ${label}: invalid end_seconds.`);
      }

      if (
        Number.isFinite(scene.start_seconds) &&
        Number.isFinite(scene.end_seconds) &&
        scene.end_seconds <= scene.start_seconds
      ) {
        errors.push(`Scene ${label}: end_seconds must exceed start_seconds.`);
      }

      if (!scene.visual_prompt) {
        errors.push(`Scene ${label}: missing visual_prompt.`);
      }
    });
  }

  return errors;
}

async function fetchClickUpTask(taskId, token) {
  const url =
    `${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}` +
    '?include_markdown_description=true';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `ClickUp returned HTTP ${response.status}: ${responseText}`
    );
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      `ClickUp returned an invalid JSON response: ${error.message}`
    );
  }
}

async function main() {
  const taskId = process.argv[2];
  const token = process.env.CLICKUP_API_TOKEN;

  if (!taskId) {
    throw new Error(
      'Missing task ID.\nUsage: node scripts/testClickUpPayload.js TASK_ID'
    );
  }

  if (!token) {
    throw new Error(
      'CLICKUP_API_TOKEN is not set in the environment.'
    );
  }

  console.log(`Fetching ClickUp task: ${taskId}`);

  const task = await fetchClickUpTask(taskId, token);

  const description =
    task.markdown_description ||
    task.description ||
    '';

  console.log('Task received successfully.');
  console.log(`Task name: ${task.name || '(unnamed task)'}`);
  console.log(`Description length: ${description.length} characters`);

  const payload = extractAutomationJson(description);
  const validationErrors = validatePayload(payload);

  const outputDirectory = path.resolve(
    process.cwd(),
    'output',
    taskId
  );

  await fs.mkdir(outputDirectory, {
    recursive: true,
  });

  const outputPath = path.join(
    outputDirectory,
    'automation.json'
  );

  await fs.writeFile(
    outputPath,
    JSON.stringify(payload, null, 2),
    'utf8'
  );

  console.log('\nAUTOMATION JSON parsed successfully.');
  console.log(`Project: ${payload.project}`);
  console.log(`Topic: ${payload.topic}`);
  console.log(`Title: ${payload.recommended_title}`);
  console.log(`Target duration: ${payload.target_duration_seconds}s`);
  console.log(`Scenes found: ${payload.scenes?.length || 0}`);
  console.log(`Saved to: ${outputPath}`);

  if (validationErrors.length > 0) {
    console.log('\nPayload parsed, but validation found issues:');

    for (const error of validationErrors) {
      console.log(`- ${error}`);
    }

    process.exitCode = 2;
    return;
  }

  console.log('\nPayload validation passed.');

  console.log('\nScene timing:');

  for (const scene of payload.scenes) {
    const duration =
      scene.end_seconds - scene.start_seconds;

    console.log(
      `Scene ${scene.scene_number}: ` +
      `${scene.start_seconds}s–${scene.end_seconds}s ` +
      `(${duration}s)`
    );
  }
}

main().catch((error) => {
  console.error('\nTest failed.');
  console.error(error.message);
  process.exit(1);
});
