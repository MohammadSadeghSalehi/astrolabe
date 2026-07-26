import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HeroDay } from "@/components/HeroDay";
import { MethodPipeline } from "@/components/MethodPipeline";
import {
  DeviceStrip,
  LandingScroll,
  PlateRule,
  SponsorStrip,
} from "@/components/LandingScroll";

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
    <LandingScroll>
    <div className="land-page flex min-h-screen flex-col">
      <Nav />

      {/* ── hero ─────────────────────────────────────────────────────────
          overflow-hidden is load-bearing: the rete bleeds off the top-right
          corner by design, and without it that reads as horizontal scroll
          on narrow viewports rather than an intentional crop. */}
      <section className="relative overflow-hidden">
        {/* Ambient only. It sits under the headline at low opacity, is muted,
            and is hidden from assistive tech — it carries no information. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* One sized object, one crop, every width — see .astro-plate. Mobile
              gets the still: same composition, a hundredth of the bytes.
              data-parallax-plate: subtle scroll drift (LandingScroll). */}
          <div className="astro-plate" data-parallax-plate>
            {/* The still is the base layer, always. The loop lays over it from
                sm up — so switching the loop off (reduced motion, a phone, a
                codec nobody supports) falls back to the picture rather than to
                nothing. The wrapper carries the opacity, so the two never
                compound. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/hero-plate.png" alt="" />
            <video
              className="astro-hero-video absolute inset-0 hidden sm:block"
              poster="/brand/hero-plate.png"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            >
              <source src="/brand/hero-loop.webm" type="video/webm" />
              <source src="/brand/hero-loop.mp4" type="video/mp4" />
            </video>
          </div>
          {/* Scrim. Two axes because the text column is on the left at desktop
              and directly under the plate on a phone. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(92deg, var(--page) 8%, color-mix(in oklab, var(--page) 62%, transparent) 44%, transparent 82%), linear-gradient(to top, var(--page) 4%, transparent 46%)",
            }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-[1280px] px-5 pb-14 pt-10 md:px-6 md:pb-20 md:pt-16">
          <div className="max-w-[64ch]" data-reveal>
            <p
              className="font-mono text-[17px] uppercase tracking-[0.22em] md:text-[20px]"
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
          <dl className="mt-11 grid gap-x-8 gap-y-8 sm:grid-cols-3">
            {[
              {
                head: "When it says nine times in ten, it means it",
                fig: "90.3%",
                foot: "of the time the truth fell inside the range it drew — aiming at 90%",
              },
              {
                head: "It gets quieter when the evidence gets thinner",
                fig: "6×",
                foot: "more hours declined on one wrist than two, rather than guessing on",
              },
              {
                head: "It is right more often when it says less",
                fig: "+11 pts",
                foot: "accuracy on the hours it keeps, versus answering everything",
              },
            ].map((m, i) => (
              <div
                key={m.fig}
                className="min-w-0"
                data-reveal
                data-reveal-delay={String(i + 1)}
              >
                <dt className="text-[18px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
                  {m.head}
                </dt>
                <dd className="mt-3">
                  <span
                    className="font-mono text-[34px] leading-none tabular-nums md:text-[40px]"
                    style={{ color: "var(--brass-hi)" }}
                  >
                    {m.fig}
                  </span>
                  <span className="mt-2 block text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    {m.foot}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <ul className="mt-11 flex flex-wrap gap-2.5">
            {[
              { t: "Bayesian inference over the whole day", d: 0 },
              { t: "Ranges checked against held-out truth", d: 110 },
              { t: "No language model near a prediction", d: 220 },
            ].map((c) => (
              <li
                key={c.t}
                className="glass glass-lit astro-chip rounded-full px-4 py-2 text-[15px]"
                style={{ color: "var(--ink)", animationDelay: `${c.d}ms` }}
              >
                {c.t}
              </li>
            ))}
          </ul>

          <div className="mt-10 md:mt-12" data-reveal>
            <HeroDay />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4" data-reveal>
            <Link
              href="/day"
              className="astro-btn astro-btn-primary rounded-md px-6 py-3 text-[17px] font-medium"
              style={{ background: "var(--brass)", color: "var(--page)" }}
            >
              Open a real day <span className="astro-arrow">→</span>
            </Link>
            <Link
              href="/join"
              className="astro-btn rounded-md border px-6 py-3 text-[17px]"
              style={{ borderColor: "var(--brass)", color: "var(--brass)" }}
            >
              Try it on a recording
            </Link>
          </div>


        </div>
      </section>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 md:px-6">
        <PlateRule />

        {/* ── why this, and why now ────────────────────────────────────────
            Every figure here is sourced and linked. A product page making
            epidemiological claims without citations is asking to be believed
            rather than checked, which is the opposite of the argument. */}
        <section className="mt-16 md:mt-24" data-reveal>
          <h2
            className="font-display text-[26px] font-light md:text-[34px]"
            style={{ color: "var(--ink)" }}
          >
            The fastest-growing neurological condition in the world
          </h2>
          <p
            className="mt-4 max-w-[64ch] text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            And the one whose day-to-day management depends most on knowing
            <em> when</em> symptoms happen — which is exactly what nobody
            currently records.
          </p>

          <dl className="mt-9 grid gap-x-8 gap-y-8 sm:grid-cols-3">
            {[
              {
                fig: "11.8M",
                head: "people living with Parkinson’s",
                foot: "up 274% since 1990",
                href: "https://www.sciencedirect.com/science/article/pii/S2666756824000941",
                cite: "Lancet Healthy Longevity, 2024",
              },
              {
                fig: "25.2M",
                head: "projected by 2050",
                foot: "a 112% rise on 2021",
                href: "https://bmjgroup.com/cases-of-parkinsons-disease-set-to-reach-25-million-worldwide-by-2050/",
                cite: "BMJ, 2025",
              },
              {
                fig: "60–90%",
                head: "develop motor fluctuations",
                foot: "within 5–10 years of levodopa treatment",
                href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4634347/",
                cite: "Parkinson’s Disease and Its Management, 2015",
              },
            ].map((m) => (
              <div key={m.fig} className="min-w-0">
                <dt
                  className="font-mono text-[32px] leading-none tabular-nums md:text-[40px]"
                  style={{ color: "var(--brass-hi)" }}
                >
                  {m.fig}
                </dt>
                <dd className="mt-2.5">
                  <span className="block text-[17px] leading-snug" style={{ color: "var(--ink)" }}>
                    {m.head}
                  </span>
                  <span className="mt-1 block text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    {m.foot}
                  </span>
                  <a
                    href={m.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-[14px] underline underline-offset-4"
                    style={{ color: "var(--brass)" }}
                  >
                    {m.cite}
                  </a>
                </dd>
              </div>
            ))}
          </dl>

          <p
            className="mt-9 max-w-[70ch] text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            Once fluctuations begin, treatment becomes a timing problem: the same
            dose helps at one hour and not the next. Among people who experience
            OFF periods, roughly a quarter live with them{" "}
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/37517986/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
              style={{ color: "var(--brass)" }}
            >
              three to six hours a day
            </a>
            . Adjusting for that needs an hour-by-hour record — and the paper
            diary that is supposed to provide it is the first thing to go.
          </p>
        </section>

        <PlateRule />

        {/* ── the problem ────────────────────────────────────────────────── */}
        <section className="mt-4 max-w-[62ch] md:mt-8" data-reveal>
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
          <div className="mt-8" data-reveal>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/completion.svg"
              alt="Twenty-four hour slots with roughly three in five filled — diary completion as empty and recorded hours"
              className="w-full max-w-[520px]"
            />
          </div>
        </section>

        <DeviceStrip />

        <PlateRule />

        {/* ── how it works ───────────────────────────────────────────────
            One figure, not six cards. The method is a sequence a signal moves
            through, and a sequence drawn as a grid of equal cards loses the
            one thing worth showing: that the last stage is a refusal. The
            measured results sit beneath in a table, because every one of them
            is a value against a comparator and that is what a table is for. */}
        <section className="mt-16 md:mt-24" data-reveal>
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

        <PlateRule />

        {/* ── measured results ───────────────────────────────────────────── */}
        <section className="mt-16 md:mt-24" data-reveal>
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
        <div className="mt-12 flex justify-center" data-reveal aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/bilateral.svg"
            alt=""
            className="w-full max-w-[280px] opacity-90"
          />
        </div>

        <section
          className="glass glass-lit mt-16 rounded-xl p-6 md:mt-24 md:p-12"
          data-reveal
        >
          <p
            className="font-mono text-[15px] uppercase tracking-[0.16em]"
            style={{ color: "var(--brass)" }}
          >
            Where it stops
          </p>
          <h2
            className="font-display mt-4 max-w-[26ch] text-[26px] font-light leading-[1.15] md:text-[38px]"
            style={{ color: "var(--ink)" }}
          >
            It can tell you about your tremor. It cannot tell you how your day
            felt.
          </h2>
          <div className="mt-7 grid max-w-[80ch] gap-x-12 gap-y-6 md:grid-cols-2">
            <p className="text-[17px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              Tremor is movement, and movement is something a sensor on your
              wrist can measure. Whether an hour felt good or bad is a judgement
              you make — about stiffness, effort, how your body answered you —
              and no accelerometer has access to that. We tried hard to predict
              it anyway and could not beat simply guessing &ldquo;a good
              hour&rdquo; every time.
            </p>
            <p className="text-[17px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              So we do not predict it. That row of your diary stays yours: what
              you reported, or an honest blank. A tool that filled it in with a
              confident guess would be more comfortable to look at and worth
              less than nothing to bring to an appointment.
            </p>
          </div>
        </section>

        <PlateRule />

        {/* ── supplement ────────────────────────────────────────────────── */}
        <section className="mt-16 max-w-[74ch] md:mt-24" data-reveal>
          <h2
            className="font-display text-[24px] font-light md:text-[30px]"
            style={{ color: "var(--ink)" }}
          >
            Check the work
          </h2>
          <p className="mt-3 text-[17px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The method, the maths and the results that went against us.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <a
              href="/astrolabe-technical-report.pdf"
              className="glass glass-lit flex items-center gap-4 rounded-xl px-5 py-4"
              style={{ color: "var(--ink)" }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--brass)" }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
                <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
              <span className="min-w-0">
                <span className="block text-[17px]">Technical report</span>
                <span className="block text-[15px]" style={{ color: "var(--ink-2)" }}>
                  PDF · method, calibration, negative results
                </span>
              </span>
            </a>

            <a
              href="https://github.com/MohammadSadeghSalehi/astrolabe"
              className="glass glass-lit flex items-center gap-4 rounded-xl px-5 py-4"
              style={{ color: "var(--ink)" }}
            >
              {/* GitHub mark, drawn rather than an image so it inherits ink. */}
              <svg width="26" height="26" viewBox="0 0 16 16" fill="currentColor" aria-hidden style={{ color: "var(--brass)" }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              <span className="min-w-0">
                <span className="block text-[17px]">Source on GitHub</span>
                <span className="block text-[15px]" style={{ color: "var(--ink-2)" }}>
                  Every figure regenerates from a named script
                </span>
              </span>
            </a>
          </div>

          <p className="mt-7 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Built on an open study of 66 people living with Parkinson&apos;s who
            wore sensors on both wrists and kept an hourly diary for about a week.
            Two thirds have a deep brain stimulator, so this is an advanced group
            rather than a newly diagnosed one.
          </p>
        </section>
      </main>

      <div className="mx-auto w-full max-w-[1280px] px-5 md:px-6">
        <SponsorStrip />
      </div>

      <footer className="mx-auto w-full max-w-[1280px] px-5 py-8 text-[15px] md:px-6" style={{ color: "var(--ink-2)" }}>
        Not a medical device. No diagnostic, dosing or treatment claim is made
        · COPS data CC-BY 4.0
      </footer>
    </div>
    </LandingScroll>
  );
}
