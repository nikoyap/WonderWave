const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");

async function uploadThumbnail({
    youtube,
    videoId,
    thumbnailPath
}) {
    if (!thumbnailPath) {
        logger.warn(
            `No thumbnail provided for video ${videoId}; skipping thumbnail upload.`
        );

        return null;
    }

    const resolvedPath = path.resolve(thumbnailPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(
            `Thumbnail file not found: ${resolvedPath}`
        );
    }

    const fileStats = fs.statSync(resolvedPath);

    if (!fileStats.isFile()) {
        throw new Error(
            `Thumbnail path is not a file: ${resolvedPath}`
        );
    }

    logger.info(
        `Uploading thumbnail for YouTube video ${videoId}...`
    );

    const response = await youtube.thumbnails.set({
        videoId,
        media: {
            body: fs.createReadStream(resolvedPath)
        }
    });

    logger.success(
        `Thumbnail uploaded for YouTube video ${videoId}.`
    );

    return response.data;
}

module.exports = {
    uploadThumbnail
};
