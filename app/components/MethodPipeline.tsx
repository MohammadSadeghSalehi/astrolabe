"use client";

/**
 * The method, as one figure instead of six cards of prose.
 *
 * This is a SCHEMATIC and says so in its caption. The waveforms illustrate what
 * each stage does to a signal; they are not a recording, and the only numbers
 * on it are the two band edges and the coverage target, all of which are
 * definitional rather than measured. Every measured figure stays in the stat
 * row beneath, where it can be checked.
 *
 * The whole point is the last stage. Four stages of increasingly confident
 * processing, and then the line stops — because the interval got too wide to
 * stand behind. A reader should reach that gap and understand it is deliberate
 * before reading a single label.
 */

const W = 1160;
const H = 260;
const STAGE_W = 200;
const GAP = 40;
const TOP = 34;
const MID = 128;

const stageX = (i: number) => i * (STAGE_W + GAP);

/** Deterministic pseudo-waveform — stable across renders, no Math.random. */
function wave(
  x0: number,
  y: number,
  width: number,
  amp: number,
  cycles: number,
  jitter = 0,
) {
  const pts: string[] = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + t * width;
    // Two summed sines plus a deterministic wobble, so it reads organic
    // without a random source that would break hydration.
    const j = jitter * Math.sin(t * 37.7 + 1.3) * Math.sin(t * 11.1);
    const v = Math.sin(t * cycles * Math.PI * 2) + 0.35 * Math.sin(t * cycles * Math.PI * 5.3);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${(y + (v + j) * amp).toFixed(1)}`);
  }
  return pts.join(" ");
}

const STAGES = [
  { n: 1, title: "Both wrists", sub: "raw acceleration, 100 Hz" },
  { n: 2, title: "Split by frequency", sub: "movement 0.1–3 Hz · tremor 4–8 Hz" },
  { n: 3, title: "One answer per hour", sub: "probability of tremor" },
  { n: 4, title: "Wrap it in an interval", sub: "widened until 90% is really 90%" },
  { n: 5, title: "Refuse where it is wide", sub: "the gap is the product" },
];

export function MethodPipeline() {
  return (
    <figure className="m-0 min-w-0">
      <div className="overflow-x-auto">
        <svg
          width={W}
          height={H + 74}
          viewBox={`0 0 ${W} ${H + 74}`}
          role="img"
          aria-label="Schematic of the method: bilateral acceleration is split into movement and tremor frequency bands, reduced to one probability per hour, wrapped in a calibrated interval, and refused wherever that interval is too wide to stand behind."
          className="block"
          style={{ minWidth: 860 }}
        >
          <defs>
            <pattern
              id="mp-hatch"
              width={7}
              height={7}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={7} stroke="var(--seq-3)" strokeWidth={1.6} />
            </pattern>
            <linearGradient id="mp-flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--axis)" stopOpacity={0.15} />
              <stop offset="50%" stopColor="var(--brass)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--axis)" stopOpacity={0.15} />
            </linearGradient>
          </defs>

          {/* the spine every stage sits on — an instrument rule, not a divider */}
          <line
            x1={0}
            y1={MID}
            x2={W}
            y2={MID}
            stroke="url(#mp-flow)"
            strokeWidth={1}
          />

          {/* ── 1 · both wrists ─────────────────────────────────────────── */}
          <g transform={`translate(${stageX(0)},0)`}>
            <path
              d={wave(6, MID - 26, STAGE_W - 12, 15, 7, 0.5)}
              fill="none"
              stroke="var(--s3-wrist-left)"
              strokeWidth={1.6}
              opacity={0.95}
            />
            <path
              d={wave(6, MID + 28, STAGE_W - 12, 13, 6, 0.6)}
              fill="none"
              stroke="var(--s4-wrist-right)"
              strokeWidth={1.6}
              opacity={0.95}
            />
            <text x={6} y={MID - 52} className="font-mono" fontSize={14} fill="var(--s3-wrist-left)">
              left
            </text>
            <text x={6} y={MID + 62} className="font-mono" fontSize={14} fill="var(--s4-wrist-right)">
              right
            </text>
          </g>

          {/* ── 2 · band split ──────────────────────────────────────────── */}
          <g transform={`translate(${stageX(1)},0)`}>
            {/* slow band — present, but not the one that carries tremor */}
            <path
              d={wave(6, MID - 30, STAGE_W - 12, 16, 2, 0)}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.6}
              opacity={0.5}
            />
            <text x={6} y={MID - 56} className="font-mono" fontSize={14} fill="var(--ink-2)">
              0.1–3 Hz
            </text>
            {/* fast band — the signal the product is built on */}
            <path
              d={wave(6, MID + 30, STAGE_W - 12, 13, 13, 0)}
              fill="none"
              stroke="var(--seq-4)"
              strokeWidth={2}
            />
            <text x={6} y={MID + 66} className="font-mono" fontSize={14} fill="var(--seq-4)">
              4–8 Hz
            </text>
          </g>

          {/* ── 3 · hourly probability ──────────────────────────────────── */}
          <g transform={`translate(${stageX(2)},0)`}>
            {[0.42, 0.61, 0.55, 0.78, 0.66].map((p, i) => {
              const bw = (STAGE_W - 12) / 5;
              const x = 6 + i * bw;
              const y = MID + 44 - p * 88;
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={y}
                    x2={x + bw - 3}
                    y2={y}
                    stroke="var(--seq-4)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  {i > 0 && (
                    <line
                      x1={x}
                      y1={MID + 44 - [0.42, 0.61, 0.55, 0.78, 0.66][i - 1]! * 88}
                      x2={x}
                      y2={y}
                      stroke="var(--seq-4)"
                      strokeWidth={2.5}
                      opacity={0.55}
                    />
                  )}
                </g>
              );
            })}
            <line
              x1={6}
              y1={MID}
              x2={STAGE_W - 6}
              y2={MID}
              stroke="var(--ink-2)"
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.6}
            />
          </g>

          {/* ── 4 · calibrated interval ─────────────────────────────────── */}
          <g transform={`translate(${stageX(3)},0)`}>
            <path
              d={`M6,${MID - 6} L${STAGE_W - 6},${MID - 30} L${STAGE_W - 6},${MID + 30} L6,${MID + 16} Z`}
              fill="url(#mp-hatch)"
              opacity={0.45}
            />
            <path
              d={`M6,${MID - 6} L${STAGE_W - 6},${MID - 30}`}
              stroke="var(--seq-5)"
              strokeWidth={1.4}
              fill="none"
            />
            <path
              d={`M6,${MID + 16} L${STAGE_W - 6},${MID + 30}`}
              stroke="var(--seq-5)"
              strokeWidth={1.4}
              fill="none"
            />
            <path
              d={`M6,${MID + 5} L${STAGE_W - 6},${MID}`}
              stroke="var(--seq-4)"
              strokeWidth={2.5}
              fill="none"
            />
            <text
              x={STAGE_W - 6}
              y={MID - 40}
              textAnchor="end"
              className="font-mono"
              fontSize={14}
              fill="var(--ink-2)"
            >
              90%
            </text>
          </g>

          {/* ── 5 · the refusal — the payload ───────────────────────────── */}
          <g transform={`translate(${stageX(4)},0)`}>
            {/* answered stretch */}
            <path
              d={`M6,${MID + 2} L72,${MID - 8}`}
              stroke="var(--seq-4)"
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
            />
            {/* the hole — no fill, dashed edge, exactly as the chart draws it */}
            <rect
              x={82}
              y={TOP + 26}
              width={STAGE_W - 88}
              height={H - TOP - 74}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.6}
              strokeDasharray="6 5"
            />
            <text
              x={82 + (STAGE_W - 88) / 2}
              y={MID + 4}
              textAnchor="middle"
              className="font-mono"
              fontSize={14}
              fill="var(--ink)"
              letterSpacing="0.06em"
            >
              DECLINED
            </text>
          </g>

          {/* ── stage captions ──────────────────────────────────────────── */}
          {STAGES.map((s, i) => (
            <g key={s.n} transform={`translate(${stageX(i)},${H + 14})`}>
              <line
                x1={0}
                y1={-16}
                x2={STAGE_W - 6}
                y2={-16}
                stroke="var(--axis)"
                strokeWidth={1}
              />
              <text x={0} y={6} fontSize={16} fill="var(--ink)">
                {s.title}
              </text>
              <text x={0} y={28} fontSize={14} fill="var(--ink-2)">
                {s.sub}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <figcaption
        className="mt-5 max-w-[68ch] text-[15px] leading-relaxed"
        style={{ color: "var(--ink-2)" }}
      >
        Schematic. The traces illustrate what each stage does to a signal — they
        are not a recording. The only figures on the diagram are the two band
        edges and the coverage target; every measured result is below, where it
        can be checked.
      </figcaption>
    </figure>
  );
}
