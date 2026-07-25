// Astrolabe ramps, v2.
//  - each diverging ARM is validated on its own (a one-hue ordinal ramp);
//    the neutral midpoint is checked separately for contrast, since by
//    definition it is not part of either arm's hue.
//  - the kinesia timeline draws DISCRETE hourly marks, so every step -
//    midpoint included - must clear the 2:1 ordinal floor. "Good kinesia" is
//    the most common state on a good day: it has to read as a calm present
//    band, not as a hole in the chart.
import { validateOrdinal, contrast } from "./validate_palette.js";

const lin2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function linFromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
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
const step = (L, H, cf) => toHex(L, Math.min(0.17, maxC(L, H) * 0.97) * cf, H);
const SURF = { dark: "#10151F", light: "#FAF8F3" };
const H_AKIN = 264, H_DYSK = 30, H_SEQ = 310;

// neutral midpoint: lowest-chroma slate that still clears the 2:1 ordinal floor
function midpoint(mode) {
  const grid = [];
  for (let L = 0.20; L <= 0.95; L += 0.005) grid.push(toHex(L, 0.018, mode === "dark" ? 264 : 88));
  const ok = grid.filter((h) => contrast(h, SURF[mode]) >= 2.05);
  return mode === "dark" ? ok[0] : ok[ok.length - 1]; // nearest passing step to the surface
}

const arm = (hue, mode) => (mode === "dark"
  ? [step(0.50, hue, 0.72), step(0.61, hue, 0.9), step(0.72, hue, 1.0)]
  : [step(0.70, hue, 0.66), step(0.585, hue, 0.88), step(0.47, hue, 1.0)]);

const out = {};
for (const mode of ["dark", "light"]) {
  const a = arm(H_AKIN, mode), d = arm(H_DYSK, mode), mid = midpoint(mode);
  const seven = [a[2], a[1], a[0], mid, d[0], d[1], d[2]];
  out[mode] = seven;
  console.log(`\n=== DIVERGING · KinesiaScore · ${mode.toUpperCase()} (surface ${SURF[mode]}) ===`);
  ["-3 severe akinesia", "-2 discomforting", "-1 slight akin.", " 0 GOOD KINESIA",
   "+1 slight dysk.", "+2 discomforting", "+3 severe dyskinesia"].forEach((lab, i) =>
    console.log(`   ${lab.padEnd(22)} ${seven[i]}   ${contrast(seven[i], SURF[mode]).toFixed(2)}:1`));
  console.log("   css:", seven.join(","));
  for (const [name, ramp] of [["akinesia arm (-1..-3)", a], ["dyskinesia arm (+1..+3)", d]]) {
    const { report } = validateOrdinal(mode === "dark" ? [...ramp].reverse() : ramp, { mode, surface: SURF[mode] });
    const bad = report.filter(([, st]) => st !== true && st !== "pass");
    console.log(`   ${name}: ${bad.length ? "ISSUES" : "all ordinal checks pass"}`);
    for (const [n, , m] of bad) console.log(`      [FAIL] ${n}: ${m}`);
  }
  const mc = contrast(mid, SURF[mode]);
  console.log(`   midpoint ${mid}: ${mc.toFixed(2)}:1 ${mc >= 2 ? "PASS (>=2:1 ordinal floor)" : "FAIL"}`);
}

// sequential — tremor probability / confidence. Two usable spans:
//   continuous (heat/area): full range, light end may recede
//   ordinal (discrete cells): trimmed so the near-surface end still clears 2:1
for (const mode of ["dark", "light"]) {
  const Ls = mode === "dark" ? [0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.80] : [0.90, 0.82, 0.73, 0.64, 0.55, 0.46, 0.37];
  const ramp = Ls.map((L) => step(L, H_SEQ, 0.9));
  const ordSafe = ramp.filter((h) => contrast(h, SURF[mode]) >= 2.0);
  console.log(`\n=== SEQUENTIAL · tremor probability / confidence · ${mode.toUpperCase()} ===`);
  console.log("   continuous 100→700:", ramp.join(","));
  console.log("   ordinal-safe span :", ordSafe.join(","), `(${ordSafe.length} steps clear 2:1)`);
  const { report } = validateOrdinal(mode === "dark" ? [...ordSafe].reverse() : ordSafe, { mode, surface: SURF[mode] });
  const bad = report.filter(([, st]) => st !== true && st !== "pass");
  console.log(`   ordinal-safe span: ${bad.length ? "ISSUES" : "all ordinal checks pass"}`);
  for (const [n, , m] of bad) console.log(`      [FAIL] ${n}: ${m}`);
}
