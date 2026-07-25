"use client";

import { useCallback, useEffect, useRef } from "react";
import { getBundle } from "@/lib/source";
import { useStore } from "@/lib/store";
import { Timeline } from "./Timeline";
import { PosteriorInspector } from "./PosteriorInspector";
import { SensorToggles } from "./SensorToggles";
import { MetricsPanel } from "./MetricsPanel";
import { EvidenceLayers } from "./EvidenceLayers";

export function DayView() {
  const {
    participant,
    bundle,
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
        const b = await getBundle(p, { nowrist });
        if (seq !== loadSeq.current) return;
        set({
          bundle: b,
          loading: false,
          revealX: 0,
          hour: null,
        });
      } catch (err) {
        console.error(err);
        if (seq !== loadSeq.current) return;
        set({ bundle: null, loading: false });
      }
    },
    [set],
  );

  useEffect(() => {
    void load(participant, mask);
  }, [participant, mask, load]);

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
    <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-[12px] uppercase tracking-[0.14em]"
            style={{ color: "var(--brass)" }}
          >
            Astrolabe
          </p>
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
        <div className="text-right text-[13px]" style={{ color: "var(--ink-2)" }}>
          <p>
            Drag the handle to reveal the diary · press{" "}
            <kbd
              className="rounded border px-1.5 py-0.5 font-mono text-[12px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
            >
              R
            </kbd>{" "}
            to auto-sweep
          </p>
          <p className="mt-1">
            <kbd
              className="rounded border px-1.5 py-0.5 font-mono text-[12px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
            >
              ←
            </kbd>{" "}
            <kbd
              className="rounded border px-1.5 py-0.5 font-mono text-[12px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
            >
              →
            </kbd>{" "}
            step hours
          </p>
        </div>
      </header>

      <div className="rule" />

      <section
        className="rounded-md border p-4 md:p-5"
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
          height={360}
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricsPanel bundle={bundle} />
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

      <footer className="pb-6 text-[13px]" style={{ color: "var(--ink-2)" }}>
        Offline demo path · bundles from{" "}
        <span className="font-mono">/public/bundles</span>
        {" · "}
        COPS data CC-BY 4.0 · not a medical device
      </footer>
    </div>
  );
}
