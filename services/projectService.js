require('dotenv').config({ path: '/opt/wonderwave/.env' });

const fs = require('fs/promises');
const path = require('path');

const PROJECTS_DIR =
  process.env.PROJECTS_DIR || '/opt/wonderwave/projects';

function sanitizeFolderName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Job payload must be a valid object');
  }

  const taskId = payload.task_id || payload.id;

  if (!taskId) {
    throw new Error('Missing required field: task_id');
  }

  if (!payload.topic && !payload.script) {
    throw new Error('At least one of topic or script is required');
  }

  return {
    task_id: String(taskId),
    task_name: payload.task_name
      ? String(payload.task_name)
      : 'Untitled WonderWave Video',
    topic: payload.topic ? String(payload.topic) : '',
    script: payload.script ? String(payload.script) : '',
    language: payload.language
      ? String(payload.language)
      : 'en',
    target_duration_seconds: Number(
      payload.target_duration_seconds || 60
    ),
    title: payload.title ? String(payload.title) : '',
    description: payload.description
      ? String(payload.description)
      : '',
    tags: Array.isArray(payload.tags)
      ? payload.tags.map(String)
      : [],
    image_urls: Array.isArray(payload.image_urls)
      ? payload.image_urls.map(String)
      : [],
    created_at: new Date().toISOString(),
  };
}

async function createProject(payload) {
  const projectData = validatePayload(payload);

  const safeTaskId =
    sanitizeFolderName(projectData.task_id) ||
    `job-${Date.now()}`;

  const projectDir = path.join(PROJECTS_DIR, safeTaskId);

  const directories = {
    root: projectDir,
    assets: path.join(projectDir, 'assets'),
    audio: path.join(projectDir, 'audio'),
    images: path.join(projectDir, 'images'),
    render: path.join(projectDir, 'render'),
    output: path.join(projectDir, 'output'),
    logs: path.join(projectDir, 'logs'),
  };

  await Promise.all(
    Object.values(directories).map((directory) =>
      fs.mkdir(directory, { recursive: true })
    )
  );

  const metadataPath = path.join(projectDir, 'metadata.json');
  const scriptPath = path.join(projectDir, 'script.txt');
  const statusPath = path.join(projectDir, 'status.json');

  await fs.writeFile(
    metadataPath,
    JSON.stringify(projectData, null, 2),
    'utf8'
  );

  const rawScript = projectData.script || '';

const narrationMatch = rawScript.match(
  /Final Narration\s*([\s\S]*?)\s*Scene JSON/i
);

if (!narrationMatch) {
  throw new Error(
    'Could not extract Final Narration from projectData.script.'
  );
}

const narration = narrationMatch[1].trim();

const wordCount = narration.split(/\s+/).filter(Boolean).length;

console.log(
  `[Project Service] Extracted narration (${wordCount} words)`
);

await fs.writeFile(
  scriptPath,
  `${narration}\n`,
  'utf8'
);

  const status = {
    task_id: projectData.task_id,
    status: 'prepared',
    stage: 'project-preparation',
    progress: 20,
    updated_at: new Date().toISOString(),
  };

  await fs.writeFile(
    statusPath,
    JSON.stringify(status, null, 2),
    'utf8'
  );

  return {
    projectDir,
    metadataPath,
    scriptPath,
    statusPath,
    directories,
    projectData,
  };
}

async function updateProjectStatus(
  projectDir,
  status,
  stage,
  progress,
  extra = {}
) {
  const statusPath = path.join(projectDir, 'status.json');

  const statusData = {
    status,
    stage,
    progress,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  await fs.writeFile(
    statusPath,
    JSON.stringify(statusData, null, 2),
    'utf8'
  );

  return statusData;
}

module.exports = {
  createProject,
  updateProjectStatus,
  validatePayload,
};
