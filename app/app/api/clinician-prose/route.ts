import { NextResponse } from "next/server";
import {
  buildVisitQuestions,
  type ClinicianDerived,
} from "@/lib/clinician-prose";
import type { BundleMetrics } from "@/lib/contract";
import { completeJSON } from "@/lib/openai";

export const runtime = "nodejs";

/** Every numeric token in a string: 0.594, 77.3%, 114, 09:30 → its parts. */
function numericTokens(s: string): Set<string> {
  return new Set(s.match(/\d+(?:\.\d+)?/g) ?? []);
}

/**
 * True if the rewrite contains a number that appears nowhere in the source.
 *
 * The whole point of this route is that a language model may improve the
 * *wording* of a clinical handoff and nothing else. This is the check that makes
 * that a property of the system rather than a hope about the prompt.
 */
function introducesNumber(source: string[], rewritten: string[]): boolean {
  const allowed = numericTokens(source.join(" "));
  for (const line of rewritten) {
    for (const tok of numericTokens(line)) {
      if (!allowed.has(tok)) return true;
    }
  }
  return false;
}

/**
 * Optional prose polish via OpenAI.
 * Body: { metrics, derived } — already-validated numbers only.
 * Without OPENAI_API_KEY, returns deterministic templates.
 * Never invents or recomputes clinical metrics: the rewrite is rejected if it
 * contains any number not already in the template it was given.
 */
export async function POST(req: Request) {
  let body: {
    metrics?: BundleMetrics;
    derived?: ClinicianDerived;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { metrics, derived } = body;
  // ordinal_mae is legitimately null on a day the model declined entirely, and
  // that day still gets a clinician page — it is the one most worth discussing.
  // Only baseline_mae is genuinely required, since every number shown is quoted
  // against it.
  if (!metrics || typeof metrics.baseline_mae !== "number" || !derived) {
    return NextResponse.json(
      { error: "metrics and derived required" },
      { status: 400 },
    );
  }

  const questions = buildVisitQuestions(metrics, derived);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ source: "template", questions });
  }

  try {
    const parsed = await completeJSON<{ questions?: string[] }>({
      maxCompletionTokens: 3000,
      schema: {
        name: "visit_questions",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            questions: {
              type: "array",
              items: { type: "string" },
              description:
                "Exactly three rephrased questions, in the same order as the input.",
            },
          },
          required: ["questions"],
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "You rephrase visit questions for a neurologist handoff.",
            "Use ONLY the numbers already present in the questions given to you.",
            "Do not add, invent, recompute, round, or reformat any number.",
            "Do not claim medication efficacy. This is not a medical device.",
            "Return exactly three questions, in the same order.",
          ].join(" "),
        },
        { role: "user", content: questions.map((q, i) => `${i + 1}. ${q}`).join("\n") },
      ],
    });

    const out = parsed.questions;
    if (!Array.isArray(out) || out.length !== 3 || out.some((q) => typeof q !== "string")) {
      return NextResponse.json({ source: "template", questions });
    }

    // Instructing a model not to invent numbers is not the same as it not
    // inventing them, and this text goes in front of a clinician. So the
    // instruction is checked rather than trusted: every numeric token in the
    // rephrasing must already appear somewhere in the source questions. A
    // rounded 0.59 for 0.594, or a plausible dose that was never measured,
    // fails here and the deterministic template is served instead.
    if (introducesNumber(questions, out)) {
      console.warn("[clinician-prose] rephrasing introduced a number; using template");
      return NextResponse.json({ source: "template", questions });
    }

    return NextResponse.json({ source: "openai", questions: out });
  } catch {
    return NextResponse.json({ source: "template", questions });
  }
}
