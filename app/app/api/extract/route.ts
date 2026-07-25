import { NextResponse } from "next/server";
import { OpenAIUnavailable, completeJSON } from "@/lib/openai";

export const runtime = "nodejs";

export type ExtractedEvent = {
  type: "medication" | "symptom" | "unknown";
  t: string | null;
  drug: string | null;
  dose_mg: number | null;
  note: string;
  confidence: "high" | "low";
};

/**
 * The field descriptions are load-bearing, not documentation.
 *
 * They are the only thing stopping the model from filling a plausible time or
 * dose into a diary entry that a clinician may later read as reported fact. A
 * dose this app invented is indistinguishable, once written, from one the
 * patient actually took. `strict: true` guarantees the shape; these guarantee
 * the contents stay inside what was said.
 */
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
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
        "Time as HH:MM on a 24-hour clock, if and only if it is explicitly stated. " +
        "Normalise spoken forms: '2pm' -> '14:00', 'half two' -> '14:30', " +
        "'quarter past nine' -> '09:15'. If no time is stated, return null. " +
        "Never infer a time from context and never guess.",
    },
    drug: {
      type: ["string", "null"],
      description: "Drug name if stated, else null. Never invent a drug.",
    },
    dose_mg: {
      type: ["number", "null"],
      description:
        "Dose in milligrams if stated, else null. Never invent or convert a dose " +
        "you are not certain of.",
    },
    note: {
      type: "string",
      description: "Short paraphrase of what was said. Add nothing that was not said.",
    },
    confidence: {
      type: "string",
      enum: ["high", "low"],
      description:
        "high only when type and key fields are unambiguous in the transcript; " +
        "low if anything had to be interpreted.",
    },
  },
  required: ["type", "t", "drug", "dose_mg", "note", "confidence"],
} as const;

function isExtractedEvent(v: unknown): v is ExtractedEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.type === "medication" || o.type === "symptom" || o.type === "unknown") &&
    (o.confidence === "high" || o.confidence === "low") &&
    (o.t === null || typeof o.t === "string") &&
    (o.drug === null || typeof o.drug === "string") &&
    (o.dose_mg === null || typeof o.dose_mg === "number") &&
    typeof o.note === "string"
  );
}

/**
 * POST { transcript, dayISO } → structured event.
 * Extracts only what was said — never invents time, drug or dose.
 */
export async function POST(req: Request) {
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
  const dayISO = typeof body.dayISO === "string" ? body.dayISO : "unknown day";

  try {
    const raw = await completeJSON<unknown>({
      schema: { name: "extract_event", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> },
      messages: [
        {
          role: "system",
          content: [
            "You extract Parkinson's diary voice notes into structured events.",
            "Only extract facts explicitly stated in the transcript.",
            "Never invent time, drug, or dose. If a time is not stated, t must be null.",
            "If no medication or symptom is described, type must be unknown.",
            `Day context, for resolving relative phrasing only and never for inventing a clock time: ${dayISO}.`,
          ].join(" "),
        },
        { role: "user", content: `Transcript:\n"""${transcript}"""` },
      ],
    });

    if (!isExtractedEvent(raw)) {
      return NextResponse.json(
        { error: "invalid extraction shape" },
        { status: 502 },
      );
    }

    // Only a well-formed HH:MM survives. Anything else the model produced for a
    // time — a spoken form it failed to normalise, a date, a stray word — is
    // dropped to null rather than shown, because a half-parsed time on a
    // medication record is worse than no time at all.
    const t =
      raw.t && /^\d{1,2}:\d{2}$/.test(raw.t.trim())
        ? raw.t.trim().padStart(5, "0")
        : null;

    const out: ExtractedEvent = {
      type: raw.type,
      t,
      drug: raw.drug?.trim() || null,
      dose_mg:
        typeof raw.dose_mg === "number" && Number.isFinite(raw.dose_mg)
          ? raw.dose_mg
          : null,
      note: raw.note.trim() || transcript,
      // A time we had to discard means the transcript was not unambiguous,
      // whatever the model claimed.
      confidence: raw.t && !t ? "low" : raw.confidence,
    };

    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof OpenAIUnavailable) {
      console.warn("[extract] model unavailable:", err.message);
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[extract]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "extraction failed" },
      { status: 502 },
    );
  }
}
