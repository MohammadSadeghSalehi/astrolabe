import type { Bundle } from "./contract";

/**
 * Single place that knows where bundles come from.
 * DEMO_MODE=offline (default) reads committed JSON under /public/bundles.
 * Supabase can slot in later without touching components.
 */
export async function getBundle(
  participant: string,
  opts?: { nowrist?: boolean },
): Promise<Bundle> {
  const offline =
    process.env.NEXT_PUBLIC_DEMO_MODE !== "online" &&
    process.env.NEXT_PUBLIC_DEMO_MODE !== "supabase";

  if (!offline) {
    // Sponsor path not wired yet — fall back to local so the demo never dies.
    console.warn("[source] online path not configured; using local bundles");
  }

  const name = opts?.nowrist ? `${participant}_nowrist` : participant;
  const res = await fetch(`/bundles/${name}.json`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load bundle ${name}: ${res.status}`);
  }
  return (await res.json()) as Bundle;
}
