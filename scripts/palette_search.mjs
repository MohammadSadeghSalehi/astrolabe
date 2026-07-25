// Astrolabe palette: slot order is SEMANTIC and fixed (it encodes product meaning,
// so it is not a free variable). Only the step per slot is searched — for the
// step set that passes every gate with no contrast relief, while staying as
// close as possible to the brand anchors from the deck.
import { validate } from "./validate_palette.js";

const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex2srgb = (h) => { h = h.replace(/^#/, ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
const lin = (h) => hex2srgb(h).map(s2lin);
function oklabFromLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function linFromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const oklch = (h) => { const [L, a, b] = oklabFromLin(lin(h)); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180 / Math.PI) % 360 + 360) % 360]; };
const inGamut = ([r, g, b]) => [r, g, b].every((c) => c >= -1e-4 && c <= 1 + 1e-4);
const toHex = (L, C, H) => {
  const rad = (H * Math.PI) / 180;
  const rgb = linFromOklab([L, C * Math.cos(rad), C * Math.sin(rad)]).map(lin2s);
  return "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");
};
function maxC(L, H) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2, rad = (H * Math.PI) / 180;
    if (inGamut(linFromOklab([L, mid * Math.cos(rad), mid * Math.sin(rad)]))) lo = mid; else hi = mid;
  }
  return lo;
}
const dE = (h1, h2) => { const a = oklabFromLin(lin(h1)), b = oklabFromLin(lin(h2)); return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };

// ── SEMANTIC slot order (fixed — encodes product meaning) ─────────────────────
// 1 reconstructed (the instrument's reading)  2 observed truth (the reveal)
// 3 left wrist  4 right wrist  5 tremor  6 medication-aligned
const SLOTS = [
  { role: "reconstructed", anchor: "#C8963E", hue: 78.6 },  // brass — brand signature
  { role: "truth",         anchor: "#4FB3A4", hue: 182.2 }, // verdigris — brand signature
  { role: "wrist-left",    anchor: "#6E8FE8", hue: 264 },
  { role: "wrist-right",   anchor: "#B07BD8", hue: 310 },
  { role: "tremor",        anchor: "#D9705F", hue: 30.6 },
  { role: "aligned",       anchor: "#3FA85F", hue: 150 },
];
const MODES = {
  dark:  { band: [0.48, 0.67], surface: "#10151F" },
  light: { band: [0.43, 0.77], surface: "#FAF8F3" },
};

function steps(hue, mode) {
  const [lo, hi] = MODES[mode].band, out = [];
  for (let L = lo + 0.004; L <= hi - 0.004; L += 0.006)
    for (const frac of [1.0, 0.9, 0.8, 0.7, 0.6]) {
      const c = Math.min(0.17, maxC(L, hue) * 0.97) * frac;
      if (c >= 0.102) out.push(toHex(L, c, hue));
    }
  return [...new Set(out)];
}

// Seeded PRNG (mulberry32). The search must be REPRODUCIBLE: the palette in
// DESIGN.md is the documented one, and a re-run that produced different hexes
// would make the documentation unverifiable.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260725;

function search(mode, iters = 400000) {
  const { surface } = MODES[mode];
  const pool = SLOTS.map((s) => steps(s.hue, mode));
  const rand = rng(SEED + (mode === "dark" ? 0 : 1));
  let best = null;
  for (let it = 0; it < iters; it++) {
    const pal = pool.map((p) => p[(rand() * p.length) | 0]);
    const { report, ok } = validate(pal, { mode, surface });
    if (!ok) continue;
    if (report[4][1] === "relief") continue;                  // demand >= 3:1 on every slot
    const cvd = parseFloat(report[2][2].match(/ΔE ([\d.]+)/)[1]);
    const tri = parseFloat(report[2][2].match(/tritan ([\d.]+)/)[1]);
    const nor = parseFloat(report[3][2].match(/ΔE ([\d.]+)/)[1]);
    // Headroom above the gates rather than sitting on them: the demo is judged
    // on a projector, where every separation shrinks.
    if (cvd < 9 || tri < 6 || nor < 17) continue;
    // among passing sets, prefer the one closest to the brand anchors
    const drift = pal.reduce((a, c, i) => a + dE(c, SLOTS[i].anchor), 0);
    if (best === null || drift < best.drift) best = { drift, pal, cvd };
  }
  return best;
}

for (const mode of ["dark", "light"]) {
  const b = search(mode);
  console.log(`\n=== ${mode.toUpperCase()}  surface ${MODES[mode].surface} ===`);
  if (!b) { console.log("  none passed"); continue; }
  b.pal.forEach((hex, i) => {
    const [L, C, H] = oklch(hex);
    console.log(`  ${String(i + 1)}. ${SLOTS[i].role.padEnd(14)} ${hex}   L=${L.toFixed(3)} C=${C.toFixed(3)} H=${H.toFixed(0)}   (drift from ${SLOTS[i].anchor}: ΔE ${dE(hex, SLOTS[i].anchor).toFixed(1)})`);
  });
  console.log("  palette:", b.pal.join(","));
  const { report } = validate(b.pal, { mode, surface: MODES[mode].surface });
  for (const [n, st, m] of report) console.log(`   [${String(st).toUpperCase().padEnd(6)}] ${n.padEnd(22)} ${m}`);
}
