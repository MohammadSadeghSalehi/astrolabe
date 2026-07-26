"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { area as d3area, line as d3line, curveStepAfter, curveMonotoneX } from "d3-shape";
import { getBundle } from "@/lib/source";
import type { Bundle } from "@/lib/contract";

/**
 * The hero: the product's central moment, running on its own.
 *
 * Prefers a day where the diary kinesia actually moves (COPS-28): reconstruction
 * MAP + interval band, with the diary truth sweeping in behind so agreement and
 * disagreement are visible. Falls back to tremor probability when kinesia is
 * fully declined (e.g. COPS-29).
 *
 * Everything is from a real held-out bundle — no invented posteriors.
 */

/** Default demo day — COPS-28 has the strongest diary swings in the set. */
export const DEMO_PARTICIPANT = "COPS-28";

const H = 300;
// Left pad must fit "dyskinesia" at the 14px type floor without clipping against
// the overflow:hidden frame (textAnchor=end sits just left of the plot).
// 10 chars x ~0.6em advance in Plex Mono = 84px, plus the 10px tick offset.
const PAD = { t: 26, r: 20, b: 42, l: 102 };

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
    getBundle(DEMO_PARTICIPANT)
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
      raf = requestAnimationFrame(() => setSweep(1));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const DUR = 2800;
    const DELAY = 450;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0 - DELAY) / DUR));
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

    const answered = hours.filter((s) => !s.abstain && s.state != null).length;
    const truthAll = bundle.truth ?? [];
    const hourTruth = idxs.map((i) => truthAll[i] ?? null);
    const truthNums = hourTruth.filter((v): v is number => typeof v === "number");
    const truthRange =
      truthNums.length > 0 ? Math.max(...truthNums) - Math.min(...truthNums) : 0;
    // Prefer kinesia when the model answers and the diary actually moves.
    const mode: "kinesia" | "tremor" =
      answered >= 4 && truthRange >= 2 ? "kinesia" : "tremor";

    const x = (i: number) => (i / (hours.length - 1)) * plotW;

    if (mode === "kinesia") {
      // Ordinal 0..6 → plot height
      const y = (state: number) => plotH - (state / 6) * plotH;
      const pts = hours.map((s, i) => ({
        i,
        map: s.state?.map ?? null,
        lo: s.state?.ci[0] ?? null,
        hi: s.state?.ci[1] ?? null,
        abstain: s.abstain || s.state == null,
        t: s.t,
        truth: hourTruth[i],
      }));

      const band = d3area<(typeof pts)[number]>()
        .defined((d) => !d.abstain && d.lo != null && d.hi != null)
        .x((d) => x(d.i))
        .y0((d) => y(d.hi === d.lo ? (d.lo as number) + 0.35 : (d.hi as number)))
        .y1((d) => y(d.hi === d.lo ? (d.lo as number) - 0.35 : (d.lo as number)))
        .curve(curveStepAfter)(pts);

      const trace = d3line<(typeof pts)[number]>()
        .defined((d) => !d.abstain && d.map != null)
        .x((d) => x(d.i))
        .y((d) => y(d.map as number))
        .curve(curveStepAfter)(pts);

      const truthLine = d3line<(typeof pts)[number]>()
        .defined((d) => d.truth != null)
        .x((d) => x(d.i))
        .y((d) => y(d.truth as number))
        .curve(curveMonotoneX)(pts);

      const meds = bundle.events
        .filter((e) => e.type === "medication")
        .map((e) => {
          const hh = Number(e.t.slice(0, 2));
          const j = hours.findIndex((s) => Number(s.t.slice(0, 2)) === hh);
          return j >= 0 ? x(j) : null;
        })
        .filter((v): v is number => v != null);

      return {
        mode,
        hours,
        band,
        trace,
        truthLine,
        meds,
        x,
        y,
        yTicks: [0, 3, 6] as const,
        yTickLabel: (v: number) =>
          v === 0 ? "akinesia" : v === 3 ? "good" : "dyskinesia",
        legendModel: "reconstructed kinesia",
        legendTruth: "diary kinesia",
      };
    }

    // Tremor fallback
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

    const tTruth = bundle.tremor_truth ?? [];
    const rail = idxs.map((orig, i) => ({
      i,
      v: tTruth[orig] ?? null,
      x: x(i),
    }));
    const step = plotW / Math.max(1, hours.length - 1);

    const meds = bundle.events
      .filter((e) => e.type === "medication")
      .map((e) => {
        const hh = Number(e.t.slice(0, 2));
        const j = hours.findIndex((s) => Number(s.t.slice(0, 2)) === hh);
        return j >= 0 ? x(j) : null;
      })
      .filter((v): v is number => v != null);

    return {
      mode: "tremor" as const,
      hours,
      band,
      trace,
      truthLine: null as string | null,
      rail,
      step,
      meds,
      x,
      y,
      yTicks: [0, 0.5, 1] as const,
      yTickLabel: (v: number) => String(v),
      legendModel: "tremor probability, hourly",
      legendTruth: "what the diary said",
    };
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
        <svg
          width={w}
          height={H}
          className="block"
          role="img"
          aria-label={
            model?.mode === "kinesia"
              ? "One day of reconstructed kinesia from wrist sensors, with the patient's diary revealed behind it."
              : "One day of tremor probability from wrist sensors, with the patient's reported diary revealed behind it."
          }
        >
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
            {model &&
              model.yTicks.map((v) => (
                <g key={v}>
                  <line
                    x1={0}
                    x2={plotW}
                    y1={model.y(v)}
                    y2={model.y(v)}
                    stroke="var(--axis)"
                    strokeWidth={1}
                    opacity={v === model.yTicks[1] ? 0.75 : 0.4}
                    strokeDasharray={v === model.yTicks[1] ? "3 5" : undefined}
                  />
                  {model.mode === "kinesia" && (
                    <text
                      x={-10}
                      y={model.y(v) + 4}
                      textAnchor="end"
                      fontSize={14}
                      fill="var(--ink-2)"
                      fontFamily="var(--font-mono)"
                      style={{ dominantBaseline: "middle" }}
                    >
                      {model.yTickLabel(v)}
                    </text>
                  )}
                </g>
              ))}

            {model && (
              <>
                {model.meds.map((mx, i) => (
                  <g key={i} opacity={0.75}>
                    <line
                      x1={mx}
                      y1={-6}
                      x2={mx}
                      y2={plotH}
                      stroke="var(--ink)"
                      strokeOpacity={0.28}
                      strokeWidth={1}
                    />
                    <polygon
                      points={`${mx},-12 ${mx + 4.5},-6 ${mx},0 ${mx - 4.5},-6`}
                      fill="var(--ink)"
                      opacity={0.8}
                    />
                  </g>
                ))}

                {/* Diary truth, swept in from the left */}
                <g clipPath="url(#hd-sweep)">
                  {model.mode === "kinesia" && model.truthLine && (
                    <path
                      d={model.truthLine}
                      fill="none"
                      stroke="var(--s2-truth)"
                      strokeWidth={2.4}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={0.95}
                    />
                  )}
                  {model.mode === "tremor" &&
                    "rail" in model &&
                    model.rail?.map((r, i) =>
                      r.v == null ? null : (
                        <rect
                          key={i}
                          x={r.x}
                          y={plotH + 10}
                          width={Math.max(2, (model.step ?? 8) - 3)}
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

          <g transform={`translate(${PAD.l},${16})`}>
            <rect x={0} y={-8} width={11} height={3} rx={1.5} fill="var(--seq-4)" />
            <text x={17} y={-4} fontSize={14} fill="var(--ink-2)">
              {model?.legendModel ?? "loading…"}
            </text>
            <rect
              x={model?.mode === "kinesia" ? 210 : 200}
              y={-9}
              width={9}
              height={5}
              rx={1.5}
              fill="var(--s2-truth)"
              opacity={0.9}
            />
            <text
              x={model?.mode === "kinesia" ? 225 : 215}
              y={-4}
              fontSize={14}
              fill="var(--ink-2)"
            >
              {model?.legendTruth ?? ""}
            </text>
          </g>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="font-mono text-[15px]" style={{ color: "var(--ink-2)" }}>
          <span style={{ color: "var(--brass-hi)" }}>{revealed}</span> of{" "}
          {model?.hours.length ?? 0} hours revealed
        </p>
        <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
          {DEMO_PARTICIPANT} · held-out participant · diary swings across the
          full kinesia scale · scored in full on{" "}
          <a
            href="/day"
            className="underline underline-offset-4"
            style={{ color: "var(--brass)" }}
          >
            the day view
          </a>
        </p>
      </div>
    </div>
  );
}
