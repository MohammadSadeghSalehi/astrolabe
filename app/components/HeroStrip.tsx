"use client";

import { useEffect, useState } from "react";
import { getBundle } from "@/lib/source";
import type { Bundle } from "@/lib/contract";

/**
 * The landing hero, drawn from the real bundle.
 *
 * It would have been quicker to illustrate this. But an invented hero showing a
 * confident reconstruction — the obvious thing to draw — would advertise the one
 * behaviour the product does not have, on the page that sets expectations. So it
 * renders the actual day: one block per labelled hour, dashed where the model
 * declined, with the tremor trajectory it will stand behind underneath.
 *
 * Renders nothing until the bundle arrives, and nothing at all if it fails.
 * A hero is not worth a fallback that might mislead.
 */
export function HeroStrip() {
  const [bundle, setBundle] = useState<Bundle | null>(null);

  useEffect(() => {
    let live = true;
    getBundle("COPS-29")
      .then(({ bundle }) => live && setBundle(bundle))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!bundle) return <div className="h-[132px]" aria-hidden />;

  // One block per hour: the resolution the diary and the model both have.
  const hours = bundle.series.filter((s) => s.t.endsWith(":00"));
  if (hours.length === 0) return <div className="h-[132px]" aria-hidden />;

  const W = 1000;
  const H = 132;
  const gap = 3;
  const bw = (W - gap * (hours.length - 1)) / hours.length;
  const declined = hours.filter((h) => h.abstain).length;

  const trace = hours
    .map((h, i) => {
      const p = h.tremor_p ?? 0.5;
      const x = i * (bw + gap) + bw / 2;
      const y = 118 - p * 44;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={`One day: ${declined} of ${hours.length} hours declined by the model, with the tremor trajectory beneath.`}
      >
        {hours.map((h, i) => {
          const x = i * (bw + gap);
          return h.abstain ? (
            <rect
              key={h.t}
              x={x}
              y={8}
              width={bw}
              height={58}
              rx={2}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.4}
              strokeDasharray="5 5"
              opacity={0.55}
              className="astro-fade-up"
              style={{ animationDelay: `${i * 38}ms` }}
            />
          ) : (
            <rect
              key={h.t}
              x={x}
              y={8}
              width={bw}
              height={58}
              rx={2}
              fill="var(--brass)"
              opacity={0.75}
              className="astro-fade-up"
              style={{ animationDelay: `${i * 38}ms` }}
            />
          );
        })}

        <path
          d={trace}
          fill="none"
          stroke="var(--seq-4)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          pathLength={1}
          className="astro-draw"
          style={
            { "--astro-draw-len": "1", strokeDasharray: 1 } as React.CSSProperties
          }
        />
      </svg>

      <figcaption
        className="mt-3 font-mono text-[14px] leading-relaxed"
        style={{ color: "var(--ink-2)" }}
      >
        <span style={{ color: "var(--ink-2)" }}>▢ declined {declined}/{hours.length} hours</span>
        {"   "}
        <span style={{ color: "var(--seq-4)" }}>— tremor, the one claim it stands behind</span>
      </figcaption>
    </figure>
  );
}
