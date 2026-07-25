import type { Bundle, BundleMetrics } from "./contract";
import { KINESIA_LABELS } from "./contract";

/**
 * Deterministic visit questions — every number comes from the bundle.
 * Claude / Anthropic may rephrase only; never invent metrics.
 */
export type ClinicianDerived = {
  abstained: { t: string; reason: string }[];
  extremeHours: { t: string; map: number; label: string }[];
  nExtreme: number;
  nAkinesia: number;
  nDyskinesia: number;
  nGood: number;
  nWithMap: number;
  nSeries: number;
  firstT: string | null;
  lastT: string | null;
  medEvents: number;
};

export function deriveClinicianStats(bundle: Bundle): ClinicianDerived {
  const abstained = bundle.series
    .filter((s) => s.abstain)
    .map((s) => ({
      t: s.t,
      reason: s.reason ?? "insufficient evidence",
    }));

  const withMap = bundle.series.filter((s) => s.state != null && !s.abstain);
  const extremeHours = withMap
    .filter((s) => s.state!.map <= 1 || s.state!.map >= 5)
    .map((s) => ({
      t: s.t,
      map: s.state!.map,
      label: KINESIA_LABELS[s.state!.map] ?? `index ${s.state!.map}`,
    }));

  return {
    abstained,
    extremeHours,
    nExtreme: extremeHours.length,
    nAkinesia: withMap.filter((s) => s.state!.map <= 2).length,
    nDyskinesia: withMap.filter((s) => s.state!.map >= 4).length,
    nGood: withMap.filter((s) => s.state!.map === 3).length,
    nWithMap: withMap.length,
    nSeries: bundle.series.length,
    firstT: bundle.series[0]?.t ?? null,
    lastT: bundle.series[bundle.series.length - 1]?.t ?? null,
    medEvents: bundle.events.filter((e) => e.type === "medication").length,
  };
}

export function buildVisitQuestions(
  metrics: BundleMetrics,
  derived: ClinicianDerived,
): string[] {
  const base = metrics.baseline_mae.toFixed(3);
  const abstainPct =
    metrics.abstain_rate != null
      ? `${(metrics.abstain_rate * 100).toFixed(1)}%`
      : `${derived.abstained.length} of ${derived.nSeries} windows`;

  // When nothing was answered there is no reconstruction to ask about, and
  // questions phrased as though there were would put numbers in a clinician's
  // mouth that the model never produced. Ask about the refusal instead — it is
  // the finding.
  if (metrics.ordinal_mae == null || derived.nWithMap === 0) {
    return [
      `The model declined every one of the ${derived.nSeries} windows on this day, so there is no reconstruction to compare against the always-predict-Good baseline of ${base}. Does a day it cannot read at all match anything you know about this patient's recording conditions?`,
      `Abstention was ${abstainPct}. Each window carries its own recorded reason. Do those reasons line up with known non-wear, sleep, or device issues?`,
      `${derived.medEvents} medication events were reported on this day, and those timings are the patient's own record rather than anything inferred. Are they the ones you expected?`,
    ];
  }

  const mae = metrics.ordinal_mae.toFixed(2);
  const width =
    metrics.mean_interval_width != null
      ? metrics.mean_interval_width.toFixed(2)
      : "—";
  const nHours =
    metrics.n_hours != null ? String(metrics.n_hours) : String(derived.nSeries);

  return [
    `Reconstruction ordinal MAE is ${mae} against always-predict-Good baseline ${base} over ${nHours} diary-comparable hours. Does the gap match what you saw clinically that day?`,
    `The model abstained on ${abstainPct} of windows (mean 90% interval width ${width} states). Were those gaps during known non-wear, sleep transitions, or something the diary missed?`,
    `${derived.nExtreme} reconstructed windows had MAP at extremes (indices ≤1 or ≥5: severe/discomforting akinesia or dyskinesia). Of ${derived.nWithMap} scored windows, ${derived.nAkinesia} leaned akinetic (≤2), ${derived.nDyskinesia} dyskinetic (≥4), ${derived.nGood} Good kinesia (3). Which of those extremes should we verify first?`,
  ];
}

export function buildPatternSummary(
  metrics: BundleMetrics,
  derived: ClinicianDerived,
): string {
  const base = metrics.baseline_mae.toFixed(3);
  const span =
    derived.firstT && derived.lastT
      ? `${derived.firstT}–${derived.lastT}`
      : "the recorded window";
  const abstainPct =
    metrics.abstain_rate != null
      ? `${(metrics.abstain_rate * 100).toFixed(1)}%`
      : "n/a";

  if (metrics.ordinal_mae == null) {
    return [
      `Across ${span} (${derived.nSeries} bins at the bundle resolution), the model answered no windows, so no ordinal MAE exists to compare against the baseline of ${base} (always predict Good kinesia).`,
      `Abstain rate ${abstainPct}.`,
      `${derived.medEvents} reported medication events on the day.`,
    ].join(" ");
  }

  const mae = metrics.ordinal_mae.toFixed(2);
  const beats = metrics.ordinal_mae < metrics.baseline_mae;

  return [
    `Across ${span} (${derived.nSeries} bins at the bundle resolution), reconstruction ordinal MAE is ${mae} versus baseline MAE ${base} (always predict Good kinesia).`,
    beats
      ? `Ordinal MAE is below baseline on this day.`
      : `Ordinal MAE is not below baseline on this day.`,
    `Abstain rate ${abstainPct}; mean interval width ${
      metrics.mean_interval_width != null
        ? metrics.mean_interval_width.toFixed(2)
        : "—"
    } states; coverage_90 ${
      metrics.coverage_90 != null ? metrics.coverage_90.toFixed(3) : "—"
    }.`,
    `${derived.medEvents} reported medication events on the day.`,
  ].join(" ");
}
