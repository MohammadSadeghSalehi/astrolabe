"use client";

import Link from "next/link";
import { IconSensor } from "@/components/icons/ScienceIcons";
import { IconBilateral, IconRing } from "@/components/icons/DeviceIcons";

/**
 * Compatible devices.
 *
 * Every capability claim here is sourced, and where a specification is not
 * public it says "not documented" rather than a plausible number — a
 * compatibility page is read as a promise, and someone might buy hardware on
 * it. Nothing is integrated; this is what each device class could supply.
 *
 * Compact by design: the three requirement dimensions are spec chips a reader
 * scans in one pass, and the longer reasoning sits behind a disclosure rather
 * than four repeated paragraphs. The one thing that gets its own chart is the
 * sampling-rate comparison, because a bar next to a measured 16 Hz floor says
 * more in one glance than the same three numbers in prose.
 */

type Fit = "full" | "partial" | "none" | "unknown";

const FIT_LABEL: Record<Fit, string> = {
  full: "Yes",
  partial: "Partial",
  none: "No",
  unknown: "Not documented",
};

const FIT_STYLE: Record<Fit, React.CSSProperties> = {
  full: { color: "var(--s2-truth)", borderColor: "var(--s2-truth)" },
  partial: { color: "var(--brass)", borderColor: "var(--brass)" },
  none: { color: "var(--ink-2)", borderColor: "var(--axis)" },
  unknown: { color: "var(--ink-2)", borderColor: "var(--axis)" },
};

type Verdict = "best" | "partial" | "no";
const VERDICT_LABEL: Record<Verdict, string> = {
  best: "Most favourable",
  partial: "Partially usable",
  no: "Not usable for this method",
};
const VERDICT_STYLE: Record<Verdict, React.CSSProperties> = {
  best: { color: "var(--s2-truth)", borderColor: "var(--s2-truth)" },
  partial: { color: "var(--brass)", borderColor: "var(--brass)" },
  no: { color: "var(--ink-2)", borderColor: "var(--axis)" },
};

type Device = {
  name: string;
  kind: string;
  Icon: (p: { className?: string }) => React.JSX.Element;
  verdict: Verdict;
  rawAccel: Fit;
  sampleRate: Fit;
  bilateral: Fit;
  hz: number | null; // for the shared gauge; null = not documented / n/a
  why: string;
};

const DEVICES: Device[] = [
  {
    name: "Apple Watch",
    kind: "Wrist · watchOS",
    Icon: IconSensor,
    verdict: "best",
    rawAccel: "full",
    sampleRate: "unknown",
    bilateral: "none",
    hz: null,
    why: "Core Motion exposes raw acceleration, and watchOS ships a Movement Disorder API (CMMovementDisorderManager) built specifically for Parkinson's — it isolates the 4–6 Hz resting-tremor band, close to the 4–8 Hz band this model targets, and reports tremor and dyskinesia continuously. Several apps built on it hold FDA 510(k) clearance, so the pathway is established rather than hypothetical. The obvious integration is to take that output as an additional evidence stream, not to reimplement it. Apple has not published the accelerometer's continuous sampling rate, so it is marked not documented rather than assumed adequate.",
  },
  {
    name: "Galaxy Watch",
    kind: "Wrist · Wear OS 4+",
    Icon: IconSensor,
    verdict: "partial",
    rawAccel: "full",
    sampleRate: "partial",
    bilateral: "none",
    hz: 25,
    why: "The Samsung Health Sensor SDK exposes a continuous raw accelerometer, but the rate is fixed at 25 Hz and cannot be changed. That clears the 16 Hz floor a 4–8 Hz band strictly needs, so tremor is recoverable in principle — with far less headroom than the 100 Hz this model was trained on, and we have not measured what that costs.",
  },
  {
    name: "Oura Ring",
    kind: "Finger · ring",
    Icon: IconRing,
    verdict: "no",
    rawAccel: "none",
    sampleRate: "none",
    bilateral: "none",
    hz: null,
    why: "The Oura API v2 is generous with derived metrics — sleep stages, readiness, heart rate and interbeat intervals — but raw accelerometer streams are not among them. Without raw acceleration there is no 4–8 Hz band to compute, so this method cannot run on it at any sampling rate. A ring also sits on one finger, not the bilateral wrist geometry the model was built around.",
  },
  {
    name: "Research actigraphy",
    kind: "Both wrists · GENEActiv, Axivity",
    Icon: IconBilateral,
    verdict: "best",
    rawAccel: "full",
    sampleRate: "full",
    bilateral: "full",
    hz: 100,
    why: "What every number in this product was actually measured on: continuous raw acceleration on both wrists at 100 Hz. Not a consumer purchase, and typically worn for a study rather than for daily life.",
  },
];

const SOURCES = [
  {
    label: "Samsung Health Sensor SDK — data specifications",
    href: "https://developer.samsung.com/health/sensor/guide/data-specifications.html",
    note: "25 Hz continuous accelerometer, fixed",
  },
  {
    label: "Oura API v2 documentation",
    href: "https://cloud.ouraring.com/docs",
    note: "derived metrics and heart-rate series; no raw accelerometer",
  },
  {
    label: "FDA clearance for an Apple Watch Parkinson's monitor",
    href: "https://www.medtechdive.com/news/apple-watch-APPL-h2o-parkinsons-monitoring-FDA/637014/",
    note: "Movement Disorder API in production use",
  },
];

function Chip({ fit, label }: { fit: Fit; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[14px] leading-none"
      style={FIT_STYLE[fit]}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background: fit === "full" || fit === "partial" ? "currentColor" : "transparent",
          border: fit === "none" || fit === "unknown" ? "1.5px solid currentColor" : "none",
        }}
      />
      {label}
      <span className="opacity-75">· {FIT_LABEL[fit]}</span>
    </span>
  );
}

/** The one shared, honest chart on this page: rate vs the 16 Hz floor. */
function SampleRateGauge() {
  const W = 640;
  const H = 92;
  const padL = 8;
  const padR = 8;
  const trackW = W - padL - padR;
  const maxHz = 110;
  const x = (hz: number) => padL + (hz / maxHz) * trackW;
  const floor = 16;

  const marks = DEVICES.filter((d) => d.hz != null) as (Device & { hz: number })[];

  return (
    <div className="min-w-0 overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ minWidth: 420 }}
        role="img"
        aria-label="Accelerometer sampling rate by device, against the 16 Hz theoretical floor for a 4 to 8 Hz tremor band"
      >
        {/* track */}
        <line
          x1={padL}
          y1={54}
          x2={W - padR}
          y2={54}
          stroke="var(--axis)"
          strokeWidth={2}
        />
        {/* floor marker */}
        <line
          x1={x(floor)}
          y1={40}
          x2={x(floor)}
          y2={68}
          stroke="var(--ink-2)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        <text
          x={x(floor)}
          y={30}
          textAnchor="middle"
          className="font-mono"
          fontSize={14}
          fill="var(--ink-2)"
        >
          16 Hz floor
        </text>

        {/* device markers */}
        {marks.map((d) => (
          <g key={d.name}>
            <circle
              cx={x(d.hz)}
              cy={54}
              r={6}
              fill={d.hz >= 100 ? "var(--s2-truth)" : "var(--brass)"}
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text
              x={x(d.hz)}
              y={82}
              textAnchor="middle"
              className="font-mono"
              fontSize={14}
              fill="var(--ink)"
            >
              {d.hz} Hz
            </text>
            <text
              x={x(d.hz)}
              y={H - 2}
              textAnchor="middle"
              fontSize={14}
              fill="var(--ink-2)"
            >
              {d.name === "Research actigraphy" ? "research" : d.name.split(" ")[0]}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        Apple has not published its continuous sampling rate, and Oura exposes
        no raw accelerometer at all — both are omitted from the scale rather
        than placed on it without a source.
      </p>
    </div>
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
          supply, checked against vendor documentation — because a
          compatibility page is read as a promise.
        </p>
      </header>

      {/* ── the requirement, compact ───────────────────────────────────── */}
      <section
        className="mt-8 rounded-lg border p-5 md:p-6"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
      >
        <h2
          className="text-[14px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--brass)" }}
        >
          Three requirements
        </h2>
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
          {[
            { t: "Raw acceleration", d: "Not step counts. Tremor lives in the waveform." },
            { t: "≥16 Hz sampling", d: "The floor for a 4–8 Hz band. Trained at 100 Hz." },
            { t: "Both wrists", d: "Asymmetry is evidence — losing one is a measured cost." },
          ].map((r) => (
            <div key={r.t} className="min-w-0">
              <h3 className="text-[16px] font-medium" style={{ color: "var(--ink)" }}>
                {r.t}
              </h3>
              <p className="mt-1 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {r.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── devices, compact grid ──────────────────────────────────────── */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEVICES.map((d) => (
          <article
            key={d.name}
            className="flex min-w-0 flex-col rounded-lg border p-4 transition-colors md:p-5"
            style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                style={{ borderColor: "var(--axis)", color: "var(--ink-2)" }}
                aria-hidden
              >
                <d.Icon />
              </span>
              <span
                className="rounded border px-2 py-0.5 text-right font-mono text-[14px] leading-tight"
                style={VERDICT_STYLE[d.verdict]}
              >
                {VERDICT_LABEL[d.verdict]}
              </span>
            </div>

            <h2 className="mt-3 text-[18px] font-medium" style={{ color: "var(--ink)" }}>
              {d.name}
            </h2>
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              {d.kind}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip fit={d.rawAccel} label="Raw accel" />
              <Chip fit={d.sampleRate} label="Sample rate" />
              <Chip fit={d.bilateral} label="Bilateral" />
            </div>

            <details className="mt-3 [&_summary::-webkit-details-marker]:hidden">
              <summary
                className="cursor-pointer text-[14px] font-medium underline decoration-dotted underline-offset-4"
                style={{ color: "var(--brass)" }}
              >
                Why
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {d.why}
              </p>
            </details>
          </article>
        ))}
      </section>

      {/* ── the shared, sourced chart ──────────────────────────────────── */}
      <section
        className="mt-6 rounded-lg border p-5 md:p-6"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
      >
        <h2
          className="text-[14px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--brass)" }}
        >
          Sampling rate, against the floor
        </h2>
        <div className="mt-4">
          <SampleRateGauge />
        </div>
      </section>

      {/* ── the honest catch ───────────────────────────────────────────── */}
      <section
        className="mt-6 rounded-lg border-l-[3px] border-y border-r p-6 md:p-10"
        style={{ borderColor: "var(--axis)", borderLeftColor: "var(--k4)", background: "var(--surface)" }}
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
          Nobody wears two watches. But every figure in this product was
          measured on both wrists, and when we take one away and hold the
          model to the same error budget, it can only stay inside it by
          answering far less — abstention rises from{" "}
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
          vague way — it moves it onto a curve we have already measured, and
          the honest version of it would spend most of the day declining to
          answer. Either that is acceptable and the refusals carry the value,
          or the second sensor has to come from somewhere. Better said before
          anyone buys a watch than after.
        </p>
      </section>

      {/* ── sources ────────────────────────────────────────────────────── */}
      <section className="mt-8 max-w-[68ch]">
        <h2 className="text-[16px] font-medium" style={{ color: "var(--ink)" }}>
          Sources
        </h2>
        <ul className="mt-3 space-y-1.5 text-[15px]" style={{ color: "var(--ink-2)" }}>
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a
                className="underline underline-offset-4"
                style={{ color: "var(--brass)" }}
                href={s.href}
                target="_blank"
                rel="noreferrer"
              >
                {s.label}
              </a>{" "}
              ({s.note})
            </li>
          ))}
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
