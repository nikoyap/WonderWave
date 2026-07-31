const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const TTS_PYTHON =
  process.env.TTS_PYTHON ||
  "/opt/wonderwave/tts/venv/bin/python";

const TTS_SCRIPT =
  process.env.TTS_SCRIPT ||
  "/opt/wonderwave/tts/generate.py";

const DEFAULT_VOICE =
  process.env.TTS_VOICE ||
  "af_heart";

const DEFAULT_SPEED = Number(
  process.env.TTS_SPEED || 1
);

/**
 * Generate narration audio using Kokoro.
 *
 * @param {object} options
 * @param {string} options.inputPath Path to script.txt
 * @param {string} options.outputPath Path to narration.wav
 * @param {string} [options.voice]
 * @param {number} [options.speed]
 * @param {string} [options.language]
 */
async function generateNarration({
  inputPath,
  outputPath,
  voice = DEFAULT_VOICE,
  speed = DEFAULT_SPEED,
  language = "a",
}) {
  if (!inputPath) {
    throw new Error("TTS inputPath is required.");
  }

  if (!outputPath) {
    throw new Error("TTS outputPath is required.");
  }

  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath);

  await verifyFileExists(TTS_PYTHON, "TTS Python executable");
  await verifyFileExists(TTS_SCRIPT, "TTS generator script");
  await verifyFileExists(resolvedInputPath, "TTS input script");

  await fs.mkdir(
    path.dirname(resolvedOutputPath),
    { recursive: true }
  );

  console.log("[TTS Service] Starting narration generation");
  console.log(`[TTS Service] Input: ${resolvedInputPath}`);
  console.log(`[TTS Service] Output: ${resolvedOutputPath}`);
  console.log(`[TTS Service] Voice: ${voice}`);
  console.log(`[TTS Service] Speed: ${speed}`);

  const argumentsList = [
    TTS_SCRIPT,
    resolvedInputPath,
    resolvedOutputPath,
    "--voice",
    voice,
    "--speed",
    String(speed),
    "--language",
    language,
  ];

  const result = await runProcess(
    TTS_PYTHON,
    argumentsList
  );

  const outputStats = await fs.stat(
    resolvedOutputPath
  );

  if (!outputStats.isFile() || outputStats.size === 0) {
    throw new Error(
      `TTS output was not created correctly: ${resolvedOutputPath}`
    );
  }

  console.log(
    `[TTS Service] Narration created: ${resolvedOutputPath}`
  );

  return {
    success: true,
    outputPath: resolvedOutputPath,
    sizeBytes: outputStats.size,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function verifyFileExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(
      `${label} does not exist or is inaccessible: ${filePath}`
    );
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`[Kokoro] ${text}`);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[Kokoro Error] ${text}`);
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Unable to start Kokoro process: ${error.message}`
        )
      );
    });

    child.on("close", (exitCode, signal) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            [
              `Kokoro exited with code ${exitCode}`,
              signal ? `Signal: ${signal}` : null,
              stderr.trim()
                ? `Error output: ${stderr.trim()}`
                : null,
            ]
              .filter(Boolean)
              .join("\n")
          )
        );

        return;
      }

      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

module.exports = {
  generateNarration,
};
