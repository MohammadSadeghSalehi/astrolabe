"use client";

import type { Bundle } from "@/lib/contract";

/**
 * A null metric could not be computed — an MAE over zero answered steps has no
 * value. It renders as an em-dash, never as 0.00: a zero would read as a
 * perfect score for a day the model declined outright, which is the exact
 * overclaim this interface exists to prevent.
 */
function fmt(v: number | null | undefined, digits: number): string {
  return v == null ? "—" : v.toFixed(digits);
}

export function MetricsPanel({ bundle }: { bundle: Bundle | null }) {
  const m = bundle?.metrics;

  return (
    <section
      className="rounded-md border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
    >
      <h2
        className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        Metrics
      </h2>
      {!m ? (
        <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
          —
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Metric
            label="Ordinal MAE"
            value={fmt(m.ordinal_mae, 2)}
            hint={m.ordinal_mae == null ? "nothing answered" : undefined}
            emphasize
          />
          <Metric
            label="Baseline MAE"
            value={m.baseline_mae.toFixed(3)}
            hint="always-good"
          />
          {m.coverage_90 != null && (
            <Metric label="Coverage 90" value={fmt(m.coverage_90, 2)} />
          )}
          {m.mean_interval_width != null && (
            <Metric label="Mean CI width" value={fmt(m.mean_interval_width, 2)} />
          )}
          {m.abstain_rate != null && (
            <Metric
              label="Abstain rate"
              value={`${(m.abstain_rate * 100).toFixed(1)}%`}
            />
          )}
          {m.macro_f1 != null && (
            <Metric label="Macro-F1" value={m.macro_f1.toFixed(2)} />
          )}
        </dl>
      )}
      {m && (
        <p className="mt-4 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
          A number alone is not a claim. Baseline is always-predict Good kinesia
          over the cohort ({m.baseline_mae}).
        </p>
      )}
    </section>
  );
}

function Metric({
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
      <dt className="text-[12px] uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>
        {label}
        {hint && (
          <span className="ml-1 normal-case tracking-normal opacity-80">
            ({hint})
          </span>
        )}
      </dt>
      <dd
        className="font-mono text-[22px] tabular-nums leading-tight"
        style={{ color: emphasize ? "var(--brass-hi)" : "var(--ink)" }}
      >
        {value}
      </dd>
    </div>
  );
}
