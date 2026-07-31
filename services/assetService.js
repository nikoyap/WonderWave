'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

function getAttachmentFilename(attachment) {
  return (
    attachment?.title ||
    attachment?.name ||
    attachment?.filename ||
    attachment?.file_name ||
    ''
  );
}

function getAttachmentUrl(attachment) {
  return (
    attachment?.url ||
    attachment?.download_url ||
    attachment?.downloadUrl ||
    attachment?.file_url ||
    attachment?.fileUrl ||
    null
  );
}

function getAttachmentId(attachment) {
  return (
    attachment?.id ||
    attachment?.attachment_id ||
    attachment?.attachmentId ||
    null
  );
}

function getAttachmentMimeType(attachment) {
  return (
    attachment?.mimetype ||
    attachment?.mime_type ||
    attachment?.mimeType ||
    null
  );
}

function parseSceneNumber(filename) {
  const normalizedFilename = String(filename || '')
    .trim()
    .toLowerCase();

  const match = normalizedFilename.match(
    /^scene-(\d+)\.(png|jpg|jpeg|webp)$/
  );

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function isThumbnailFilename(filename) {
  const normalizedFilename = String(filename || '')
    .trim()
    .toLowerCase();

  return /^thumbnail.*\.(png|jpg|jpeg|webp)$/.test(
    normalizedFilename
  );
}

function isImageAttachment(attachment) {
  const filename =
    getAttachmentFilename(attachment);

  const mimeType = String(
    getAttachmentMimeType(attachment) || ''
  ).toLowerCase();

  const extension = path
    .extname(filename)
    .toLowerCase();

  return (
    mimeType.startsWith('image/') ||
    IMAGE_EXTENSIONS.has(extension)
  );
}

function getExtension(filename, mimeType) {
  const filenameExtension = path
    .extname(filename || '')
    .toLowerCase();

  if (IMAGE_EXTENSIONS.has(filenameExtension)) {
    return filenameExtension === '.jpeg'
      ? '.jpg'
      : filenameExtension;
  }

  const normalizedMimeType = String(
    mimeType || ''
  )
    .split(';')[0]
    .trim()
    .toLowerCase();

  const extensionByMimeType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

  return (
    extensionByMimeType[normalizedMimeType] ||
    null
  );
}

function detectMimeType(buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() ===
      'RIFF' &&
    buffer.subarray(8, 12).toString() ===
      'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function validateAttachmentShape(attachment) {
  const filename =
    getAttachmentFilename(attachment);

  const url =
    getAttachmentUrl(attachment);

  if (!filename) {
    throw new Error(
      'A ClickUp attachment has no usable filename.'
    );
  }

  if (!url) {
    throw new Error(
      `Attachment "${filename}" has no usable download URL.`
    );
  }

  return {
    filename,
    url,
  };
}

function validateAttachmentMapping({
  attachments,
  scenes,
  requireThumbnail,
}) {
  const imageAttachments =
    attachments.filter(isImageAttachment);

  const sceneMap = new Map();
  const duplicateScenes = [];

  for (const attachment of imageAttachments) {
    const filename =
      getAttachmentFilename(attachment);

    const sceneNumber =
      parseSceneNumber(filename);

    if (sceneNumber === null) {
      continue;
    }

    if (sceneMap.has(sceneNumber)) {
      duplicateScenes.push({
        sceneNumber,
        filenames: [
          getAttachmentFilename(
            sceneMap.get(sceneNumber)
          ),
          filename,
        ],
      });

      continue;
    }

    sceneMap.set(
      sceneNumber,
      attachment
    );
  }

  if (duplicateScenes.length > 0) {
    throw new Error(
      [
        'Duplicate scene attachments found.',
        ...duplicateScenes.map(
          ({ sceneNumber, filenames }) =>
            `Scene ${sceneNumber}: ${filenames.join(', ')}`
        ),
      ].join('\n')
    );
  }

  const expectedSceneNumbers = new Set(
    scenes.map((scene) =>
      Number(scene.sceneNumber)
    )
  );

  const missingScenes = [
    ...expectedSceneNumbers,
  ].filter(
    (sceneNumber) =>
      !sceneMap.has(sceneNumber)
  );

  if (missingScenes.length > 0) {
    throw new Error(
      [
        'Missing ClickUp scene attachments.',
        ...missingScenes.map(
          (sceneNumber) =>
            `Expected scene-${String(sceneNumber).padStart(2, '0')}.png`
        ),
      ].join('\n')
    );
  }

  const unexpectedScenes = [
    ...sceneMap.keys(),
  ]
    .filter(
      (sceneNumber) =>
        !expectedSceneNumbers.has(sceneNumber)
    )
    .sort((a, b) => a - b);

  if (unexpectedScenes.length > 0) {
    throw new Error(
      [
        'Unexpected scene attachments found.',
        ...unexpectedScenes.map(
          (sceneNumber) =>
            `scene-${String(sceneNumber).padStart(2, '0')}`
        ),
      ].join('\n')
    );
  }

  const thumbnailAttachments =
    imageAttachments.filter(
      (attachment) =>
        isThumbnailFilename(
          getAttachmentFilename(attachment)
        )
    );

  if (thumbnailAttachments.length > 1) {
    throw new Error(
      [
        'Multiple thumbnail attachments found.',
        ...thumbnailAttachments.map(
          (attachment) =>
            getAttachmentFilename(attachment)
        ),
      ].join('\n')
    );
  }

  if (
    requireThumbnail &&
    thumbnailAttachments.length === 0
  ) {
    throw new Error(
      [
        'Missing required thumbnail.',
        'Expected a filename beginning with "thumbnail",',
        'such as thumbnail-concept.png.',
      ].join('\n')
    );
  }

  return {
    strategy: 'deterministic-filename',

    sceneAttachments:
      scenes.map((scene) =>
        sceneMap.get(
          Number(scene.sceneNumber)
        )
      ),

    thumbnailAttachment:
      thumbnailAttachments[0] || null,
  };
}

async function calculateSha256(filePath) {
  const fileBuffer =
    await fs.readFile(filePath);

  return crypto
    .createHash('sha256')
    .update(fileBuffer)
    .digest('hex');
}

async function fetchAttachment({
  url,
  apiToken,
  timeoutMs,
  includeAuthorization,
}) {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  const headers = {
    Accept: 'image/*',
  };

  if (
    includeAuthorization &&
    apiToken
  ) {
    headers.Authorization = apiToken;
  }

  try {
    return await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadAttachment({
  attachment,
  destinationBasePath,
  config,
  apiToken,
}) {
  const {
    filename,
    url,
  } = validateAttachmentShape(attachment);

  let response;

  try {
    response = await fetchAttachment({
      url,
      apiToken,
      timeoutMs:
        config.assets.requestTimeoutMs,
      includeAuthorization: true,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        `Download timed out for "${filename}".`
      );
    }

    throw error;
  }

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    try {
      response = await fetchAttachment({
        url,
        apiToken: null,
        timeoutMs:
          config.assets.requestTimeoutMs,
        includeAuthorization: false,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(
          `Download timed out for "${filename}".`
        );
      }

      throw error;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Unable to download "${filename}": ` +
      `${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const buffer =
    Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new Error(
      `Attachment "${filename}" downloaded as an empty file.`
    );
  }

  if (
    buffer.length >
    config.assets.maximumFileSizeBytes
  ) {
    throw new Error(
      `Attachment "${filename}" exceeds the configured size limit.`
    );
  }

  const detectedMimeType =
    detectMimeType(buffer);

  if (!detectedMimeType) {
    const preview = buffer
      .subarray(0, 100)
      .toString('utf8')
      .replace(/\s+/g, ' ');

    throw new Error(
      `Attachment "${filename}" is not a supported image. ` +
      `Response begins with: ${preview}`
    );
  }

  if (
    !config.assets.allowedMimeTypes.includes(
      detectedMimeType
    )
  ) {
    throw new Error(
      `Unsupported image type for "${filename}": ` +
      detectedMimeType
    );
  }

  const extension =
    getExtension(
      filename,
      detectedMimeType
    );

  if (!extension) {
    throw new Error(
      `Unable to determine the file extension for "${filename}".`
    );
  }

  const destinationPath =
    `${destinationBasePath}${extension}`;

  await fs.mkdir(
    path.dirname(destinationPath),
    {
      recursive: true,
    }
  );

  const temporaryPath =
    `${destinationPath}.tmp`;

  try {
    await fs.writeFile(
      temporaryPath,
      buffer
    );

    await fs.rename(
      temporaryPath,
      destinationPath
    );
  } catch (error) {
    await fs.rm(
      temporaryPath,
      {
        force: true,
      }
    );

    throw error;
  }

  return {
    attachmentId:
      getAttachmentId(attachment),

    sourceFilename:
      filename,

    sourceUrl:
      url,

    localPath:
      destinationPath,

    mimeType:
      detectedMimeType,

    sizeBytes:
      buffer.length,

    sha256:
      await calculateSha256(
        destinationPath
      ),
  };
}

function createAttachmentDiagnostic(
  attachments
) {
  return attachments.map(
    (attachment) => ({
      id:
        getAttachmentId(attachment),

      filename:
        getAttachmentFilename(
          attachment
        ),

      mimeType:
        getAttachmentMimeType(
          attachment
        ),

      hasUrl:
        Boolean(
          getAttachmentUrl(attachment)
        ),
    })
  );
}

async function execute(context) {
  const {
    task,
    manifest,
    run,
    config,
    logger,
  } = context;

  const attachments =
    Array.isArray(task?.attachments)
      ? task.attachments
      : [];

  if (attachments.length === 0) {
    throw new Error(
      [
        'The ClickUp task has no attachments.',
        'Attach the generated scene images and thumbnail before running the pipeline.',
      ].join(' ')
    );
  }

  await logger.info(
    'Resolving ClickUp assets.',
    {
      attachmentCount:
        attachments.length,

      attachments:
        createAttachmentDiagnostic(
          attachments
        ),
    }
  );

  const resolvedAssets =
    validateAttachmentMapping({
      attachments,
      scenes:
        manifest.scenes,
      requireThumbnail:
        config.assets.requireThumbnail,
    });

  await logger.info(
    'ClickUp asset mapping resolved.',
    {
      strategy:
        resolvedAssets.strategy,

      sceneCount:
        resolvedAssets
          .sceneAttachments
          .length,

      thumbnailFilename:
        resolvedAssets
          .thumbnailAttachment
          ? getAttachmentFilename(
              resolvedAssets
                .thumbnailAttachment
            )
          : null,
    }
  );

  const downloadedScenes = [];

  for (
    let index = 0;
    index < manifest.scenes.length;
    index += 1
  ) {
    const scene =
      manifest.scenes[index];

    const attachment =
      resolvedAssets
        .sceneAttachments[index];

    const paddedSceneNumber =
      String(scene.sceneNumber)
        .padStart(2, '0');

    const result =
      await downloadAttachment({
        attachment,

        destinationBasePath:
          path.join(
            run.runDirectory,
            'assets',
            'images',
            `scene-${paddedSceneNumber}`
          ),

        config,

        apiToken:
          config.clickup.apiToken,
      });

    const relativePath =
      path.relative(
        run.runDirectory,
        result.localPath
      );

    scene.asset = {
      ...(scene.asset || {}),

      type: 'scene-image',

      expectedBaseName:
        `scene-${paddedSceneNumber}`,

      sourceAttachmentId:
        result.attachmentId,

      sourceFilename:
        result.sourceFilename,

      sourceUrl:
        result.sourceUrl,

      localPath:
        relativePath,

      mimeType:
        result.mimeType,

      sizeBytes:
        result.sizeBytes,

      sha256:
        result.sha256,

      downloadedAt:
        new Date().toISOString(),
    };

    downloadedScenes.push({
      sceneNumber:
        scene.sceneNumber,

      sourceFilename:
        result.sourceFilename,

      localPath:
        relativePath,

      mimeType:
        result.mimeType,

      sizeBytes:
        result.sizeBytes,

      sha256:
        result.sha256,
    });

    await logger.info(
      `Downloaded scene ${scene.sceneNumber}.`,
      {
        sourceFilename:
          result.sourceFilename,

        localPath:
          relativePath,

        sizeBytes:
          result.sizeBytes,
      }
    );
  }

  const thumbnailAttachment =
    resolvedAssets.thumbnailAttachment;

  let thumbnailOutput = null;

  if (thumbnailAttachment) {
    const thumbnailResult =
      await downloadAttachment({
        attachment:
          thumbnailAttachment,

        destinationBasePath:
          path.join(
            run.runDirectory,
            'assets',
            'thumbnail',
            'thumbnail'
          ),

        config,

        apiToken:
          config.clickup.apiToken,
      });

    const relativePath =
      path.relative(
        run.runDirectory,
        thumbnailResult.localPath
      );

    manifest.thumbnail =
      manifest.thumbnail || {};

    manifest.thumbnail.asset = {
      ...(manifest.thumbnail.asset || {}),

      type: 'thumbnail',

      expectedBaseName:
        'thumbnail',

      sourceAttachmentId:
        thumbnailResult.attachmentId,

      sourceFilename:
        thumbnailResult.sourceFilename,

      sourceUrl:
        thumbnailResult.sourceUrl,

      localPath:
        relativePath,

      mimeType:
        thumbnailResult.mimeType,

      sizeBytes:
        thumbnailResult.sizeBytes,

      sha256:
        thumbnailResult.sha256,

      downloadedAt:
        new Date().toISOString(),
    };

    thumbnailOutput = {
      sourceFilename:
        thumbnailResult.sourceFilename,

      localPath:
        relativePath,

      mimeType:
        thumbnailResult.mimeType,

      sizeBytes:
        thumbnailResult.sizeBytes,

      sha256:
        thumbnailResult.sha256,
    };

    await logger.info(
      'Downloaded thumbnail.',
      {
        sourceFilename:
          thumbnailResult.sourceFilename,

        localPath:
          relativePath,

        sizeBytes:
          thumbnailResult.sizeBytes,
      }
    );
  } else {
    await logger.warn(
      'No thumbnail attachment found; continuing because it is optional.'
    );
  }

  context.outputs.assets = {
    provider: 'clickup',

    mappingStrategy:
      resolvedAssets.strategy,

    sceneCount:
      downloadedScenes.length,

    scenes:
      downloadedScenes,

    thumbnail:
      thumbnailOutput,
  };

  await logger.info(
    'ClickUp assets downloaded.',
    {
      mappingStrategy:
        resolvedAssets.strategy,

      sceneCount:
        downloadedScenes.length,

      thumbnailDownloaded:
        Boolean(thumbnailOutput),
    }
  );

  return context;
}

module.exports = {
  name: 'assets',
  execute,
};
