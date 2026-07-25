# Deploying the demo

**Live: https://astrolabe-flame.vercel.app**

A public URL so judges can open the product without cloning anything.

## Vercel, via the CLI

Already done for this project — `sadegh3/astrolabe`, deployed from `app/` so the
root directory resolves without extra configuration. To repeat it elsewhere:

```bash
cd app
npx vercel login          # device-code flow, approve in a browser
npx vercel link --yes --project astrolabe
printf '%s' "$VALUE" | npx vercel env add NAME production --force
npx vercel --prod --yes
```

Running from `app/` is what makes the root directory correct. Deploying from the
repository root instead requires setting **Root Directory: `app`** in project
settings, and the build fails confusingly if that is missed.

## Or via the dashboard

1. [vercel.com/new](https://vercel.com/new) → **Import** `MohammadSadeghSalehi/astrolabe`.
2. **Root Directory: `app`.** This is the one setting that matters — the Next.js
   project is not at the repository root, and the build fails confusingly if it
   is left at `./`.
3. Framework preset: Next.js (detected). Build and output settings: defaults.
4. Environment variables — add before the first deploy:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — for the voice-note insert |
| `ELEVENLABS_API_KEY` | transcription |
| `OPENAI_API_KEY` | extraction and clinician prose |
| `NEXT_PUBLIC_SITE_URL` | the deployed URL, once you have it |

Only `NEXT_PUBLIC_*` reaches the browser. The other three are read exclusively
inside route handlers.

5. Deploy. Then set `NEXT_PUBLIC_SITE_URL` to the real URL and redeploy once, so
   the Open Graph and Twitter card images resolve against the right host.

## After deploying, check the deploy rather than assume it

```bash
node scripts/check_supabase.mjs        # the online path the deployment uses
```

Then open the deployment and confirm:

- the footer reads **“Online · bundles from Supabase”**, not “local fallback”
- `/day` shows `DECLINED ALL 114 STEPS`, coverage `0.903`, abstain `12.4%`
- dropping a wrist moves hold-out abstention to `77.3%`
- `/devices` and `/profile` render
- `?source=local` and `?source=supabase` agree on every number

If the footer says local fallback, the deployment could not reach Supabase —
env vars missing, or the grants in `supabase/migrations/0001_init.sql` were not
applied to that project. The app still works; it is telling you the truth about
where the data came from.

## Recording the demo

Record against `?source=local`. The online path is real and worth showing, but a
one-minute take should not contain a network round trip you cannot retry. The
footer states which one is in use either way, so nothing is misrepresented.

## Shutting it down afterwards

The demo is disposable by design and holds no personal data — the bundles are
derived from a public CC-BY research cohort.

1. Vercel → project → Settings → **Delete Project**.
2. Supabase → project → Settings → **Pause** or **Delete**.
3. Rotate anything that was ever pasted outside `.env.local`: the ElevenLabs
   key, the OpenAI key, and the Supabase service role.

Rotating is worth doing even if the keys were never committed. A key is
compromised the moment it is pasted anywhere it can be logged, and none of these
are worth the cost of being wrong about that.
