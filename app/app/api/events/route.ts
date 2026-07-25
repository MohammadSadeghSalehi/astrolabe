import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Server-side event insert for the voice track.
 *
 * RLS only allows INSERT when auth.uid() is set; the demo uses the service
 * role on the server so we never put that key in NEXT_PUBLIC_*. Offline demos
 * never call this route.
 */
export async function POST(req: Request) {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        error: "Supabase service role not configured on the server",
        offline: true,
      },
      { status: 503 },
    );
  }

  let body: {
    participant?: string;
    day?: number | null;
    t?: string;
    type?: string;
    source?: string;
    drug?: string | null;
    dose_mg?: number | null;
    note?: string | null;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const participant = body.participant?.trim();
  const t = body.t?.trim();
  const type = body.type?.trim();
  if (!participant || !t || !type) {
    return NextResponse.json(
      { error: "participant, t, and type are required" },
      { status: 400 },
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const row = {
    participant,
    day: body.day ?? null,
    t,
    type,
    source: body.source?.trim() || "reported",
    drug: body.drug ?? null,
    dose_mg: body.dose_mg ?? null,
    note: body.note ?? null,
  };

  const { data, error } = await sb.from("events").insert(row).select().single();

  if (error) {
    console.error("[api/events]", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ event: data });
}
