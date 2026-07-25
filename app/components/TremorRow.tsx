"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { area as d3area, line as d3line, curveStepAfter } from "d3-shape";
import type { Bundle } from "@/lib/contract";
import { makeXScale, parseTime } from "@/lib/scales";
import { useStore } from "@/lib/store";

/**
 * The tremor row.
 *
 * Two things are deliberate and neither is cosmetic.
 *
 * It is drawn as a STEP, not a curve. `tremor_p` changes once an hour because
 * the detector was trained on hourly means and the diary labels are hourly.
 * Interpolating it into a smooth line would draw a 10-minute resolution that
 * neither the model nor the ground truth possesses — the visual equivalent of
 * quoting a spurious decimal place.
 *
 * The revealed truth is scored against the MAJORITY-CLASS rate, side by side,
 * and on the demo participant the model loses that comparison. It is shown
 * losing. An interface that only displays its wins is not evidence of anything,
 * and the one claim this project makes is that its numbers can be trusted.
 */

// Must match Timeline's MARGIN so the two x-axes line up under each other.
const MARGIN = { top: 22, right: 28, bottom: 50, left: 64 };

/** Half-width of the confidence band at conf=0 (probability units). */
const CONF_BAND_MAX = 0.1;

export type TremorRowProps = {
  bundle: Bundle | null;
  /** 0..1, shared with the timeline handle so one drag uncovers both rows. */
  revealX: number;
  hour: number | null;
  height?: number;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Subscribed rather than set from an effect: writing state synchronously inside
 * an effect triggers a cascading render, and the server has no media query to
 * answer with, so it needs its own snapshot.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export function TremorRow({
  bundle,
  revealX,
  hour,
  height = 180,
}: TremorRowProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const reduced = usePrefersReducedMotion();
  const set = useStore((s) => s.set);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  // Memoised so the fallback is one stable array. `bundle?.series ?? []` mints a
  // fresh identity every render, which silently defeats every useMemo below it.
  const series = useMemo(() => bundle?.series ?? [], [bundle]);
  const truth = bundle?.tremor_truth;
  const plotW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const plotH = Math.max(30, height - MARGIN.top - MARGIN.bottom);

  const xScale = useMemo(
    () => makeXScale(series.map((s) => s.t), plotW),
    [series, plotW],
  );
  const y = useMemo(
    () => (p: number) => plotH - p * plotH,
    [plotH],
  );

  const hasP = series.some((s) => s.tremor_p != null);
  const hasConf = series.some(
    (s) => s.tremor_p != null && s.tremor_confidence != null,
  );

  const pathP = useMemo(() => {
    if (!hasP) return "";
    const gen = d3line<(typeof series)[number]>()
      .defined((d) => d.tremor_p != null)
      .x((d) => xScale(parseTime(d.t)))
      .y((d) => y(d.tremor_p!))
      .curve(curveStepAfter);
    return gen(series) ?? "";
  }, [series, xScale, y, hasP]);

  const areaP = useMemo(() => {
    if (!hasP) return "";
    const gen = d3area<(typeof series)[number]>()
      .defined((d) => d.tremor_p != null)
      .x((d) => xScale(parseTime(d.t)))
      .y0(plotH)
      .y1((d) => y(d.tremor_p!))
      .curve(curveStepAfter);
    return gen(series) ?? "";
  }, [series, xScale, y, plotH, hasP]);

  /**
   * Thin band around the step line: half-width shrinks with tremor_confidence
   * (distance from a coin flip). Absent confidence → no band.
   */
  const confBand = useMemo(() => {
    if (!hasConf) return "";
    const gen = d3area<(typeof series)[number]>()
      .defined((d) => d.tremor_p != null && d.tremor_confidence != null)
      .x((d) => xScale(parseTime(d.t)))
      .y0((d) => {
        const conf = d.tremor_confidence ?? 0;
        const half = (1 - conf) * CONF_BAND_MAX;
        return y(Math.max(0, d.tremor_p! - half));
      })
      .y1((d) => {
        const conf = d.tremor_confidence ?? 0;
        const half = (1 - conf) * CONF_BAND_MAX;
        return y(Math.min(1, d.tremor_p! + half));
      })
      .curve(curveStepAfter);
    return gen(series) ?? "";
  }, [series, xScale, y, hasConf]);

  /** Contiguous runs of the diary's own tremor answer, for the truth rail. */
  const truthRuns = useMemo(() => {
    if (!truth || truth.length !== series.length) return [];
    const runs: { x0: number; x1: number; v: number }[] = [];
    let i = 0;
    while (i < series.length) {
      const v = truth[i];
      if (v == null) {
        i += 1;
        continue;
      }
      const start = i;
      while (i < series.length && truth[i] === v) i += 1;
      runs.push({
        x0: xScale(parseTime(series[start]!.t)),
        x1: xScale(parseTime(series[i - 1]!.t)),
        v,
      });
    }
    return runs;
  }, [truth, series, xScale]);

  /**
   * Score only what the handle has actually uncovered, against the constant
   * that would have been right most often over that same stretch.
   */
  const revealed = useMemo(() => {
    if (!truth || truth.length !== series.length || revealX <= 0) return null;
    const cut = revealX * plotW;
    let n = 0;
    let correct = 0;
    let positives = 0;
    for (let i = 0; i < series.length; i++) {
      if (xScale(parseTime(series[i]!.t)) > cut) break;
      const p = series[i]!.tremor_p;
      const t = truth[i];
      if (p == null || t == null) continue;
      n += 1;
      positives += t;
      if ((p > 0.5 ? 1 : 0) === t) correct += 1;
    }
    if (n === 0) return null;
    const prevalence = positives / n;
    return {
      n,
      accuracy: correct / n,
      majority: Math.max(prevalence, 1 - prevalence),
      hours: (n * (bundle?.resolution_min ?? 10)) / 60,
    };
  }, [truth, series, revealX, plotW, xScale, bundle?.resolution_min]);

  const nearestIndex = (clientX: number, svg: SVGSVGElement) => {
    if (series.length === 0) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    const px = local.x - MARGIN.left;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < series.length; i++) {
      const x = xScale(parseTime(series[i]!.t));
      const d = Math.abs(x - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const cursorX =
    hour != null && series[hour] ? xScale(parseTime(series[hour]!.t)) : null;
  const cursorP = hour != null ? series[hour]?.tremor_p ?? null : null;
  const cursorTruth =
    hour != null && truth && truth.length === series.length ? truth[hour] : null;

  const clipW = Math.max(0, revealX * plotW);
  const railY = plotH + 8;

  // The wrapper always mounts, even before a bundle arrives. Returning null
  // ahead of it would leave `wrapRef` unattached, and since the ResizeObserver
  // effect runs once on mount it would never measure — the chart would render
  // at its 800px fallback while the timeline above spans the full container,
  // and the two x-axes would silently stop lining up.
  return (
    <div ref={wrapRef} className="relative w-full">
      {!hasP ? null : (
        <>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p
          className="font-mono text-[14px] tracking-wide"
          style={{ color: "var(--ink)" }}
        >
          TREMOR{" "}
          <span style={{ color: "var(--ink-2)" }}>
            · model output · hourly resolution
          </span>
        </p>
        <p className="font-mono text-[14px]" style={{ color: "var(--ink-2)" }}>
          {revealed ? (
            <>
              <span style={{ color: "var(--ink)" }}>
                {(revealed.accuracy * 100).toFixed(0)}%
              </span>{" "}
              correct vs{" "}
              <span style={{ color: "var(--ink)" }}>
                {(revealed.majority * 100).toFixed(0)}%
              </span>{" "}
              for always-guessing ·{" "}
              {revealed.hours.toFixed(1)}h revealed
            </>
          ) : (
            "drag the handle above to reveal the diary"
          )}
        </p>
      </div>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Tremor probability against the reported diary"
        className="block select-none"
        onPointerMove={(e) => {
          if (series.length === 0) return;
          const i = nearestIndex(e.clientX, e.currentTarget);
          if (i != null) set({ hour: i });
        }}
        onPointerLeave={() => set({ hour: null })}
      >
        <defs>
          <clipPath id="tremor-reveal">
            <rect x={0} y={-MARGIN.top} width={clipW} height={height} />
          </clipPath>
          <linearGradient id="tremor-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--seq-3)" stopOpacity={0.42} />
            <stop offset="100%" stopColor="var(--seq-1)" stopOpacity={0.06} />
          </linearGradient>
          {/* Light diagonal hatch for truth=0 so hollow runs stay visible in greyscale */}
          <pattern
            id="tremor-none-hatch"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={6}
              stroke="var(--s2-truth)"
              strokeWidth={1.25}
              strokeOpacity={0.55}
            />
          </pattern>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line
                x1={0}
                x2={plotW}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--axis)"
                strokeWidth={1}
                strokeDasharray={v === 0.5 ? "3 4" : undefined}
                opacity={v === 0.5 ? 0.9 : 0.55}
              />
              <text
                x={-10}
                y={y(v) + 4}
                textAnchor="end"
                className="font-mono"
                fontSize={14}
                fill="var(--ink-2)"
              >
                {v === 0.5 ? "0.5" : v.toFixed(0)}
              </text>
            </g>
          ))}

          <path d={areaP} fill="url(#tremor-fill)" />
          {confBand && (
            <path
              d={confBand}
              fill="var(--seq-4)"
              fillOpacity={0.18}
              stroke="none"
            />
          )}
          {/* Draws itself left to right on load. The state row above is busy
              declining every step; this is the one trajectory the model will
              commit to, and drawing it makes that contrast a sequence rather
              than two things that were simply already on screen.

              pathLength={1} renormalises the path to unit length, so the dash
              and offset are exact without measuring the DOM — guessing an upper
              bound makes the stroke clear its dash early and the reveal finishes
              before the line does. */}
          <path
            key={pathP}
            className="astro-draw"
            pathLength={1}
            style={
              {
                "--astro-draw-len": "1",
                strokeDasharray: 1,
              } as React.CSSProperties
            }
            d={pathP}
            fill="none"
            stroke="var(--seq-4)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/*
            The diary's own answer, uncovered by the same handle that drives the
            state row. Filled = tremor reported; hatched light fill = none —
            both survive greyscale and a projector (hue alone is never the cue).
          */}
          <g clipPath="url(#tremor-reveal)">
            {truthRuns.map((r, i) => (
              <rect
                key={i}
                x={r.x0}
                y={railY}
                width={Math.max(2, r.x1 - r.x0)}
                height={9}
                rx={2}
                fill={
                  r.v === 1 ? "var(--s2-truth)" : "url(#tremor-none-hatch)"
                }
                stroke="var(--s2-truth)"
                strokeWidth={1.25}
                opacity={r.v === 1 ? 0.95 : 0.85}
              />
            ))}
          </g>
          {/* The key sits outside the clip: it explains the rail, so it has to
              be readable before anything has been uncovered. */}
          {truthRuns.length > 0 && (
            <text
              x={0}
              y={railY + 24}
              className="font-mono"
              fontSize={14}
              fill="var(--ink-2)"
            >
              diary — filled = tremor reported, hatched = none
            </text>
          )}

          {cursorX != null && (
            <g>
              <line
                x1={cursorX}
                x2={cursorX}
                y1={0}
                y2={plotH}
                stroke="var(--brass)"
                strokeWidth={1}
                opacity={0.7}
              />
              {cursorP != null && (
                <circle
                  cx={cursorX}
                  cy={y(cursorP)}
                  r={4.5}
                  fill="var(--seq-5)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  style={
                    reduced ? undefined : { transition: "cy 120ms ease-out" }
                  }
                />
              )}
            </g>
          )}
        </g>

        {cursorP != null && (
          <text
            x={width - MARGIN.right}
            y={16}
            textAnchor="end"
            className="font-mono"
            fontSize={14}
            fill="var(--ink)"
          >
            p(tremor) {cursorP.toFixed(2)}
            {cursorTruth != null && (
              <tspan fill="var(--s2-truth)">
                {"  ·  diary "}
                {cursorTruth === 1 ? "tremor" : "none"}
              </tspan>
            )}
          </text>
        )}
      </svg>
        </>
      )}
    </div>
  );
}
