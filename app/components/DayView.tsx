"use client";

import { useCallback, useEffect, useRef } from "react";
import { getBundle, subscribeEvents } from "@/lib/source";
import type { BundleEvent } from "@/lib/contract";
import { useStore } from "@/lib/store";
import { Timeline } from "./Timeline";
import { TremorRow } from "./TremorRow";
import { PosteriorInspector } from "./PosteriorInspector";
import { SensorToggles } from "./SensorToggles";
import { MetricsPanel } from "./MetricsPanel";
import { SelectivePredictionChart } from "./SelectivePredictionChart";
import { EvidenceLayers } from "./EvidenceLayers";
import { VoiceNote } from "./VoiceNote";

function isOfflineDemo(): boolean {
  const m = process.env.NEXT_PUBLIC_DEMO_MODE;
  return m !== "online" && m !== "supabase";
}

export function DayView() {
  const {
    participant,
    bundle,
    origin,
    fellBack,
    loading,
    hour,
    mask,
    revealX,
    layers,
    set,
  } = useStore();

  const loadSeq = useRef(0);

  const load = useCallback(
    async (p: string, m: { left: boolean; right: boolean }) => {
      const seq = ++loadSeq.current;
      set({ loading: true });
      try {
        // Stress case: any wrist dropped → nowrist bundle (matches handoff)
        const nowrist = !m.left || !m.right;
        const { bundle: b, origin, fellBack } = await getBundle(p, { nowrist });
        if (seq !== loadSeq.current) return;
        set({
          bundle: b,
          origin,
          fellBack,
          loading: false,
          revealX: 0,
          hour: null,
        });
      } catch (err) {
        console.error(err);
        if (seq !== loadSeq.current) return;
        set({ bundle: null, origin: null, fellBack: false, loading: false });
      }
    },
    [set],
  );

  useEffect(() => {
    void load(participant, mask);
  }, [participant, mask, load]);

  // Supabase realtime: voice/typed events inserted elsewhere appear as diamonds.
  // Offline DEMO_MODE skips the subscription entirely.
  useEffect(() => {
    if (isOfflineDemo()) return;
    if (!bundle?.participant) return;
    const day = bundle.day ?? 0;
    const unsub = subscribeEvents(bundle.participant, day, (row) => {
      const b = useStore.getState().bundle;
      if (!b || b.participant !== row.participant) return;
      if (row.day != null && b.day != null && row.day !== b.day) return;

      const ev: BundleEvent = {
        t: row.t,
        type: row.type,
        source: (row.source as BundleEvent["source"]) || "reported",
      };
      if (row.drug) ev.drug = row.drug;
      if (row.dose_mg != null) ev.dose_mg = Number(row.dose_mg);

      const dup = b.events.some(
        (e) => e.t === ev.t && e.type === ev.type && e.drug === ev.drug,
      );
      if (dup) return;
      set({ bundle: { ...b, events: [...b.events, ev] } });
    });
    return unsub;
  }, [bundle?.participant, bundle?.day, set]);

  // Keyboard: step hours, space play (light), R handled in RevealWipe
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const n = bundle?.series.length ?? 0;
      if (n === 0) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const h = hour == null ? n - 1 : Math.max(0, hour - 1);
        set({ hour: h });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const h = hour == null ? 0 : Math.min(n - 1, hour + 1);
        set({ hour: h });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bundle, hour, set]);

  const dayLabel =
    bundle?.day != null ? `day ${bundle.day}` : "one day";

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-1 flex-col gap-6 px-5 py-8 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            {/* Monoline mark (inline so no next/image domain config) */}
            <span
              className="inline-block h-7 w-7 shrink-0"
              style={{
                backgroundColor: "var(--brass)",
                mask: "url(/brand/astrolabe-mark.svg) center / contain no-repeat",
                WebkitMask:
                  "url(/brand/astrolabe-mark.svg) center / contain no-repeat",
              }}
              aria-hidden
            />
            <p
              className="text-[14px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--brass)" }}
            >
              Astrolabe
            </p>
          </div>
          <h1
            className="font-display mt-1 text-[32px] font-light leading-tight"
            style={{ color: "var(--ink)" }}
          >
            Read the hours you couldn&apos;t record
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
            <span className="font-mono" style={{ color: "var(--ink)" }}>
              {participant}
            </span>
            {" · "}
            {dayLabel}
            {" · "}
            reconstruction with calibrated uncertainty
          </p>
        </div>
        <div className="text-right text-[15px]" style={{ color: "var(--ink-2)" }}>
          <p>
            Drag the handle to reveal the diary · press{" "}
            <kbd
              className="rounded border px-1.5 py-0.5 font-mono text-[14px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
            >
              R
            </kbd>{" "}
            to auto-sweep
          </p>
          <p className="mt-1">
            <kbd
              className="rounded border px-1.5 py-0.5 font-mono text-[14px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
            >
              ←
            </kbd>{" "}
            <kbd
              className="rounded border px-1.5 py-0.5 font-mono text-[14px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
            >
              →
            </kbd>{" "}
            step hours
            {" · "}
            <a href="/clinician" style={{ color: "var(--brass)" }}>
              Clinician handoff
            </a>
          </p>
        </div>
      </header>

      <div className="rule" />

      <section
        className="min-w-0 rounded-md border p-4 md:p-5"
        style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
      >
        <Timeline
          bundle={bundle}
          loading={loading}
          mask={mask}
          layers={layers}
          hour={hour}
          revealX={revealX}
          onRevealX={(x) => set({ revealX: x })}
          onHover={(i) => set({ hour: i })}
          onSelect={(i) => set({ hour: i })}
          height={380}
        />

        {/*
          Separate row, own y-axis, same x-scale and margins as the timeline
          above. Two claims of different kinds never share an axis: the state
          row is a 7-point ordinal scale the model declines to predict, this one
          is a probability it will stand behind.
        */}
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--axis)" }}>
          <TremorRow bundle={bundle} revealX={revealX} hour={hour} />
        </div>
      </section>

      {/*
        Metrics need room for held-out vs day split + selective curve.
        Full-width pair under the timeline; inspector/controls stay below.
      */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <MetricsPanel bundle={bundle} />
        <SelectivePredictionChart bundle={bundle} />
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <PosteriorInspector bundle={bundle} hour={hour} />
        <SensorToggles
          mask={mask}
          onChange={(m) => set({ mask: m })}
        />
        <EvidenceLayers
          layers={layers}
          onChange={(l) => set({ layers: l })}
        />
      </div>

      {/* Track E — voice note; mounts under day chrome, does not rewrite Timeline */}
      <VoiceNote />

      {/*
        Reports where this bundle actually came from, not what DEMO_MODE was set
        to. Those differ exactly when something is wrong — a bad key or a missing
        grant drops every request onto the local fallback while the env var still
        says `supabase` — and a footer reading the env var would sit there
        claiming a database it never reached. Not a caption worth getting wrong
        in a project whose whole argument is that what is displayed is checkable.
      */}
      <footer className="pb-6 text-[16px]" style={{ color: "var(--ink-2)" }}>
        {origin === "supabase" ? (
          <>
            Online · bundles from Supabase ·{" "}
            <span className="font-mono">realtime events</span>
          </>
        ) : origin === "local" ? (
          <>
            {fellBack ? "Supabase unreachable — local fallback" : "Offline demo path"}
            {" · bundles from "}
            <span className="font-mono">/public/bundles</span>
          </>
        ) : (
          <>Loading bundle…</>
        )}
        {" · "}
        COPS data CC-BY 4.0 · not a medical device
      </footer>
    </div>
  );
}
