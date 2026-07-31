require("dotenv").config({
  path: "/opt/wonderwave/.env",
});

const path = require("node:path");
const {
  generateNarration,
} = require("../services/ttsService");

async function main() {
  const projectId =
    process.argv[2] || "wonderwave-test-002";

  const projectDir = path.join(
    process.env.PROJECTS_DIR ||
      "/opt/wonderwave/projects",
    projectId
  );

  const inputPath = path.join(
    projectDir,
    "script.txt"
  );

  const outputPath = path.join(
    projectDir,
    "audio",
    "narration-node-test.wav"
  );

  const result = await generateNarration({
    inputPath,
    outputPath,
  });

  console.log("\n[TTS Test] Success");
  console.log(
    JSON.stringify(result, null, 2)
  );
}

main().catch((error) => {
  console.error("\n[TTS Test] Failed");
  console.error(error);
  process.exitCode = 1;
});
