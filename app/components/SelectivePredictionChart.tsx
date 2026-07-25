"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import type { Bundle, SelectivePoint } from "@/lib/contract";

/**
 * Fallback only when the bundle omits selective_curve. Real COPS-29 ships the
 * curve; these numbers mirror the published hold-out operating points so a
 * missing field still draws a legible story rather than a blank card.
 */
const FALLBACK_CURVE: SelectivePoint[] = [
  {
    answered_fraction: 1.0,
    n: 6291,
    auc: 0.681,
    balanced_accuracy: 0.61,
    accuracy: 0.713,
  },
  {
    answered_fraction: 0.75,
    n: 4916,
    auc: 0.687,
    balanced_accuracy: 0.649,
    accuracy: 0.758,
  },
  {
    answered_fraction: 0.5,
    n: 3312,
    auc: 0.71,
    balanced_accuracy: 0.687,
    accuracy: 0.785,
  },
  {
    answered_fraction: 0.35,
    n: 2324,
    auc: 0.725,
    balanced_accuracy: 0.7,
    accuracy: 0.787,
  },
  {
    answered_fraction: 0.25,
    n: 1624,
    auc: 0.709,
    balanced_accuracy: 0.708,
    accuracy: 0.825,
  },
];

const MARGIN = { top: 28, right: 52, bottom: 40, left: 44 };

export function SelectivePredictionChart({
  bundle,
}: {
  bundle: Bundle | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(420);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 420);
    return () => ro.disconnect();
  }, []);

  const fromBundle = bundle?.metrics?.selective_curve;
  const usingFallback = !fromBundle || fromBundle.length === 0;
  const curve = useMemo(() => {
    const src = usingFallback ? FALLBACK_CURVE : fromBundle!;
    // Left → right: answer more → answer fewer (or the reverse of fraction
    // order). Sort descending so 1.0 is on the left and 0.25 on the right.
    return [...src].sort(
      (a, b) => b.answered_fraction - a.answered_fraction,
    );
  }, [fromBundle, usingFallback]);

  const height = 220;
  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(1, height - MARGIN.top - MARGIN.bottom);

  const x = useMemo(() => {
    const xs = curve.map((p) => p.answered_fraction);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    // Domain high→low so answered_fraction 1.0 is left, 0.25 is right.
    return scaleLinear().domain([hi, lo]).range([0, innerW]).nice();
  }, [curve, innerW]);

  const y = useMemo(() => {
    const ys = curve.map((p) => p.accuracy);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = Math.max(0.02, (hi - lo) * 0.15);
    return scaleLinear()
      .domain([Math.max(0, lo - pad), Math.min(1, hi + pad)])
      .range([innerH, 0]);
  }, [curve, innerH]);

  const points = curve.map((p) => ({
    ...p,
    cx: x(p.answered_fraction),
    cy: y(p.accuracy),
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];

  const yTicks = y.ticks(4);
  const xTicks = x.ticks(4);

  return (
    <section
      className="rounded-md border p-4 md:p-5"
      style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
    >
      <h2
        className="mb-1 text-[13px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        Selective prediction
      </h2>
      <p className="mb-3 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
        Hold-out accuracy vs fraction of hours answered
        {usingFallback && (
          <span className="ml-1 opacity-80">(fixture — curve missing from bundle)</span>
        )}
      </p>

      <div ref={wrapRef} className="w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Selective prediction: accuracy rises as answered fraction falls"
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Grid */}
            {yTicks.map((t) => (
              <g key={`y-${t}`}>
                <line
                  x1={0}
                  x2={innerW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ink-2)"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                >
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <g key={`x-${t}`}>
                <text
                  x={x(t)}
                  y={innerH + 18}
                  textAnchor="middle"
                  fill="var(--ink-2)"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                >
                  {(t * 100).toFixed(0)}%
                </text>
              </g>
            ))}

            {/* Axis labels */}
            <text
              x={innerW / 2}
              y={innerH + 34}
              textAnchor="middle"
              fill="var(--ink-2)"
              fontSize={11}
            >
              answered fraction → fewer hours
            </text>
            <text
              transform={`translate(${-34},${innerH / 2}) rotate(-90)`}
              textAnchor="middle"
              fill="var(--ink-2)"
              fontSize={11}
            >
              accuracy
            </text>

            {/* Series */}
            <path
              d={pathD}
              fill="none"
              stroke="var(--s2-truth)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((p) => (
              <circle
                key={p.answered_fraction}
                cx={p.cx}
                cy={p.cy}
                r={3.5}
                fill="var(--s2-truth)"
              />
            ))}

            {/* Direct labels on both endpoints */}
            {first && (
              <EndpointLabel
                x={first.cx}
                y={first.cy}
                accuracy={first.accuracy}
                fraction={first.answered_fraction}
                side="start"
                innerW={innerW}
              />
            )}
            {last && last !== first && (
              <EndpointLabel
                x={last.cx}
                y={last.cy}
                accuracy={last.accuracy}
                fraction={last.answered_fraction}
                side="end"
                innerW={innerW}
              />
            )}
          </g>
        </svg>
      </div>

      <p
        className="mt-2 text-[13px] leading-snug"
        style={{ color: "var(--ink-2)" }}
      >
        the fewer hours it answers, the more often it is right — so the refusals
        are real.
      </p>
    </section>
  );
}

function EndpointLabel({
  x,
  y,
  accuracy,
  fraction,
  side,
  innerW,
}: {
  x: number;
  y: number;
  accuracy: number;
  fraction: number;
  side: "start" | "end";
  innerW: number;
}) {
  const text = `${(accuracy * 100).toFixed(0)}% @ ${(fraction * 100).toFixed(0)}%`;
  // Keep labels inside the plot: start left of point (or above), end right.
  const anchor = side === "start" ? "start" : "end";
  const dx = side === "start" ? 8 : -8;
  const ty = y - 12;
  // Clamp horizontal so labels do not clip the card edges hard.
  const tx = Math.min(innerW - 4, Math.max(4, x + dx));

  return (
    <text
      x={tx}
      y={ty}
      textAnchor={anchor}
      fill="var(--ink)"
      fontSize={12}
      fontFamily="var(--font-mono)"
    >
      {text}
    </text>
  );
}
