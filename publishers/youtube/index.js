const path = require("path");
const logger = require("../../utils/logger");

const {
    createYouTubeClient
} = require("./client");

const {
    buildMetadata
} = require("./metadata");

const {
    uploadVideo
} = require("./upload");

const {
    uploadThumbnail
} = require("./thumbnail");

class YouTubePublisher {
    async publish(job) {
        logger.info(
            `Publishing job ${job.id} to YouTube...`
        );

        const videoPath = job.metadata?.video?.path;

        if (!videoPath) {
            throw new Error(
                `Job ${job.id} does not contain metadata.video.path`
            );
        }

        const youtube = createYouTubeClient();
        const metadata = buildMetadata(job);

        const uploadResult = await uploadVideo({
            youtube,
            videoPath: path.resolve(videoPath),
            metadata
        });

        const thumbnailPath =
            job.metadata?.thumbnail?.path;

        let thumbnailUploaded = false;
let thumbnailError = null;

if (thumbnailPath) {
    try {
        await uploadThumbnail({
            youtube,
            videoId: uploadResult.videoId,
            thumbnailPath: path.resolve(thumbnailPath)
        });

        thumbnailUploaded = true;
    } catch (error) {
        thumbnailError = error.message;

        logger.warn(
            `Video ${uploadResult.videoId} uploaded, but thumbnail upload failed: ${error.message}`
        );
    }
} else {
    logger.warn(
        `Job ${job.id} has no thumbnail path; skipping thumbnail upload.`
    );
}

return {
    ...uploadResult,
    thumbnailUploaded,
    thumbnailError
};
    }
}

module.exports = new YouTubePublisher();
