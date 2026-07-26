"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBundle } from "@/lib/source";
import type { Bundle } from "@/lib/contract";
import { KINESIA_LABELS } from "@/lib/contract";
import {
  buildPatternSummary,
  buildVisitQuestions,
  deriveClinicianStats,
} from "@/lib/clinician-prose";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const PARTICIPANT = "COPS-29";

type AbstainGroup = {
  kind: string;
  count: number;
  first: string;
  last: string;
  detail: string | null;
};

/**
 * Collapse per-window reasons into their kind.
 *
 * The bundle's reasons carry a per-window number — "no state preferred (peak
 * probability 0.37)" — so a naive group-by never merges anything. Strip the
 * parenthetical to get the kind, then report the range of those numbers once,
 * which is the part that actually informs.
 */
function groupAbstentions(rows: { t: string; reason: string }[]): AbstainGroup[] {
  const by = new Map<string, { rows: typeof rows; nums: number[] }>();
  for (const r of rows) {
    const kind = r.reason.replace(/\s*\([^)]*\)\s*$/, "").trim() || "unspecified";
    const m = r.reason.match(/([0-9]*\.?[0-9]+)\s*\)?\s*$/);
    const g = by.get(kind) ?? { rows: [], nums: [] };
    g.rows.push(r);
    if (m) g.nums.push(Number(m[1]));
    by.set(kind, g);
  }
  return [...by.entries()]
    .map(([kind, g]) => {
      const times = g.rows.map((r) => r.t).sort();
      const lo = g.nums.length ? Math.min(...g.nums) : null;
      const hi = g.nums.length ? Math.max(...g.nums) : null;
      return {
        kind: kind.charAt(0).toUpperCase() + kind.slice(1),
        count: g.rows.length,
        first: times[0] ?? "",
        last: times[times.length - 1] ?? "",
        detail:
          lo != null && hi != null
            ? `peak probability ${lo.toFixed(2)}–${hi.toFixed(2)}`
            : null,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function ClinicianView() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { bundle: b } = await getBundle(PARTICIPANT);
        if (!cancelled) {
          setBundle(b);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load bundle");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(
    () => (bundle ? deriveClinicianStats(bundle) : null),
    [bundle],
  );

  const questions = useMemo(
    () =>
      bundle && derived
        ? buildVisitQuestions(bundle.metrics, derived)
        : [],
    [bundle, derived],
  );

  const pattern = useMemo(
    () =>
      bundle && derived
        ? buildPatternSummary(bundle.metrics, derived)
        : "",
    [bundle, derived],
  );

  if (loading) {
    return (
      <div className="clinician-sheet-inner">
        <div className="mx-auto max-w-[880px] px-6 py-10">
          <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
            Loading clinician handoff…
          </p>
        </div>
      </div>
    );
  }

  if (error || !bundle || !derived) {
    return (
      <div className="clinician-sheet-inner">
        <div className="mx-auto max-w-[880px] px-6 py-10">
          <p className="text-[15px]" style={{ color: "var(--ink)" }}>
            {error ?? "No bundle"}
          </p>
          <Link
            href="/day"
            className="mt-4 inline-block text-[14px] underline"
            style={{ color: "var(--brass)" }}
          >
            Back to day view
          </Link>
        </div>
      </div>
    );
  }

  const m = bundle.metrics;
  const dayLabel = bundle.day != null ? `Day ${bundle.day}` : "One day";
  const abstainPct =
    m.abstain_rate != null
      ? `${(m.abstain_rate * 100).toFixed(1)}%`
      : "—";

  return (
    <div className="clinician-sheet-inner">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-5 py-8 md:px-8 md:py-10">
        {/* Header */}
        <header className="print-break flex flex-wrap items-start justify-between gap-4">
          <div>
            <p
              className="text-[14px] uppercase tracking-[0.14em]"
              style={{ color: "var(--brass)" }}
            >
              Astrolabe · Clinician handoff
            </p>
            <h1
              className="font-display mt-1 text-[28px] font-light leading-tight md:text-[32px]"
              style={{ color: "var(--ink)" }}
            >
              <span className="font-mono">{bundle.participant}</span>
              {" · "}
              {dayLabel}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
              Motor diary reconstruction from wrist accelerometry with calibrated
              uncertainty. Not a medical device — temporal alignment only; no
              causal claim about medication effect.
            </p>
            <p
              className="mt-2 max-w-xl text-[15px] leading-snug"
              style={{ color: "var(--ink-2)" }}
            >
              Set light and print-first on purpose: this is the sheet that gets
              handed across a desk under clinic lighting, not the screen the
              patient explores.
            </p>
          </div>
          <div className="no-print flex flex-col items-end gap-2 text-[15px]">
            <Link
              href="/day"
              className="rounded border px-3 py-1.5 font-medium"
              style={{
                borderColor: "var(--border)",
                color: "var(--ink)",
                background: "var(--surface)",
              }}
            >
              ← Day view
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border px-3 py-1.5"
              style={{
                borderColor: "var(--border)",
                color: "var(--ink-2)",
                background: "transparent",
              }}
            >
              Print
            </button>
          </div>
        </header>

        <Separator />

        {/* Pattern summary */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Day pattern summary</CardTitle>
            <CardDescription>
              Ordinal MAE is always shown next to baseline MAE (always-predict
              Good kinesia). A number alone is not a claim.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Ordinal MAE"
                value={m.ordinal_mae != null ? m.ordinal_mae.toFixed(2) : "—"}
                hint={m.ordinal_mae == null ? "nothing answered" : undefined}
                emphasize
              />
              <Stat
                label="Baseline MAE"
                value={m.baseline_mae.toFixed(3)}
                hint="always-good"
              />
              <Stat label="Abstain rate" value={abstainPct} />
              <Stat
                label="Mean CI width"
                value={
                  m.mean_interval_width != null
                    ? m.mean_interval_width.toFixed(2)
                    : "—"
                }
              />
              {m.n_hours != null && (
                <Stat label="N hours (metric)" value={String(m.n_hours)} />
              )}
              {m.coverage_90 != null && (
                <Stat
                  label="Coverage 90"
                  value={m.coverage_90.toFixed(3)}
                />
              )}
              {m.macro_f1 != null && (
                <Stat label="Macro-F1" value={m.macro_f1.toFixed(2)} />
              )}
              {m.brier != null && (
                <Stat label="Brier" value={m.brier.toFixed(2)} />
              )}
            </div>
            <p
              className="text-[15px] leading-relaxed"
              style={{ color: "var(--ink)" }}
            >
              {pattern}
            </p>
          </CardContent>
        </Card>

        {/* Uncertain windows */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Where the model was uncertain</CardTitle>
            <CardDescription>
              Abstained windows — drawn as holes on the day view, listed here with
              reasons from the bundle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {derived.abstained.length === 0 ? (
              <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                No abstained windows in this bundle.
              </p>
            ) : (
              /* Grouped by reason, not listed one per window. On a day the
                 model declines entirely that list is 114 near-identical rows,
                 which buries the finding it is supposed to deliver: that the
                 refusals share one cause. A clinician needs the cause, the
                 count and the span — the per-window detail is on the day view,
                 where hovering a hole shows its own reason. */
              <>
                <ul className="flex flex-col gap-4">
                  {groupAbstentions(derived.abstained).map((g) => (
                    <li
                      key={g.kind}
                      className="border-b pb-4 last:border-0 last:pb-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-[16px]" style={{ color: "var(--ink)" }}>
                          {g.kind}
                        </span>
                        <span
                          className="font-mono text-[15px] tabular-nums"
                          style={{ color: "var(--ink-2)" }}
                        >
                          {g.count} window{g.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-1 text-[15px]" style={{ color: "var(--ink-2)" }}>
                        {g.first === g.last ? g.first : `${g.first} – ${g.last}`}
                        {g.detail && <> · {g.detail}</>}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[15px]" style={{ color: "var(--ink-2)" }}>
                  Per-window reasons are on the day view — hovering any hole
                  shows the one recorded for that step.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Thin evidence */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Missing / thin evidence</CardTitle>
            <CardDescription>
              Counts and widths from bundle metrics — not computed in prose.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt
                  className="text-[14px] uppercase tracking-wide"
                  style={{ color: "var(--ink-2)" }}
                >
                  Abstain rate
                </dt>
                <dd
                  className="font-mono text-[22px] tabular-nums"
                  style={{ color: "var(--ink)" }}
                >
                  {abstainPct}
                </dd>
              </div>
              <div>
                <dt
                  className="text-[14px] uppercase tracking-wide"
                  style={{ color: "var(--ink-2)" }}
                >
                  Mean interval width
                </dt>
                <dd
                  className="font-mono text-[22px] tabular-nums"
                  style={{ color: "var(--ink)" }}
                >
                  {m.mean_interval_width != null
                    ? m.mean_interval_width.toFixed(2)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt
                  className="text-[14px] uppercase tracking-wide"
                  style={{ color: "var(--ink-2)" }}
                >
                  Abstained windows
                </dt>
                <dd
                  className="font-mono text-[22px] tabular-nums"
                  style={{ color: "var(--ink)" }}
                >
                  {derived.abstained.length}
                  <span
                    className="ml-1 text-[14px] font-normal"
                    style={{ color: "var(--ink-2)" }}
                  >
                    / {derived.nSeries}
                  </span>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Visit questions */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Three questions for the visit</CardTitle>
            <CardDescription>
              Template filled only with numbers from this bundle&apos;s metrics
              and series. No invented clinical claims.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-4 pl-5">
              {questions.map((q, i) => (
                <li
                  key={i}
                  className="text-[15px] leading-relaxed pl-1"
                  style={{ color: "var(--ink)" }}
                >
                  {q}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Medication events */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>Medication events</CardTitle>
            <CardDescription>
              From bundle.events — reported times only; no efficacy inference.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bundle.events.length === 0 ? (
              <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                No events in this bundle.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
                  <thead>
                    <tr
                      className="border-b text-[14px] uppercase tracking-wide"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--ink-2)",
                      }}
                    >
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 font-medium">Drug</th>
                      <th className="py-2 pr-3 font-medium">Dose (mg)</th>
                      <th className="py-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.events.map((ev, i) => (
                      <tr
                        key={`${ev.t}-${ev.drug ?? ev.type}-${i}`}
                        className="border-b last:border-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td
                          className="py-2.5 pr-3 font-mono tabular-nums"
                          style={{ color: "var(--ink)" }}
                        >
                          {ev.t}
                        </td>
                        <td className="py-2.5 pr-3" style={{ color: "var(--ink-2)" }}>
                          {ev.type}
                        </td>
                        <td className="py-2.5 pr-3" style={{ color: "var(--ink)" }}>
                          {ev.drug ?? "—"}
                        </td>
                        <td
                          className="py-2.5 pr-3 font-mono tabular-nums"
                          style={{ color: "var(--ink)" }}
                        >
                          {ev.dose_mg != null ? ev.dose_mg : "—"}
                        </td>
                        <td className="py-2.5" style={{ color: "var(--ink-2)" }}>
                          {ev.source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Extreme MAP reference (counts only) */}
        <Card className="print-break">
          <CardHeader>
            <CardTitle>MAP at extremes (reference)</CardTitle>
            <CardDescription>
              Windows with MAP index ≤1 or ≥5 — labels from the contract scale.
              Index 3 is Good kinesia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-[14px]" style={{ color: "var(--ink-2)" }}>
              {derived.nExtreme} of {derived.nWithMap} scored windows
              {derived.extremeHours.length > 12
                ? ` (showing first 12 of ${derived.extremeHours.length})`
                : ""}
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {derived.extremeHours.slice(0, 12).map((e) => (
                <li
                  key={`${e.t}-${e.map}`}
                  className="flex items-baseline gap-3 text-[14px]"
                >
                  <span
                    className="font-mono tabular-nums"
                    style={{ color: "var(--ink)" }}
                  >
                    {e.t}
                  </span>
                  <span style={{ color: "var(--ink-2)" }}>
                    map {e.map} · {e.label}
                  </span>
                </li>
              ))}
            </ul>
            <p
              className="mt-4 text-[14px] leading-snug"
              style={{ color: "var(--ink-2)" }}
            >
              Scale:{" "}
              {Object.entries(KINESIA_LABELS)
                .map(([i, lab]) => `${i}=${lab}`)
                .join(" · ")}
            </p>
          </CardContent>
        </Card>

        <footer
          className="pb-8 text-[14px] leading-snug"
          style={{ color: "var(--ink-2)" }}
        >
          Participant {bundle.participant}
          {bundle.day != null ? ` · day ${bundle.day}` : ""}
          {" · "}
          resolution {bundle.resolution_min} min
          {" · "}
          COPS CC-BY 4.0 · offline demo bundle · not for diagnosis or dosing
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p
        className="text-[14px] uppercase tracking-wide"
        style={{ color: "var(--ink-2)" }}
      >
        {label}
        {hint && (
          <span className="ml-1 normal-case tracking-normal opacity-80">
            ({hint})
          </span>
        )}
      </p>
      <p
        className="font-mono text-[22px] tabular-nums leading-tight"
        style={{ color: emphasize ? "var(--brass-hi)" : "var(--ink)" }}
      >
        {value}
      </p>
    </div>
  );
}
