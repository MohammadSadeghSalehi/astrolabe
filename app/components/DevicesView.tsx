"use client";

import Link from "next/link";
import { DeviceIllustration } from "@/components/icons/DeviceIllustration";

/**
 * Compatible devices.
 *
 * Every capability claim on this page is sourced, and where a specification is
 * not public it says "not documented" rather than a plausible number. Getting
 * this wrong would be worse than leaving the page out: a compatibility table is
 * read as a promise, and someone with Parkinson's might buy hardware on it.
 *
 * Nothing here is integrated. The page describes what each device could supply,
 * not what Astrolabe currently reads.
 */

type Verdict = "best" | "partial" | "no";

const VERDICT_LABEL: Record<Verdict, string> = {
  best: "Most favourable",
  partial: "Partially usable",
  no: "Not usable for this method",
};

const DEVICES: {
  name: string;
  kind: string;
  verdict: Verdict;
  rawAccel: string;
  pdSpecific: string;
  note: string;
}[] = [
  {
    name: "Apple Watch",
    kind: "Wrist · watchOS",
    verdict: "best",
    rawAccel: "Yes, via Core Motion",
    pdSpecific:
      "Movement Disorder API (CMMovementDisorderManager) — purpose-built for Parkinson's, reports resting tremor and dyskinesia continuously",
    note:
      "Apple's own algorithm isolates the 4–6 Hz band, which is the same signature Astrolabe's tremor band targets. Several apps built on it hold FDA 510(k) clearance, so the pathway is established rather than hypothetical. The obvious integration is to take that output as an additional evidence stream, not to reimplement it.",
  },
  {
    name: "Galaxy Watch (Wear OS)",
    kind: "Wrist · Wear OS",
    verdict: "partial",
    rawAccel: "Yes — 25 Hz, fixed",
    pdSpecific: "None",
    note:
      "The Samsung Health Sensor SDK exposes a continuous raw accelerometer, but the rate is fixed at 25 Hz and cannot be changed. That is above the 16 Hz a 4–8 Hz band strictly requires, so tremor is recoverable in principle — with far less headroom than the 100 Hz this model was trained on, and we have not measured what that costs. Galaxy Watch4 and later.",
  },
  {
    name: "Oura Ring",
    kind: "Finger · ring",
    verdict: "no",
    rawAccel: "Not exposed",
    pdSpecific: "None",
    note:
      "The Oura API v2 is generous with derived metrics — sleep stages, readiness, heart rate and interbeat intervals — but raw accelerometer streams are not among them. Without raw acceleration there is no 4–8 Hz band to compute, so this method cannot run on it at any sampling rate. A ring also sits on one finger, which is not the bilateral wrist geometry the model was built around.",
  },
  {
    name: "Research-grade actigraphy",
    kind: "Both wrists · e.g. GENEActiv, Axivity",
    verdict: "best",
    rawAccel: "Yes — 100 Hz, both wrists",
    pdSpecific: "n/a",
    note:
      "What every number in this product was actually measured on. Continuous raw acceleration on both wrists at 100 Hz. Not a consumer purchase, and typically worn for a study rather than for life.",
  },
];

function Badge({ verdict }: { verdict: Verdict }) {
  const style =
    verdict === "best"
      ? { color: "var(--s2-truth)", borderColor: "var(--s2-truth)" }
      : verdict === "partial"
        ? { color: "var(--brass)", borderColor: "var(--brass)" }
        : { color: "var(--ink-2)", borderColor: "var(--axis)" };
  return (
    <span
      className="inline-block shrink-0 rounded border px-2 py-1 font-mono text-[14px]"
      style={style}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function DevicesView() {
  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-10 md:px-6 md:py-14">
      <header className="max-w-[68ch]">
        <p
          className="font-mono text-[14px] uppercase tracking-[0.14em]"
          style={{ color: "var(--brass)" }}
        >
          Compatible devices
        </p>
        <h1
          className="font-display mt-3 text-[30px] font-light leading-tight md:text-[40px]"
          style={{ color: "var(--ink)" }}
        >
          What hardware could actually feed this
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          None of these are integrated yet. This is what each device class can
          supply, checked against vendor documentation — because a compatibility
          table gets read as a promise, and someone might buy hardware on it.
        </p>
      </header>

      {/* ── the requirement ────────────────────────────────────────────── */}
      <section
        className="mt-10 rounded-lg border p-5 md:p-6"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
      >
        <h2
          className="text-[14px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--brass)" }}
        >
          What Astrolabe needs
        </h2>
        <ol className="mt-4 grid gap-5 md:grid-cols-3">
          {[
            {
              n: "1",
              t: "Raw acceleration",
              d: "Not step counts, not activity minutes. Tremor lives in the waveform, and a derived daily summary has already thrown it away.",
            },
            {
              n: "2",
              t: "Enough sampling rate",
              d: "The tremor band is 4–8 Hz, so 16 Hz is the theoretical floor and more is safer. This model was trained at 100 Hz.",
            },
            {
              n: "3",
              t: "Both wrists",
              d: "Asymmetry between sides is part of the evidence, and losing one is a measurable loss — see below.",
            },
          ].map((r) => (
            <li key={r.n} className="min-w-0">
              <p className="font-mono text-[14px]" style={{ color: "var(--brass)" }}>
                {r.n}
              </p>
              <h3 className="mt-1 text-[17px] font-medium" style={{ color: "var(--ink)" }}>
                {r.t}
              </h3>
              <p className="mt-1 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {r.d}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── devices ────────────────────────────────────────────────────── */}
      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        {DEVICES.map((d) => (
          <article
            key={d.name}
            className="min-w-0 rounded-lg border p-5 md:p-6"
            style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span style={{ color: "var(--ink-2)" }} aria-hidden>
                  <DeviceIllustration size={36} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[19px] font-medium" style={{ color: "var(--ink)" }}>
                    {d.name}
                  </h2>
                  <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                    {d.kind}
                  </p>
                </div>
              </div>
              <Badge verdict={d.verdict} />
            </div>

            <dl className="mt-4 divide-y" style={{ borderColor: "var(--axis)" }}>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-3">
                <dt className="text-[16px]" style={{ color: "var(--ink-2)" }}>
                  Raw accelerometer
                </dt>
                <dd className="text-right text-[16px]" style={{ color: "var(--ink)" }}>
                  {d.rawAccel}
                </dd>
              </div>
              <div className="py-3">
                <dt className="text-[16px]" style={{ color: "var(--ink-2)" }}>
                  Parkinson&apos;s-specific API
                </dt>
                <dd className="mt-1 text-[16px] leading-relaxed" style={{ color: "var(--ink)" }}>
                  {d.pdSpecific}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {d.note}
            </p>
          </article>
        ))}
      </section>

      {/* ── the honest catch ───────────────────────────────────────────── */}
      <section
        className="mt-10 rounded-lg border p-6 md:p-10"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
      >
        <h2
          className="font-display max-w-[54ch] text-[24px] font-light leading-snug md:text-[30px]"
          style={{ color: "var(--ink)" }}
        >
          One watch is, by our own measurement, the degraded configuration.
        </h2>
        <p
          className="mt-4 max-w-[68ch] text-[16px] leading-relaxed"
          style={{ color: "var(--ink-2)" }}
        >
          Nobody wears two watches. But every figure in this product was measured
          on both wrists, and when we take one away and hold the model to the
          same error budget, it can only stay inside it by answering far less —
          abstention rises from{" "}
          <span className="font-mono" style={{ color: "var(--ink)" }}>12.4%</span>{" "}
          to{" "}
          <span className="font-mono" style={{ color: "var(--ink)" }}>77.3%</span>{" "}
          of hours.
        </p>
        <p
          className="mt-4 max-w-[68ch] text-[16px] leading-relaxed"
          style={{ color: "var(--ink-2)" }}
        >
          So a single consumer wearable does not make this product worse in a
          vague way — it moves it onto a curve we have already measured, and the
          honest version of it would spend most of the day declining to answer.
          Either that is acceptable and the refusals carry the value, or the
          second sensor has to come from somewhere. We would rather state that
          before anyone buys a watch than after.
        </p>
      </section>

      {/* ── sources ────────────────────────────────────────────────────── */}
      <section className="mt-10 max-w-[68ch]">
        <h2 className="text-[17px] font-medium" style={{ color: "var(--ink)" }}>
          Sources
        </h2>
        <ul className="mt-3 space-y-2 text-[16px]" style={{ color: "var(--ink-2)" }}>
          <li>
            <a
              className="underline underline-offset-4"
              style={{ color: "var(--brass)" }}
              href="https://developer.samsung.com/health/sensor/guide/data-specifications.html"
              target="_blank"
              rel="noreferrer"
            >
              Samsung Health Sensor SDK — data specifications
            </a>{" "}
            (25 Hz continuous accelerometer, fixed)
          </li>
          <li>
            <a
              className="underline underline-offset-4"
              style={{ color: "var(--brass)" }}
              href="https://cloud.ouraring.com/docs"
              target="_blank"
              rel="noreferrer"
            >
              Oura API v2 documentation
            </a>{" "}
            (derived metrics and heart-rate series; no raw accelerometer)
          </li>
          <li>
            <a
              className="underline underline-offset-4"
              style={{ color: "var(--brass)" }}
              href="https://www.medtechdive.com/news/apple-watch-APPL-h2o-parkinsons-monitoring-FDA/637014/"
              target="_blank"
              rel="noreferrer"
            >
              FDA clearance for an Apple Watch Parkinson&apos;s monitor
            </a>{" "}
            (Movement Disorder API in production use)
          </li>
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/day"
          className="rounded-md px-6 py-3 text-[17px] font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--brass)", color: "var(--page)" }}
        >
          See the day →
        </Link>
        <Link
          href="/profile"
          className="rounded-md border px-6 py-3 text-[17px]"
          style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
        >
          Profile
        </Link>
      </div>
    </main>
  );
}
