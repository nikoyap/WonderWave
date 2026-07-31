const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const credentials = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/client_secret.json"))
);

const token = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/token.json"))
);

const client = credentials.installed;

const auth = new google.auth.OAuth2(
    client.client_id,
    client.client_secret
);

auth.setCredentials(token);

async function test() {
    const youtube = google.youtube({
        version: "v3",
        auth,
    });

    const res = await youtube.channels.list({
        part: ["snippet"],
        mine: true,
    });

    console.log(JSON.stringify(res.data, null, 2));
}

test().catch(console.error);
