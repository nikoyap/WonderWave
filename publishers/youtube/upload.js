const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger");

async function uploadVideo({
    youtube,
    videoPath,
    metadata
}) {
    if (!youtube) {
        throw new Error("YouTube client is required.");
    }

    if (!videoPath) {
        throw new Error("Video path is required.");
    }

    const resolvedPath = path.resolve(videoPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(
            `Video file not found: ${resolvedPath}`
        );
    }

    const fileStats = fs.statSync(resolvedPath);

    if (!fileStats.isFile()) {
        throw new Error(
            `Video path is not a file: ${resolvedPath}`
        );
    }

    logger.info(
        `Uploading video to YouTube: ${resolvedPath}`
    );

    let response;

try {
    response = await youtube.videos.insert({
        part: [
            "snippet",
            "status"
        ],
        requestBody: metadata,
        media: {
            body: fs.createReadStream(resolvedPath)
        }
    });

} catch (error) {

    logger.error(
        "========== YOUTUBE API ERROR =========="
    );

    logger.error(
        JSON.stringify(
            error.response?.data ||
            error.errors ||
            error.message ||
            error,
            null,
            2
        )
    );

    logger.error(
        "========================================"
    );

    throw error;
}

    const videoId = response.data.id;

    if (!videoId) {
        throw new Error(
            "YouTube upload completed without returning a video ID."
        );
    }

    const url =
        `https://www.youtube.com/watch?v=${videoId}`;

    logger.success(
        `YouTube upload completed: ${url}`
    );

    return {
        videoId,
        url,
        title: response.data.snippet?.title,
        privacy: response.data.status?.privacyStatus
    };
}

module.exports = {
    uploadVideo
};
