"use client";

import type { Bundle } from "@/lib/contract";
import { KINESIA_LABELS } from "@/lib/contract";

const K_COLORS = [
  "var(--k0)",
  "var(--k1)",
  "var(--k2)",
  "var(--k3)",
  "var(--k4)",
  "var(--k5)",
  "var(--k6)",
];

export function PosteriorInspector({
  bundle,
  hour,
}: {
  bundle: Bundle | null;
  hour: number | null;
}) {
  const point =
    bundle && hour != null ? bundle.series[hour] ?? null : null;

  if (!bundle) {
    return (
      <Panel title="Posterior">
        <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
          Load a day to inspect the 7-way state distribution.
        </p>
      </Panel>
    );
  }

  if (hour == null || !point) {
    return (
      <Panel title="Posterior">
        <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
          Hover or click an hour on the timeline.
        </p>
      </Panel>
    );
  }

  if (point.abstain || !point.state) {
    return (
      <Panel title="Posterior" subtitle={point.t}>
        <p className="text-[14px]" style={{ color: "var(--ink)" }}>
          Abstained
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
          {point.reason ?? "insufficient evidence"}
        </p>
      </Panel>
    );
  }

  const { posterior, map, ci } = point.state;
  const maxP = Math.max(...posterior, 1e-6);

  return (
    <Panel title="Posterior" subtitle={point.t}>
      <div className="flex flex-col gap-1.5">
        {posterior.map((p, i) => {
          const inCi = i >= ci[0] && i <= ci[1];
          const isMap = i === map;
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="w-16 shrink-0 font-mono text-[12px] tabular-nums"
                style={{ color: "var(--ink-2)" }}
              >
                {i - 3 > 0 ? `+${i - 3}` : `${i - 3}`}
              </span>
              <div className="relative h-4 flex-1 rounded-sm" style={{ background: "var(--grid)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${(p / maxP) * 100}%`,
                    background: K_COLORS[i],
                    opacity: inCi ? 1 : 0.45,
                    outline: isMap ? "1.5px solid var(--ink)" : undefined,
                    outlineOffset: 1,
                  }}
                />
              </div>
              <span
                className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums"
                style={{ color: "var(--ink)" }}
              >
                {p.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
        MAP{" "}
        <span style={{ color: "var(--ink)" }}>
          {KINESIA_LABELS[map] ?? map}
        </span>
        {" · "}
        90% CI [{ci[0]}, {ci[1]}]
      </p>
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-md border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--axis)",
      }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2
          className="text-[13px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--brass)" }}
        >
          {title}
        </h2>
        {subtitle && (
          <span className="font-mono text-[13px]" style={{ color: "var(--ink-2)" }}>
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
