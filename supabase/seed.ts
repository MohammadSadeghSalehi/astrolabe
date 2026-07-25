/**
 * Seed participants + reconstruction bundles into Supabase.
 *
 * Uses SERVICE ROLE only — never run this in the browser.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed.ts
 *
 * Resolves @supabase/supabase-js from app/node_modules (install deps in app/).
 * Reads contract mocks (frozen UI interface) and Demographics.csv when present.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Prefer app/node_modules so seed works without a root package.json.
const require = createRequire(join(REPO_ROOT, "app", "package.json"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
  );
  console.error(
    "Service role is seed-only — never put it in NEXT_PUBLIC_* or app/ code.",
  );
  process.exit(1);
}

if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "WARN: NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is set — remove it; service role must not ship to the client.",
  );
}

type BundlePayload = {
  participant: string;
  day?: number;
  events?: Array<{
    t: string;
    type: string;
    source?: string;
    drug?: string;
    dose_mg?: number;
    note?: string;
  }>;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

type DemoRow = {
  id: string;
  age: number | null;
  sex: string | null;
  pd_subtype: string | null;
  hoehn_yahr: number | null;
  dbs: boolean | null;
};

/** Known demo fallback when Demographics.csv is not on disk (gitignored raw). */
const COPS29_FALLBACK: DemoRow = {
  id: "COPS-29",
  age: 60,
  sex: "female",
  pd_subtype: "equivalence-type",
  hoehn_yahr: 2,
  dbs: true,
};

function loadJson<T>(rel: string): T {
  const path = join(REPO_ROOT, rel);
  if (!existsSync(path)) {
    throw new Error(`Missing file: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function parseBool(raw: string | undefined): boolean | null {
  if (raw == null || raw === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "1" || v === "y") return true;
  if (v === "no" || v === "false" || v === "0" || v === "n") return false;
  return null;
}

function parseNum(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Semicolon-delimited COPS Demographics.csv → map by ID. */
function loadDemographics(): Map<string, DemoRow> {
  const candidates = [
    process.env.DEMOGRAPHICS_CSV,
    join(REPO_ROOT, "data/cops/meta/Demographics.csv"),
    // Sibling working copy used by human (raw data not in worktree)
    "C:/Users/sadeg/Hackathon/data/cops/meta/Demographics.csv",
  ].filter(Boolean) as string[];

  const map = new Map<string, DemoRow>();

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    const header = lines[0].split(";").map((h) => h.trim());
    const idx = (name: string) => header.indexOf(name);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";");
      const id = cols[idx("ID")]?.trim();
      if (!id) continue;
      map.set(id, {
        id,
        age: parseNum(cols[idx("Age")]),
        sex: cols[idx("Sex")]?.trim() || null,
        pd_subtype: cols[idx("PD_Subtype")]?.trim() || null,
        hoehn_yahr: parseNum(cols[idx("PD_HoehnAndYahr")]),
        dbs: parseBool(cols[idx("DBS")]),
      });
    }
    console.log(`Loaded demographics from ${path} (${map.size} rows)`);
    return map;
  }

  console.warn(
    "Demographics.csv not found — using COPS-29 fallback row only. " +
      "Set DEMOGRAPHICS_CSV or fetch data/cops/meta via scripts/osf_download.py.",
  );
  map.set(COPS29_FALLBACK.id, COPS29_FALLBACK);
  return map;
}

async function main() {
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The REAL emitted bundles, never the mocks. The mocks carry invented
  // posteriors and an ordinal_mae of 0.33 against a 0.594 baseline — a number no
  // model produced, for a target that in fact loses. Seeding those would mean
  // that flipping NEXT_PUBLIC_DEMO_MODE to `supabase` silently swaps the honest
  // numbers for flattering ones, which is the single worst thing this project
  // could do to itself. Fail loudly if they are missing rather than falling back.
  const full = loadJson<BundlePayload>("contract/COPS-29.json");
  const nowrist = loadJson<BundlePayload>("contract/COPS-29_nowrist.json");
  const demos = loadDemographics();

  const participantId = full.participant;
  if (!participantId) {
    throw new Error("Bundle missing participant");
  }

  const demo = demos.get(participantId) ?? {
    ...COPS29_FALLBACK,
    id: participantId,
  };
  const day = typeof full.day === "number" ? full.day : 1;

  console.log(`Upserting participant ${participantId} (day ${day})…`);

  const { error: pErr } = await sb.from("participants").upsert(
    {
      id: demo.id,
      age: demo.age,
      sex: demo.sex,
      pd_subtype: demo.pd_subtype,
      hoehn_yahr: demo.hoehn_yahr,
      dbs: demo.dbs,
    },
    { onConflict: "id" },
  );
  if (pErr) throw new Error(`participants upsert: ${pErr.message}`);

  const bundleRows = [
    {
      participant: participantId,
      day,
      variant: "full",
      payload: full,
    },
    {
      participant: participantId,
      day: typeof nowrist.day === "number" ? nowrist.day : day,
      variant: "nowrist",
      payload: nowrist,
    },
  ];

  const { error: bErr } = await sb
    .from("bundles")
    .upsert(bundleRows, { onConflict: "participant,day,variant" });
  if (bErr) throw new Error(`bundles upsert: ${bErr.message}`);

  // Optional: seed reported med events from the full mock (idempotent-ish via delete+insert day)
  const events = Array.isArray(full.events) ? full.events : [];
  if (events.length > 0) {
    await sb
      .from("events")
      .delete()
      .eq("participant", participantId)
      .eq("day", day)
      .eq("source", "reported");

    const eventRows = events.map((e) => ({
      participant: participantId,
      day,
      t: e.t,
      type: e.type,
      source: e.source ?? "reported",
      drug: e.drug ?? null,
      dose_mg: e.dose_mg ?? null,
      note: e.note ?? null,
    }));

    const { error: eErr } = await sb.from("events").insert(eventRows);
    if (eErr) throw new Error(`events insert: ${eErr.message}`);
    console.log(`Inserted ${eventRows.length} reported events for day ${day}`);
  }

  console.log("Seed complete:", {
    participant: participantId,
    day,
    variants: ["full", "nowrist"],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
