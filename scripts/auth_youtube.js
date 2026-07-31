const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");

const credentials = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../config/client_secret.json"),
        "utf8"
    )
);

const client = credentials.installed;

const oauth2Client = new google.auth.OAuth2(
    client.client_id,
    client.client_secret,
    client.redirect_uris[0]
);

const SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload"
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
});

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("\nPaste the authorization code here:\n", async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code);

        fs.writeFileSync(
            path.join(__dirname, "../config/token.json"),
            JSON.stringify(tokens, null, 2)
        );

        console.log("\n✅ New token.json saved!");
    } catch (err) {
        console.error(err);
    }

    rl.close();
});
