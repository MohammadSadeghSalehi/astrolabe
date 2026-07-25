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

const MARGIN = { top: 40, right: 28, bottom: 64, left: 64 };
const MIN_TICK_GAP_PX = 56;
const MIN_MED_LABEL_GAP_PX = 48;
const ABSTAIN_LABEL_MIN_W = 28;

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

  // Stabilize empty fallback — inline `?? []` allocates a new array every render
  const series = useMemo(() => bundle?.series ?? [], [bundle]);
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
    if (series.length === 0) return [] as { t: string; x: number; anchor: string }[];
    const step = Math.max(1, Math.floor(series.length / 7));
    const candidates: string[] = [];
    for (let i = 0; i < series.length; i += step) candidates.push(series[i]!.t);
    const last = series[series.length - 1]!.t;
    if (candidates[candidates.length - 1] !== last) candidates.push(last);

    // Drop ticks that would collide; always keep first; prefer keeping last with end anchor.
    const placed: { t: string; x: number; anchor: string }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i]!;
      const x = xScale(parseTime(t));
      const isLast = i === candidates.length - 1;
      const isFirst = placed.length === 0;
      if (!isFirst && !isLast) {
        const prev = placed[placed.length - 1]!;
        if (x - prev.x < MIN_TICK_GAP_PX) continue;
      }
      if (isLast && placed.length > 0) {
        const prev = placed[placed.length - 1]!;
        if (x - prev.x < MIN_TICK_GAP_PX) placed.pop();
      }
      placed.push({
        t,
        x,
        anchor: isLast ? "end" : isFirst ? "start" : "middle",
      });
    }
    return placed;
  }, [series, xScale]);

  /**
   * Med marks: diamonds always.
   * Labels are time-only under the diamond when they fit; dense clusters collapse
   * to a single "+N more" caption (brief B2).
   */
  const medLayout = useMemo(() => {
    type Item = {
      ev: (typeof meds)[number];
      x: number;
      showLabel: boolean;
      label: string;
    };
    const items: Item[] = meds.map((ev) => ({
      ev,
      x: xScale(parseTime(ev.t)),
      showLabel: false,
      label: ev.t,
    }));
    if (items.length === 0) return { items, overflow: null as null | { x: number; text: string } };

    // Greedy left-to-right placement of time labels
    let lastLabeledX = -Infinity;
    let hidden = 0;
    for (const it of items) {
      if (it.x - lastLabeledX >= MIN_MED_LABEL_GAP_PX) {
        it.showLabel = true;
        lastLabeledX = it.x;
      } else {
        hidden += 1;
      }
    }
    // Ensure first + last diamonds get a time if possible
    if (items.length >= 1) {
      items[0]!.showLabel = true;
    }
    if (items.length >= 2) {
      const last = items[items.length - 1]!;
      last.showLabel = true;
      // un-label previous if collision
      for (let i = items.length - 2; i >= 1; i--) {
        if (!items[i]!.showLabel) continue;
        if (last.x - items[i]!.x < MIN_MED_LABEL_GAP_PX) {
          items[i]!.showLabel = false;
          hidden += 1;
        }
        break;
      }
    }
    // Recount hidden after force first/last
    hidden = items.filter((it) => !it.showLabel).length;

    const overflow =
      hidden > 0
        ? {
            x: plotW / 2,
            text: `medication · ${items.length} doses · +${hidden} unlabeled`,
          }
        : null;

    return { items, overflow };
  }, [meds, xScale, plotW]);

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

  const totalRefusal =
    series.length > 0 && series.every((s) => s.abstain);
  /**
   * Both figures come from the bundle. The threshold was set on held-out
   * participants, so "0.55 against 0.58" is a statement about a rule fixed
   * before this day was seen — not a line tuned until the sentence read well.
   */
  const refusalDetail = useMemo(() => {
    const m = bundle?.metrics;
    const peak = m?.peak_confidence_max;
    const thr = m?.abstain_min_peak;
    if (peak == null || thr == null) return "confidence never cleared the threshold";
    return `peak confidence ${peak.toFixed(2)} · it answers at ${thr.toFixed(2)}`;
  }, [bundle?.metrics]);

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

          {/* X ticks — dense mono stays 13 */}
          {xTicks.map(({ t, x, anchor }) => (
            <text
              key={t}
              x={x}
              y={plotH + 20}
              textAnchor={anchor as "start" | "middle" | "end"}
              fill="var(--ink-2)"
              style={{
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: 13,
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

          {/*
            Abstention holes.
            totalRefusal: per-hour dashed vertical rhythm (not one giant empty box)
            + no per-run ABSTAINED pills (centrepiece + reveal pill own the caption lane).
            Partial abstain: dashed run boxes + up to 3 ABSTAINED pills.
          */}
          {!loading && layers.reconstructed && totalRefusal && (
            <g pointerEvents="none" aria-hidden>
              {series.map((p, i) => {
                // 10-min steps → tick every hour (:00)
                if (!p.t.endsWith(":00")) return null;
                const x = xScale(parseTime(p.t));
                return (
                  <line
                    key={`abs-tick-${p.t}-${i}`}
                    x1={x}
                    y1={4}
                    x2={x}
                    y2={plotH - 4}
                    stroke="var(--ink-2)"
                    strokeWidth={1.4}
                    strokeDasharray="5 6"
                    strokeOpacity={0.55}
                  />
                );
              })}
            </g>
          )}
          {!loading &&
            layers.reconstructed &&
            !totalRefusal &&
            (() => {
              const pad =
                series.length > 1
                  ? Math.abs(
                      xScale(parseTime(series[Math.min(1, series.length - 1)]!.t)) -
                        xScale(parseTime(series[0]!.t)),
                    ) / 2
                  : 8;
              const enriched = runs.map(([a, b], idx) => {
                const x0 = xScale(parseTime(series[a]!.t));
                const x1 = xScale(parseTime(series[b]!.t));
                const left = x0 - pad;
                const w = Math.max(12, x1 - x0 + pad * 2);
                return {
                  a,
                  b,
                  idx,
                  left,
                  w,
                  nPts: b - a + 1,
                  reason: series[a]!.reason ?? "",
                };
              });
              // Label at most 3 widest runs; drop a label if its pill would collide
              const pillW = 86;
              const labelSet = new Set<number>();
              const ranked = [...enriched].sort(
                (u, v) => v.w - u.w || v.nPts - u.nPts,
              );
              for (const r of ranked) {
                if (labelSet.size >= 3) break;
                if (r.w < ABSTAIN_LABEL_MIN_W && r.nPts < 2) continue;
                const cx = r.left + r.w / 2;
                const collides = [...labelSet].some((id) => {
                  const o = enriched[id]!;
                  const ocx = o.left + o.w / 2;
                  return Math.abs(cx - ocx) < pillW + 8;
                });
                if (!collides) labelSet.add(r.idx);
              }

              return enriched.map((r) => {
                const showTitle =
                  labelSet.has(r.idx) &&
                  (r.w >= ABSTAIN_LABEL_MIN_W || r.nPts >= 2);
                // Reason lives in the hover tooltip — never paint it on the chart
                const cx = r.left + r.w / 2;
                const pillX = Math.min(
                  Math.max(cx - pillW / 2, 0),
                  Math.max(0, plotW - pillW),
                );
                return (
                  <g key={`abs-${r.a}-${r.b}`}>
                    <rect
                      x={r.left}
                      y={0}
                      width={r.w}
                      height={plotH}
                      fill="none"
                      stroke="var(--ink-2)"
                      strokeWidth={1.6}
                      strokeDasharray="6 5"
                    />
                    {showTitle && (
                      // Sit in the top margin (negative y) so MAP/truth never cover it
                      <g transform={`translate(${pillX}, -18)`}>
                        <rect
                          width={pillW}
                          height={16}
                          rx={3}
                          fill="var(--page)"
                          stroke="var(--ink-2)"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                        />
                        <text
                          x={pillW / 2}
                          y={12}
                          textAnchor="middle"
                          fill="var(--ink)"
                          style={{
                            fontFamily:
                              "var(--font-mono), ui-monospace, monospace",
                            fontSize: 11,
                            letterSpacing: "0.08em",
                          }}
                        >
                          ABSTAINED
                        </text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}

          {/*
            Every step declined. Without this the plot is an empty frame, which
            reads as a rendering failure rather than as the model's answer. It
            IS the answer, so it gets stated in words with the two numbers that
            justify it — both read from the bundle, neither computed here.
          */}
          {!loading && totalRefusal && (
            <rect
              x={0}
              y={0}
              width={plotW}
              height={plotH}
              fill="url(#map-hatch)"
              opacity={0.1}
              pointerEvents="none"
            />
          )}

          {/* Medication events — diamonds always; times when they fit */}
          {!loading &&
            medLayout.items.map(({ ev, x, showLabel, label }, i) => (
              <g key={`med-${ev.t}-${i}`}>
                <line
                  x1={x}
                  y1={10}
                  x2={x}
                  y2={plotH}
                  stroke="var(--ink)"
                  strokeOpacity={0.55}
                  strokeWidth={1}
                />
                <polygon
                  points={`${x},2 ${x + 5},10 ${x},18 ${x - 5},10`}
                  fill="var(--ink)"
                />
                {showLabel && (
                  <text
                    x={Math.min(Math.max(x, 18), plotW - 18)}
                    y={plotH + 36}
                    textAnchor={x < 28 ? "start" : x > plotW - 28 ? "end" : "middle"}
                    fill="var(--ink-2)"
                    style={{
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </text>
                )}
              </g>
            ))}
          {!loading && medLayout.overflow && (
            <text
              x={medLayout.overflow.x}
              y={plotH + 52}
              textAnchor="middle"
              fill="var(--ink-2)"
              style={{
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: 13,
              }}
            >
              {medLayout.overflow.text}
            </text>
          )}

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

          {/* Reveal layer — last child under centrepiece */}
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

          {/*
            The refusal, stated last so it survives the reveal sweeping under
            it. Without this the plot is an empty frame and reads as a rendering
            failure rather than as the model's answer — and it IS the answer, so
            it gets said in words. Both numbers come from the bundle: the
            threshold was fixed on held-out participants before this day was
            seen, so "0.55 against 0.58" is a fact about a rule, not a line
            tuned until the sentence read well.
          */}
          {!loading && totalRefusal && (
            <g pointerEvents="none">
              <rect
                x={plotW / 2 - 224}
                y={plotH / 2 - 36}
                width={448}
                height={66}
                rx={4}
                fill="var(--surface)"
                opacity={0.9}
              />
              <text
                x={plotW / 2}
                y={plotH / 2 - 12}
                textAnchor="middle"
                fill="var(--ink)"
                style={{
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontSize: 15,
                  letterSpacing: "0.06em",
                }}
              >
                {`DECLINED ALL ${series.length} STEPS`}
              </text>
              <text
                x={plotW / 2}
                y={plotH / 2 + 10}
                textAnchor="middle"
                fill="var(--ink-2)"
                style={{
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontSize: 14,
                }}
              >
                {refusalDetail}
              </text>
              <text
                x={plotW / 2}
                y={plotH / 2 + 28}
                textAnchor="middle"
                fill="var(--ink-2)"
                style={{ fontSize: 14 }}
              >
                No motor state is shown because none was earned.
              </text>
            </g>
          )}
        </g>

        {/* Series identity — top-left of SVG, clear of the right-parked reveal pill */}
        {!loading && series.length > 0 && layers.reconstructed && (
          <g transform={`translate(${MARGIN.left}, 14)`}>
            <circle cx={4} cy={-3} r={3.5} fill="var(--s1-reconstructed)" />
            <text
              x={12}
              y={0}
              fill="var(--s1-reconstructed)"
              style={{
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                fontSize: 14,
              }}
            >
              reconstruction
            </text>
            {bundle?.truth && (
              <>
                <circle cx={138} cy={-3} r={3.5} fill="var(--s2-truth)" />
                <text
                  x={146}
                  y={0}
                  fill="var(--s2-truth)"
                  style={{
                    fontFamily: "var(--font-sans), system-ui, sans-serif",
                    fontSize: 14,
                  }}
                >
                  diary truth
                </text>
              </>
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
  const abstained = point.abstain || !point.state;
  const reason = point.reason ?? "insufficient evidence";
  // Wide enough for peak-probability reasons; never truncate the specific string
  const tw = abstained ? Math.min(320, Math.max(200, reason.length * 7 + 24)) : 168;
  const th = abstained ? 78 : 64;
  const flip = x > plotW - tw - 12;
  const tx = flip ? x - tw - 8 : x + 8;
  const name = abstained
    ? "Abstained"
    : (KINESIA_LABELS[point.state!.map] ?? `state ${point.state!.map}`);
  const evidence = EVIDENCE_WORDS[point.evidence] ?? point.evidence;
  const conf = `confidence ${point.confidence.toFixed(2)}`;

  return (
    <g transform={`translate(${tx}, 12)`}>
      <rect
        width={tw}
        height={th}
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
          fontSize: 14,
        }}
      >
        {name}
      </text>
      {abstained ? (
        <>
          <text
            x={10}
            y={54}
            fill="var(--ink-2)"
            style={{
              fontFamily: "var(--font-sans), system-ui, sans-serif",
              fontSize: 12,
            }}
          >
            {reason}
          </text>
          <text
            x={10}
            y={70}
            fill="var(--ink-2)"
            style={{
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            {conf}
          </text>
        </>
      ) : (
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
          {conf}
        </text>
      )}
    </g>
  );
}
