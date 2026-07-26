import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Count distinct visitors without storing anyone's address.
 *
 * The IP is salted and hashed here and never written down. The salt matters: a
 * bare SHA-256 of an IPv4 address is reversible by brute force in seconds —
 * there are only four billion of them — so an unsalted digest would be a
 * personal identifier wearing a disguise. With a server-side secret in front,
 * the digest is only useful for equality, which is all a distinct-count needs.
 *
 * Failure is silent by design. A visitor counter is the least important thing
 * on the page and must never be the reason it errors.
 */
function hashIp(ip: string): string {
  const salt = process.env.VISIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return NextResponse.json({ count: null });

  const ip = clientIp(req);
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (ip) {
      const ip_hash = hashIp(ip);
      // Upsert rather than insert: a returning visitor bumps their own row and
      // the distinct count stays a count of people, not of page loads.
      await sb.from("visits").upsert(
        { ip_hash, last_seen: new Date().toISOString() },
        { onConflict: "ip_hash", ignoreDuplicates: false },
      );
    }
    const { data, error } = await sb.rpc("visit_count");
    if (error) throw error;
    return NextResponse.json({ count: Number(data) });
  } catch (err) {
    console.warn("[visit]", err instanceof Error ? err.message : err);
    return NextResponse.json({ count: null });
  }
}
