const JobStatus = Object.freeze({
    QUEUED: "queued",
    SCRIPT_GENERATING: "script_generating",
    IMAGES_GENERATING: "images_generating",
    AUDIO_GENERATING: "audio_generating",
    VIDEO_RENDERING: "video_rendering",
    PUBLISHING: "publishing",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled"
});

module.exports = JobStatus;
