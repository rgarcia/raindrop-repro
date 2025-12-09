import { createId } from "@paralleldrive/cuid2";
import "dotenv/config";
import * as fs from "fs/promises";
import * as path from "path";
import { Raindrop } from "raindrop-ai";
import sharp from "sharp";

// CLI flags
const USE_REAL_IMAGES = process.argv.includes("--use-real-images");
const NO_SLEEPS = process.argv.includes("--no-sleeps");

// Helper to create a synthetic colored image
async function createSyntheticImage(color: { r: number; g: number; b: number }): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: color,
    },
  });
  return image.png().toBuffer();
}

// Helper to load real images from local data folder
async function loadRealImage(filename: string): Promise<Buffer> {
  const imagePath = path.join(__dirname, "data", filename);
  return fs.readFile(imagePath);
}

// Sleep helper (respects NO_SLEEPS flag)
function sleep(ms: number): Promise<void> {
  if (NO_SLEEPS) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();
  const elapsed = () => `+${((Date.now() - startTime) / 1000).toFixed(2)}s`;

  console.log("\n=== Starting Bug Reproduction ===\n");
  console.log(`Mode: ${USE_REAL_IMAGES ? "REAL IMAGES from ../data" : "SYNTHETIC IMAGES"}`);
  console.log(`Sleeps: ${NO_SLEEPS ? "DISABLED" : "ENABLED"}`);

  const writeKey = process.env.RAINDROP_WRITE_KEY;
  if (!writeKey) {
    throw new Error("RAINDROP_WRITE_KEY environment variable is required");
  }

  const raindrop = new Raindrop({
    writeKey,
    debugLogs: true,
    redactPii: true,
  });

  const eventId = createId();
  const convoId = createId();

  console.log(`Event ID: ${eventId}`);
  console.log(`Convo ID: ${convoId}`);

  const interaction = raindrop.begin({
    eventId,
    event: "bug_repro_test",
    userId: "test-user",
    input: "Test input for bug reproduction",
    model: "test-model",
    convoId,
    properties: {
      test: true,
      useRealImages: USE_REAL_IMAGES,
    },
  });

  // Simulate navigation delay (~2s)
  console.log(`[TIMING ${elapsed()}] Starting navigation`);
  await sleep(1960);
  console.log(`[TIMING ${elapsed()}] Navigation complete`);

  // Simulate screenshot capture (~0.4s)
  console.log(`[TIMING ${elapsed()}] Capturing screenshot`);
  await sleep(380);
  const inputImage = USE_REAL_IMAGES
    ? await loadRealImage("input-screenshot.png")
    : await createSyntheticImage({ r: 255, g: 0, b: 0 });
  console.log(`[TIMING ${elapsed()}] Screenshot captured (${inputImage.length} bytes)`);

  // Add INPUT attachment
  console.log(`[TIMING ${elapsed()}] Adding INPUT attachment (screenshot)`);
  interaction.addAttachments([{
    type: "image",
    name: "screenshot",
    value: `data:image/png;base64,${inputImage.toString("base64")}`,
    role: "input",
  }]);
  console.log(`[TIMING ${elapsed()}] INPUT attachment added`);

  // Simulate model completion (~7.3s) - this is where the timeout flush happens
  console.log(`[TIMING ${elapsed()}] Starting model completion`);
  await sleep(7290);
  console.log(`[TIMING ${elapsed()}] Model completion finished`);

  // Simulate annotated image creation (~0.02s)
  console.log(`[TIMING ${elapsed()}] Creating annotated click target image`);
  await sleep(20);
  const outputImage = USE_REAL_IMAGES
    ? await loadRealImage("output-click-target.png")
    : await createSyntheticImage({ r: 0, g: 255, b: 0 });

  // Add OUTPUT attachment
  console.log(`[TIMING ${elapsed()}] Adding OUTPUT attachment (click_target)`);
  interaction.addAttachments([{
    type: "image",
    name: "click_target",
    value: `data:image/png;base64,${outputImage.toString("base64")}`,
    role: "output",
  }]);
  console.log(`[TIMING ${elapsed()}] OUTPUT attachment added`);

  console.log(`[TIMING ${elapsed()}] Task complete`);

  // Finish the interaction
  interaction.finish({
    output: JSON.stringify({ type: "click", x: 1730, y: 157 }),
  });

  console.log("\n=== Bug Reproduction Complete ===");
  console.log("\nEXPECTED: Final event should have 2 attachments (input + output)");
  console.log("ACTUAL: Final event likely has only 1 attachment (input)");
  console.log("\nCheck Raindrop dashboard to verify attachment count.");

  // Ensure all events are flushed before exit
  await raindrop.close();
  console.log("\nRaindrop closed, all events flushed.");
}

process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT, exiting...");
  process.exit(0);
});

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

