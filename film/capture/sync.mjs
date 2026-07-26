import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const target = resolve(here, "../remotion/public/clips");
await mkdir(target, { recursive: true });
const manifest = JSON.parse(await readFile(join(out, "manifest.json"), "utf8"));
for (const scene of manifest.scenes) {
  await cp(join(out, scene.file), join(target, scene.file));
}
await writeFile(
  join(target, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  resolve(here, "../remotion/src/capture-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Synced ${manifest.scenes.length} clips`);
