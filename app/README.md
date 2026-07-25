# Astrolabe — web app

Next.js 16 · TypeScript · Tailwind v4 · `motion` · `d3-scale`/`d3-shape` for
maths only. Every chart is hand-rolled SVG: the hatch fills, the uncertainty
bands and the abstention holes are not shapes a charting library will draw.

```bash
npm install
npm run dev                    # http://localhost:3000
# or
npm run build && npm start
```

## Choosing the data source

The app renders one JSON bundle per participant-day. Where that comes from is
decided in exactly one place, [`lib/source.ts`](lib/source.ts).

| `NEXT_PUBLIC_DEMO_MODE` | Source |
|---|---|
| `offline` (default) | `public/bundles/*.json` |
| `supabase` | the `bundles` table, anon read |

`NEXT_PUBLIC_*` is inlined at build time, so changing that variable means a
rebuild. To compare both paths without one, override per request:

```
/?source=local
/?source=supabase
```

The override only selects between two real sources — it cannot manufacture data
— and **the footer reports where the bundle actually came from**, not what was
asked for. A request for Supabase that falls back to local says so on screen.

If the online path misbehaves, `node ../scripts/check_supabase.mjs` names the
failing step (env, migration, grants, or seed) instead of leaving you to infer
it from a 401.

Copy `../.env.example` to `.env.local`. Everything except `NEXT_PUBLIC_*` is
server-side only, and the Supabase service role must never appear under `app/`
outside a route handler.

## If the page looks unstyled

Stop the server before rebuilding. `next build` replaces `.next` in place, so a
running `next start` keeps serving HTML that points at chunk filenames the new
build no longer wrote:

```
GET /_next/static/chunks/<hash>.css  500
```

Nothing else errors. React hydrates, the data loads, every number is correct —
and the page renders as unstyled full-width blocks, which reads as a broken UI
rather than a missing stylesheet. Kill the server, `rm -rf .next`, rebuild,
start.

```powershell
npm run build ; npm start     # sequential, never against a live server
```

## Windows and WSL cannot share one `node_modules`

`npm install` fetches binaries compiled for the platform it runs on —
`lightningcss` and `@next/swc` both ship as native `.node` files. Install on
Windows, build from WSL, and the build dies on a missing Linux binary:

```
Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
```

Reinstalling in the other shell only moves the failure. Pick one environment per
checkout and stay in it — in this repo the Python and ML work happens in WSL and
the app is built from PowerShell, so the installed binaries are `win32-x64`. A
fresh clone on Linux or macOS runs `npm install` there and is fine.

## Layout

```
app/            routes — day view, /clinician, and the API handlers
components/     Timeline, TremorRow, RevealWipe, MetricsPanel, …
lib/            contract types, scales, store, source, openai
public/bundles/ the emitted bundles the UI renders
public/brand/   mark, wordmark, cards
```

## The design rule

Every element declares where it came from: solid fill for observed, a diamond
for reported, hatch inside an uncertainty band for reconstructed, and — where
the model abstained — no fill at all, a dashed hole with the reason written out.

Treatments differ by **texture, not hue**, so they survive greyscale, a
projector and colour-blind vision. Abstention is drawn as absence, because "we
don't know" must never look like a value.

`null` in a metric means *could not be computed* and renders as an em-dash. It
is never shown as `0.00`; a zero would read as a perfect score for a day the
model declined entirely.
