import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const require = createRequire(resolve(repo, "app/package.json"));
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");

const envText = await readFile(resolve(repo, "app/.env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is missing");

const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
// This hackathon key is intentionally scoped to speech operations and cannot
// enumerate the account voice library. Use ElevenLabs' documented example
// narrator unless a voice ID is explicitly configured.
const voice = {
  voiceId: env.ELEVENLABS_VOICE_ID ?? "Xb7hH8MSUJpSbSDYk0k2",
  name: env.ELEVENLABS_VOICE_ID ? "Configured narrator" : "ElevenLabs narrator",
};

const segments = {
  intro:
    "Eleven point eight million people live with Parkinson's. Treatment depends on an hour-by-hour paper diary. Most hours stay blank.",
  hero:
    "Astrolabe reconstructs the missing hours from two wrist sensors.",
  problem:
    "Even with research staff, just sixty-one point six percent were completed.",
  reveal:
    "Drag, and the patient's diary appears behind the reconstruction. This participant was held out of training; coverage is measured on held-out people.",
  refusal:
    "Here is what most demos hide. On this day, the evidence was too weak. So Astrolabe declined all one hundred and fourteen windows.",
  sensors:
    "Remove one wrist and it does not bluff. It refuses more, holding the same error budget.",
  "voice-before":
    "So tell it what the sensor missed.",
  "voice-after":
    "Transcribed, structured, and confirmed by you. The diary changes. The model's refusal does not.",
  clinician:
    "It prints for the appointment, and never fills a row it cannot defend.",
  epidemiology:
    "Parkinson's is the world's fastest-growing neurological condition, and motor fluctuations turn care into a timing problem.",
  pipeline:
    "Five stages align, extract, model, calibrate, and finally refuse when the evidence is weak.",
  pick:
    "Choose a participant the model never saw.",
  posterior:
    "Every hour carries a full probability distribution, not a single confident number.",
  layers:
    "Turn off inference and see exactly what was observed and reported.",
  selective:
    "As the detector answers less, accuracy rises from seventy-one point three to eighty-two point five percent.",
  devices:
    "Only research-grade bilateral wrists expose the raw acceleration this method requires.",
  report:
    "Every figure in the report regenerates from a named script.",
  end:
    "Astrolabe. A diary that tells you when it doesn't know.",
};

const output = resolve(repo, "film/remotion/public/vo");
await mkdir(output, { recursive: true });

async function toBuffer(stream) {
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  if (typeof stream?.arrayBuffer === "function") {
    return Buffer.from(await stream.arrayBuffer());
  }
  if (stream?.[Symbol.asyncIterator]) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  if (typeof stream?.getReader === "function") {
    const chunks = [];
    const reader = stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported ElevenLabs audio response");
}

const requested = new Set(process.argv.slice(2));
for (const [id, text] of Object.entries(segments)) {
  if (requested.size && !requested.has(id)) continue;
  const audio = await client.textToSpeech.convert(voice.voiceId, {
    text,
    modelId: "eleven_turbo_v2_5",
    outputFormat: "mp3_44100_128",
    voiceSettings: {
      stability: 0.55,
      similarityBoost: 0.75,
      style: 0.12,
      useSpeakerBoost: true,
      speed: 1.12,
    },
  });
  await writeFile(resolve(output, `${id}.mp3`), await toBuffer(audio));
  console.log(`Generated ${id}`);
}

await writeFile(
  resolve(output, "manifest.json"),
  `${JSON.stringify(
    {
      provider: "ElevenLabs",
      model: "eleven_turbo_v2_5",
      voice: voice.name,
      voiceId: voice.voiceId,
      generatedAt: new Date().toISOString(),
      segments,
    },
    null,
    2,
  )}\n`,
);
console.log(`Voice: ${voice.name}`);
