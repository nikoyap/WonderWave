#!/usr/bin/env node

'use strict';

const fs = require('fs/promises');
const path = require('path');

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function requireNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return number;
}

function normalizeAspectRatio(aspectRatio) {
  const value = String(aspectRatio || '9:16').trim();

  const supportedRatios = {
    '9:16': {
      ratio: '9:16',
      width: 1080,
      height: 1920,
    },
    '16:9': {
      ratio: '16:9',
      width: 1920,
      height: 1080,
    },
    '1:1': {
      ratio: '1:1',
      width: 1080,
      height: 1080,
    },
  };

  if (!supportedRatios[value]) {
    throw new Error(`Unsupported aspect ratio: ${value}`);
  }

  return supportedRatios[value];
}

function normalizeScene(scene, index) {
  const sceneNumber = requireNumber(
    scene.scene_number ?? index + 1,
    `scenes[${index}].scene_number`
  );

  const startSeconds = requireNumber(
    scene.start_seconds,
    `Scene ${sceneNumber} start_seconds`
  );

  const endSeconds = requireNumber(
    scene.end_seconds,
    `Scene ${sceneNumber} end_seconds`
  );

  if (startSeconds < 0) {
    throw new Error(
      `Scene ${sceneNumber} start_seconds cannot be negative.`
    );
  }

  if (endSeconds <= startSeconds) {
    throw new Error(
      `Scene ${sceneNumber} end_seconds must exceed start_seconds.`
    );
  }

  return {
    sceneNumber,
    startSeconds,
    endSeconds,
    durationSeconds: Number(
      (endSeconds - startSeconds).toFixed(3)
    ),

    voiceover:
      typeof scene.voiceover === 'string'
        ? scene.voiceover.trim()
        : '',

    visualPrompt: requireString(
      scene.visual_prompt,
      `Scene ${sceneNumber} visual_prompt`
    ),

    onscreenText:
      typeof scene.onscreen_text === 'string'
        ? scene.onscreen_text.trim()
        : '',

    soundEffect:
      typeof scene.sound_effect === 'string'
        ? scene.sound_effect.trim()
        : '',

    // Paths are assigned now but files do not need to exist yet.
    imagePath: `assets/images/scene-${String(sceneNumber).padStart(
      2,
      '0'
    )}.png`,
  };
}

function validateSceneSequence(scenes, targetDuration) {
  const tolerance = 0.001;

  if (scenes.length === 0) {
    throw new Error('The payload contains no scenes.');
  }

  if (Math.abs(scenes[0].startSeconds) > tolerance) {
    throw new Error(
      `Scene 1 must start at 0 seconds, received ${scenes[0].startSeconds}.`
    );
  }

  for (let index = 1; index < scenes.length; index += 1) {
    const previous = scenes[index - 1];
    const current = scenes[index];

    const difference =
      current.startSeconds - previous.endSeconds;

    if (Math.abs(difference) > tolerance) {
      const type = difference > 0 ? 'gap' : 'overlap';

      throw new Error(
        `Scene timing ${type} between scenes ` +
        `${previous.sceneNumber} and ${current.sceneNumber}: ` +
        `${Math.abs(difference).toFixed(3)} seconds.`
      );
    }
  }

  const finalEnd = scenes[scenes.length - 1].endSeconds;

  if (Math.abs(finalEnd - targetDuration) > tolerance) {
    throw new Error(
      `Final scene ends at ${finalEnd}s, but target duration is ` +
      `${targetDuration}s.`
    );
  }
}

function normalizePayload(payload, taskId) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Automation payload must be a JSON object.');
  }

  const targetDuration = requireNumber(
    payload.target_duration_seconds,
    'target_duration_seconds'
  );

  if (targetDuration <= 0) {
    throw new Error(
      'target_duration_seconds must be greater than zero.'
    );
  }

  if (!Array.isArray(payload.scenes)) {
    throw new Error('scenes must be an array.');
  }

  const scenes = payload.scenes
    .map(normalizeScene)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  validateSceneSequence(scenes, targetDuration);

  const video = normalizeAspectRatio(payload.aspect_ratio);

  return {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),

    source: {
      provider: 'clickup',
      taskId,
      payloadTaskId: payload.task_id || null,
      scriptVersion: payload.script_version ?? 1,
    },

    project: {
      name: payload.project || 'WonderWave',
      platform: payload.platform || 'youtube_shorts',
      taskName: payload.task_name || '',
      topic: payload.topic || '',
      language: payload.language || 'en',
    },

    video: {
      targetDurationSeconds: targetDuration,
      aspectRatio: video.ratio,
      width: video.width,
      height: video.height,
      framesPerSecond: 30,
      timingMode: 'explicit-scene-timing',
    },

    narration: {
      script: requireString(
        payload.voiceover_script,
        'voiceover_script'
      ),
      audioPath: 'assets/audio/narration.mp3',
      subtitlesPath: 'assets/subtitles/subtitles.ass',
    },

    publishing: {
      title: payload.recommended_title || '',
      description: payload.description || '',
      hashtags: Array.isArray(payload.hashtags)
        ? payload.hashtags
        : [],
      tags: Array.isArray(payload.tags)
        ? payload.tags
        : [],
      madeForKids: Boolean(payload.made_for_kids),
      containsSyntheticMedia: Boolean(
        payload.contains_synthetic_media
      ),
      status: payload.publish_status || 'draft',
    },

    scenes,

    thumbnail: {
      text: payload.thumbnail?.text || '',
      prompt: payload.thumbnail?.prompt || '',
      imagePath: 'assets/thumbnail/thumbnail.png',
    },

    output: {
      videoPath: 'final-v3.2.mp4',
    },
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const taskId = process.argv[2];

  if (!taskId) {
    throw new Error(
      'Missing task ID.\n' +
      'Usage: node scripts/testNormalizePayload.js TASK_ID'
    );
  }

  const projectDirectory = path.resolve(
    process.cwd(),
    'output',
    taskId
  );

  const automationPath = path.join(
    projectDirectory,
    'automation.json'
  );

  const manifestPath = path.join(
    projectDirectory,
    'manifest.json'
  );

  if (!(await fileExists(automationPath))) {
    throw new Error(
      `automation.json was not found:\n${automationPath}\n\n` +
      'Run testClickUpPayload.js first.'
    );
  }

  console.log(`Reading: ${automationPath}`);

  const rawPayload = await fs.readFile(
    automationPath,
    'utf8'
  );

  let payload;

  try {
    payload = JSON.parse(rawPayload);
  } catch (error) {
    throw new Error(
      `automation.json is invalid: ${error.message}`
    );
  }

  const manifest = normalizePayload(payload, taskId);

  await fs.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  const totalSceneDuration = manifest.scenes.reduce(
    (total, scene) => total + scene.durationSeconds,
    0
  );

  console.log('\nPayload normalized successfully.');
  console.log(`Task ID: ${manifest.source.taskId}`);
  console.log(`Title: ${manifest.publishing.title}`);
  console.log(
    `Resolution: ${manifest.video.width}x${manifest.video.height}`
  );
  console.log(
    `Timing mode: ${manifest.video.timingMode}`
  );
  console.log(`Scenes: ${manifest.scenes.length}`);
  console.log(
    `Scene duration total: ${totalSceneDuration.toFixed(3)}s`
  );
  console.log(
    `Target duration: ${manifest.video.targetDurationSeconds}s`
  );

  console.log('\nNormalized scenes:');

  for (const scene of manifest.scenes) {
    console.log(
      `Scene ${scene.sceneNumber}: ` +
      `${scene.startSeconds}s–${scene.endSeconds}s ` +
      `(${scene.durationSeconds}s) | ` +
      `${scene.onscreenText || '(no onscreen text)'}`
    );
  }

  console.log(`\nManifest saved to: ${manifestPath}`);
  console.log('\nDry-run normalization passed.');
}

main().catch((error) => {
  console.error('\nNormalization test failed.');
  console.error(error.message);
  process.exit(1);
});
