/**
 * The one place that talks to OpenAI.
 *
 * Server-side only — `OPENAI_API_KEY` is never exposed to the browser, and no
 * caller outside a route handler should import this.
 *
 * Two things about this model family that the call shape has to respect:
 *
 *   1. `max_tokens` is rejected; it is `max_completion_tokens`.
 *   2. It reasons before answering, and reasoning is billed against the same
 *      budget. A budget that looks generous for the visible answer can be spent
 *      entirely on thinking, returning `finish_reason: "length"` with empty
 *      content. That is not an outage and must not be reported as one — every
 *      caller here has a deterministic fallback, and a silent empty string
 *      would let a blank render pass for an answer.
 */

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export class OpenAIUnavailable extends Error {}

type Message = { role: "system" | "user" | "assistant"; content: string };

type CompleteOptions = {
  messages: Message[];
  maxCompletionTokens?: number;
  /** JSON Schema for a strict structured response. Omit for free text. */
  schema?: { name: string; schema: Record<string, unknown> };
  signal?: AbortSignal;
};

/**
 * Returns the assistant's text, or throws `OpenAIUnavailable`.
 *
 * Throwing rather than returning null is deliberate: every call site here is
 * decorating numbers a clinician may read, and a caller that forgets to check a
 * null gets a silent blank. A throw cannot be ignored by accident.
 */
export async function complete({
  messages,
  maxCompletionTokens = 3000,
  schema,
  signal,
}: CompleteOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIUnavailable("OPENAI_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages,
    max_completion_tokens: maxCompletionTokens,
  };
  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, strict: true, schema: schema.schema },
    };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenAIUnavailable(
      `OpenAI ${res.status}: ${detail.slice(0, 300) || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";

  if (!text) {
    throw new OpenAIUnavailable(
      choice?.finish_reason === "length"
        ? "token budget consumed by reasoning before any answer was produced"
        : "model returned no content",
    );
  }
  return text;
}

/** `complete` with a schema, parsed. Throws `OpenAIUnavailable` on bad JSON. */
export async function completeJSON<T>(
  opts: CompleteOptions & { schema: { name: string; schema: Record<string, unknown> } },
): Promise<T> {
  const text = await complete(opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OpenAIUnavailable("model returned malformed JSON");
  }
}
