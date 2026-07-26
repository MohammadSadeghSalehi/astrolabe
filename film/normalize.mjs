import {spawnSync} from 'node:child_process';
import {existsSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const compositorPackage = {
  win32: '@remotion/compositor-win32-x64-msvc',
  darwin: process.arch === 'arm64'
    ? '@remotion/compositor-darwin-arm64'
    : '@remotion/compositor-darwin-x64',
  linux: process.arch === 'arm64'
    ? '@remotion/compositor-linux-arm64-gnu'
    : '@remotion/compositor-linux-x64-gnu',
}[process.platform];

if (!compositorPackage) {
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
}

const ffmpeg = join(
  repo,
  'film',
  'remotion',
  'node_modules',
  compositorPackage,
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
);

if (!existsSync(ffmpeg)) {
  throw new Error(`Remotion ffmpeg was not found at ${ffmpeg}. Run npm install in film/remotion.`);
}

const jobs = [
  ['submission-60.mp4', 'final-60.mp4'],
  ['showcase-120.mp4', 'final-showcase-120.mp4'],
];

for (const [sourceName, outputName] of jobs) {
  const source = join(repo, 'film', 'out', sourceName);
  const output = join(repo, 'film', 'out', outputName);

  if (!existsSync(source)) {
    throw new Error(`Missing render: ${source}`);
  }

  const result = spawnSync(ffmpeg, [
    '-y',
    '-i', source,
    '-filter:a', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    output,
  ], {stdio: 'inherit'});

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed while normalizing ${sourceName}`);
  }

  console.log(`${outputName}: ${(statSync(output).size / 1_000_000).toFixed(1)} MB`);
}
