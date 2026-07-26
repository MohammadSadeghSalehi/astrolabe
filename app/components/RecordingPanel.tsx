"use client";

import type { Bundle } from "@/lib/contract";

/**
 * What this recording is, beside the chart it produced.
 *
 * This was a separate Profile tab built around a participant record, which put
 * a dataset row where a product expects a person and made the reader navigate
 * away from the only screen that matters. The parts that actually inform a
 * reading of the chart — what measured it, in which configuration, and what the
 * patient reported taking — belong next to the chart. The parts that were only
 * study metadata are gone rather than relocated.
 */

type Dose = { t: string; mg: number | null };

/** One row per medicine. A schedule is mostly one name repeated, and printing
 *  it nine times spends attention on the part that does not change. */
function groupMeds(events: Bundle["events"]) {
  const by = new Map<string, Dose[]>();
  for (const e of events) {
    if (e.type !== "medication") continue;
    const key = e.drug?.trim() || "Medicine";
    const list = by.get(key) ?? [];
    list.push({ t: e.t, mg: e.dose_mg ?? null });
    by.set(key, list);
  }
  return [...by.entries()].map(([name, doses]) => {
    const mgs = doses.map((d) => d.mg);
    const uniform =
      mgs.length > 0 && mgs.every((m) => m != null && m === mgs[0]) ? mgs[0]! : null;
    return {
      name,
      doses: [...doses].sort((a, b) => a.t.localeCompare(b.t)),
      uniform,
    };
  });
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt className="text-[15px]" style={{ color: "var(--ink-2)" }}>
        {label}
      </dt>
      <dd className="text-right">
        <span className="font-mono text-[16px] tabular-nums" style={{ color: "var(--ink)" }}>
          {value}
        </span>
        {hint && (
          <span className="ml-2 text-[14px]" style={{ color: "var(--ink-2)" }}>
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}

export function RecordingPanel({ bundle }: { bundle: Bundle | null }) {
  const meds = groupMeds(bundle?.events ?? []);
  const m = bundle?.metrics;
  const declined = bundle?.series.filter((s) => s.abstain).length ?? 0;
  const steps = bundle?.series.length ?? 0;
  const totalMg = (bundle?.events ?? [])
    .filter((e) => e.type === "medication")
    .reduce((a, e) => a + (e.dose_mg ?? 0), 0);

  return (
    <section
      className="glass glass-lit min-w-0 rounded-lg p-5 md:p-6"
      aria-label="About this recording"
    >
      <h2
        className="text-[14px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        This recording
      </h2>

      <dl className="mt-3 divide-y" style={{ borderColor: "var(--axis)" }}>
        <Line
          label="Measured by"
          value="GENEActiv"
          hint="both wrists, 100 Hz"
        />
        <Line label="Sensors active" value={m?.sensor_config ?? "—"} />
        <Line
          label="Steps"
          value={steps ? String(steps) : "—"}
          hint={steps ? `${declined} declined` : undefined}
        />
      </dl>

      <h3
        className="mt-6 text-[14px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        Reported medicine
      </h3>
      <p className="mt-1.5 text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
        The patient&apos;s own record — the only marks on the timeline the model
        did not produce.
      </p>

      {meds.length === 0 ? (
        <p className="mt-3 text-[15px]" style={{ color: "var(--ink-2)" }}>
          None reported.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-3.5">
            {meds.map((g) => (
              <li key={g.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-[15px]" style={{ color: "var(--ink)" }}>
                    {g.name}
                  </span>
                  <span className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                    {g.doses.length}&times;
                    {g.uniform != null && (
                      <span className="ml-1.5 font-mono" style={{ color: "var(--ink)" }}>
                        {g.uniform} mg
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  {g.doses.map((d, i) => (
                    <span
                      key={`${d.t}-${i}`}
                      className="font-mono text-[14px] tabular-nums"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {d.t}
                      {g.uniform == null && d.mg != null && (
                        <span style={{ color: "var(--ink)" }}>&nbsp;{d.mg}mg</span>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[14px]" style={{ color: "var(--ink-2)" }}>
            {(bundle?.events ?? []).filter((e) => e.type === "medication").length} doses ·{" "}
            {Number.isInteger(totalMg) ? totalMg : totalMg.toFixed(1)} mg total
          </p>
        </>
      )}
    </section>
  );
}
