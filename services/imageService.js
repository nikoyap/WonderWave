require('dotenv').config({
  path: '/opt/wonderwave/.env',
});

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const CLICKUP_API_TOKEN =
  process.env.CLICKUP_API_TOKEN || '';

const IMAGE_WIDTH = parsePositiveInteger(
  process.env.IMAGE_WIDTH,
  1080
);

const IMAGE_HEIGHT = parsePositiveInteger(
  process.env.IMAGE_HEIGHT,
  1920
);

const IMAGE_QUALITY = parsePositiveInteger(
  process.env.IMAGE_QUALITY,
  90
);

const MAX_IMAGE_COUNT = parsePositiveInteger(
  process.env.IMAGE_MAX_COUNT,
  20
);

const MAX_DOWNLOAD_BYTES =
  parsePositiveInteger(
    process.env.IMAGE_MAX_DOWNLOAD_BYTES,
    20 * 1024 * 1024
  );

const DOWNLOAD_TIMEOUT_MS =
  parsePositiveInteger(
    process.env.IMAGE_DOWNLOAD_TIMEOUT_MS,
    60000
  );

const MAX_REDIRECTS = 6;

const MIME_EXTENSIONS = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  avif: '.avif',
};

/**
 * Download ClickUp image attachments and prepare vertical scenes.
 *
 * @param {object} options
 * @param {string} options.projectDir
 * @param {object[]} options.attachments
 * @returns {Promise<object>}
 */
async function prepareClickUpImages({
  projectDir,
  attachments,
}) {
  if (!projectDir) {
    throw new Error('projectDir is required');
  }

  if (
    !Array.isArray(attachments) ||
    attachments.length === 0
  ) {
    throw new Error(
      'At least one ClickUp image attachment is required'
    );
  }

  if (
    attachments.length > MAX_IMAGE_COUNT
  ) {
    throw new Error(
      `ClickUp task contains ${attachments.length} image attachments. Maximum allowed is ${MAX_IMAGE_COUNT}.`
    );
  }

  const imagesDir = path.join(
    projectDir,
    'images'
  );

  const sourceDir = path.join(
    imagesDir,
    'source'
  );

  await fs.mkdir(sourceDir, {
    recursive: true,
  });

  await cleanGeneratedFiles(
    imagesDir,
    sourceDir
  );

  const results = [];

  for (
    let index = 0;
    index < attachments.length;
    index += 1
  ) {
    const attachment = attachments[index];

    const sequence = String(
      index + 1
    ).padStart(3, '0');

    console.log(
      `[Image Service] Downloading ClickUp image ${sequence}: ${attachment.filename}`
    );

    const downloaded =
      await downloadClickUpAttachment(
        attachment.url
      );

    const sourceExtension =
      MIME_EXTENSIONS[
        downloaded.metadata.format
      ];

    if (!sourceExtension) {
      throw new Error(
        `Unsupported image format for ${attachment.filename}: ${downloaded.metadata.format}`
      );
    }

    const sourceFilename =
      `source-${sequence}${sourceExtension}`;

    const sourcePath = path.join(
      sourceDir,
      sourceFilename
    );

    const sceneFilename =
      `scene-${sequence}.jpg`;

    const scenePath = path.join(
      imagesDir,
      sceneFilename
    );

    await fs.writeFile(
      sourcePath,
      downloaded.buffer,
      {
        flag: 'wx',
      }
    );

    await normalizeSceneImage({
      sourcePath,
      scenePath,
    });

    const sceneMetadata =
      await sharp(scenePath).metadata();

    const sceneStats =
      await fs.stat(scenePath);

    const checksum = crypto
      .createHash('sha256')
      .update(downloaded.buffer)
      .digest('hex');

    results.push({
      sequence: index + 1,
      attachment_id: attachment.id,
      attachment_filename:
        attachment.filename,
      attachment_url:
        attachment.url,
      source_file: path.relative(
        projectDir,
        sourcePath
      ),
      scene_file: path.relative(
        projectDir,
        scenePath
      ),
      source_format:
        downloaded.metadata.format,
      source_width:
        downloaded.metadata.width,
      source_height:
        downloaded.metadata.height,
      source_size_bytes:
        downloaded.buffer.length,
      source_sha256: checksum,
      scene_width:
        sceneMetadata.width,
      scene_height:
        sceneMetadata.height,
      scene_size_bytes:
        sceneStats.size,
    });

    console.log(
      `[Image Service] Prepared ${sceneFilename}`
    );
  }

  const manifest = {
    version: 1,
    source: 'clickup-task-attachments',
    created_at: new Date().toISOString(),
    image_count: results.length,
    output: {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      format: 'jpeg',
      quality: IMAGE_QUALITY,
    },
    images: results,
  };

  const manifestPath = path.join(
    imagesDir,
    'manifest.json'
  );

  await writeJsonAtomic(
    manifestPath,
    manifest
  );

  console.log(
    `[Image Service] Prepared ${results.length} scene image(s)`
  );

  return {
    success: true,
    imagesDir,
    manifestPath,
    imageCount: results.length,
    images: results,
  };
}

async function downloadClickUpAttachment(
  attachmentUrl,
  redirectCount = 0
) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(
      `Too many redirects while downloading ClickUp attachment`
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(
      attachmentUrl
    );
  } catch {
    throw new Error(
      `Invalid ClickUp attachment URL`
    );
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      `ClickUp attachment URL must use HTTPS`
    );
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, DOWNLOAD_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(parsedUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Authorization:
          CLICKUP_API_TOKEN,
        Accept:
          'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
        'User-Agent':
          'WonderWave/1.0',
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `ClickUp attachment download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`
      );
    }

    throw new Error(
      `ClickUp attachment download failed: ${error.message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (
    response.status >= 300 &&
    response.status < 400
  ) {
    const location =
      response.headers.get('location');

    if (!location) {
      throw new Error(
        `ClickUp attachment redirect did not include a location header`
      );
    }

    const redirectedUrl =
      new URL(
        location,
        parsedUrl
      ).toString();

    return downloadClickUpAttachment(
      redirectedUrl,
      redirectCount + 1
    );
  }

  if (!response.ok) {
    throw new Error(
      `ClickUp attachment returned HTTP ${response.status}`
    );
  }

  const declaredLength = Number(
    response.headers.get(
      'content-length'
    )
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength >
      MAX_DOWNLOAD_BYTES
  ) {
    throw new Error(
      `ClickUp attachment exceeds the ${MAX_DOWNLOAD_BYTES}-byte limit`
    );
  }

  if (!response.body) {
    throw new Error(
      'ClickUp attachment response contained no body'
    );
  }

  const chunks = [];
  let totalBytes = 0;

  for await (
    const chunk of response.body
  ) {
    totalBytes += chunk.length;

    if (
      totalBytes >
      MAX_DOWNLOAD_BYTES
    ) {
      throw new Error(
        `ClickUp attachment exceeded the ${MAX_DOWNLOAD_BYTES}-byte limit during download`
      );
    }

    chunks.push(chunk);
  }

  const buffer = Buffer.concat(
    chunks,
    totalBytes
  );

  if (buffer.length === 0) {
    throw new Error(
      'Downloaded ClickUp attachment is empty'
    );
  }

  let metadata;

  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels:
        100_000_000,
    }).metadata();
  } catch (error) {
    const contentType =
      response.headers.get(
        'content-type'
      ) || 'unknown';

    const preview = buffer
      .subarray(0, 100)
      .toString('utf8')
      .replace(/\s+/g, ' ');

    throw new Error(
      `Downloaded ClickUp attachment is not a readable image. Content-Type: ${contentType}. Preview: ${preview}`
    );
  }

  if (
    !MIME_EXTENSIONS[
      metadata.format
    ]
  ) {
    throw new Error(
      `Unsupported ClickUp image format: ${metadata.format || 'unknown'}`
    );
  }

  return {
    buffer,
    metadata,
  };
}

async function normalizeSceneImage({
  sourcePath,
  scenePath,
}) {
  await sharp(sourcePath, {
    failOn: 'error',
    limitInputPixels:
      100_000_000,
  })
    .rotate()
    .resize({
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: false,
    })
    .flatten({
      background: '#000000',
    })
    .toColourspace('srgb')
    .jpeg({
      quality: IMAGE_QUALITY,
      chromaSubsampling: '4:2:0',
      mozjpeg: true,
    })
    .toFile(scenePath);

  const metadata =
    await sharp(scenePath).metadata();

  if (
    metadata.width !== IMAGE_WIDTH ||
    metadata.height !== IMAGE_HEIGHT
  ) {
    throw new Error(
      `Normalized scene has unexpected dimensions: ${metadata.width}x${metadata.height}`
    );
  }
}

async function cleanGeneratedFiles(
  imagesDir,
  sourceDir
) {
  await removeMatchingFiles(
    imagesDir,
    /^scene-\d{3}\.jpg$/
  );

  await removeMatchingFiles(
    sourceDir,
    /^source-\d{3}\.(jpg|png|webp|avif)$/
  );

  await fs.rm(
    path.join(
      imagesDir,
      'manifest.json'
    ),
    {
      force: true,
    }
  );
}

async function removeMatchingFiles(
  directory,
  pattern
) {
  let entries;

  try {
    entries = await fs.readdir(
      directory,
      {
        withFileTypes: true,
      }
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          pattern.test(entry.name)
      )
      .map((entry) =>
        fs.rm(
          path.join(
            directory,
            entry.name
          ),
          {
            force: true,
          }
        )
      )
  );
}

async function writeJsonAtomic(
  filePath,
  value
) {
  const temporaryPath =
    `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    {
      encoding: 'utf8',
      flag: 'wx',
    }
  );

  await fs.rename(
    temporaryPath,
    filePath
  );
}

function parsePositiveInteger(
  value,
  fallback
) {
  const parsed = Number.parseInt(
    value,
    10
  );

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

module.exports = {
  prepareClickUpImages,
  downloadClickUpAttachment,
};
