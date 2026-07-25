import { NextResponse } from "next/server";
import {
  buildVisitQuestions,
  type ClinicianDerived,
} from "@/lib/clinician-prose";
import type { BundleMetrics } from "@/lib/contract";

/**
 * Optional prose polish via Anthropic.
 * Body: { metrics, derived } — already-validated numbers only.
 * Without ANTHROPIC_API_KEY, returns deterministic templates.
 * Never invents or recomputes clinical metrics.
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
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return NextResponse.json({
      source: "template",
      questions,
    });
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: key });

    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            "You rephrase three visit questions for a neurologist handoff.",
            "Use ONLY the numbers already in the questions below.",
            "Do not add, invent, or recompute any clinical numbers or claims.",
            "Do not claim medication efficacy. Not a medical device.",
            "Return JSON: {\"questions\":[\"...\",\"...\",\"...\"]}",
            "",
            ...questions.map((q, i) => `${i + 1}. ${q}`),
          ].join("\n"),
        },
      ],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const parsed = JSON.parse(
      text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim(),
    ) as { questions?: string[] };

    if (
      !parsed.questions ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length !== 3
    ) {
      return NextResponse.json({ source: "template", questions });
    }

    return NextResponse.json({
      source: "anthropic",
      questions: parsed.questions,
    });
  } catch {
    return NextResponse.json({ source: "template", questions });
  }
}
