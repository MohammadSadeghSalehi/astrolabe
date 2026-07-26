import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Bump when the terms text changes. Stored per sign-up, so a later change
 *  cannot retroactively alter what someone agreed to. */
export const TERMS_VERSION = "2026-07-26.1";

/**
 * Sign-up for the hackathon demonstration.
 *
 * Writes through the service role because `signups` is not readable by the anon
 * key at all — a list of people who have just told us they have Parkinson's is
 * not something an anonymous browser key should be able to enumerate, however
 * short the event.
 *
 * Consent is required at the API, not only in the form. A disabled button is a
 * courtesy; a server that refuses unticked consent is the actual control.
 */
export async function POST(req: Request) {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  let body: {
    email?: string;
    role?: string;
    note?: string;
    acceptedTerms?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  }
  if (body.acceptedTerms !== true) {
    return NextResponse.json(
      { error: "The terms have to be accepted before we can store anything." },
      { status: 400 },
    );
  }

  if (!url || !serviceKey) {
    // Configuration failure, not the visitor's problem — and we must not imply
    // their details were kept when they were not.
    return NextResponse.json(
      { error: "Sign-up is not configured on this deployment. Nothing was stored." },
      { status: 503 },
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await sb.from("signups").insert({
    email,
    role: body.role?.trim().slice(0, 200) || null,
    note: body.note?.trim().slice(0, 2000) || null,
    terms_version: TERMS_VERSION,
  });

  if (error) {
    console.error("[signup]", error.message);
    return NextResponse.json(
      { error: "Could not store that. Nothing was saved." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
}
