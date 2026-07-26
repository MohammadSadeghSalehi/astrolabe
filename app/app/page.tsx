import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HeroDay } from "@/components/HeroDay";
import { MethodPipeline } from "@/components/MethodPipeline";
import { AstrolabeGlyph } from "@/components/AstrolabeGlyph";

export const metadata = {
  title: "Astrolabe — read the hours you couldn't record",
};

/**
 * Landing page.
 *
 * Every figure here is measured and appears in docs/FINDINGS.md, or is
 * computed straight from data/cops/derived/participants.csv (the diary
 * completion rate — see scripts/diary_completion.py). Nothing on this page
 * states a capability the model does not have — no efficacy language, no
 * "predicts your symptoms" — and the negative result is given the same
 * visual weight as the rest rather than being buried in a footnote.
 */

const RESULTS: {
  claim: string;
  value: string;
  against: string;
  holds: boolean;
  note?: string;
}[] = [
  {
    claim: "The 90% interval really contains the truth",
    value: "0.903",
    against: "a 0.90 target, on 11 held-out participants",
    holds: true,
  },
  {
    claim: "Tremor is detectable across people",
    value: "0.697",
    against: "AUC, ± 0.075 over 55 held-out participants",
    holds: true,
  },
  {
    claim: "Refusing improves what remains",
    value: "0.713 → 0.825",
    against: "accuracy, answering all hours vs the most confident quarter",
    holds: true,
  },
  {
    claim: "Losing a wrist costs answers, not accuracy",
    value: "12.4% → 77.3%",
    against: "hours declined, holding the same error budget",
    holds: true,
  },
  {
    claim: "Within one person, tremor is much weaker",
    value: "0.550",
    against: "median per-participant AUC — the figure a diary is judged on",
    holds: false,
    note: "The pooled 0.697 largely separates tremor-dominant people from everyone else.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      <Nav />

      {/* ── hero ─────────────────────────────────────────────────────────
          overflow-hidden is load-bearing: the rete bleeds off the top-right
          corner by design, and without it that reads as horizontal scroll
          on narrow viewports rather than an intentional crop. */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 hidden opacity-90 sm:block md:-right-16 md:-top-20"
        >
          <AstrolabeGlyph className="h-[340px] w-[340px] md:h-[480px] md:w-[480px]" />
        </div>

        <div className="relative mx-auto w-full max-w-[1280px] px-5 pb-14 pt-10 md:px-6 md:pb-20 md:pt-16">
          <div className="max-w-[64ch]">
            <p
              className="font-mono text-[14px] uppercase tracking-[0.14em]"
              style={{ color: "var(--brass)" }}
            >
              Parkinson&apos;s motor diary
            </p>
            <h1
              className="font-display mt-3 text-[34px] font-light leading-[1.08] md:text-[58px]"
              style={{ color: "var(--ink)" }}
            >
              Most of the day <em className="italic">goes unrecorded.</em>
            </h1>
            <p
              className="mt-5 text-[18px] leading-relaxed md:text-[21px]"
              style={{ color: "var(--ink-2)" }}
            >
              Medication decisions rest on a twenty-minute clinic visit and a
              diary that stops getting filled. Astrolabe reconstructs the missing
              hours from wrist sensors — and refuses, hour by hour, wherever the
              evidence cannot carry the answer.
            </p>
          </div>

          {/* The claim, stated as three measured facts rather than adjectives.
              Each carries its comparator, because a number without one is a
              decoration. */}
          <dl className="mt-10 grid max-w-[68ch] gap-x-10 gap-y-7 sm:grid-cols-3">
            {[
              {
                v: "0.903",
                k: "Its 90% range really is 90%",
                s: "measured on people it never trained on, not assumed",
              },
              {
                v: "6×",
                k: "More cautious when a sensor drops",
                s: "declines 12.4% of hours → 77.3%, same error budget",
              },
              {
                v: "+11 pts",
                k: "More accurate the less it answers",
                s: "0.713 → 0.825 as it keeps only what it is sure of",
              },
            ].map((m) => (
              <div key={m.v} className="min-w-0">
                <dt
                  className="font-mono text-[32px] leading-none tabular-nums md:text-[40px]"
                  style={{ color: "var(--brass-hi)" }}
                >
                  {m.v}
                </dt>
                <dd className="mt-2.5 text-[17px] leading-snug" style={{ color: "var(--ink)" }}>
                  {m.k}
                  <span className="mt-1 block text-[15px]" style={{ color: "var(--ink-2)" }}>
                    {m.s}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-10 md:mt-12">
            <HeroDay />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/day"
              className="rounded-md px-6 py-3 text-[17px] font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--brass)", color: "var(--page)" }}
            >
              Open a real day →
            </Link>
            <Link
              href="/join"
              className="rounded-md border px-6 py-3 text-[17px] transition-opacity hover:opacity-90"
              style={{ borderColor: "var(--brass)", color: "var(--brass)" }}
            >
              Try it on a recording
            </Link>
          </div>

          {/* Provenance, not logos. What an "as seen in" row would be on a page
              with something more relevant to show. */}
          <div
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-5 font-mono text-[14px]"
            style={{ borderColor: "var(--axis)", color: "var(--ink-2)" }}
          >
            <span>Bayesian state inference over the day</span>
            <span aria-hidden style={{ color: "var(--axis)" }}>·</span>
            <span>intervals calibrated against held-out truth</span>
            <span aria-hidden style={{ color: "var(--axis)" }}>·</span>
            <span>no language model anywhere near a prediction</span>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 md:px-6">
        {/* ── the problem ────────────────────────────────────────────────── */}
        <section className="mt-4 max-w-[62ch] md:mt-8">
          <h2
            className="font-display text-[26px] font-light md:text-[32px]"
            style={{ color: "var(--ink)" }}
          >
            Twenty minutes, months apart
          </h2>
          <p
            className="mt-4 text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            Parkinson&apos;s symptoms fluctuate hour to hour. The clinic visit
            that decides medication is a snapshot of one of those hours. The
            diary meant to fill the gap is a chore, so it stops getting
            filled.
          </p>
          <blockquote
            className="mt-6 border-l-2 pl-5 text-[17px] italic leading-relaxed"
            style={{ borderColor: "var(--brass)", color: "var(--ink)" }}
          >
            &ldquo;My meds felt off all week. My neurologist asked when it was
            worse and I honestly couldn&apos;t tell her. I&apos;d stopped
            filling in the diary by Wednesday.&rdquo;
          </blockquote>

          {/* The pull-quote, made checkable: this is not an anecdote, it is
              the median in the very dataset behind this product. */}
          <p
            className="mt-5 text-[15px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            That is not an outlier. Even with research staff supporting the
            process,{" "}
            <span className="font-mono" style={{ color: "var(--ink)" }}>
              61.6%
            </span>{" "}
            of possible hours in this study carry a diary entry with a motor score — see{" "}
            <code
              className="rounded px-1 py-0.5 font-mono text-[14px]"
              style={{ background: "var(--surface)", color: "var(--brass)" }}
            >
              scripts/diary_completion.py
            </code>
            . Unsupervised, real-world completion is unlikely to be higher.
          </p>
        </section>

        {/* ── how it works ───────────────────────────────────────────────
            One figure, not six cards. The method is a sequence a signal moves
            through, and a sequence drawn as a grid of equal cards loses the
            one thing worth showing: that the last stage is a refusal. The
            measured results sit beneath in a table, because every one of them
            is a value against a comparator and that is what a table is for. */}
        <section className="mt-16 md:mt-24">
          <h2
            className="font-display text-[26px] font-light md:text-[32px]"
            style={{ color: "var(--ink)" }}
          >
            One signal, five stages, and a refusal
          </h2>
          <p
            className="mt-3 max-w-[62ch] text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            Bilateral acceleration goes in. What comes out is an hourly
            probability wrapped in an interval that has been widened until it
            tells the truth — and, wherever that interval is too wide to stand
            behind, nothing at all.
          </p>

          <div className="mt-10">
            <MethodPipeline />
          </div>
        </section>

        {/* ── measured results ───────────────────────────────────────────── */}
        <section className="mt-16 md:mt-24">
          <h2
            className="font-display text-[26px] font-light md:text-[32px]"
            style={{ color: "var(--ink)" }}
          >
            What that buys, measured
          </h2>
          <p
            className="mt-3 max-w-[62ch] text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            Every row is measured on participants the model never trained on,
            and every row names what it is being compared against. A number
            without its comparator is not a claim.
          </p>

          <div className="mt-8 min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ color: "var(--ink-2)" }}>
                  <th className="border-b py-3 pr-6 text-[15px] font-medium" style={{ borderColor: "var(--axis)" }}>
                    Claim
                  </th>
                  <th className="border-b py-3 pr-6 text-[15px] font-medium" style={{ borderColor: "var(--axis)" }}>
                    Measured
                  </th>
                  <th className="border-b py-3 text-[15px] font-medium" style={{ borderColor: "var(--axis)" }}>
                    Against
                  </th>
                </tr>
              </thead>
              <tbody>
                {RESULTS.map((r) => (
                  <tr key={r.claim}>
                    <td
                      className="border-b py-4 pr-6 align-top text-[16px]"
                      style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
                    >
                      {r.claim}
                      {r.note && (
                        <span className="mt-1 block text-[15px]" style={{ color: "var(--ink-2)" }}>
                          {r.note}
                        </span>
                      )}
                    </td>
                    <td
                      className="border-b py-4 pr-6 align-top font-mono text-[19px] tabular-nums"
                      style={{
                        borderColor: "var(--axis)",
                        color: r.holds ? "var(--brass-hi)" : "var(--ink-2)",
                      }}
                    >
                      {r.value}
                    </td>
                    <td
                      className="border-b py-4 align-top text-[16px]"
                      style={{ borderColor: "var(--axis)", color: "var(--ink-2)" }}
                    >
                      {r.against}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── the negative result, at full weight ──────────────────────────
            Left rule in --k4, the dyskinesia arm of the diverging kinesia
            ramp — the exact colour this panel is about, not a decorative
            accent borrowed from elsewhere. */}
        <section
          className="mt-16 rounded-lg border-l-[3px] border-y border-r p-6 md:mt-24 md:p-10"
          style={{ borderColor: "var(--axis)", borderLeftColor: "var(--k4)", background: "var(--surface)" }}
        >
          <p
            className="font-mono text-[14px] uppercase tracking-[0.12em]"
            style={{ color: "var(--brass)" }}
          >
            What it will not claim
          </p>
          <h2
            className="font-display mt-3 max-w-[52ch] text-[24px] font-light leading-snug md:text-[30px]"
            style={{ color: "var(--ink)" }}
          >
            The seven-point motor scale does not generalise across people, so
            we do not predict it.
          </h2>
          <p
            className="mt-4 max-w-[62ch] text-[16px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            How well someone feels they moved in the last hour is a judgement,
            and the accelerometer has no access to it. Nine feature sets over
            five participant-level folds; none beat a constant. Held-out
            ordinal MAE{" "}
            <span className="font-mono" style={{ color: "var(--ink)" }}>0.684</span>{" "}
            against a{" "}
            <span className="font-mono" style={{ color: "var(--ink)" }}>0.594</span>{" "}
            always-predict-Good baseline. So that row is shown as reported by
            the patient, or abstained — never as inferred.
          </p>
          <p
            className="mt-4 max-w-[62ch] text-[16px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            On the demo day the model declines every one of the 114 steps.
            That is the product working, not failing.
          </p>
        </section>

        {/* ── supplement ────────────────────────────────────────────────── */}
        <section className="mt-16 max-w-[62ch] md:mt-24">
          <h2 className="text-[19px] font-medium" style={{ color: "var(--ink)" }}>
            Technical supplement
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The dataset, the full experimental record, the negative results
            and the two bugs that made the pipeline flatter itself are all
            written up in the repository — including what we would need to
            establish anything causal, which this does not.
          </p>
          <ul className="mt-4 space-y-2 text-[16px]">
            <li>
              <a
                href="https://github.com/MohammadSadeghSalehi/astrolabe/blob/main/docs/FINDINGS.md"
                className="underline underline-offset-4"
                style={{ color: "var(--brass)" }}
              >
                docs/FINDINGS.md
              </a>{" "}
              <span style={{ color: "var(--ink-2)" }}>
                — what generalises across people, and what does not
              </span>
            </li>
            <li>
              <a
                href="https://github.com/MohammadSadeghSalehi/astrolabe/blob/main/docs/DATA.md"
                className="underline underline-offset-4"
                style={{ color: "var(--brass)" }}
              >
                docs/DATA.md
              </a>{" "}
              <span style={{ color: "var(--ink-2)" }}>
                — the COPS cohort, its quirks and its limits
              </span>
            </li>
          </ul>
          <p className="mt-6 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Built on COPS (Nesser et al., CC-BY 4.0): 66 people with
            Parkinson&apos;s, bilateral wrist accelerometry paired with hourly
            symptom diaries. 46 of them have deep brain stimulation, so this
            is an advanced, device-treated cohort rather than a newly
            diagnosed one.
          </p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] px-5 py-8 text-[15px] md:px-6" style={{ color: "var(--ink-2)" }}>
        Not a medical device. No diagnostic, dosing or treatment claim is made
        · COPS data CC-BY 4.0
      </footer>
    </div>
  );
}
