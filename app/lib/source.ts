import type { Bundle } from "./contract";
import { createBrowserClient } from "./db";

/**
 * Single place that knows where bundles come from.
 *
 * - NEXT_PUBLIC_DEMO_MODE=offline | unset | anything else: local /bundles/*.json
 * - NEXT_PUBLIC_DEMO_MODE=online | supabase: Supabase `bundles` table (anon read)
 *
 * Online failures fall back to local JSON so wifi-off and misconfig never crash
 * the pitch path.
 */
export async function getBundle(
  participant: string,
  opts?: { nowrist?: boolean },
): Promise<Bundle> {
  const mode = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "offline").toLowerCase();
  const online = mode === "online" || mode === "supabase";
  const variant = opts?.nowrist ? "nowrist" : "full";

  if (online) {
    try {
      const bundle = await fetchBundleFromSupabase(participant, variant);
      if (bundle) return bundle;
      console.warn(
        "[source] online path returned no row; falling back to local bundles",
      );
    } catch (err) {
      console.warn(
        "[source] online path failed; falling back to local bundles",
        err,
      );
    }
  }

  return fetchBundleLocal(participant, opts?.nowrist === true);
}

async function fetchBundleLocal(
  participant: string,
  nowrist: boolean,
): Promise<Bundle> {
  const name = nowrist ? `${participant}_nowrist` : participant;
  const res = await fetch(`/bundles/${name}.json`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load bundle ${name}: ${res.status}`);
  }
  return (await res.json()) as Bundle;
}

async function fetchBundleFromSupabase(
  participant: string,
  variant: "full" | "nowrist",
): Promise<Bundle | null> {
  const client = createBrowserClient();
  if (!client) {
    console.warn("[source] Supabase env missing (URL / anon key)");
    return null;
  }

  // Prefer exact participant+variant; day is part of PK but demo is one day per mock.
  const { data, error } = await client
    .from("bundles")
    .select("payload, day")
    .eq("participant", participant)
    .eq("variant", variant)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.payload) return null;

  const payload = data.payload as Bundle;
  // Ensure day is present even if older payloads omit it.
  if (payload.day == null && data.day != null) {
    return { ...payload, day: data.day };
  }
  return payload;
}

// Re-export realtime helper so voice track can import from one seam if preferred.
export { subscribeEvents, type EventInsert } from "./db";
