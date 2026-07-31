const Platforms = require("../constants/Platforms");

function create(platform) {
    switch (platform) {
        case Platforms.YOUTUBE:
            return require("./youtube");

        case Platforms.FACEBOOK:
            throw new Error("Facebook publisher is not implemented yet.");

        case Platforms.INSTAGRAM:
            throw new Error("Instagram publisher is not implemented yet.");

        case Platforms.X:
            throw new Error("X publisher is not implemented yet.");

        default:
            throw new Error(`Unsupported publishing platform: ${platform}`);
    }
}

module.exports = {
    create
};
