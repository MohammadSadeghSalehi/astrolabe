import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HeroStrip } from "@/components/HeroStrip";
import {
  IconDegraded,
  IconFrequency,
  IconInterval,
  IconNotClaimed,
  IconRefusal,
  IconSensor,
} from "@/components/icons/ScienceIcons";

export const metadata = {
  title: "Astrolabe — read the hours you couldn't record",
};

/**
 * Landing page.
 *
 * Every figure here is measured and appears in docs/FINDINGS.md. Nothing on this
 * page states a capability the model does not have — no efficacy language, no
 * "predicts your symptoms", and the negative result is given the same weight as
 * the rest rather than being buried in a footnote.
 */

const SCIENCE = [
  {
    n: "01",
    title: "What the sensors see",
    Icon: IconSensor,
    body:
      "Two wrist accelerometers at 100 Hz, split into a movement band (0.1–3 Hz) and a tremor band (4–8 Hz). Tremor is a mechanical oscillation an accelerometer measures directly — not something inferred from steps or heart rate.",
    stat: null as null | { value: string; unit: string; label: string },
  },
  {
    n: "02",
    title: "What it predicts",
    Icon: IconFrequency,
    body:
      "For every hour, the probability that tremor was present. Measured on 55 participants it never trained on.",
    stat: { value: "0.697", unit: "± 0.075 AUC", label: "held-out, across people" },
  },
  {
    n: "03",
    title: "How it knows when it might be wrong",
    Icon: IconInterval,
    body:
      "The 90% interval is not asserted, it is earned. Its width is fitted on participants held out of both training and calibration, widened until the truth genuinely falls inside it nine times in ten.",
    stat: { value: "0.903", unit: "achieved coverage", label: "against a 0.90 target" },
  },
  {
    n: "04",
    title: "Why it refuses",
    Icon: IconRefusal,
    body:
      "Answering only the most confident quarter of hours raises accuracy from 0.713 to 0.825. The hours it declines really are the hours it would have got wrong — so a refusal is information, not a gap.",
    stat: { value: "0.713 → 0.825", unit: "accuracy", label: "as it answers fewer hours" },
  },
  {
    n: "05",
    title: "What happens when evidence degrades",
    Icon: IconDegraded,
    body:
      "Both sensor configurations are held to the same error budget. Take one wrist away and the only way to stay inside that budget is to answer less — so it does, without being told to.",
    stat: { value: "12.4% → 77.3%", unit: "hours declined", label: "when a wrist is removed" },
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--page)" }}>
      <Nav />

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-10 md:px-6 md:py-16">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section className="max-w-[62ch]">
          <p
            className="font-mono text-[14px] uppercase tracking-[0.14em]"
            style={{ color: "var(--brass)" }}
          >
            Parkinson&apos;s motor diary
          </p>
          <h1
            className="font-display mt-3 text-[34px] font-light leading-[1.12] md:text-[52px]"
            style={{ color: "var(--ink)" }}
          >
            Read the hours you couldn&apos;t record
          </h1>
          <p
            className="mt-5 text-[17px] leading-relaxed md:text-[19px]"
            style={{ color: "var(--ink-2)" }}
          >
            The paper diary gets abandoned within days, and nobody remembers last
            Tuesday afternoon accurately. Astrolabe reconstructs those hours from
            a pair of wrist sensors — and tells you, hour by hour, when it does
            not know.
          </p>
        </section>

        <div className="mt-10 md:mt-12">
          <HeroStrip />
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
            href="/profile"
            className="rounded-md border px-6 py-3 text-[17px] transition-opacity hover:opacity-90"
            style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
          >
            Profile &amp; devices
          </Link>
        </div>

        {/* ── the problem ──────────────────────────────────────────────── */}
        <section className="mt-20 max-w-[62ch] md:mt-28">
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
            Parkinson&apos;s symptoms fluctuate hour to hour. The clinic visit that
            decides medication is a snapshot of one of those hours. The diary
            meant to fill the gap is a chore, so it stops getting filled.
          </p>
          <blockquote
            className="mt-6 border-l-2 pl-5 text-[17px] italic leading-relaxed"
            style={{ borderColor: "var(--brass)", color: "var(--ink)" }}
          >
            “My meds felt off all week. My neurologist asked when it was worse and
            I honestly couldn&apos;t tell her. I&apos;d stopped filling in the
            diary by Wednesday.”
          </blockquote>
        </section>

        {/* ── how it works ─────────────────────────────────────────────── */}
        <section className="mt-20 md:mt-28">
          <h2
            className="font-display text-[26px] font-light md:text-[32px]"
            style={{ color: "var(--ink)" }}
          >
            How it works
          </h2>
          <p
            className="mt-3 max-w-[62ch] text-[17px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            Every number below is measured on people the model never trained on.
            None of them is a simulation or a target.
          </p>

          <ol className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-2">
            {SCIENCE.map((s) => (
              <li key={s.n} className="flex min-w-0 gap-4 sm:gap-5">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-md border"
                    style={{ borderColor: "var(--axis)", color: "var(--brass)" }}
                    aria-hidden
                  >
                    <s.Icon />
                  </span>
                  <span
                    className="font-mono text-[14px] leading-none"
                    style={{ color: "var(--brass)" }}
                  >
                    {s.n}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[19px] font-medium" style={{ color: "var(--ink)" }}>
                    {s.title}
                  </h3>
                  <p
                    className="mt-2 text-[16px] leading-relaxed"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {s.body}
                  </p>
                  {s.stat && (
                    <p className="mt-3">
                      <span
                        className="font-mono text-[22px] tabular-nums"
                        style={{ color: "var(--brass-hi)" }}
                      >
                        {s.stat.value}
                      </span>{" "}
                      <span className="text-[16px]" style={{ color: "var(--ink-2)" }}>
                        {s.stat.unit} · {s.stat.label}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── the negative result, at full weight ──────────────────────── */}
        <section
          className="mt-20 rounded-lg border p-6 md:mt-28 md:p-10"
          style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-md border"
              style={{ borderColor: "var(--axis)", color: "var(--brass)" }}
              aria-hidden
            >
              <IconNotClaimed />
            </span>
            <p
              className="font-mono text-[14px] uppercase tracking-[0.12em]"
              style={{ color: "var(--brass)" }}
            >
              06 · What it will not claim
            </p>
          </div>
          <h2
            className="font-display mt-3 max-w-[52ch] text-[24px] font-light leading-snug md:text-[30px]"
            style={{ color: "var(--ink)" }}
          >
            The seven-point motor scale does not generalise across people, so we
            do not predict it.
          </h2>
          <p
            className="mt-4 max-w-[62ch] text-[16px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            How well someone feels they moved in the last hour is a judgement, and
            the accelerometer has no access to it. Nine feature sets over five
            participant-level folds; none beat a constant. Held-out ordinal MAE{" "}
            <span className="font-mono" style={{ color: "var(--ink)" }}>0.684</span>{" "}
            against a{" "}
            <span className="font-mono" style={{ color: "var(--ink)" }}>0.594</span>{" "}
            always-predict-Good baseline. So that row is shown as reported by the
            patient, or abstained — never as inferred.
          </p>
          <p
            className="mt-4 max-w-[62ch] text-[16px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            On the demo day the model declines every one of the 114 steps. That is
            the product working, not failing.
          </p>
        </section>

        {/* ── supplement ───────────────────────────────────────────────── */}
        <section className="mt-20 max-w-[62ch] md:mt-28">
          <h2 className="text-[19px] font-medium" style={{ color: "var(--ink)" }}>
            Technical supplement
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The dataset, the full experimental record, the negative results and the
            two bugs that made the pipeline flatter itself are all written up in
            the repository — including what we would need to establish anything
            causal, which this does not.
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
            symptom diaries. 46 of them have deep brain stimulation, so this is an
            advanced, device-treated cohort rather than a newly diagnosed one.
          </p>
        </section>
      </main>

      <footer
        className="mx-auto w-full max-w-[1280px] px-5 py-8 text-[15px] md:px-6"
        style={{ color: "var(--ink-2)" }}
      >
        Not a medical device. No diagnostic, dosing or treatment claim is made ·
        COPS data CC-BY 4.0
      </footer>
    </div>
  );
}
