"use client";

import { useEffect, useMemo, useState } from "react";
import { getBundle } from "@/lib/source";
import type { Bundle, SeriesPoint } from "@/lib/contract";

/**
 * Landing hero from the real COPS-29 bundle.
 *
 * Hour blocks: dashed = declined, solid brass = not declined (rare on this day).
 * Violet step trace = tremor_p — the claim the model stands behind.
 * No invented UI chrome, no fabricated numbers.
 */
export function HeroStrip() {
  const [bundle, setBundle] = useState<Bundle | null>(null);

  useEffect(() => {
    let live = true;
    getBundle("COPS-29")
      .then(({ bundle: b }) => live && setBundle(b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!bundle) {
    return (
      <div
        className="h-[148px] w-full rounded-md border"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
        aria-hidden
      />
    );
  }

  return <HeroFigure bundle={bundle} />;
}

function HeroFigure({ bundle }: { bundle: Bundle }) {
  // One block per clock hour — diary resolution.
  const hours = useMemo(
    () => bundle.series.filter((s) => s.t.endsWith(":00")),
    [bundle.series],
  );

  if (hours.length === 0) {
    return <div className="h-[148px]" aria-hidden />;
  }

  const W = 1000;
  const H = 148;
  const padX = 8;
  const topY = 14;
  const blockH = 52;
  const gap = 2.5;
  const n = hours.length;
  const bw = (W - padX * 2 - gap * (n - 1)) / n;
  const declined = hours.filter((h) => h.abstain).length;

  const stepPath = tremorStepPath(hours, padX, bw, gap, topY + blockH + 18, 40);

  return (
    <figure className="m-0 w-full min-w-0">
      {/* Own horizontal scroll on narrow viewports — page body never scrolls x */}
      <div
        className="w-full overflow-x-auto rounded-md border p-3 md:p-4"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full min-w-[320px]"
          role="img"
          aria-label={`One day from the real bundle: model declined ${declined} of ${n} hours; violet step line is tremor probability.`}
        >
          {hours.map((h, i) => {
            const x = padX + i * (bw + gap);
            if (h.abstain) {
              return (
                <rect
                  key={h.t}
                  x={x}
                  y={topY}
                  width={bw}
                  height={blockH}
                  rx={2}
                  fill="none"
                  stroke="var(--ink-2)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3.5"
                  opacity={0.65}
                  className="astro-fade-up"
                  style={{ animationDelay: `${Math.min(i, 20) * 28}ms` }}
                />
              );
            }
            return (
              <rect
                key={h.t}
                x={x}
                y={topY}
                width={bw}
                height={blockH}
                rx={2}
                fill="var(--brass)"
                opacity={0.8}
                className="astro-fade-up"
                style={{ animationDelay: `${Math.min(i, 20) * 28}ms` }}
              />
            );
          })}

          {/* baseline for tremor lane */}
          <line
            x1={padX}
            y1={topY + blockH + 18 + 40}
            x2={W - padX}
            y2={topY + blockH + 18 + 40}
            stroke="var(--grid)"
            strokeWidth={1}
          />

          <path
            d={stepPath}
            fill="none"
            stroke="var(--seq-4)"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            className="astro-draw"
            style={
              {
                "--astro-draw-len": "1",
                strokeDasharray: 1,
              } as React.CSSProperties
            }
          />
        </svg>
      </div>

      <figcaption
        className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[14px] leading-relaxed"
        style={{ color: "var(--ink-2)" }}
      >
        <span>
          <span
            className="mr-1.5 inline-block h-2.5 w-3.5 rounded-[1px] border border-dashed align-middle"
            style={{ borderColor: "var(--ink-2)" }}
            aria-hidden
          />
          declined {declined}/{n} hours
        </span>
        <span style={{ color: "var(--seq-4)" }}>
          <span
            className="mr-1.5 inline-block h-[2px] w-4 align-middle"
            style={{ background: "var(--seq-4)" }}
            aria-hidden
          />
          tremor probability — the claim it stands behind
        </span>
      </figcaption>
    </figure>
  );
}

/** Step path: hourly tremor_p, no smooth interpolation past the label resolution. */
function tremorStepPath(
  hours: SeriesPoint[],
  padX: number,
  bw: number,
  gap: number,
  y0: number,
  h: number,
): string {
  if (hours.length === 0) return "";
  const parts: string[] = [];
  hours.forEach((hr, i) => {
    const p = hr.tremor_p ?? 0.5;
    const y = y0 + h - p * h;
    const x0 = padX + i * (bw + gap);
    const x1 = x0 + bw;
    if (i === 0) parts.push(`M${x0.toFixed(1)},${y.toFixed(1)}`);
    else {
      // horizontal step from previous
      parts.push(`H${x0.toFixed(1)}`);
      parts.push(`V${y.toFixed(1)}`);
    }
    parts.push(`H${x1.toFixed(1)}`);
  });
  return parts.join(" ");
}
