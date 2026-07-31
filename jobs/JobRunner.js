const PublishJobRepository = require(
    "../storage/repositories/PublishJobRepository"
);
const publishService = require(
    "../services/publishService"
);
const logger = require(
    "../utils/logger"
);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class JobRunner {

    async start() {

        const recoveredJobs =
            PublishJobRepository.recoverStalePublishingJobs(30);

        logger.info(
            `WonderWave Job Runner started. Recovered ${recoveredJobs} stale job(s).`
        );

        while (true) {

            const job =
                PublishJobRepository.nextQueued();

            if (!job) {
    
                await sleep(5000);
                continue;
            }

            const attemptNumber =
                job.retry_count + 1;

            logger.info(
                `Processing job ${job.id} — attempt ${attemptNumber} of ${job.max_retries}`
            );

            try {

                const result =
                    await publishService.publish(job.id);

                if (result.status === "completed") {

                    PublishJobRepository.resetRetry(job.id);

                    logger.success(
                        `Job ${job.id} completed successfully.`
                    );

                } else {

                    const errorMessage =
                        `Publishing finished with status: ${result.status}`;

                    await this.handleFailure(
                        job,
                        errorMessage
                    );

                }

            } catch (error) {

                await this.handleFailure(
                    job,
                    error.message
                );

            }

            await sleep(1000);

        }

    }

    async handleFailure(job, errorMessage) {

        PublishJobRepository.incrementRetry(
            job.id,
            errorMessage
        );

        const updatedJob =
            PublishJobRepository.find(job.id);

        if (
            updatedJob.retry_count <
            updatedJob.max_retries
        ) {

            let delayMinutes = 1;

switch (updatedJob.retry_count) {
    case 1:
        delayMinutes = 1;
        break;

    case 2:
        delayMinutes = 5;
        break;

    default:
        delayMinutes = 30;
}

PublishJobRepository.markQueued(
    job.id,
    delayMinutes
);

            logger.warn(
    `Job ${job.id} failed on attempt ${updatedJob.retry_count} of ${updatedJob.max_retries}. Retrying in ${delayMinutes} minute(s). Error: ${errorMessage}`
);

            return;

        }

        PublishJobRepository.markFailed(
            job.id,
            errorMessage
        );

        logger.error(
            `Job ${job.id} permanently failed after ${updatedJob.retry_count} attempt(s). Error: ${errorMessage}`
        );

    }

}

module.exports = JobRunner;
