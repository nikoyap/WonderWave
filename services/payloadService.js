'use strict';

/**
 * WonderWave Payload Service
 *
 * Extracts AUTOMATION JSON from ClickUp descriptions and normalizes both the
 * current AI-friendly schema and the older detailed schema into one manifest.
 */

const AUTOMATION_JSON_MARKER = 'AUTOMATION JSON:';

const DEFAULT_PROJECT_NAME = 'WonderWave';
const DEFAULT_PLATFORM = 'youtube_shorts';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_ASPECT_RATIO = '9:16';
const DEFAULT_FPS = 30;
const DEFAULT_WORDS_PER_MINUTE = 150;
const MIN_SCENE_DURATION_SECONDS = 1.5;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function optionalString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function requireString(value, fieldName) {
  const normalized = optionalString(value);

  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalized;
}

function optionalNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requireNumber(value, fieldName) {
  const number = optionalNumber(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return number;
}

function optionalBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', 'yes', '1'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', '0'].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalString(item)).filter(Boolean);
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}

function extractFirstJsonObject(text) {
  const objectStart = text.indexOf('{');

  if (objectStart === -1) {
    throw new Error('AUTOMATION JSON does not contain a JSON object.');
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = objectStart; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === '\\') {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(objectStart, index + 1);
      }
    }
  }

  throw new Error('AUTOMATION JSON contains an incomplete JSON object.');
}

function parseJsonText(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Unable to parse AUTOMATION JSON: ${error.message}`);
  }
}

function extractAutomationPayload(description) {
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error('The ClickUp task description is empty.');
  }

  const markerIndex = description.indexOf(AUTOMATION_JSON_MARKER);

  if (markerIndex === -1) {
    throw new Error(
      `The task description does not contain "${AUTOMATION_JSON_MARKER}".`,
    );
  }

  const contentAfterMarker = description
    .slice(markerIndex + AUTOMATION_JSON_MARKER.length)
    .trim();

  const fencedMatch = contentAfterMarker.match(
    /^```(?:json)?\s*([\s\S]*?)```/i,
  );

  if (fencedMatch) {
    return parseJsonText(fencedMatch[1].trim());
  }

  return parseJsonText(extractFirstJsonObject(contentAfterMarker));
}

function normalizeAspectRatio(aspectRatio) {
  const value = optionalString(aspectRatio, DEFAULT_ASPECT_RATIO);

  const supportedRatios = {
    '9:16': { ratio: '9:16', width: 1080, height: 1920 },
    '16:9': { ratio: '16:9', width: 1920, height: 1080 },
    '1:1': { ratio: '1:1', width: 1080, height: 1080 },
  };

  if (!supportedRatios[value]) {
    throw new Error(`Unsupported aspect ratio: ${value}`);
  }

  return supportedRatios[value];
}

function countWords(text) {
  const normalized = optionalString(text);

  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/u).filter(Boolean).length;
}

function estimateSpeechDuration(
  text,
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
) {
  const wordCount = countWords(text);

  if (wordCount === 0) {
    return MIN_SCENE_DURATION_SECONDS;
  }

  const seconds = (wordCount / wordsPerMinute) * 60;
  return Math.max(MIN_SCENE_DURATION_SECONDS, seconds);
}

function hasExplicitTiming(scene) {
  return (
    optionalNumber(firstDefined(scene.start_seconds, scene.startSeconds)) !==
      null &&
    optionalNumber(firstDefined(scene.end_seconds, scene.endSeconds)) !== null
  );
}

function deriveTargetDuration(payload, rawScenes, narrationScript) {
  const explicitDuration = optionalNumber(
    firstDefined(
      payload.target_duration_seconds,
      payload.targetDurationSeconds,
      payload.duration_seconds,
      payload.durationSeconds,
      payload.duration,
    ),
  );

  if (explicitDuration !== null && explicitDuration > 0) {
    return explicitDuration;
  }

  if (rawScenes.length > 0 && rawScenes.every(hasExplicitTiming)) {
    const lastEnd = Math.max(
      ...rawScenes.map((scene) =>
        requireNumber(
          firstDefined(scene.end_seconds, scene.endSeconds),
          'scene end time',
        ),
      ),
    );

    if (lastEnd > 0) {
      return lastEnd;
    }
  }

  return estimateSpeechDuration(narrationScript);
}

function allocateEstimatedDurations(rawScenes, targetDuration) {
  const weights = rawScenes.map((scene) => {
    const narration = firstDefined(
      scene.narration,
      scene.voiceover,
      scene.voice_over,
      scene.text,
      '',
    );

    return Math.max(1, countWords(narration));
  });

  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;

  return rawScenes.map((scene, index) => {
    const isLast = index === rawScenes.length - 1;
    const duration = isLast
      ? targetDuration - cursor
      : targetDuration * (weights[index] / totalWeight);

    const safeDuration = Math.max(0.001, duration);
    const startSeconds = cursor;
    const endSeconds = isLast ? targetDuration : cursor + safeDuration;

    cursor = endSeconds;

    return {
      startSeconds: roundSeconds(startSeconds),
      endSeconds: roundSeconds(endSeconds),
    };
  });
}

function createSceneAsset(sceneNumber) {
  const paddedSceneNumber = String(sceneNumber).padStart(2, '0');

  return {
    type: 'scene-image',
    expectedBaseName: `scene-${paddedSceneNumber}`,
    sourceAttachmentId: null,
    sourceFilename: null,
    sourceUrl: null,
    localPath: null,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
  };
}

function normalizeScene(scene, index, timing) {
  if (!isPlainObject(scene)) {
    throw new Error(`scenes[${index}] must be an object.`);
  }

  const sceneNumber = requireNumber(
    firstDefined(
      scene.scene_number,
      scene.sceneNumber,
      scene.scene,
      index + 1,
    ),
    `scenes[${index}].scene`,
  );

  const startSeconds = requireNumber(
    timing.startSeconds,
    `Scene ${sceneNumber} start time`,
  );

  const endSeconds = requireNumber(
    timing.endSeconds,
    `Scene ${sceneNumber} end time`,
  );

  if (startSeconds < 0) {
    throw new Error(`Scene ${sceneNumber} cannot start before zero.`);
  }

  if (endSeconds <= startSeconds) {
    throw new Error(
      `Scene ${sceneNumber} end time must exceed its start time.`,
    );
  }

  const visualPrompt = requireString(
    firstDefined(
      scene.visual_prompt,
      scene.visualPrompt,
      scene.image_prompt,
      scene.imagePrompt,
      scene.prompt,
    ),
    `Scene ${sceneNumber} imagePrompt`,
  );

  const voiceover = optionalString(
    firstDefined(
      scene.voiceover,
      scene.voice_over,
      scene.narration,
      scene.text,
    ),
  );

  return {
    sceneNumber,
    startSeconds,
    endSeconds,
    durationSeconds: roundSeconds(endSeconds - startSeconds),
    voiceover,
    narration: voiceover,
    visualPrompt,
    imagePrompt: visualPrompt,
    onscreenText: optionalString(
      firstDefined(
        scene.onscreen_text,
        scene.onscreenText,
        scene.on_screen_text,
      ),
    ),
    soundEffect: optionalString(
      firstDefined(scene.sound_effect, scene.soundEffect, scene.sfx),
    ),
    motion:
      optionalString(
        firstDefined(scene.motion, scene.camera_motion, scene.cameraMotion),
      ) || null,
    emotion:
      optionalString(firstDefined(scene.emotion, scene.mood)) || null,
    asset: createSceneAsset(sceneNumber),
  };
}

function normalizeScenes(payload, targetDuration) {
  const rawScenes = payload.scenes;

  if (!Array.isArray(rawScenes)) {
    throw new Error('The payload scenes field must be an array.');
  }

  if (rawScenes.length === 0) {
    throw new Error('The payload contains no scenes.');
  }

  const explicitTiming = rawScenes.every(hasExplicitTiming);

  const timings = explicitTiming
    ? rawScenes.map((scene) => ({
        startSeconds: requireNumber(
          firstDefined(scene.start_seconds, scene.startSeconds),
          'scene start time',
        ),
        endSeconds: requireNumber(
          firstDefined(scene.end_seconds, scene.endSeconds),
          'scene end time',
        ),
      }))
    : allocateEstimatedDurations(rawScenes, targetDuration);

  return rawScenes
    .map((scene, index) => normalizeScene(scene, index, timings[index]))
    .sort((first, second) => first.startSeconds - second.startSeconds);
}

function validateSceneSequence(scenes, targetDuration) {
  const tolerance = 0.01;

  if (Math.abs(scenes[0].startSeconds) > tolerance) {
    throw new Error('The first scene must start at 0 seconds.');
  }

  for (let index = 1; index < scenes.length; index += 1) {
    const previous = scenes[index - 1];
    const current = scenes[index];
    const difference = current.startSeconds - previous.endSeconds;

    if (Math.abs(difference) > tolerance) {
      const problem = difference > 0 ? 'gap' : 'overlap';

      throw new Error(
        `Scene timing ${problem} between scenes ` +
          `${previous.sceneNumber} and ${current.sceneNumber}: ` +
          `${Math.abs(difference).toFixed(3)} seconds.`,
      );
    }
  }

  const finalScene = scenes[scenes.length - 1];

  if (Math.abs(finalScene.endSeconds - targetDuration) > tolerance) {
    throw new Error(
      `The final scene ends at ${finalScene.endSeconds}s, ` +
        `but the target duration is ${targetDuration}s.`,
    );
  }
}

function normalizePayload(payload, taskId) {
  if (!isPlainObject(payload)) {
    throw new Error('The automation payload must be an object.');
  }

  if (!Array.isArray(payload.scenes)) {
    throw new Error('The payload scenes field must be an array.');
  }

  const narrationScript = requireString(
    firstDefined(
      payload.voiceover_script,
      payload.voiceoverScript,
      payload.narration,
      payload.script,
    ),
    'narration or script',
  );

  const targetDuration = deriveTargetDuration(
    payload,
    payload.scenes,
    narrationScript,
  );

  if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
    throw new Error('The derived target duration must exceed zero.');
  }

  const scenes = normalizeScenes(payload, targetDuration);
  validateSceneSequence(scenes, targetDuration);

  const dimensions = normalizeAspectRatio(
    firstDefined(
      payload.aspect_ratio,
      payload.aspectRatio,
      DEFAULT_ASPECT_RATIO,
    ),
  );

  const title = optionalString(
    firstDefined(
      payload.recommended_title,
      payload.recommendedTitle,
      payload.title,
      payload.task_name,
      payload.taskName,
    ),
  );

  const tone =
    optionalString(firstDefined(payload.tone, payload.mood, 'educational')) ||
    'educational';

  const motion =
    optionalString(
      firstDefined(payload.motion, payload.camera_motion, payload.cameraMotion),
    ) || null;

  const thumbnailPayload = isPlainObject(payload.thumbnail)
    ? payload.thumbnail
    : {};

  const timingMode = payload.scenes.every(hasExplicitTiming)
    ? 'explicit-scene-timing'
    : 'estimated-from-narration';

const youtube = isPlainObject(payload.youtube)
    ? payload.youtube
    : {};

  return {
    manifestVersion: 2,
    generatedAt: new Date().toISOString(),
    payloadVersion: firstDefined(
      payload.version,
      payload.payload_version,
      payload.payloadVersion,
      null,
    ),
    tone,
    motion,
    source: {
      provider: 'clickup',
      taskId,
      payloadTaskId: firstDefined(payload.task_id, payload.taskId, null),
      scriptVersion: firstDefined(
        payload.script_version,
        payload.scriptVersion,
        payload.version,
        1,
      ),
    },
    project: {
      name:
        optionalString(payload.project, DEFAULT_PROJECT_NAME) ||
        DEFAULT_PROJECT_NAME,
      platform:
        optionalString(payload.platform, DEFAULT_PLATFORM) || DEFAULT_PLATFORM,
      taskName: optionalString(
        firstDefined(payload.task_name, payload.taskName, title),
      ),
      topic: optionalString(firstDefined(payload.topic, title)),
      language:
        optionalString(payload.language, DEFAULT_LANGUAGE) || DEFAULT_LANGUAGE,
    },
    video: {
      targetDurationSeconds: roundSeconds(targetDuration),
      aspectRatio: dimensions.ratio,
      width: dimensions.width,
      height: dimensions.height,
      framesPerSecond: optionalNumber(
        firstDefined(
          payload.frames_per_second,
          payload.framesPerSecond,
          payload.fps,
        ),
        DEFAULT_FPS,
      ),
      timingMode,
      tone,
      motion,
    },
    narration: {
      script: narrationScript,
      audioPath: 'assets/audio/narration.mp3',
      subtitlesPath: 'assets/subtitles/subtitles.ass',
    },
    

publishing: {
    title:
        optionalString(
            firstDefined(
                youtube.title,
                payload.title,
                title
            )
        ),

    description:
        optionalString(
            firstDefined(
                youtube.description,
                payload.description
            )
        ),

    hashtags:
        normalizeStringArray(
            firstDefined(
                youtube.hashtags,
                payload.hashtags
            )
        ),

    tags:
        normalizeStringArray(
            firstDefined(
                youtube.tags,
                payload.tags
            )
        ),

    privacy:
        optionalString(
            firstDefined(
                youtube.privacy,
                payload.privacy,
                "private"
            )
        ),

    language:
        optionalString(
            firstDefined(
                youtube.language,
                payload.language,
                DEFAULT_LANGUAGE
            )
        ),

    madeForKids:
        optionalBoolean(
            firstDefined(
                youtube.made_for_kids,
                payload.made_for_kids,
                payload.madeForKids
            )
        ),

    containsSyntheticMedia:
        optionalBoolean(
            firstDefined(
                youtube.contains_synthetic_media,
                payload.contains_synthetic_media,
                payload.containsSyntheticMedia
            )
        ),

    status:
        optionalString(
            firstDefined(
                youtube.status,
                payload.publish_status,
                payload.publishStatus,
                "draft"
            )
        )
},

      
    scenes,
    thumbnail: {
      text: optionalString(
        firstDefined(
          thumbnailPayload.text,
          payload.thumbnail_text,
          payload.thumbnailText,
        ),
      ),
      prompt: optionalString(
        firstDefined(
          thumbnailPayload.prompt,
          payload.thumbnail_prompt,
          payload.thumbnailPrompt,
        ),
      ),
      asset: {
        type: 'thumbnail',
        expectedBaseName: 'thumbnail',
        sourceAttachmentId: null,
        sourceFilename: null,
        sourceUrl: null,
        localPath: null,
        mimeType: null,
        sizeBytes: null,
        sha256: null,
      },
    },
  };
}

module.exports = {
  AUTOMATION_JSON_MARKER,
  extractAutomationPayload,
  normalizePayload,
  normalizeAspectRatio,
};
