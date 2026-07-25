/** Types mirrored from the frozen bundle contract. Do not invent fields. */

export type Evidence = "observed" | "reported" | "reconstructed";

export type StateIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SeriesState = {
  posterior: number[]; // length 7, indices 0..6
  map: number;
  ci: [number, number]; // inclusive [lo, hi]
};

export type SeriesPoint = {
  t: string; // "HH:MM"
  state: SeriesState | null;
  tremor_p: number | null;
  /** Distance from a coin flip, 0..1. Null wherever tremor_p is. */
  tremor_confidence?: number | null;
  confidence: number;
  abstain: boolean;
  evidence: Evidence;
  reason: string | null;
};

export type BundleEvent = {
  t: string;
  type: string;
  source: Evidence | string;
  drug?: string;
  dose_mg?: number;
};

/**
 * `null` is a real value here and never interchangeable with 0. It means the
 * quantity could not be computed — an MAE over zero answered steps has no
 * value, and rendering that as `0.00` would claim a perfect score for a day the
 * model declined entirely. Render null as an em-dash with a reason.
 */
export type BundleMetrics = {
  // ── this day only. Context, never a headline: one day is ~19 labelled hours.
  ordinal_mae: number | null;
  baseline_mae: number;
  coverage_90?: number | null;
  macro_f1?: number | null;
  brier?: number | null;
  mean_interval_width?: number | null;
  n_hours?: number | null;
  n_steps?: number;
  n_answered?: number;
  abstain_rate?: number | null;
  kinesia_beats_baseline?: boolean;

  tremor_n_scored?: number;
  tremor_day_accuracy?: number | null;
  tremor_day_baseline_accuracy?: number | null;
  tremor_day_prevalence?: number | null;
  tremor_day_auc?: number | null;
  tremor_day_brier?: number | null;
  tremor_day_brier_climatology?: number | null;
  tremor_day_beats_baseline?: boolean;

  // ── measured on held-out participants. These are the claims.
  coverage_target?: number;
  coverage_calibration?: number;
  coverage_calibration_n_participants?: number;
  interval_mass?: number;
  sensor_config?: string;
  abstain_min_peak?: number;
  abstain_max_interval_width?: number;
  peak_confidence_max?: number | null;
  holdout_abstain_rate?: number;
  holdout_mae_answered?: number;
  holdout_n_hours?: number;
  tremor_auc?: number;
  tremor_auc_within_participant_median?: number;
  selective_curve?: SelectivePoint[];
};

export type SelectivePoint = {
  answered_fraction: number;
  n: number;
  auc: number;
  balanced_accuracy: number;
  accuracy: number;
  min_confidence?: number;
};

export type Bundle = {
  participant: string;
  day?: number;
  resolution_min: number;
  generated?: string;
  series: SeriesPoint[];
  events: BundleEvent[];
  /** Present only in reveal bundles. Index-aligned with series. */
  truth?: number[];
  /**
   * The diary's own tremor answer per step, 0/1, null where the hour was
   * unlabelled. Index-aligned with series. This is what a reveal can actually
   * be scored against — the kinesia reconstruction abstains everywhere.
   */
  tremor_truth?: (number | null)[];
  state_names?: string[];
  metrics: BundleMetrics;
  next_observation?: {
    action: string;
    expected_uncertainty_drop: number;
    burden: number;
  };
};

/** Diverging scale: index 3 is Good kinesia. */
export const KINESIA_LABELS: Record<number, string> = {
  0: "Severe akinesia",
  1: "Discomforting akinesia",
  2: "Slight akinesia",
  3: "Good kinesia",
  4: "Slight dyskinesia",
  5: "Discomforting dyskinesia",
  6: "Severe dyskinesia",
};

export const EVIDENCE_WORDS: Record<Evidence, string> = {
  observed: "measured",
  reported: "you told us",
  reconstructed: "reconstructed",
};
