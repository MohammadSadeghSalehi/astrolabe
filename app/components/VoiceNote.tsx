"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { BundleEvent } from "@/lib/contract";
import { useStore } from "@/lib/store";

/** Mirrors extract route + demo note.json */
export type ExtractedEvent = {
  type: "medication" | "symptom" | "unknown";
  t: string | null;
  drug: string | null;
  dose_mg: number | null;
  note: string;
  confidence: "high" | "low";
};

type Progress = "idle" | "transcribing" | "understanding" | "confirm" | "added";

type Draft = {
  type: "medication" | "symptom" | "unknown";
  t: string;
  drug: string;
  dose_mg: string;
  note: string;
  confidence: "high" | "low";
};

const emptyDraft = (): Draft => ({
  type: "medication",
  t: "",
  drug: "",
  dose_mg: "",
  note: "",
  confidence: "high",
});

function isOfflineDemo(): boolean {
  const m = process.env.NEXT_PUBLIC_DEMO_MODE;
  return m !== "online" && m !== "supabase";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractionToDraft(e: ExtractedEvent): Draft {
  return {
    type: e.type,
    t: e.t ?? "",
    drug: e.drug ?? "",
    dose_mg: e.dose_mg != null ? String(e.dose_mg) : "",
    note: e.note ?? "",
    confidence: e.confidence,
  };
}

function draftToEvent(d: Draft): BundleEvent | null {
  const t = d.t.trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (hh > 23 || mm > 59) return null;
  const tNorm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

  const doseRaw = d.dose_mg.trim();
  const dose_mg =
    doseRaw === "" ? undefined : Number.isFinite(Number(doseRaw))
      ? Number(doseRaw)
      : undefined;

  const type =
    d.type === "unknown" ? "note" : d.type === "symptom" ? "symptom" : "medication";

  const ev: BundleEvent = {
    t: tNorm,
    type,
    source: "reported",
  };
  if (d.drug.trim()) ev.drug = d.drug.trim();
  if (dose_mg != null) ev.dose_mg = dose_mg;
  return ev;
}

export function VoiceNote() {
  const bundle = useStore((s) => s.bundle);
  const set = useStore((s) => s.set);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<Progress>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [lowFlag, setLowFlag] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    clearTimer();
    stopStream();
    mediaRef.current?.state !== "inactive" && mediaRef.current?.stop();
  }, [clearTimer, stopStream]);

  const commitEvent = useCallback(
    (d: Draft) => {
      const ev = draftToEvent(d);
      if (!ev) {
        setError("Time is required as HH:MM before adding.");
        setLowFlag(true);
        timeInputRef.current?.focus();
        return false;
      }
      const b = useStore.getState().bundle;
      if (!b) {
        setError("No day loaded yet.");
        return false;
      }
      set({
        bundle: {
          ...b,
          events: [...b.events, ev],
        },
      });
      setProgress("added");
      setError(null);
      setTimeout(() => {
        setProgress("idle");
        setDraft(emptyDraft());
        setTranscript(null);
        setLowFlag(false);
      }, 1200);
      return true;
    },
    [set],
  );

  const runPipeline = useCallback(
    async (audioBlob: Blob | null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setError(null);

      try {
        let text: string;
        let extraction: ExtractedEvent;

        if (isOfflineDemo()) {
          setProgress("transcribing");
          await sleep(700);
          // Optional silent fetch of note.webm if present (demo asset)
          try {
            await fetch("/demo/note.webm", { method: "HEAD" });
          } catch {
            /* clip optional */
          }
          const res = await fetch("/demo/note.json", { cache: "no-store" });
          if (!res.ok) throw new Error("demo note missing");
          const demo = (await res.json()) as {
            text: string;
            extraction: ExtractedEvent;
          };
          text = demo.text;
          setTranscript(text);

          setProgress("understanding");
          await sleep(700);
          extraction = demo.extraction;
        } else {
          if (!audioBlob) throw new Error("no audio");

          setProgress("transcribing");
          const fd = new FormData();
          fd.append(
            "audio",
            audioBlob,
            `note.${audioBlob.type.includes("webm") ? "webm" : "bin"}`,
          );
          const tr = await fetch("/api/transcribe", {
            method: "POST",
            body: fd,
          });
          const trBody = (await tr.json()) as { text?: string; error?: string };
          if (!tr.ok || !trBody.text) {
            throw new Error(trBody.error || "transcription failed");
          }
          text = trBody.text;
          setTranscript(text);

          setProgress("understanding");
          const dayISO =
            bundle?.day != null
              ? `day ${bundle.day}`
              : new Date().toISOString().slice(0, 10);
          const er = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: text, dayISO }),
          });
          const erBody = (await er.json()) as ExtractedEvent & {
            error?: string;
          };
          if (!er.ok || erBody.error) {
            throw new Error(erBody.error || "extraction failed");
          }
          extraction = {
            type: erBody.type,
            t: erBody.t,
            drug: erBody.drug,
            dose_mg: erBody.dose_mg,
            note: erBody.note,
            confidence: erBody.confidence,
          };
        }

        const next = extractionToDraft(extraction);
        setDraft(next);
        setProgress("confirm");
        if (extraction.confidence === "low" || !extraction.t) {
          setLowFlag(true);
          // Focus time after paint
          requestAnimationFrame(() => timeInputRef.current?.focus());
        } else {
          setLowFlag(false);
        }
      } catch (err) {
        console.error("[VoiceNote]", err);
        setError(
          err instanceof Error
            ? err.message
            : "Voice path failed — use typed entry below.",
        );
        setProgress("idle");
      } finally {
        busyRef.current = false;
      }
    },
    [bundle?.day],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    if (isOfflineDemo()) {
      // Offline: mic still optional for the beat, but we can demo without hardware
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stopStream();
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        void runPipeline(blob);
      };
      rec.start();
      setRecording(true);
      setElapsed(0);
      clearTimer();
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      console.error(err);
      setError("Microphone denied — type the note instead.");
      setRecording(false);
    }
  }, [clearTimer, runPipeline, stopStream]);

  const stopRecording = useCallback(() => {
    clearTimer();
    setRecording(false);
    if (isOfflineDemo()) {
      void runPipeline(null);
      return;
    }
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      stopStream();
    }
  }, [clearTimer, runPipeline, stopStream]);

  const onTypedSubmit = (e: FormEvent) => {
    e.preventDefault();
    const d: Draft = {
      ...draft,
      confidence: draft.t.trim() ? draft.confidence : "low",
    };
    if (!d.note.trim() && !d.drug.trim()) {
      setError("Add a short note or drug name.");
      return;
    }
    if (!d.note.trim() && d.drug.trim()) {
      d.note = `${d.drug}${d.dose_mg ? ` ${d.dose_mg}mg` : ""}`.trim();
    }
    commitEvent(d);
  };

  const onAccept = () => {
    commitEvent(draft);
  };

  const onDiscard = () => {
    setProgress("idle");
    setDraft(emptyDraft());
    setTranscript(null);
    setLowFlag(false);
    setError(null);
  };

  const progressLabel =
    progress === "transcribing"
      ? "transcribing…"
      : progress === "understanding"
        ? "understanding…"
        : progress === "added"
          ? "added"
          : progress === "confirm"
            ? "review before adding"
            : null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const processing =
    progress === "transcribing" || progress === "understanding";

  return (
    <section
      className="rounded-md border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--axis)" }}
      aria-label="Voice note"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-[13px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--brass)" }}
        >
          Voice note
        </h2>
        {isOfflineDemo() && (
          <span
            className="font-mono text-[12px]"
            style={{ color: "var(--ink-2)" }}
          >
            offline demo
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Mic column */}
        <div className="flex shrink-0 flex-col items-start gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={processing || progress === "confirm"}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-medium disabled:opacity-50"
              style={{
                borderColor: "var(--brass)",
                color: "var(--ink)",
                background: "transparent",
              }}
              aria-label="Start recording"
            >
              <MicIcon />
              Record
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-medium"
              style={{
                borderColor: "var(--s5-tremor)",
                color: "var(--ink)",
                background: "rgba(172, 83, 69, 0.15)",
              }}
              aria-label="Stop recording"
            >
              <StopIcon />
              Stop · {mm}:{ss}
            </button>
          )}

          {progressLabel && (
            <p
              className="font-mono text-[13px]"
              style={{ color: "var(--brass-hi)" }}
              aria-live="polite"
            >
              {progressLabel}
            </p>
          )}
        </div>

        {/* Typed form — always visible (primary path) */}
        <form
          onSubmit={onTypedSubmit}
          className="min-w-0 flex-1 space-y-3"
        >
          {transcript && progress === "confirm" && (
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              <span style={{ color: "var(--ink)" }}>Heard: </span>
              <span className="italic">&ldquo;{transcript}&rdquo;</span>
            </p>
          )}

          {lowFlag && (
            <p
              className="rounded border px-3 py-2 text-[14px]"
              style={{
                borderColor: "var(--brass)",
                color: "var(--brass-hi)",
                background: "rgba(200, 150, 62, 0.08)",
              }}
              role="status"
            >
              Please check this — time or details may need a fix.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[13px]" style={{ color: "var(--ink-2)" }}>
              Type
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    type: e.target.value as Draft["type"],
                  }))
                }
                className="mt-1 min-h-[44px] w-full rounded border bg-transparent px-3 text-[14px]"
                style={{
                  borderColor: "var(--axis)",
                  color: "var(--ink)",
                }}
              >
                <option value="medication">Medication</option>
                <option value="symptom">Symptom</option>
                <option value="unknown">Note</option>
              </select>
            </label>

            <label className="block text-[13px]" style={{ color: "var(--ink-2)" }}>
              Time (HH:MM)
              <input
                ref={timeInputRef}
                type="text"
                inputMode="numeric"
                placeholder="14:00"
                value={draft.t}
                onChange={(e) => setDraft((d) => ({ ...d, t: e.target.value }))}
                className="mt-1 min-h-[44px] w-full rounded border bg-transparent px-3 font-mono text-[14px]"
                style={{
                  borderColor: lowFlag ? "var(--brass)" : "var(--axis)",
                  color: "var(--ink)",
                }}
                autoComplete="off"
              />
            </label>

            <label className="block text-[13px]" style={{ color: "var(--ink-2)" }}>
              Drug
              <input
                type="text"
                value={draft.drug}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, drug: e.target.value }))
                }
                className="mt-1 min-h-[44px] w-full rounded border bg-transparent px-3 text-[14px]"
                style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
                placeholder="Levodopa"
              />
            </label>

            <label className="block text-[13px]" style={{ color: "var(--ink-2)" }}>
              Dose (mg)
              <input
                type="text"
                inputMode="decimal"
                value={draft.dose_mg}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, dose_mg: e.target.value }))
                }
                className="mt-1 min-h-[44px] w-full rounded border bg-transparent px-3 font-mono text-[14px]"
                style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
                placeholder="100"
              />
            </label>
          </div>

          <label className="block text-[13px]" style={{ color: "var(--ink-2)" }}>
            Note
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="mt-1 min-h-[44px] w-full rounded border bg-transparent px-3 text-[14px]"
              style={{ borderColor: "var(--axis)", color: "var(--ink)" }}
              placeholder="Took dose late…"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {progress === "confirm" ? (
              <>
                <button
                  type="button"
                  onClick={onAccept}
                  className="inline-flex min-h-[44px] items-center rounded-md px-4 text-[14px] font-medium"
                  style={{
                    background: "var(--brass)",
                    color: "var(--page)",
                  }}
                >
                  Accept &amp; add
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  className="inline-flex min-h-[44px] items-center rounded-md border px-4 text-[14px]"
                  style={{ borderColor: "var(--axis)", color: "var(--ink-2)" }}
                >
                  Discard
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={processing || recording}
                className="inline-flex min-h-[44px] items-center rounded-md border px-4 text-[14px] font-medium disabled:opacity-50"
                style={{
                  borderColor: "var(--axis)",
                  color: "var(--ink)",
                }}
              >
                Add typed entry
              </button>
            )}
          </div>
        </form>
      </div>

      {error && (
        <p
          className="mt-3 text-[14px]"
          style={{ color: "var(--s5-tremor)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="mt-3 text-[12px]" style={{ color: "var(--ink-2)" }}>
        Reported events appear as diamonds on the timeline. Confirm before
        commit — nothing is invented when voice fails.
      </p>
    </section>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6 11a6 6 0 0 0 12 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 17v3M9 20h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="10" height="10" rx="1.5" />
    </svg>
  );
}
