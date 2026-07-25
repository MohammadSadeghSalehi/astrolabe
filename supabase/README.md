# Supabase (Track C)

Offline demo stays the default. Supabase is the **online** sponsor path for
bundles + realtime events (voice track). The UI never requires wifi.

## Schema

Migration: [`migrations/0001_init.sql`](./migrations/0001_init.sql)

| Table | Role |
|---|---|
| `participants` | Demographics (COPS id, age, sex, subtype, HY, DBS) |
| `bundles` | Full reconstruction JSON (`payload` jsonb); `variant` = `full` \| `nowrist` |
| `events` | Meds / voice-reported events; realtime inserts for voice track |

RLS: public **select** on all three. **insert** on `events` only when `auth.uid()` is set.
Service role is used **only** by the seed script, never in the browser.

## Env

### App (`app/.env.local`) — browser-safe only

```bash
# offline (default) | online | supabase
NEXT_PUBLIC_DEMO_MODE=offline

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
```

**Never** put `service_role` in `NEXT_PUBLIC_*` or under `app/`.

### Seed (shell / CI only)

```bash
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
# optional aliases also accepted:
# NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ANON_KEY (seed needs service role)
```

## Apply migration

### Linked remote project

```bash
# from repo root
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or paste `migrations/0001_init.sql` into the Supabase SQL editor once.

### Local CLI (optional)

```bash
npx supabase start
npx supabase db reset   # applies migrations/
```

After schema is live, enable **Realtime** on `events` (Database → Replication →
`events`, or `alter publication supabase_realtime add table events`).

## Seed

Reads frozen contract mocks + COPS demographics, upserts participant + both
bundle variants.

```bash
# from repo root; needs Node 18+ and app deps installed
cd app && npm install && cd ..

# Demographics.csv is not vendored — fetch via scripts/osf_download.py or point:
#   DEMOGRAPHICS_CSV=C:/Users/sadeg/Hackathon/data/cops/meta/Demographics.csv

# Windows PowerShell:
#   $env:SUPABASE_URL="https://….supabase.co"
#   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ…"
#   npx --yes tsx supabase/seed.ts

# WSL / bash:
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
npx --yes tsx supabase/seed.ts
```

Expects:

- `contract/COPS-29.mock.json`
- `contract/COPS-29_nowrist.mock.json`
- `data/cops/meta/Demographics.csv` (semicolon-delimited; optional fallback for COPS-29)

## App integration

| File | Role |
|---|---|
| `app/lib/db.ts` | Browser client (anon key) + `subscribeEvents` |
| `app/lib/source.ts` | `getBundle` — offline JSON first; online reads `bundles` |

`NEXT_PUBLIC_DEMO_MODE` must be `online` or `supabase` to hit the DB.
Any other value (or unset) → `/public/bundles/*.json`. If Supabase errors,
`source.ts` falls back to local JSON and `console.warn`s — the demo never crashes.

## Verification

```bash
# 1) Offline still works (default)
cd app && npm run dev
# open UI — COPS-29 timeline renders from /bundles

# 2) No service_role in client tree
# (PowerShell) Select-String -Path app\**\* -Pattern service_role
# (WSL) grep -r service_role app/   # must be empty

# 3) Online (after migrate + seed + env)
# NEXT_PUBLIC_DEMO_MODE=supabase npm run dev
```

## Ownership

Track C owns `supabase/**`, `app/lib/db.ts`, and the online path in
`app/lib/source.ts` only. Do not edit UI components or `contract/**`.
