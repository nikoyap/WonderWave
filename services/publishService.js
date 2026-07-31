const PublisherFactory = require("../publishers/publisherFactory");
const PublishJobRepository = require(
    "../storage/repositories/PublishJobRepository"
);
const PublishResultRepository = require(
    "../storage/repositories/PublishResultRepository"
);


const JobStatus = require("../constants/JobStatus");
const {
    updateTaskStatus
} = require("./clickupService");

class PublishService {
    async publish(jobId) {
        const job = PublishJobRepository.find(jobId);

        if (!job) {
            throw new Error(`Publish job not found: ${jobId}`);
        }

        const platforms = job.metadata?.platforms;

        if (!Array.isArray(platforms) || platforms.length === 0) {
            throw new Error(
                `Publish job ${jobId} does not contain any target platforms`
            );
        }

        PublishJobRepository.updateStatus(
            jobId,
            JobStatus.PUBLISHING
        );

        const results = [];

        for (const platform of platforms) {

    const previousResult =
        PublishResultRepository.findSuccessful(
            jobId,
            platform
        );

    if (previousResult) {

        results.push({
            jobId,
            platform,
            status: "published",
            skipped: true,
            response: previousResult.response
        });

        continue;
    }

    try {
        const publisher = PublisherFactory.create(platform);

                const response = await publisher.publish(job);

                const result = {
                    jobId,
                    platform,
                    status: "published",
                    response: response || {}
                };

                PublishResultRepository.create(result);
                results.push(result);


            } catch (error) {
                const result = {
                    jobId,
                    platform,
                    status: "failed",
                    response: {
                        error: error.message
                    }
                };

                PublishResultRepository.create(result);
                results.push(result);
            }
        }

        const publishedCount = results.filter(
            result => result.status === "published"
        ).length;

        const failedCount = results.filter(
            result => result.status === "failed"
        ).length;

        const summary = {
            total: results.length,
            published: publishedCount,
            failed: failedCount,
            platforms: Object.fromEntries(
                results.map(result => [
                    result.platform,
                    result.status
                ])
            )
        };

        PublishJobRepository.updateResultSummary(jobId, summary);

        const finalStatus =
            failedCount === 0
                ? JobStatus.COMPLETED
                : JobStatus.FAILED;

        PublishJobRepository.updateStatus(jobId, finalStatus);

console.log(job);

if (
    finalStatus === JobStatus.COMPLETED &&
    job.clickup_task
) {
    try {

        await updateTaskStatus(
            job.clickup_task,
            "PUBLISHED"
        );

        console.log(
            `[PublishService] ClickUp task ${job.clickup_task} marked PUBLISHED`
        );

    } catch (error) {

        console.error(
            "[PublishService] Failed updating ClickUp status:",
            error.message
        );

    }
}

        return {
            jobId,
            status: finalStatus,
            summary,
            results
        };
    }
}

module.exports = new PublishService();
