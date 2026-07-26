import { chromium } from "playwright";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installCursor } from "./cursor.ts";
import { scenes } from "./scenes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const outDir = join(here, "out");
const baseUrl = process.env.ASTROLABE_BASE_URL ?? "http://localhost:3000";
const notePath = resolve(here, "assets/note.wav").replaceAll("\\", "/");
const selected = new Set(process.argv.slice(2));
const queue = selected.size ? scenes.filter((s) => selected.has(s.id)) : scenes;
let previousManifest = { scenes: [] };
if (selected.size) {
  try {
    previousManifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8"),
    );
  } catch {
    previousManifest = { scenes: [] };
  }
}

if (!queue.length) throw new Error("No matching scenes");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${notePath}%noloop`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function warmRoutes() {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  for (const route of [...new Set(queue.map((s) => s.route))]) {
    const suffix = route.includes("?") ? "&capture=1" : "?capture=1";
    await page.goto(`${baseUrl}${route}${suffix}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
  }
  await context.close();
}

async function participantInit(context, participant) {
  if (!participant) return;
  const path = join(repo, "app/public/bundles", `${participant}.json`);
  const json = await readFile(path, "utf8");
  await context.addInitScript(
    ({ payload }) => {
      window.sessionStorage.setItem("astrolabe.uploaded-bundle", payload);
    },
    { payload: json },
  );
}

await warmRoutes();
const manifest = [];

try {
  for (const [index, scene] of queue.entries()) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
      reducedMotion: "no-preference",
      colorScheme: "dark",
    });
    await context.grantPermissions(["microphone"], { origin: baseUrl });
    await participantInit(context, scene.participant);
    const page = await context.newPage();
    const video = page.video();
    const query = new URLSearchParams({ capture: "1", source: scene.live ? "supabase" : "local" });
    const url = `${baseUrl}${scene.route}${scene.route.includes("?") ? "&" : "?"}${query}`;
    const begun = Date.now();
    console.log(`[${index + 1}/${queue.length}] ${scene.id}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (scene.route === "/day") {
      await page.waitForFunction(() => window.__astroReady === true);
    }
    await installCursor(page);
    await page.mouse.move(1780, 980);
    await page.evaluate(() => window.__astroCursor?.(1780, 980));
    if (scene.stage) await scene.stage(page);
    await page.waitForTimeout(2000);
    const actionStarted = Date.now();
    await scene.actions(page);
    const actionFinished = Date.now();
    await page.waitForTimeout(2000);
    const rawPath = await video.path();
    await context.close();
    const output = join(outDir, `scene-${scene.id}.webm`);
    await rename(rawPath, output);
    manifest.push({
      ...scene,
      stage: undefined,
      actions: undefined,
      file: output.split(/[\\/]/).pop(),
      duration: (Date.now() - begun) / 1000,
      trimHead: (actionStarted - begun) / 1000,
      actionDuration: (actionFinished - actionStarted) / 1000,
    });
  }
} finally {
  await browser.close();
}

const mergedScenes = selected.size
  ? scenes
      .map(
        (scene) =>
          manifest.find((captured) => captured.id === scene.id) ??
          previousManifest.scenes.find((captured) => captured.id === scene.id),
      )
      .filter(Boolean)
  : manifest;

await writeFile(
  join(outDir, "manifest.json"),
  `${JSON.stringify({ capturedAt: new Date().toISOString(), scenes: mergedScenes }, null, 2)}\n`,
);
console.log(`Captured ${manifest.length} scenes to ${outDir}`);
