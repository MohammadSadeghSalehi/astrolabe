"use client";

import type { EvidenceLayers as Layers } from "@/lib/store";

const ITEMS: { key: keyof Layers; label: string; hint: string }[] = [
  { key: "observed", label: "Observed", hint: "from the sensor" },
  { key: "reported", label: "Reported", hint: "medication marks" },
  { key: "reconstructed", label: "Inferred", hint: "model + band" },
];

export function EvidenceLayers({
  layers,
  onChange,
}: {
  layers: Layers;
  onChange: (l: Layers) => void;
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
        Evidence layers
      </h2>
      <div className="flex flex-col gap-2">
        {ITEMS.map(({ key, label, hint }) => {
          const on = layers[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...layers, [key]: !on })}
              className="flex min-h-[44px] items-center justify-between rounded-md border px-3 text-left text-[14px]"
              style={{
                borderColor: on ? "var(--brass)" : "var(--axis)",
                color: "var(--ink)",
                opacity: on ? 1 : 0.5,
              }}
              aria-pressed={on}
            >
              <span>
                {label}
                <span className="ml-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
                  {hint}
                </span>
              </span>
              <span className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
                {on ? "ON" : "OFF"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[13px]" style={{ color: "var(--ink-2)" }}>
        Turning inferred off should leave the chart sparse — that emptiness is the
        product.
      </p>
    </section>
  );
}
