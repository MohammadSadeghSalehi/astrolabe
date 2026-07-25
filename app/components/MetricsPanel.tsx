"use client";

import type { Bundle, BundleMetrics } from "@/lib/contract";

/**
 * A null metric could not be computed — an MAE over zero answered steps has no
 * value. It renders as an em-dash, never as 0.00: a zero would read as a
 * perfect score for a day the model declined outright, which is the exact
 * overclaim this interface exists to prevent.
 */
function fmt(v: number | null | undefined, digits: number): string {
  return v == null ? "—" : v.toFixed(digits);
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  return v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function nullReason(
  v: number | null | undefined,
  m: BundleMetrics,
): string | undefined {
  if (v != null) return undefined;
  if (m.n_answered === 0) return "nothing answered";
  return "not computed";
}

/** Human labels for known metric keys. Unknown keys fall back to the raw name. */
const LABEL: Record<string, string> = {
  coverage_calibration: "Coverage (calibration)",
  coverage_target: "Coverage target",
  holdout_abstain_rate: "Hold-out abstain rate",
  holdout_mae_answered: "Hold-out MAE (answered)",
  holdout_n_hours: "Hold-out hours",
  tremor_auc: "Tremor AUC",
  tremor_auc_within_participant_median: "Within-participant median AUC",
  interval_mass: "Interval mass",
  sensor_config: "Sensor config",
  ordinal_mae: "Ordinal MAE",
  baseline_mae: "Baseline MAE",
  tremor_day_accuracy: "Day accuracy",
  tremor_day_baseline_accuracy: "Majority baseline",
  n_answered: "Answered",
  n_steps: "Steps",
  abstain_rate: "Abstain rate",
  coverage_calibration_n_participants: "Held-out participants",
};

function labelOf(key: string): string {
  return LABEL[key] ?? key.replace(/_/g, " ");
}

export function MetricsPanel({ bundle }: { bundle: Bundle | null }) {
  const m = bundle?.metrics;

  return (
    <section
      className="rounded-md border p-4 md:p-5"
      style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
    >
      <h2
        className="mb-4 text-[15px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        Metrics
      </h2>

      {!m ? (
        <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
          —
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <HeldOutBlock m={m} />
          <div className="rule" />
          <ThisDayBlock m={m} />
        </div>
      )}
    </section>
  );
}

function HeldOutBlock({ m }: { m: BundleMetrics }) {
  const nPart = m.coverage_calibration_n_participants;
  const nHours = m.holdout_n_hours;
  const titleBits: string[] = ["Measured on held-out participants"];
  if (nPart != null || nHours != null) {
    const detail: string[] = [];
    if (nPart != null) detail.push(`${nPart} participants`);
    if (nHours != null) detail.push(`${nHours.toLocaleString()} hours`);
    titleBits.push(`(${detail.join(" · ")})`);
  }

  return (
    <div>
      <h3
        className="mb-3 text-[15px] font-medium leading-snug"
        style={{ color: "var(--ink)" }}
      >
        {titleBits[0]}
        {titleBits[1] && (
          <span className="ml-1.5 font-normal" style={{ color: "var(--ink-2)" }}>
            {titleBits[1]}
          </span>
        )}
      </h3>

      {/* Coverage calibration vs target on one aligned row */}
      {(m.coverage_calibration != null || m.coverage_target != null) && (
        <CompareRow
          leftLabel={labelOf("coverage_calibration")}
          leftValue={fmt(m.coverage_calibration, 3)}
          rightLabel={labelOf("coverage_target")}
          rightValue={fmt(m.coverage_target, 2)}
        />
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {m.holdout_abstain_rate != null && (
          <Cell
            label={labelOf("holdout_abstain_rate")}
            value={fmtPct(m.holdout_abstain_rate)}
          />
        )}
        {m.holdout_mae_answered != null && (
          <Cell
            label={labelOf("holdout_mae_answered")}
            value={fmt(m.holdout_mae_answered, 3)}
          />
        )}
        {m.holdout_n_hours != null && (
          <Cell
            label={labelOf("holdout_n_hours")}
            value={m.holdout_n_hours.toLocaleString()}
          />
        )}
        {m.tremor_auc != null && (
          <Cell label={labelOf("tremor_auc")} value={fmt(m.tremor_auc, 3)} />
        )}
        {m.tremor_auc_within_participant_median != null && (
          <Cell
            label={labelOf("tremor_auc_within_participant_median")}
            value={fmt(m.tremor_auc_within_participant_median, 2)}
            hint="median of per-person AUCs — not the pooled claim"
          />
        )}
        {m.interval_mass != null && (
          <Cell
            label={labelOf("interval_mass")}
            value={fmt(m.interval_mass, 2)}
          />
        )}
        {m.sensor_config != null && m.sensor_config !== "" && (
          <Cell label={labelOf("sensor_config")} value={m.sensor_config} />
        )}
      </dl>
    </div>
  );
}

function ThisDayBlock({ m }: { m: BundleMetrics }) {
  const maeReason = nullReason(m.ordinal_mae, m);
  // Prefer the explicit flag; fall back to comparing MAE when the flag is absent.
  const kinesiaLoses =
    m.kinesia_beats_baseline === false ||
    (m.kinesia_beats_baseline == null &&
      m.ordinal_mae != null &&
      m.ordinal_mae >= m.baseline_mae);

  const tremorLoses =
    m.tremor_day_beats_baseline === false ||
    (m.tremor_day_beats_baseline == null &&
      m.tremor_day_accuracy != null &&
      m.tremor_day_baseline_accuracy != null &&
      m.tremor_day_accuracy <= m.tremor_day_baseline_accuracy);

  return (
    <div>
      <h3
        className="mb-1 text-[15px] font-medium leading-snug"
        style={{ color: "var(--ink)" }}
      >
        This day
      </h3>
      <p className="mb-3 text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
        Context only — one day is ~19 labelled hours, not a claim.
      </p>

      {/* Ordinal MAE beside baseline on one shared aligned row */}
      <CompareRow
        leftLabel={labelOf("ordinal_mae")}
        leftValue={fmt(m.ordinal_mae, 2)}
        leftHint={maeReason}
        leftEmphasize
        rightLabel={labelOf("baseline_mae")}
        rightValue={fmt(m.baseline_mae, 3)}
        rightHint="always-good"
      />

      {kinesiaLoses && (
        <p
          className="mt-2 text-[15px] leading-snug"
          style={{ color: "var(--ink-2)" }}
        >
          {m.ordinal_mae == null
            ? "Kinesia does not beat the constant baseline — nothing was answered on this day."
            : "Kinesia does not beat the constant baseline (always-predict Good kinesia)."}
        </p>
      )}

      {/* Tremor day accuracy vs majority baseline — one aligned row */}
      {(m.tremor_day_accuracy != null ||
        m.tremor_day_baseline_accuracy != null) && (
        <div className="mt-4">
          <CompareRow
            leftLabel={labelOf("tremor_day_accuracy")}
            leftValue={fmt(m.tremor_day_accuracy, 3)}
            leftHint={nullReason(m.tremor_day_accuracy, m)}
            rightLabel={labelOf("tremor_day_baseline_accuracy")}
            rightValue={fmt(m.tremor_day_baseline_accuracy, 3)}
            rightHint="majority class"
          />
          {tremorLoses && (
            <p
              className="mt-2 text-[15px] leading-snug"
              style={{ color: "var(--ink-2)" }}
            >
              Tremor does not beat the majority-class baseline on this day.
            </p>
          )}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {m.n_answered != null && (
          <Cell
            label={labelOf("n_answered")}
            value={
              m.n_steps != null
                ? `${m.n_answered} / ${m.n_steps}`
                : String(m.n_answered)
            }
            hint={m.n_steps != null ? "answered / steps" : undefined}
          />
        )}
        {m.n_answered == null && m.n_steps != null && (
          <Cell label={labelOf("n_steps")} value={String(m.n_steps)} />
        )}
        {m.abstain_rate != null && (
          <Cell
            label={labelOf("abstain_rate")}
            value={fmtPct(m.abstain_rate)}
          />
        )}
      </dl>
    </div>
  );
}

/**
 * Two metrics on one shared grid row so columns stay aligned — fixes the
 * baseline sitting on a separate visual tier from the day MAE.
 */
function CompareRow({
  leftLabel,
  leftValue,
  leftHint,
  leftEmphasize,
  rightLabel,
  rightValue,
  rightHint,
}: {
  leftLabel: string;
  leftValue: string;
  leftHint?: string;
  leftEmphasize?: boolean;
  rightLabel: string;
  rightValue: string;
  rightHint?: string;
}) {
  return (
    <dl
      className="grid grid-cols-2 gap-x-4"
      style={{ borderTop: "1px solid var(--axis)", paddingTop: 10 }}
    >
      <div>
        <dt
          className="text-[15px] leading-snug"
          style={{ color: "var(--ink-2)" }}
        >
          {leftLabel}
          {leftHint && (
            <span className="ml-1 opacity-80">· {leftHint}</span>
          )}
        </dt>
        <dd
          className="mt-0.5 font-mono text-[18px] tabular-nums leading-tight sm:text-[20px]"
          style={{
            color: leftEmphasize ? "var(--brass-hi)" : "var(--ink)",
          }}
        >
          {leftValue}
        </dd>
      </div>
      <div>
        <dt
          className="text-[15px] leading-snug"
          style={{ color: "var(--ink-2)" }}
        >
          {rightLabel}
          {rightHint && (
            <span className="ml-1 opacity-80">· {rightHint}</span>
          )}
        </dt>
        <dd
          className="mt-0.5 font-mono text-[18px] tabular-nums leading-tight sm:text-[20px]"
          style={{ color: "var(--ink)" }}
        >
          {rightValue}
        </dd>
      </div>
    </dl>
  );
}

function Cell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt
        className="text-[15px] leading-snug"
        style={{ color: "var(--ink-2)" }}
      >
        {label}
      </dt>
      <dd
        className="mt-0.5 font-mono text-[16px] tabular-nums leading-tight sm:text-[18px]"
        style={{ color: "var(--ink)" }}
      >
        {value}
      </dd>
      {hint && (
        <p className="mt-0.5 text-[14px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
