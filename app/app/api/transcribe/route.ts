import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const runtime = "nodejs";

/**
 * POST multipart field `audio` → ElevenLabs Scribe v2.
 * Returns `{ text }` or 502 `{ error }`. Never fabricates a transcript.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY not configured" },
        { status: 502 },
      );
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "missing audio" }, { status: 400 });
    }

    const client = new ElevenLabsClient({ apiKey });
    const result = await client.speechToText.convert({
      file: audio,
      modelId: "scribe_v2",
    });

    const text =
      result && typeof result === "object" && "text" in result
        ? String((result as { text: string }).text ?? "").trim()
        : "";

    if (!text) {
      return NextResponse.json({ error: "empty transcript" }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[transcribe]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "transcription failed" },
      { status: 502 },
    );
  }
}
