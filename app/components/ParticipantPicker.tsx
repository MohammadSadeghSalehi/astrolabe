"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UPLOAD_KEY } from "@/lib/source";

/**
 * Pick a real participant and run the pipeline on their day.
 *
 * These are people from a public research cohort, not personas. There are no
 * invented names, no photographs and no illustrated faces — a cartoon face over
 * someone's real medical recording would be both false and tasteless. The card
 * carries the study ID and what their day actually contains, and every line of
 * it is computed from the bundle by ml/scripts/make_manifest.py rather than
 * written by hand, so it cannot drift from the data.
 */

type Entry = {
  participant: string;
  file: string;
  day: number | null;
  steps: number;
  hours: number;
  tremor_prevalence: number | null;
  abstain_rate: number | null;
  medications: number;
  summary: string;
};

/** A ring of 24 hour-segments filled to this participant's own prevalence —
 *  the same system for everyone, differing only where their data differs. */
function DayRing({ filled, size = 46 }: { filled: number; size?: number }) {
  const seg = 24;
  const r = size / 2 - 4;
  const c = size / 2;
  const n = Math.round(filled * seg);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {Array.from({ length: seg }, (_, i) => {
        const a0 = (i / seg) * Math.PI * 2 - Math.PI / 2;
        const on = i < n;
        return (
          <line
            key={i}
            x1={c + Math.cos(a0) * (r - 5)}
            y1={c + Math.sin(a0) * (r - 5)}
            x2={c + Math.cos(a0) * r}
            y2={c + Math.sin(a0) * r}
            stroke={on ? "var(--seq-4)" : "var(--axis)"}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function ParticipantPicker() {
  const router = useRouter();
  const [list, setList] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/bundles/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setList(j?.participants ?? []))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, []);

  const load = useCallback(
    async (e: Entry) => {
      setBusy(e.participant);
      try {
        const res = await fetch(`/bundles/${e.file}`, { cache: "no-store" });
        const bundle = await res.json();
        sessionStorage.setItem(UPLOAD_KEY, JSON.stringify(bundle));
        router.push("/day");
      } catch {
        setBusy(null);
      }
    },
    [router],
  );

  if (list && list.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(list ?? Array.from({ length: 4 }, () => null)).map((e, i) =>
        e == null ? (
          <div
            key={i}
            className="h-[122px] animate-pulse rounded-lg border"
            style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
          />
        ) : (
          <button
            key={e.participant}
            type="button"
            onClick={() => void load(e)}
            disabled={busy != null}
            className="group min-w-0 rounded-lg border p-4 text-left transition-colors"
            style={{
              borderColor: busy === e.participant ? "var(--brass)" : "var(--axis)",
              background: "var(--surface)",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0" style={{ opacity: 0.95 }}>
                <DayRing filled={e.tremor_prevalence ?? 0} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block font-mono text-[16px]"
                  style={{ color: "var(--ink)" }}
                >
                  {e.participant}
                  {e.day != null && (
                    <span style={{ color: "var(--ink-2)" }}> · day {e.day}</span>
                  )}
                </span>
                <span
                  className="mt-1 block text-[15px] leading-snug"
                  style={{ color: "var(--ink-2)" }}
                >
                  {e.summary}
                </span>
                <span
                  className="mt-2 block text-[15px]"
                  style={{ color: "var(--brass)" }}
                >
                  {busy === e.participant ? "Loading…" : "Run the pipeline →"}
                </span>
              </span>
            </div>
          </button>
        ),
      )}
    </div>
  );
}
