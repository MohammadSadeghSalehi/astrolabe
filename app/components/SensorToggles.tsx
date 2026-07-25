"use client";

import type { SensorMask } from "@/lib/store";

export function SensorToggles({
  mask,
  onChange,
}: {
  mask: SensorMask;
  onChange: (m: SensorMask) => void;
}) {
  return (
    <section
      className="rounded-md border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
    >
      <h2
        className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        Sensors
      </h2>
      <div className="flex flex-wrap gap-3">
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
      <p className="mt-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
        Drop a wrist to load the stress bundle — bands widen, abstention rises.
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
      className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md border px-3 py-2 text-[14px] transition-none"
      style={{
        borderColor: on ? color : "var(--axis)",
        background: on ? "var(--page)" : "transparent",
        color: "var(--ink)",
        opacity: on ? 1 : 0.55,
      }}
      aria-pressed={on}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
      <span className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
