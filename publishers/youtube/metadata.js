const Privacy = require("../../constants/Privacy");

function buildMetadata(job) {
    const metadata = job.metadata || {};
    const publish = metadata.publish || {};
    const youtube = publish.youtube || {};

    const allowedPrivacy = [
        "private",
        "unlisted",
        "public"
    ];

    const requestedPrivacy =
    youtube.privacy ||
    publish.privacy;

const privacyStatus =
    allowedPrivacy.includes(requestedPrivacy)
        ? requestedPrivacy
        : Privacy.PRIVATE;

    const snippet = {
    title:
        youtube.title ||
        job.title,

    description:
        youtube.description ||
        publish.description ||
        "",

    tags:
        Array.isArray(youtube.tags)
            ? youtube.tags
            : Array.isArray(publish.tags)
            ? publish.tags
            : [],

    categoryId: String(
        youtube.categoryId ||
        publish.categoryId ||
        "22"
    ),

    defaultLanguage:
        youtube.language ||
        publish.language ||
        "en"
};

    const status = {
        privacyStatus,
        selfDeclaredMadeForKids: false
    };

console.log("========== YOUTUBE METADATA ==========");
console.log(JSON.stringify({
    title: snippet.title,
    description: snippet.description,
    tags: snippet.tags,
    privacy: status.privacyStatus
}, null, 2));
console.log("======================================");

    return {
        snippet,
        status
    };
}

module.exports = {
    buildMetadata
};
