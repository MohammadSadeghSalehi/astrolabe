/**
 * Browser Supabase client (anon key only).
 * Service role must never appear here or under NEXT_PUBLIC_*.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Singleton browser client. Returns null if env is not configured. */
export function createBrowserClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  if (browserClient) return browserClient;
  browserClient = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return browserClient;
}

export type EventInsert = {
  id: string;
  participant: string | null;
  day: number | null;
  t: string;
  type: string;
  source: string;
  drug: string | null;
  dose_mg: number | null;
  note: string | null;
  created_at: string;
};

/**
 * Realtime subscription for new `events` rows (voice track).
 * Returns an unsubscribe function. No-ops if client is unavailable.
 */
export function subscribeEvents(
  participant: string,
  day: number,
  onInsert: (row: EventInsert) => void,
): () => void {
  const client = createBrowserClient();
  if (!client) {
    console.warn("[db] subscribeEvents: Supabase not configured");
    return () => {};
  }

  const channel: RealtimeChannel = client
    .channel(`events:${participant}:${day}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "events",
        filter: `participant=eq.${participant}`,
      },
      (payload) => {
        const row = payload.new as EventInsert;
        if (row.day != null && row.day !== day) return;
        onInsert(row);
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
