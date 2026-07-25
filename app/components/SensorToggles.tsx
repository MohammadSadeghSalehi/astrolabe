"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import type { SensorMask } from "@/lib/store";
import { useStore } from "@/lib/store";
import { usePrefersReducedMotion } from "@/lib/prefers-reduced-motion";

/**
 * Sensor mask is the live beat of the demo: both day bundles abstain 100% on
 * the timeline, so the held-out abstain rate is what sells the toggle. Values
 * come from the loaded bundle's metrics — never hard-coded.
 */
export function SensorToggles({
  mask,
  onChange,
}: {
  mask: SensorMask;
  onChange: (m: SensorMask) => void;
}) {
  const bundle = useStore((s) => s.bundle);
  const m = bundle?.metrics;
  const holdout = m?.holdout_abstain_rate;
  const intervalMass = m?.interval_mass;
  const reducedMotion = usePrefersReducedMotion();

  const [displayHoldout, setDisplayHoldout] = useState(holdout ?? 0);
  const displayRef = useRef(holdout ?? 0);

  useEffect(() => {
    if (holdout == null || reducedMotion) return;
    const from = displayRef.current;
    if (from === holdout) return;
    const controls = animate(from, holdout, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        displayRef.current = v;
        setDisplayHoldout(v);
      },
    });
    return () => controls.stop();
  }, [holdout, reducedMotion]);

  // Instant cut under prefers-reduced-motion — no tween.
  const shownHoldout = reducedMotion
    ? (holdout ?? 0)
    : displayHoldout;

  const holdoutLabel =
    holdout != null ? `${(shownHoldout * 100).toFixed(1)}%` : "—";

  return (
    <section
      className="rounded-md border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
    >
      <h2
        className="mb-3 text-[15px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        Sensors
      </h2>

      {/* Held-out abstain — the number that moves when a wrist drops */}
      <div className="mb-3">
        <p
          className="text-[14px] uppercase tracking-wide"
          style={{ color: "var(--ink-2)" }}
        >
          Hold-out abstain
        </p>
        <p
          className="font-mono text-[28px] tabular-nums leading-tight tracking-tight"
          style={{ color: "var(--brass-hi)" }}
          aria-live="polite"
        >
          {holdoutLabel}
        </p>
        {intervalMass != null && (
          <p
            className="mt-1 font-mono text-[15px] tabular-nums"
            style={{ color: "var(--ink-2)" }}
          >
            interval mass{" "}
            <span style={{ color: "var(--ink)" }}>{intervalMass.toFixed(2)}</span>
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Toggle
          label="Left wrist"
          color="var(--s3-wrist-left)"
          on={mask.left}
          onClick={() => onChange({ ...mask, left: !mask.left })}
        />
        <Toggle
          label="Right wrist"
          color="var(--s4-wrist-right)"
          on={mask.right}
          onClick={() => onChange({ ...mask, right: !mask.right })}
        />
      </div>

      <p
        className="mt-3 text-[15px] italic leading-snug"
        style={{ color: "var(--ink-2)" }}
      >
        same error budget — with one wrist it can only meet it by answering less.
      </p>
    </section>
  );
}

function Toggle({
  label,
  color,
  on,
  onClick,
}: {
  label: string;
  color: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] min-w-0 flex-1 basis-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-[14px] transition-none"
      style={{
        borderColor: on ? color : "var(--axis)",
        background: on ? "var(--page)" : "transparent",
        color: "var(--ink)",
        opacity: on ? 1 : 0.55,
      }}
      aria-pressed={on}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="truncate">{label}</span>
      <span
        className="shrink-0 font-mono text-[14px]"
        style={{ color: "var(--ink-2)" }}
      >
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
