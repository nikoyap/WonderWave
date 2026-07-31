const path = require("node:path");
const crypto = require("node:crypto");

const PublishJobRepository = require(
    "../storage/repositories/PublishJobRepository"
);

class JobService {
    createPublishJob(input) {
        if (!input || typeof input !== "object") {
            throw new Error(
                "JobService.createPublishJob requires an input object"
            );
        }

        const {
            title,
            description = "",
            tags = [],
            videoPath,
            clickupTask = null,
            thumbnailPath = null,
            platforms = ["youtube"],
            privacy = "public",
            language = "en",
        } = input;

        if (!title || typeof title !== "string") {
            throw new Error("A job title is required");
        }

        if (!videoPath || typeof videoPath !== "string") {
            throw new Error("A video path is required");
        }

        if (!Array.isArray(platforms) || platforms.length === 0) {
            throw new Error(
                "At least one target platform is required"
            );
        }

        const metadata = {
            version: 1,

            platforms: platforms.map(platform =>
                String(platform).trim().toLowerCase()
            ),

            video: {
                path: this.normalizePath(videoPath),
            },

            publish: {
                privacy,
                language,
            
                   description:
        		typeof description === "string"
            			? description.trim()
            			: "",
tags:
        Array.isArray(tags)
            ? tags
            : [], 

	  	},
        };

        if (thumbnailPath) {
            metadata.thumbnail = {
                path: this.normalizePath(thumbnailPath),
            };
        }

      const job = {
    id: crypto.randomUUID(),
    clickupTask,
    title: title.trim(),
    status: "queued",
    metadata,
};

        return PublishJobRepository.create(job);
    }

    normalizePath(filePath) {
        if (path.isAbsolute(filePath)) {
            return path.normalize(filePath);
        }

        return path.resolve("/opt/wonderwave", filePath);
    }
}

module.exports = new JobService();
