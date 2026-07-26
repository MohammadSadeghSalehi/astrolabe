"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { area as d3area, line as d3line, curveStepAfter } from "d3-shape";
import { getBundle } from "@/lib/source";
import type { Bundle } from "@/lib/contract";

/**
 * The hero: the product's central moment, running on its own.
 *
 * The previous hero drew the declined hours as a row of empty dashed boxes.
 * It was accurate and it was the wrong first impression — a page that opens on
 * nineteen empty rectangles reads as "this predicts nothing" rather than "this
 * knows what it cannot predict". Refusal only means something once you have
 * seen the thing being refused.
 *
 * So this shows the claim instead: the tremor trajectory the model does stand
 * behind, its uncertainty band, and the patient's own diary sweeping in behind
 * it so you can watch the two agree or fail to. Everything is from the real
 * bundle. The only motion is the sweep, and it stops after one pass rather than
 * looping forever in the corner of someone's eye.
 */

const H = 300;
const PAD = { t: 26, r: 20, b: 42, l: 20 };

export function HeroDay() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1120);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const width = e[0]?.contentRect.width;
      if (width && width > 0) setW(width);
    });
    ro.observe(el);
    setW(el.clientWidth || 1120);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    getBundle("COPS-29")
      .then(({ bundle: b }) => live && setBundle(b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // One pass, then it rests. A hero that loops forever competes with the copy
  // it is supposed to support, and respects nobody's attention.
  useEffect(() => {
    if (!bundle) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    if (reduced) {
      // Land on the finished state without a synchronous setState in the effect
      // body, which would cascade a render on every mount.
      raf = requestAnimationFrame(() => setSweep(1));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const DUR = 2600;
    const DELAY = 450;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0 - DELAY) / DUR));
      // ease-out cubic: quick to commit, slow to land
      setSweep(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bundle]);

  const plotW = Math.max(120, w - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;

  const model = useMemo(() => {
    if (!bundle) return null;
    const idxs: number[] = [];
    bundle.series.forEach((s, i) => {
      if (s.t.endsWith(":00")) idxs.push(i);
    });
    const hours = idxs.map((i) => bundle.series[i]!);
    if (hours.length < 2) return null;

    const x = (i: number) => (i / (hours.length - 1)) * plotW;
    const y = (p: number) => plotH - p * plotH;

    const pts = hours.map((s, i) => ({
      i,
      p: s.tremor_p ?? 0.5,
      c: s.tremor_confidence ?? 0.15,
      t: s.t,
    }));

    const band = d3area<(typeof pts)[number]>()
      .x((d) => x(d.i))
      .y0((d) => y(Math.min(1, d.p + (1 - d.c) * 0.22)))
      .y1((d) => y(Math.max(0, d.p - (1 - d.c) * 0.22)))
      .curve(curveStepAfter)(pts);

    const trace = d3line<(typeof pts)[number]>()
      .x((d) => x(d.i))
      .y((d) => y(d.p))
      .curve(curveStepAfter)(pts);

    // The diary's own answer, as a rail beneath — the thing being swept in.
    const truth = bundle.tremor_truth ?? [];
    const rail = idxs.map((orig, i) => ({ i, v: truth[orig] ?? null, x: x(i) }));

    const meds = bundle.events
      .filter((e) => e.type === "medication")
      .map((e) => {
        const hh = Number(e.t.slice(0, 2));
        const j = hours.findIndex((s) => Number(s.t.slice(0, 2)) === hh);
        return j >= 0 ? x(j) : null;
      })
      .filter((v): v is number => v != null);

    const step = plotW / Math.max(1, hours.length - 1);
    return { hours, band, trace, rail, meds, step, x, y };
  }, [bundle, plotW, plotH]);

  const revealed = useMemo(
    () => (model ? Math.floor(sweep * model.hours.length) : 0),
    [model, sweep],
  );

  const clipW = model ? sweep * plotW : 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div
        className="overflow-hidden rounded-xl border"
        style={{
          borderColor: "var(--axis)",
          background:
            "radial-gradient(120% 140% at 12% 0%, rgba(200,150,62,0.07), transparent 58%), var(--surface)",
        }}
      >
        <svg width={w} height={H} className="block" role="img" aria-label="One day of tremor probability from wrist sensors, with the patient's reported diary revealed behind it.">
          <defs>
            <linearGradient id="hd-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--seq-3)" stopOpacity={0.34} />
              <stop offset="100%" stopColor="var(--seq-1)" stopOpacity={0.05} />
            </linearGradient>
            <clipPath id="hd-sweep">
              <rect x={0} y={-PAD.t} width={clipW} height={H} />
            </clipPath>
            <filter id="hd-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${PAD.l},${PAD.t})`}>
            {[0, 0.5, 1].map((v) => (
              <line
                key={v}
                x1={0}
                x2={plotW}
                y1={plotH - v * plotH}
                y2={plotH - v * plotH}
                stroke="var(--axis)"
                strokeWidth={1}
                opacity={v === 0.5 ? 0.75 : 0.4}
                strokeDasharray={v === 0.5 ? "3 5" : undefined}
              />
            ))}

            {model && (
              <>
                {/* medication marks — reported, so they get the diamond */}
                {model.meds.map((mx, i) => (
                  <g key={i} opacity={0.75}>
                    <line x1={mx} y1={-6} x2={mx} y2={plotH} stroke="var(--ink)" strokeOpacity={0.28} strokeWidth={1} />
                    <polygon points={`${mx},-12 ${mx + 4.5},-6 ${mx},0 ${mx - 4.5},-6`} fill="var(--ink)" opacity={0.8} />
                  </g>
                ))}

                {/* the diary's own answer, swept in from the left */}
                <g clipPath="url(#hd-sweep)">
                  {model.rail.map((r, i) =>
                    r.v == null ? null : (
                      <rect
                        key={i}
                        x={r.x}
                        y={plotH + 10}
                        width={Math.max(2, model.step - 3)}
                        height={11}
                        rx={2}
                        fill={r.v === 1 ? "var(--s2-truth)" : "transparent"}
                        stroke="var(--s2-truth)"
                        strokeWidth={r.v === 1 ? 0 : 1.4}
                        opacity={r.v === 1 ? 1 : 0.5}
                      />
                    ),
                  )}
                </g>

                <path d={model.band ?? ""} fill="url(#hd-band)" />
                <path
                  d={model.trace ?? ""}
                  fill="none"
                  stroke="var(--seq-4)"
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  filter="url(#hd-glow)"
                />

                {/* the leading edge of the sweep */}
                {sweep > 0.004 && sweep < 0.999 && (
                  <line
                    x1={clipW}
                    y1={-10}
                    x2={clipW}
                    y2={plotH + 24}
                    stroke="var(--brass)"
                    strokeWidth={1.5}
                    opacity={0.85}
                  />
                )}
              </>
            )}
          </g>

          {/* legend, inside the frame where it belongs */}
          <g transform={`translate(${PAD.l},${16})`}>
            <rect x={0} y={-8} width={11} height={3} rx={1.5} fill="var(--seq-4)" />
            <text x={17} y={-4} fontSize={14} fill="var(--ink-2)">
              tremor probability, hourly
            </text>
            <rect x={200} y={-9} width={9} height={5} rx={1.5} fill="var(--s2-truth)" opacity={0.9} />
            <text x={215} y={-4} fontSize={14} fill="var(--ink-2)">
              what the diary said
            </text>
          </g>
        </svg>
      </div>

      {/*
        Deliberately not scored here.
        An agreement percentage for one participant-day would sit where the
        cohort claims above it sit, and be read as the headline result — but a
        single day of nineteen hours is far too small to carry that, and this
        particular day is the hardest one in the set. Quoting it would be
        misleading whichever direction it fell. The measured claims are above;
        the full scoring, with its comparator, is on the day view.
      */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="font-mono text-[15px]" style={{ color: "var(--ink-2)" }}>
          <span style={{ color: "var(--brass-hi)" }}>
            {revealed}
          </span>{" "}
          of {model?.hours.length ?? 0} hours revealed
        </p>
        <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
          COPS-29 · a participant the model never trained on · scored in full on{" "}
          <a href="/day" className="underline underline-offset-4" style={{ color: "var(--brass)" }}>
            the day view
          </a>
        </p>
      </div>
    </div>
  );
}
