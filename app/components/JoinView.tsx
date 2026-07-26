"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UPLOAD_KEY } from "@/lib/source";
import { ParticipantPicker } from "@/components/ParticipantPicker";
import { VisitorCount } from "@/components/VisitorCount";
import type { Bundle } from "@/lib/contract";

/**
 * Sign-up and upload for the hackathon demonstration.
 *
 * The status of this page is stated before anything is asked for, not after and
 * not in a link nobody opens. It was built during a two-day event, the data may
 * be deleted when the event ends, and it makes no clinical claim. Someone with
 * Parkinson's deciding whether to hand over a recording deserves to know all
 * three before they type, and consent is a deliberate action rather than a
 * pre-ticked box.
 *
 * The upload never leaves the browser. It is parsed, validated, and held in
 * sessionStorage for as long as the tab is open. We do not want a copy.
 */

const TERMS = [
  "This is a prototype built during a hackathon. It is not a medical device, and nothing it shows is a diagnosis, a dosing recommendation, or clinical advice.",
  "Its predictions come with measured uncertainty and it declines to answer where the evidence is weak. Even where it does answer, do not act on it — take nothing here to a treatment decision.",
  "Sign-up data may be deleted without notice when the event ends. Do not treat this as a service that will still exist next week.",
  "Uploaded recordings are read in your browser and held only for this session. They are not transmitted to us and not stored on our servers.",
];

type Status =
  | { k: "idle" }
  | { k: "busy" }
  | { k: "ok"; msg: string }
  | { k: "err"; msg: string };

/** Structural check. Anything that renders must have these or the day view breaks. */
function validateBundle(v: unknown): { ok: true; bundle: Bundle } | { ok: false; why: string } {
  if (!v || typeof v !== "object") return { ok: false, why: "That file is not a JSON object." };
  const b = v as Record<string, unknown>;
  if (!Array.isArray(b.series) || b.series.length === 0)
    return { ok: false, why: "No `series` array — this is not an Astrolabe bundle." };
  if (typeof b.participant !== "string")
    return { ok: false, why: "No `participant` field." };
  if (!b.metrics || typeof b.metrics !== "object")
    return { ok: false, why: "No `metrics` object." };
  const first = b.series[0] as Record<string, unknown>;
  if (typeof first?.t !== "string" || typeof first?.abstain !== "boolean")
    return { ok: false, why: "Steps need a `t` time and an `abstain` flag." };
  return { ok: true, bundle: v as Bundle };
}

export function JoinView() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>({ k: "idle" });
  const [upload, setUpload] = useState<Status>({ k: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setStatus({ k: "busy" });
      try {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: String(fd.get("email") ?? ""),
            role: String(fd.get("role") ?? ""),
            note: String(fd.get("note") ?? ""),
            acceptedTerms: accepted,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setStatus({ k: "err", msg: body.error ?? "Could not sign you up." });
          return;
        }
        setStatus({
          k: "ok",
          msg: "Thank you — we have your email and nothing else. We will delete it when the event ends.",
        });
      } catch {
        setStatus({ k: "err", msg: "Network error. Nothing was stored." });
      }
    },
    [accepted],
  );

  const takeFile = useCallback(
    async (file: File) => {
      setUpload({ k: "busy" });
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const check = validateBundle(parsed);
        if (!check.ok) {
          setUpload({ k: "err", msg: check.why });
          return;
        }
        sessionStorage.setItem(UPLOAD_KEY, JSON.stringify(check.bundle));
        const n = check.bundle.series.length;
        setUpload({
          k: "ok",
          msg: `Loaded ${check.bundle.participant} — ${n} steps. Opening it…`,
        });
        setTimeout(() => router.push("/day"), 700);
      } catch {
        setUpload({ k: "err", msg: "That file is not valid JSON." });
      }
    },
    [router],
  );

  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-12 md:px-6 md:py-16">
      <header className="max-w-[68ch]">
        <p
          className="inline-block rounded border border-dashed px-2.5 py-1 font-mono text-[14px]"
          style={{ borderColor: "var(--brass)", color: "var(--brass)" }}
        >
          Hackathon prototype · not a medical device
        </p>
        <h1
          className="font-display mt-5 text-[34px] font-light leading-[1.08] md:text-[48px]"
          style={{ color: "var(--ink)" }}
        >
          Run it on a real day
        </h1>
        <p className="mt-4 text-[18px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Pick someone from the research cohort and watch the whole pipeline
          work on their recording — the interval, the refusals, the diary
          revealed behind it. Nothing is simulated.
        </p>
        <div className="mt-4">
          <VisitorCount />
        </div>
      </header>

      {/* ── the thing that actually works, first ───────────────────────── */}
      <section className="mt-10">
        <h2 className="text-[20px] font-medium" style={{ color: "var(--ink)" }}>
          Choose a participant
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-[16px]" style={{ color: "var(--ink-2)" }}>
          Real recordings from the COPS cohort. Each was held out of training,
          so what you see is the model meeting them for the first time.
        </p>
        <div className="mt-5">
          <ParticipantPicker />
        </div>
      </section>

      {/* Two short cards beside each other, and the tall one beneath spanning
          the full width. Three equal columns put a ~1200px consent panel next
          to two ~350px ones and left a black void the height of a laptop
          screen under the left two thirds of the page. Height mismatch is a
          layout decision, not a content problem. */}
      <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
        {/* ── pair a device ────────────────────────────────────────────────
            This was the one place the product promised a future and showed
            nothing — a dashed rectangle with a mark in it. The photograph is
            the two research bands this model was actually trained on, beside
            the consumer watch that comes closest today, all three with their
            sensor windows catching the same light. It says what the sentence
            underneath says, before the sentence is read. */}
        <section
          className="min-w-0 overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
        >
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/device-pairing.png"
              alt="Two research-grade accelerometer wristbands beside an Apple Watch lying face-down, sensor arrays visible."
              className="block aspect-[3/2] w-full object-cover"
            />
            {/* The card's own surface rising into the bottom of the picture, so
                the heading below it is not sitting on a hard photographic edge. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/5"
              style={{
                background:
                  "linear-gradient(to top, var(--surface), transparent)",
              }}
            />
          </div>

          <div className="p-6 pt-4 md:p-8 md:pt-5">
          <h2 className="text-[20px] font-medium" style={{ color: "var(--ink)" }}>
            Pair your own wearable
          </h2>
          <p className="mt-2 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Wear it, and the diary fills itself in.
          </p>

          <button
            type="button"
            disabled
            aria-describedby="pair-status"
            className="group mt-6 flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-5 text-[18px] font-medium"
            style={{ borderColor: "var(--brass)", color: "var(--brass)", cursor: "not-allowed" }}
          >
            <span
              className="inline-block h-6 w-6"
              style={{
                backgroundColor: "var(--brass)",
                mask: "url(/brand/astrolabe-mark-v2.svg) center / contain no-repeat",
                WebkitMask: "url(/brand/astrolabe-mark-v2.svg) center / contain no-repeat",
              }}
              aria-hidden
            />
            Pair a device
          </button>
          <p
            id="pair-status"
            className="mt-3 text-center text-[15px] leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            <span className="font-mono" style={{ color: "var(--brass)" }}>Coming soon.</span>{" "}
            Apple Watch is the closest fit today — it already isolates the same
            tremor band we use.{" "}
            <a href="/devices" className="underline underline-offset-4" style={{ color: "var(--brass)" }}>
              See which devices fit →
            </a>
          </p>
          </div>
        </section>

        {/* ── upload ─────────────────────────────────────────────────────── */}
        <section
          className="min-w-0 rounded-lg border p-6 md:p-8"
          style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
        >
          <h2 className="text-[20px] font-medium" style={{ color: "var(--ink)" }}>
            Upload a recording
          </h2>
          <p className="mt-2 text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            An Astrolabe bundle — the JSON the model emits. It is read in your
            browser and kept only until you close the tab.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void takeFile(f);
            }}
            className="mt-6 rounded-lg border-2 border-dashed p-8 text-center transition-colors"
            style={{
              borderColor: dragging ? "var(--brass)" : "var(--axis)",
              background: dragging ? "rgba(200,150,62,0.06)" : "transparent",
            }}
          >
            <p className="text-[17px]" style={{ color: "var(--ink)" }}>
              Drop a <span className="font-mono">.json</span> bundle here
            </p>
            <p className="mt-1 text-[15px]" style={{ color: "var(--ink-2)" }}>
              or
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="astro-btn astro-btn-primary mt-3 min-h-[44px] rounded-md px-5 text-[16px] font-medium"
              style={{ background: "var(--brass)", color: "var(--page)" }}
            >
              Choose a file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void takeFile(f);
              }}
            />
          </div>

          {upload.k !== "idle" && (
            <p
              role="status"
              className="mt-4 text-[16px] leading-relaxed"
              style={{
                color:
                  upload.k === "err"
                    ? "var(--k5)"
                    : upload.k === "ok"
                      ? "var(--s2-truth)"
                      : "var(--ink-2)",
              }}
            >
              {upload.k === "busy" ? "Reading…" : upload.k === "ok" ? upload.msg : upload.msg}
            </p>
          )}

          <p className="mt-6 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            No file to hand?{" "}
            <a
              href="/sample-bundle-COPS-29.json"
              download="astrolabe-COPS-29.json"
              className="underline underline-offset-4"
              style={{ color: "var(--brass)" }}
            >
              Download a sample bundle
            </a>{" "}
            and drop it back in — it is the same recording the demo runs on.
          </p>
        </section>
      </div>

      {/* ── sign-up ──────────────────────────────────────────────────────── */}
      <section
        className="mt-6 min-w-0 rounded-lg border p-6 md:p-8"
        style={{ borderColor: "var(--axis)", background: "var(--surface)" }}
      >
        <h2 className="text-[20px] font-medium" style={{ color: "var(--ink)" }}>
          Keep in touch
        </h2>
        <p className="mt-2 max-w-[62ch] text-[16px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Email only. No name, no date of birth, nothing that would make this a
          health record.
        </p>

        <form
          onSubmit={submit}
          className="mt-6 grid items-start gap-x-10 gap-y-4 lg:grid-cols-2"
        >
          {/* Terms first in the DOM, and first on the page in both directions —
              left of the form on a wide screen, above it on a narrow one. A
              consent checkbox that reads before the thing being consented to
              is a dark pattern by layout accident. */}
          <div
            className="min-w-0 rounded-md border p-4 md:p-5"
            style={{ borderColor: "var(--axis)", background: "var(--page)" }}
          >
            <p className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
              Before you agree
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {TERMS.map((t) => (
                <li
                  key={t.slice(0, 24)}
                  className="flex gap-2.5 text-[15px] leading-relaxed"
                  style={{ color: "var(--ink-2)" }}
                >
                  <span aria-hidden style={{ color: "var(--brass)" }}>
                    —
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="min-h-[44px] rounded-md border px-3 text-[16px]"
                style={{
                  borderColor: "var(--axis)",
                  background: "var(--page)",
                  color: "var(--ink)",
                }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                Living with Parkinson&apos;s, a carer, a clinician, a
                researcher? <span className="opacity-70">(optional)</span>
              </span>
              {/* The four roles were the placeholder and clipped mid-word at
                  every width narrower than the field. A placeholder that has to
                  fit is a label. */}
              <input
                name="role"
                type="text"
                placeholder="Whichever fits"
                className="min-h-[44px] rounded-md border px-3 text-[16px]"
                style={{
                  borderColor: "var(--axis)",
                  background: "var(--page)",
                  color: "var(--ink)",
                }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                Would a diary that admits when it doesn&apos;t know be useful to
                you? <span className="opacity-70">(optional)</span>
              </span>
              <textarea
                name="note"
                rows={3}
                className="rounded-md border px-3 py-2 text-[16px]"
                style={{
                  borderColor: "var(--axis)",
                  background: "var(--page)",
                  color: "var(--ink)",
                }}
              />
            </label>

            <label className="mt-1 flex items-start gap-3">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0"
                style={{ accentColor: "var(--brass)" }}
              />
              <span className="text-[16px] leading-relaxed" style={{ color: "var(--ink)" }}>
                I have read the four points and understand this is a prototype
                that makes no clinical claim.
              </span>
            </label>

            <button
              type="submit"
              disabled={!accepted || status.k === "busy"}
              className="astro-btn astro-btn-primary min-h-[48px] rounded-md px-6 text-[17px] font-medium"
              style={{
                background: accepted ? "var(--brass)" : "var(--grid)",
                color: accepted ? "var(--page)" : "var(--ink-2)",
                cursor: accepted ? "pointer" : "not-allowed",
              }}
            >
              {status.k === "busy" ? "Sending…" : "Sign up"}
            </button>

            {status.k !== "idle" && status.k !== "busy" && (
              <p
                role="status"
                className="text-[16px] leading-relaxed"
                style={{
                  color: status.k === "err" ? "var(--k5)" : "var(--s2-truth)",
                }}
              >
                {status.msg}
              </p>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
