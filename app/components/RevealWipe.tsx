"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { line as d3line, curveMonotoneX } from "d3-shape";
import { animate } from "motion";
import type { SeriesPoint } from "@/lib/contract";
import { parseTime } from "@/lib/scales";

export type RevealWipeProps = {
  truth: number[] | undefined;
  series: SeriesPoint[];
  xScale: (t: Date) => number;
  yScale: (stateIndex: number) => number;
  plotWidth: number;
  plotHeight: number;
  revealX: number;
  onRevealX: (x: number) => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RevealWipe({
  truth,
  series,
  xScale,
  yScale,
  plotWidth,
  plotHeight,
  revealX,
  onRevealX,
}: RevealWipeProps) {
  const warned = useRef(false);
  const dragRef = useRef<{
    active: boolean;
    svgLeft: number;
  }>({ active: false, svgLeft: 0 });
  const [sweeping, setSweeping] = useState(false);
  // Stable SVG id — strip React useId colons (invalid in some SVG url(#) contexts)
  const reactId = useId();
  const clipId = `reveal-clip-${reactId.replace(/:/g, "")}`;

  const valid =
    Array.isArray(truth) &&
    truth.length > 0 &&
    truth.length === series.length;

  useEffect(() => {
    if (truth && truth.length !== series.length && !warned.current) {
      warned.current = true;
      console.warn(
        "[RevealWipe] truth.length !== series.length — hiding reveal",
        truth.length,
        series.length,
      );
    }
  }, [truth, series.length]);

  const truthPath = useMemo(() => {
    if (!valid || !truth) return "";
    const gen = d3line<number>()
      .x((_, i) => xScale(parseTime(series[i]!.t)))
      .y((v) => yScale(v))
      .curve(curveMonotoneX);
    return gen(truth) ?? "";
  }, [valid, truth, series, xScale, yScale]);

  const snapTargets = useMemo(() => {
    if (!valid) return [] as number[];
    return series.map((p) => xScale(parseTime(p.t)) / plotWidth);
  }, [valid, series, xScale, plotWidth]);

  const maeInfo = useMemo(() => {
    if (!valid || !truth || revealX <= 0) {
      return { label: "drag to reveal →", mae: null as number | null, hours: 0 };
    }
    const cut = revealX * plotWidth;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < series.length; i++) {
      const pt = series[i]!;
      const x = xScale(parseTime(pt.t));
      if (x > cut) break;
      if (pt.abstain || !pt.state) continue;
      sum += Math.abs(pt.state.map - truth[i]!);
      n += 1;
    }
    if (n === 0) {
      return { label: "drag to reveal →", mae: null, hours: 0 };
    }
    const mae = sum / n;
    // 10-min steps
    const stepMin = 10;
    const revealedHours = (n * stepMin) / 60;
    return {
      label: `MAE ${mae.toFixed(2)} · ${revealedHours.toFixed(1)}h revealed`,
      mae,
      hours: revealedHours,
    };
  }, [valid, truth, series, revealX, plotWidth, xScale]);

  const snapToNearest = useCallback(
    (x01: number) => {
      if (snapTargets.length === 0) return x01;
      let best = snapTargets[0]!;
      let bestD = Math.abs(best - x01);
      for (const t of snapTargets) {
        const d = Math.abs(t - x01);
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
      return best;
    },
    [snapTargets],
  );

  const onPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current.active = true;
    const hitBox = e.currentTarget.getBoundingClientRect();
    // Handle may be offset at rest (min hx); map clientX via hit-rect centre
    const displayHx = Math.max(revealX * plotWidth, revealX <= 0.001 ? 12 : 0);
    const plotLeft = hitBox.left + hitBox.width / 2 - displayHx;
    dragRef.current.svgLeft = plotLeft;

    const move = (clientX: number) => {
      const raw = (clientX - dragRef.current.svgLeft) / plotWidth;
      onRevealX(Math.min(1, Math.max(0, raw)));
    };
    move(e.clientX);

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current.active) return;
      move(ev.clientX);
    };
    const onUp = (ev: PointerEvent) => {
      dragRef.current.active = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const raw = (ev.clientX - dragRef.current.svgLeft) / plotWidth;
      const clamped = Math.min(1, Math.max(0, raw));
      const snapped = snapToNearest(clamped);
      if (prefersReducedMotion()) {
        onRevealX(snapped);
      } else {
        const from = clamped;
        animate(from, snapped, {
          duration: 0.12,
          onUpdate: (v) => onRevealX(v),
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    if (!valid) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();

      if (sweeping) {
        setSweeping(false);
        onRevealX(0);
        return;
      }

      // prefers-reduced-motion: instant cut to full reveal (drag still works)
      if (prefersReducedMotion()) {
        onRevealX(1);
        return;
      }

      setSweeping(true);
      const controls = animate(0, 1, {
        duration: 1.6,
        ease: [0.16, 1, 0.3, 1], // ease-out-ish
        onUpdate: (v) => onRevealX(v),
        onComplete: () => setSweeping(false),
      });
      void controls;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [valid, sweeping, onRevealX]);

  if (!valid) return null;

  // Clip uses true revealX; handle is nudged right at rest so it clears the y-axis labels
  const clipW = Math.max(0, revealX * plotWidth);
  const hx =
    revealX <= 0.001
      ? Math.max(clipW, 12)
      : clipW;
  // Wider pill for MAE string; park on right half at revealX≈0 so it never collides with left legend
  const pillW = revealX <= 0.001 ? 148 : 176;
  const legendClear = 210;
  let pillX: number;
  if (revealX <= 0.001) {
    // Always right half when parked
    pillX = Math.min(
      Math.max(plotWidth * 0.55 - pillW / 2, legendClear, plotWidth * 0.5),
      Math.max(0, plotWidth - pillW),
    );
  } else {
    pillX = Math.min(
      Math.max(hx - pillW / 2, 0),
      Math.max(0, plotWidth - pillW),
    );
  }

  return (
    <g id="reveal-wipe" style={{ pointerEvents: "all" }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={clipW} height={plotHeight} />
        </clipPath>
      </defs>

      {/* Truth — clipped to swept region (uncovered, not faded) */}
      <path
        d={truthPath}
        fill="none"
        stroke="var(--s2-truth)"
        strokeWidth={2.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        clipPath={`url(#${clipId})`}
        style={{ pointerEvents: "none" }}
      />

      {/* Handle rule */}
      <line
        x1={hx}
        y1={0}
        x2={hx}
        y2={plotHeight}
        stroke="var(--ink)"
        strokeWidth={2}
        style={{ pointerEvents: "none" }}
      />

      {/* Grip */}
      <g transform={`translate(${hx}, ${plotHeight / 2})`} style={{ pointerEvents: "none" }}>
        <rect
          x={-7}
          y={-15}
          width={14}
          height={30}
          rx={3}
          fill="var(--ink)"
        />
        <line x1={-2.5} y1={-8} x2={-2.5} y2={8} stroke="var(--page)" strokeWidth={1.4} />
        <line x1={2.5} y1={-8} x2={2.5} y2={8} stroke="var(--page)" strokeWidth={1.4} />
      </g>

      {/* Hit target ≥44px */}
      <rect
        x={hx - 22}
        y={0}
        width={44}
        height={plotHeight}
        fill="transparent"
        style={{ cursor: "col-resize" }}
        onPointerDown={onPointerDown}
      />

      {/* MAE pill — top caption lane, right-parked at rest */}
      <g transform={`translate(${pillX}, -28)`} style={{ pointerEvents: "none" }}>
        <rect
          width={pillW}
          height={22}
          rx={11}
          fill="var(--surface)"
          stroke="var(--brass)"
          strokeWidth={1}
        />
        <text
          x={pillW / 2}
          y={15}
          textAnchor="middle"
          fill="var(--brass-hi)"
          style={{
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {maeInfo.label}
        </text>
      </g>
    </g>
  );
}
