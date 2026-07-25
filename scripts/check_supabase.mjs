/**
 * Supabase readiness check — tells you exactly which step is missing.
 *
 *   node scripts/check_supabase.mjs
 *
 * Reads app/.env.local. Uses only the browser-safe anon key, so it tests the
 * same path the app takes rather than a privileged one that would pass while
 * the real request fails.
 *
 * Four things have to be true for the online path to work, and they fail in
 * ways that look alike from the app (it silently falls back to local JSON):
 *   1. URL + anon key present
 *   2. schema migrated       — table exists
 *   3. GRANTs applied        — anon may select from it  <- the usual culprit
 *   4. seeded                — rows are actually there
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(ROOT, "app", ".env.local");

function readEnv() {
  if (!fs.existsSync(ENV)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mode = (env.NEXT_PUBLIC_DEMO_MODE || "offline").toLowerCase();

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m, fix) => {
  console.log(`  ✗ ${m}`);
  if (fix) console.log(`\n${fix}\n`);
};

console.log(`\nSupabase readiness  (app/.env.local, mode=${mode})\n`);

if (!url || !anon) {
  fail("URL / anon key missing from app/.env.local");
  process.exit(1);
}
pass(`URL ${url}`);

const GRANT_SQL = `  Run this in the Supabase SQL editor:

    grant usage  on schema public       to anon, authenticated;
    grant select on public.participants to anon, authenticated;
    grant select on public.bundles      to anon, authenticated;
    grant select on public.events       to anon, authenticated;
    grant insert on public.events       to authenticated;`;

const SEED_SQL = `  Seed it (service role, shell only — never in app/):

    export SUPABASE_URL=${url}
    export SUPABASE_SERVICE_ROLE_KEY=<Settings → API → service_role>
    npx --yes tsx supabase/seed.ts`;

let ok = true;

for (const table of ["participants", "bundles", "events"]) {
  const res = await fetch(
    `${url}/rest/v1/${table}?select=*&limit=1`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  ).catch((e) => ({ ok: false, status: 0, _err: e }));

  if (!res.ok) {
    const body = await (res.text?.() ?? Promise.resolve("")).catch(() => "");
    const code = /"code":"(\w+)"/.exec(body)?.[1];
    if (code === "42501") {
      fail(`${table}: table exists but anon cannot read it (GRANT missing)`,
           ok ? GRANT_SQL : null);
    } else if (code === "42P01") {
      fail(`${table}: table does not exist — migration not applied`,
           "  npx supabase link --project-ref <ref> && npx supabase db push");
    } else {
      fail(`${table}: HTTP ${res.status} ${body.slice(0, 120)}`);
    }
    ok = false;
    continue;
  }

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    fail(`${table}: readable but EMPTY — not seeded`, ok ? SEED_SQL : null);
    ok = false;
  } else {
    pass(`${table}: readable, has rows`);
  }
}

// The bundle the app will actually request, and whether it is the honest one.
if (ok) {
  const res = await fetch(
    `${url}/rest/v1/bundles?select=payload&participant=eq.COPS-29&variant=eq.full&limit=1`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  const [row] = await res.json();
  const gen = row?.payload?.generated ?? "";
  if (/MOCK/i.test(gen)) {
    fail("seeded bundle is a MOCK — re-run supabase/seed.ts from current main",
         "  The mocks carry invented posteriors and an ordinal_mae of 0.33.\n" +
         "  seed.ts now reads contract/COPS-29.json (the emitted bundle).");
    ok = false;
  } else {
    pass(`COPS-29 payload present — "${gen.slice(0, 60)}…"`);
  }
}

console.log(
  ok
    ? "\nOnline path is ready. The footer will read “bundles from Supabase”.\n"
    : "\nNot ready — the app will fall back to local JSON and say so in the footer.\n",
);
process.exit(ok ? 0 : 1);
