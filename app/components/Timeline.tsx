"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { area as d3area, line as d3line, curveMonotoneX } from "d3-shape";
import type { Bundle, SeriesPoint } from "@/lib/contract";
import { EVIDENCE_WORDS, KINESIA_LABELS } from "@/lib/contract";
import { makeXScale, makeYScale, parseTime } from "@/lib/scales";
import type { EvidenceLayers, SensorMask } from "@/lib/store";
import { RevealWipe } from "./RevealWipe";

export type TimelineProps = {
  bundle: Bundle | null;
  loading?: boolean;
  mask: SensorMask;
  layers: EvidenceLayers;
  hour: number | null;
  revealX: number;
  onRevealX: (x: number) => void;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
  height?: number;
};

const MARGIN = { top: 36, right: 24, bottom: 48, left: 64 };

function formatYLabel(i: number): string {
  const score = i - 3;
  if (score === 0) return "0  good";
  return `${score > 0 ? "+" : ""}${score}`;
}

/** Maximal runs of abstained points → [startIdx, endIdx] inclusive. */
function abstainRuns(series: SeriesPoint[]): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < series.length) {
    if (!series[i]!.abstain) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < series.length && series[i]!.abstain) i += 1;
    runs.push([start, i - 1]);
  }
  return runs;
}

export function Timeline({
  bundle,
  loading = false,
  mask,
  layers,
  hour,
  revealX,
  onRevealX,
  onHover,
  onSelect,
  height = 320,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

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

  const series = bundle?.series ?? [];
  const plotW = Math.max(40, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const xScale = useMemo(
    () => makeXScale(series.map((s) => s.t), plotW),
    [series, plotW],
  );
  const yScale = useMemo(() => makeYScale(plotH), [plotH]);

  const bandPath = useMemo(() => {
    if (!layers.reconstructed || series.length === 0) return "";
    const gen = d3area<SeriesPoint>()
      .defined((d) => !d.abstain && d.state != null)
      .x((d) => xScale(parseTime(d.t)))
      .y0((d) => {
        const lo = d.state!.ci[0];
        const hi = d.state!.ci[1];
        // half-step padding when ci is a point
        return yScale(hi === lo ? lo + 0.35 : hi);
      })
      .y1((d) => {
        const lo = d.state!.ci[0];
        const hi = d.state!.ci[1];
        return yScale(hi === lo ? lo - 0.35 : lo);
      })
      .curve(curveMonotoneX);
    return gen(series) ?? "";
  }, [series, xScale, yScale, layers.reconstructed]);

  const mapPath = useMemo(() => {
    if (!layers.reconstructed || series.length === 0) return "";
    const gen = d3line<SeriesPoint>()
      .defined((d) => !d.abstain && d.state != null)
      .x((d) => xScale(parseTime(d.t)))
      .y((d) => yScale(d.state!.map))
      .curve(curveMonotoneX);
    return gen(series) ?? "";
  }, [series, xScale, yScale, layers.reconstructed]);

  const runs = useMemo(() => abstainRuns(series), [series]);

  const meds = useMemo(() => {
    if (!layers.reported || !bundle) return [];
    return bundle.events.filter((e) => e.type === "medication");
  }, [bundle, layers.reported]);

  const xTicks = useMemo(() => {
    if (series.length === 0) return [] as string[];
    const step = Math.max(1, Math.floor(series.length / 8));
    const ticks: string[] = [];
    for (let i = 0; i < series.length; i += step) ticks.push(series[i]!.t);
    const last = series[series.length - 1]!.t;
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }, [series]);

  const nearestIndex = (clientX: number, svg: SVGSVGElement) => {
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

  const cursor = hour != null && series[hour] ? series[hour] : null;
  const cursorX =
    cursor != null ? xScale(parseTime(cursor.t)) : null;

  const wristDropped = !mask.left || !mask.right;
  const empty = !loading && series.length === 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      {wristDropped && (
        <p
          className="mb-2 font-mono text-[13px] tracking-wide"
          style={{ color: "var(--ink-2)" }}
        >
          {!mask.left && !mask.right
            ? "BOTH WRISTS DROPPED · intervals widened"
            : !mask.left
              ? "LEFT WRIST DROPPED · intervals widened"
              : "RIGHT WRIST DROPPED · intervals widened"}
        </p>
      )}

      {empty && (
        <p
          className="absolute inset-0 flex items-center justify-center font-mono text-[14px]"
          style={{ color: "var(--ink-2)" }}
        >
          No data for this day.
        </p>
      )}

      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Motor state timeline"
        className="block select-none"
        onPointerMove={(e) => {
          if (series.length === 0) return;
          const i = nearestIndex(e.clientX, e.currentTarget);
          if (i != null) onHover(i);
        }}
        onPointerLeave={() => onHover(null)}
        onClick={(e) => {
          if (series.length === 0) return;
          const i = nearestIndex(e.clientX, e.currentTarget);
          if (i != null) onSelect(i);
        }}
      >
        <defs>
          <pattern
            id="map-hatch"
            width={9}
            height={9}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={9}
              stroke="var(--s1-reconstructed)"
              strokeWidth={2}
              strokeOpacity={0.55}
            />
          </pattern>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grid */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <g key={i}>
              <line
                x1={0}
                y1={yScale(i)}
                x2={plotW}
                y2={yScale(i)}
                stroke={i === 3 ? "var(--axis)" : "var(--grid)"}
                strokeWidth={i === 3 ? 1.4 : 1}
              />
              <text
                x={-10}
                y={yScale(i)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-2)"
                style={{
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontSize: 14,
                }}
              >
                {formatYLabel(i)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTicks.map((t) => (
            <text
              key={t}
              x={xScale(parseTime(t))}
              y={plotH + 22}
              textAnchor="middle"
              fill="var(--ink-2)"
              style={{
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: 14,
              }}
            >
              {t}
            </text>
          ))}

          {/* Skeleton only when loading — axes/grid already drawn */}
          {!loading && layers.reconstructed && (
            <>
              <path
                d={bandPath}
                fill="var(--s1-reconstructed)"
                fillOpacity={0.17}
                stroke="none"
              />
              {/* Hatch underlay for MAP */}
              <path
                d={mapPath}
                fill="none"
                stroke="url(#map-hatch)"
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={mapPath}
                fill="none"
                stroke="var(--s1-reconstructed)"
                strokeWidth={2}
                strokeDasharray="7 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Abstention holes */}
          {!loading &&
            layers.reconstructed &&
            runs.map(([a, b]) => {
              const x0 = xScale(parseTime(series[a]!.t));
              const x1 = xScale(parseTime(series[b]!.t));
              // half-step padding so the hole has visible width for single points
              const pad =
                series.length > 1
                  ? Math.abs(
                      xScale(parseTime(series[Math.min(1, series.length - 1)]!.t)) -
                        xScale(parseTime(series[0]!.t)),
                    ) / 2
                  : 8;
              const left = x0 - pad;
              const w = Math.max(12, x1 - x0 + pad * 2);
              const reason = series[a]!.reason ?? "";
              const label =
                reason.length > 42 ? `${reason.slice(0, 40)}…` : reason;
              return (
                <g key={`abs-${a}-${b}`}>
                  <rect
                    x={left}
                    y={0}
                    width={w}
                    height={plotH}
                    fill="none"
                    stroke="var(--ink-2)"
                    strokeWidth={1.6}
                    strokeDasharray="6 5"
                  />
                  <text
                    x={left + w / 2}
                    y={14}
                    textAnchor="middle"
                    fill="var(--ink)"
                    style={{
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                      fontSize: 11,
                      letterSpacing: "0.06em",
                    }}
                  >
                    ABSTAINED
                  </text>
                  {label && (
                    <text
                      x={left + w / 2}
                      y={28}
                      textAnchor="middle"
                      fill="var(--ink-2)"
                      style={{
                        fontFamily: "var(--font-sans), system-ui, sans-serif",
                        fontSize: 11,
                      }}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Medication events */}
          {!loading &&
            meds.map((ev, i) => {
              const x = xScale(parseTime(ev.t));
              const label = `${ev.t} ${ev.drug ?? "med"}${
                ev.dose_mg != null ? ` ${ev.dose_mg}mg` : ""
              }`;
              // Collapse: skip labels that would overlap previous (simple)
              const showLabel = i === 0 || i === meds.length - 1 || i % 2 === 0;
              return (
                <g key={`med-${ev.t}-${i}`}>
                  <line
                    x1={x}
                    y1={8}
                    x2={x}
                    y2={plotH}
                    stroke="var(--ink)"
                    strokeOpacity={0.55}
                    strokeWidth={1}
                  />
                  {/* filled diamond on hairline — reported evidence */}
                  <polygon
                    points={`${x},2 ${x + 5},10 ${x},18 ${x - 5},10`}
                    fill="var(--ink)"
                  />
                  {showLabel && (
                    <text
                      x={x}
                      y={plotH + 38}
                      textAnchor="middle"
                      fill="var(--ink-2)"
                      style={{
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                        fontSize: 11,
                      }}
                    >
                      {label.length > 28 ? `${label.slice(0, 26)}…` : label}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Cursor */}
          {cursorX != null && cursor && (
            <g style={{ pointerEvents: "none" }}>
              <line
                x1={cursorX}
                y1={0}
                x2={cursorX}
                y2={plotH}
                stroke="var(--ink)"
                strokeWidth={1}
                strokeOpacity={0.7}
              />
              <Tooltip
                x={cursorX}
                plotW={plotW}
                point={cursor}
              />
            </g>
          )}

          {/* Reveal layer — last child */}
          <g id="reveal-layer">
            {!loading && bundle && (
              <RevealWipe
                truth={bundle.truth}
                series={series}
                xScale={xScale}
                yScale={yScale}
                plotWidth={plotW}
                plotHeight={plotH}
                revealX={revealX}
                onRevealX={onRevealX}
              />
            )}
          </g>
        </g>

        {/* Direct labels for series identity */}
        {!loading && series.length > 0 && layers.reconstructed && (
          <g transform={`translate(${MARGIN.left},${MARGIN.top - 14})`}>
            <text
              x={0}
              y={0}
              fill="var(--s1-reconstructed)"
              style={{
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                fontSize: 13,
              }}
            >
              reconstruction
            </text>
            {bundle?.truth && (
              <text
                x={130}
                y={0}
                fill="var(--s2-truth)"
                style={{
                  fontFamily: "var(--font-sans), system-ui, sans-serif",
                  fontSize: 13,
                }}
              >
                diary truth
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

function Tooltip({
  x,
  plotW,
  point,
}: {
  x: number;
  plotW: number;
  point: SeriesPoint;
}) {
  const flip = x > plotW - 140;
  const tw = 168;
  const tx = flip ? x - tw - 8 : x + 8;
  const name =
    point.abstain || !point.state
      ? "Abstained"
      : (KINESIA_LABELS[point.state.map] ?? `state ${point.state.map}`);
  const evidence = EVIDENCE_WORDS[point.evidence] ?? point.evidence;
  const detail = point.abstain
    ? (point.reason ?? "insufficient evidence")
    : `confidence ${point.confidence.toFixed(2)}`;

  return (
    <g transform={`translate(${tx}, 12)`}>
      <rect
        width={tw}
        height={64}
        rx={4}
        fill="var(--surface)"
        stroke="var(--axis)"
        strokeWidth={1}
      />
      <text
        x={10}
        y={18}
        fill="var(--ink)"
        style={{
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: 13,
        }}
      >
        {point.t}
      </text>
      <text
        x={10}
        y={36}
        fill="var(--ink)"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        {name}
      </text>
      <text
        x={10}
        y={52}
        fill="var(--ink-2)"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 12,
        }}
      >
        {evidence}
        {" · "}
        {detail.length > 28 ? `${detail.slice(0, 26)}…` : detail}
      </text>
    </g>
  );
}
