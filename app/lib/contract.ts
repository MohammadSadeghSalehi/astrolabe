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

export type BundleMetrics = {
  ordinal_mae: number;
  baseline_mae: number;
  coverage_90?: number;
  macro_f1?: number;
  brier?: number;
  mean_interval_width?: number;
  n_hours?: number;
  abstain_rate?: number;
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
