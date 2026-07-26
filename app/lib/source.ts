import type { Bundle } from "./contract";
import { createBrowserClient } from "./db";

/** Where a bundle actually came from — not where it was configured to come from. */
export type BundleOrigin = "supabase" | "local" | "upload";

export type LoadedBundle = {
  bundle: Bundle;
  origin: BundleOrigin;
  /**
   * True only when the online path was attempted and did not answer. Local
   * because it was asked for is a different fact from local because Supabase
   * failed, and a footer that conflates them either cries wolf on a deliberate
   * offline run or stays quiet on a real outage.
   */
  fellBack: boolean;
};

/**
 * Single place that knows where bundles come from.
 *
 * - NEXT_PUBLIC_DEMO_MODE=offline | unset | anything else: local /bundles/*.json
 * - NEXT_PUBLIC_DEMO_MODE=online | supabase: Supabase `bundles` table (anon read)
 *
 * Online failures fall back to local JSON so wifi-off and misconfig never crash
 * the pitch path.
 *
 * The origin is RETURNED rather than inferred from the env var by the caller,
 * because those two things come apart precisely when it matters. A misconfigured
 * key or a missing grant sends every request down the local fallback while
 * `DEMO_MODE` still says `supabase`, and an interface that reads the env var
 * would stand there claiming a live database it is not talking to. This app
 * argues that displayed claims should be checkable; its own footer is not
 * exempt.
 */
/**
 * `?source=local` / `?source=supabase` overrides NEXT_PUBLIC_DEMO_MODE.
 *
 * NEXT_PUBLIC_* is inlined at build time, so without this, comparing the two
 * paths means editing .env.local and rebuilding between each look — slow enough
 * that in practice you check one and assume the other. Two tabs is the version
 * of that test people actually run.
 *
 * It only ever picks between two real sources; it cannot manufacture data, and
 * the footer still reports where the bundle came from rather than what was
 * requested. So a URL that asks for Supabase and silently falls back still says
 * so on screen.
 */
/** Where an uploaded bundle lives until the tab is closed. */
export const UPLOAD_KEY = "astrolabe.uploaded-bundle";

/**
 * A bundle the visitor handed us this session.
 *
 * sessionStorage, not localStorage and not the server: an upload is someone
 * else's recording, it is only needed for as long as they are looking at it,
 * and the least we can do with data we did not ask to keep is fail to keep it.
 */
function uploadedBundle(): Bundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(UPLOAD_KEY);
    return raw ? (JSON.parse(raw) as Bundle) : null;
  } catch {
    return null;
  }
}

function requestedSource(): "local" | "supabase" | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("source");
  if (q === "local" || q === "offline") return "local";
  if (q === "supabase" || q === "online") return "supabase";
  return null;
}

export async function getBundle(
  participant: string,
  opts?: { nowrist?: boolean },
): Promise<LoadedBundle> {
  // An uploaded bundle outranks everything. Someone who just handed us a file
  // and is then shown the demo participant would reasonably conclude the upload
  // did nothing, or worse, that this is their data.
  const uploaded = uploadedBundle();
  if (uploaded) return { bundle: uploaded, origin: "upload", fellBack: false };

  const mode = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "offline").toLowerCase();
  const override = requestedSource();
  const online =
    override != null
      ? override === "supabase"
      : mode === "online" || mode === "supabase";
  const variant = opts?.nowrist ? "nowrist" : "full";

  let attemptedOnline = false;
  if (online) {
    attemptedOnline = true;
    try {
      const bundle = await fetchBundleFromSupabase(participant, variant);
      if (bundle) return { bundle, origin: "supabase", fellBack: false };
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

  return {
    bundle: await fetchBundleLocal(participant, opts?.nowrist === true),
    origin: "local",
    fellBack: attemptedOnline,
  };
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
