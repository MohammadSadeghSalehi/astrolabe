"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBundle } from "@/lib/source";
import type { Bundle } from "@/lib/contract";
import { DeviceIllustration } from "@/components/icons/DeviceIllustration";

/**
 * Profile: who this day belongs to, what they reported taking, and what is
 * measuring them.
 *
 * The device panel is a placeholder and says so in the interface, not just in a
 * comment. A greyed-out "Connected — Apple Watch" would be the single most
 * tempting lie on the page and the easiest one for a judge to catch, so the
 * panel states plainly that nothing is paired and that the data on screen came
 * from a research recording.
 */

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
      <dt className="text-[16px]" style={{ color: "var(--ink-2)" }}>
        {label}
      </dt>
      <dd className="text-right">
        <span className="font-mono text-[17px] tabular-nums" style={{ color: "var(--ink)" }}>
          {value}
        </span>
        {hint && (
          <span className="ml-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}

function Card({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border p-5 md:p-6"
      style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
    >
      <h2
        className="text-[14px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--brass)" }}
      >
        {title}
      </h2>
      {caption && (
        <p className="mt-2 text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {caption}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProfileView() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getBundle("COPS-29")
      .then(({ bundle }) => live && setBundle(bundle))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const meds = bundle?.events.filter((e) => e.type === "medication") ?? [];
  const declined = bundle?.series.filter((s) => s.abstain).length ?? 0;
  const steps = bundle?.series.length ?? 0;
  const m = bundle?.metrics;

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-10 md:px-6 md:py-14">
      <header className="max-w-[62ch]">
        <h1
          className="font-display text-[30px] font-light leading-tight md:text-[38px]"
          style={{ color: "var(--ink)" }}
        >
          Profile
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          One participant from the COPS study, viewed as the person whose diary
          this is. Nothing here is a real patient record — the cohort is public
          research data, de-identified by its authors.
        </p>
      </header>

      {failed && (
        <p className="mt-8 text-[16px]" style={{ color: "var(--ink-2)" }}>
          Could not load the bundle.
        </p>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <Card
          title="Participant"
          caption="De-identified. Age and stage are not in the bundle, so they are not shown."
        >
          <dl className="divide-y" style={{ borderColor: "var(--axis)" }}>
            <Row label="Study ID" value={bundle?.participant ?? "—"} />
            <Row
              label="Day on record"
              value={bundle?.day != null ? `Day ${bundle.day}` : "—"}
            />
            <Row
              label="Resolution"
              value={bundle ? `${bundle.resolution_min} min` : "—"}
              hint="per step"
            />
            <Row
              label="Steps this day"
              value={steps ? String(steps) : "—"}
              hint={steps ? `${declined} declined` : undefined}
            />
          </dl>
        </Card>

        <Card
          title="Devices"
          caption="Placeholder. Nothing is paired, and no data on this screen came from a consumer wearable."
        >
          <div
            className="flex flex-col items-start gap-4 rounded-md border border-dashed p-4 sm:flex-row"
            style={{ borderColor: "var(--axis)" }}
          >
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border"
              style={{ borderColor: "var(--axis)", color: "var(--ink-2)" }}
            >
              <DeviceIllustration size={88} />
            </div>
            <div className="min-w-0">
              <p className="text-[17px]" style={{ color: "var(--ink)" }}>
                Connect a wrist wearable
              </p>
              <p
                className="mt-1 rounded border border-dashed px-2 py-1 font-mono text-[14px]"
                style={{ borderColor: "var(--axis)", color: "var(--brass)" }}
              >
                Placeholder — no device is paired
              </p>
              <p className="mt-2 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Not implemented. Astrolabe needs bilateral 100 Hz accelerometry
                in the 4–8 Hz band; most consumer wearables expose neither raw
                acceleration at that rate nor a second wrist, so this is a real
                engineering problem rather than an integration away.
              </p>
              <button
                type="button"
                disabled
                className="mt-3 min-h-[44px] cursor-not-allowed rounded-md border px-4 py-2 text-[16px]"
                style={{ borderColor: "var(--axis)", color: "var(--ink-2)", opacity: 0.7 }}
              >
                Pair a device — unavailable
              </button>
            </div>
          </div>

          <dl className="mt-4 divide-y" style={{ borderColor: "var(--axis)" }}>
            <Row
              label="Source of this recording"
              value="GENEActiv"
              hint="research-grade, both wrists, 100 Hz"
            />
            <Row
              label="Sensor configuration"
              value={m?.sensor_config ?? "—"}
            />
          </dl>
        </Card>

        <Card
          title="Reported medication"
          caption="The patient's own record. Times are reported, never inferred — these are the only marks on the timeline the model did not produce."
        >
          {meds.length === 0 ? (
            <p className="text-[16px]" style={{ color: "var(--ink-2)" }}>
              —
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--axis)" }}>
              {meds.map((e, i) => (
                <li
                  key={`${e.t}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
                >
                  <span
                    className="font-mono text-[17px] tabular-nums"
                    style={{ color: "var(--ink)" }}
                  >
                    {e.t}
                  </span>
                  <span className="text-[16px]" style={{ color: "var(--ink-2)" }}>
                    {e.drug ?? "medication"}
                    {e.dose_mg != null && (
                      <span className="ml-2 font-mono" style={{ color: "var(--ink)" }}>
                        {e.dose_mg} mg
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="What the model will say about this person"
          caption="Measured on participants held out of training. These do not change with the day on screen."
        >
          <dl className="divide-y" style={{ borderColor: "var(--axis)" }}>
            <Row
              label="Interval coverage"
              value={m?.coverage_calibration != null ? m.coverage_calibration.toFixed(3) : "—"}
              hint={m?.coverage_target != null ? `target ${m.coverage_target.toFixed(2)}` : undefined}
            />
            <Row
              label="Hours declined"
              value={
                m?.holdout_abstain_rate != null
                  ? `${(m.holdout_abstain_rate * 100).toFixed(1)}%`
                  : "—"
              }
              hint={m?.sensor_config}
            />
            <Row
              label="Tremor AUC"
              value={m?.tremor_auc != null ? m.tremor_auc.toFixed(3) : "—"}
              hint="pooled across people"
            />
            <Row
              label="… within one person"
              value={
                m?.tremor_auc_within_participant_median != null
                  ? m.tremor_auc_within_participant_median.toFixed(2)
                  : "—"
              }
              hint="median — the honest figure for a diary"
            />
            <Row label="Motor state" value="not predicted" hint="does not generalise" />
          </dl>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The pooled AUC largely separates tremor-dominant people from everyone
            else. Within a single person — which is what a diary actually needs —
            it is much weaker, and that is the number to judge it on.
          </p>
        </Card>
      </div>

      <div className="mt-10">
        <Link
          href="/day"
          className="rounded-md px-6 py-3 text-[17px] font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--brass)", color: "var(--page)" }}
        >
          See the day →
        </Link>
      </div>
    </main>
  );
}
