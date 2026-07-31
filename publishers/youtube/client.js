const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const logger = require("../../utils/logger");

const configDir = path.join(__dirname, "../../config");

const credentialsPath = path.join(
    configDir,
    "client_secret.json"
);

const tokenPath = path.join(
    configDir,
    "token.json"
);

function readJson(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `${label} not found at ${filePath}`
        );
    }

    try {
        return JSON.parse(
            fs.readFileSync(filePath, "utf8")
        );
    } catch (error) {
        throw new Error(
            `Unable to parse ${label}: ${error.message}`
        );
    }
}

function createYouTubeClient() {
    const credentials = readJson(
        credentialsPath,
        "YouTube OAuth client credentials"
    );

    const token = readJson(
        tokenPath,
        "YouTube OAuth token"
    );

    const clientConfig =
        credentials.installed ||
        credentials.web;

    if (!clientConfig) {
        throw new Error(
            "OAuth credentials must contain an installed or web configuration."
        );
    }

    const {
        client_id,
        client_secret,
        redirect_uris
    } = clientConfig;

    if (!client_id || !client_secret) {
        throw new Error(
            "OAuth client ID or client secret is missing."
        );
    }

    const oauthClient = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris?.[0]
    );

    oauthClient.setCredentials(token);

    oauthClient.on("tokens", newTokens => {
        const updatedToken = {
            ...token,
            ...newTokens
        };

        fs.writeFileSync(
            tokenPath,
            JSON.stringify(updatedToken, null, 2),
            {
                mode: 0o600
            }
        );

        logger.info(
            "YouTube OAuth token refreshed and saved."
        );
    });

    return google.youtube({
        version: "v3",
        auth: oauthClient
    });
}

module.exports = {
    createYouTubeClient
};
