import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export type ExtractedEvent = {
  type: "medication" | "symptom" | "unknown";
  t: string | null;
  drug: string | null;
  dose_mg: number | null;
  note: string;
  confidence: "high" | "low";
};

const TOOL_NAME = "extract_event";

const EXTRACTION_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["medication", "symptom", "unknown"],
      description:
        "medication if a dose/drug is mentioned; symptom if a feeling/state; unknown if neither",
    },
    t: {
      type: ["string", "null"],
      description:
        "Time as HH:MM 24h if explicitly stated (e.g. 2pm → 14:00). null if not stated — never invent.",
    },
    drug: {
      type: ["string", "null"],
      description: "Drug name if stated, else null. Never invent a drug.",
    },
    dose_mg: {
      type: ["number", "null"],
      description: "Dose in milligrams if stated, else null. Never invent a dose.",
    },
    note: {
      type: "string",
      description: "Short paraphrase of what was said.",
    },
    confidence: {
      type: "string",
      enum: ["high", "low"],
      description:
        "high only when type and key fields are clear from the transcript; low if ambiguous.",
    },
  },
  required: ["type", "t", "drug", "dose_mg", "note", "confidence"],
};

function isExtractedEvent(v: unknown): v is ExtractedEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const typeOk =
    o.type === "medication" || o.type === "symptom" || o.type === "unknown";
  const confOk = o.confidence === "high" || o.confidence === "low";
  const tOk = o.t === null || typeof o.t === "string";
  const drugOk = o.drug === null || typeof o.drug === "string";
  const doseOk = o.dose_mg === null || typeof o.dose_mg === "number";
  return (
    typeOk &&
    confOk &&
    tOk &&
    drugOk &&
    doseOk &&
    typeof o.note === "string"
  );
}

/**
 * POST { transcript, dayISO } → structured event from Claude.
 * Extracts only what was said — never invents time/dose.
 */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 502 },
      );
    }

    let body: { transcript?: unknown; dayISO?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const transcript =
      typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) {
      return NextResponse.json({ error: "missing transcript" }, { status: 400 });
    }
    const dayISO =
      typeof body.dayISO === "string" ? body.dayISO : "unknown day";

    const model =
      process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      system: [
        "You extract Parkinson's diary voice notes into structured events.",
        "Only extract facts explicitly stated in the transcript.",
        "Never invent time, drug, or dose. If time is not stated, t must be null.",
        "If no medication or symptom is described, type must be unknown.",
        `Day context (for relative phrasing only, not to invent clock times): ${dayISO}.`,
      ].join(" "),
      tools: [
        {
          name: TOOL_NAME,
          description: "Structured extraction of a diary voice note.",
          input_schema: EXTRACTION_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Transcript:\n"""${transcript}"""`,
        },
      ],
    });

    const block = message.content.find(
      (b) => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    if (!block || block.type !== "tool_use") {
      return NextResponse.json(
        { error: "model did not return structured extraction" },
        { status: 502 },
      );
    }

    if (!isExtractedEvent(block.input)) {
      return NextResponse.json(
        { error: "invalid extraction shape" },
        { status: 502 },
      );
    }

    // Normalise empty strings → null for optional fields
    const out: ExtractedEvent = {
      type: block.input.type,
      t: block.input.t && /^\d{1,2}:\d{2}$/.test(block.input.t)
        ? block.input.t.padStart(5, "0")
        : block.input.t
          ? block.input.t
          : null,
      drug: block.input.drug?.trim() || null,
      dose_mg:
        typeof block.input.dose_mg === "number" &&
        Number.isFinite(block.input.dose_mg)
          ? block.input.dose_mg
          : null,
      note: block.input.note.trim() || transcript,
      confidence: block.input.confidence,
    };

    return NextResponse.json(out);
  } catch (err) {
    console.error("[extract]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 502 },
    );
  }
}
