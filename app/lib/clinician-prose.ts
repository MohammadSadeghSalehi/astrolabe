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
  const mae = metrics.ordinal_mae.toFixed(2);
  const base = metrics.baseline_mae.toFixed(3);
  const abstainPct =
    metrics.abstain_rate != null
      ? `${(metrics.abstain_rate * 100).toFixed(1)}%`
      : `${derived.abstained.length} of ${derived.nSeries} windows`;
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
  const mae = metrics.ordinal_mae.toFixed(2);
  const base = metrics.baseline_mae.toFixed(3);
  const beats = metrics.ordinal_mae < metrics.baseline_mae;
  const span =
    derived.firstT && derived.lastT
      ? `${derived.firstT}–${derived.lastT}`
      : "the recorded window";
  const abstainPct =
    metrics.abstain_rate != null
      ? `${(metrics.abstain_rate * 100).toFixed(1)}%`
      : "n/a";

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
