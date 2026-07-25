# Astrolabe — design system

For the product UI and its charts. Open `design-system.html` alongside this to
see it rendered.

Every colour below was **computed and validated**, not picked by eye:
lightness band, chroma floor, colour-vision separation (Machado–Oliveira–Fernandes
at severity 1.0), and contrast against the actual surface. Both modes pass with
headroom. Do not substitute a hex without re-running the check — the generators
are in `scripts/`.

---

## 1. The one rule

> **Every element on screen is labelled `observed`, `reported`, or `inferred` — in
> three visually distinct treatments.**

This is the product's whole design thesis. A polished UI
that hides weak evidence is the failure mode being designed against.

The treatments differ by **fill texture, not by hue**, so the distinction survives
a projector, greyscale, and colour-blind vision — and so that hue stays free to
carry *state*.

| Tier | Meaning | Treatment |
|---|---|---|
| **Observed** | Came off the sensor | **Solid fill**, hard edge, full chroma |
| **Reported** | The patient told us | **Solid fill + a filled diamond marker** on a hairline vertical rule |
| **Inferred** | The model reconstructed it | **45° hatch fill** at reduced chroma, wrapped in its uncertainty band |
| **Abstained** | We do not know | **No fill at all** — dashed outline, plus the reason in words |

**Abstention is drawn as absence.** Not grey, not a colour — a hole in the chart
with a dashed edge. This is the most important single decision in the interface:
"we don't know" must not look like a value, and a judge should be able to spot it
from the back of the room without reading a legend.

The hatch and the dashed outline are the accessibility texture channel doing
double duty as semantics. That is legitimate here because the encoding is
*categorical and reserved* — never decorative.

---

## 2. Brand

The identity is fixed; these values are the source of truth for it.

| | |
|---|---|
| Display | **Fraunces**, weight 300, italic for emphasis |
| UI / body | **IBM Plex Sans**, 300/400/500/600 |
| Mono / data | **IBM Plex Mono**, 400/500 — labels, timestamps, metrics |
| Motif | The *rete* — concentric circles, crossed axes, one bright pointer |

**Brand chrome colours are not chart colours.** `--brass #C8963E` and
`--verdigris #4FB3A4` stay exactly as they are for headings, rules, eyebrows and
the rete. The chart palette below uses *steps of the same hues*, moved into the
validated lightness band. They are the same brand; they are not the same job.

```
--ink        #080B11    page plane
--plate      #10151F    chart surface (dark)
--brass      #C8963E    chrome: eyebrows, rules, the pointer
--brass-hi   #EFD39B    chrome: emphasis
--verdigris  #4FB3A4    chrome: positive accent
--parchment  #ECE7DB    primary ink on dark
--muted      #8D97AB    secondary ink
```

---

## 3. Chart palette

### 3.1 Categorical — series identity

Slot order is **semantic and fixed**. It encodes product meaning, so it is not a
free variable, and slot 1 vs slot 2 is the money shot — reconstruction against
truth. Assign in order; never cycle.

| Slot | Role | Dark (`#10151F`) | Light (`#FAF8F3`) |
|---|---|---|---|
| 1 | **Reconstructed** — the instrument's reading | `#b7862d` | `#a67a28` |
| 2 | **Observed truth** — the reveal | `#16a897` | `#139b8b` |
| 3 | Left wrist | `#3d66c4` | `#3962bf` |
| 4 | Right wrist | `#b076d9` | `#a77bc7` |
| 5 | Tremor | `#ac5345` | `#ba3727` |
| 6 | Medication-aligned | `#46a560` | `#4e9c61` |

Validation, on the adjacent pairlist:

| | Dark | Light |
|---|---|---|
| CVD separation (worst pair) | ΔE 9.1 deutan | ΔE 9.6 deutan |
| Tritan | 14.0 | 11.4 |
| Normal-vision floor | 17.9 | 17.1 |
| Contrast vs surface | **all 6 ≥ 3:1** | **all 6 ≥ 3:1** |

`scripts/palette_search.mjs` is **seeded** (`SEED = 20260725`), so re-running it
reproduces exactly these hexes. If it ever prints something else, the palette
changed and this table is stale.

Targets are ΔE ≥ 8 (CVD) and ≥ 15 (normal vision); every slot clears with room,
because a projector shrinks every separation you measured on a laptop.

**Six is the cap, and you will not need six.** Most screens show two: brass
reconstruction against verdigris truth. If a seventh series ever appears, fold it
into "Other" or facet — never generate a hue.

### 3.2 Diverging — `KinesiaScore`, the hero encoding

The 7-point diary scale maps exactly onto a 7-step diverging ramp, which is a gift:
**0 is the good state and both ends are impairment in opposite directions.** Cool
= too little movement, warm = too much.

| | −3 | −2 | −1 | **0** | +1 | +2 | +3 |
|---|---|---|---|---|---|---|---|
| | Severe akinesia | Discomforting | Slight | **Good kinesia** | Slight | Discomforting | Severe dyskinesia |
| Dark | `#77a2fc` | `#537ede` | `#3f60a8` | `#454a54` | `#9d4337` | `#cf5949` | `#fd7562` |
| Light | `#2751b8` | `#4d77d4` | `#7f9edd` | `#b4afa3` | `#db8374` | `#c55243` | `#a52014` |

Both arms pass every ordinal check independently — monotone lightness, adjacent
ΔL ≥ 0.06, single hue. Severity reads as *advancing off the surface*: on dark that
means lighter and more chromatic, on light it means darker.

**The midpoint is deliberately not invisible.** "Good kinesia" is 57% of all
labelled hours — the most common state on a good day. A near-surface neutral would
make a healthy day look like missing data. Both midpoints are stepped to clear
2.05:1, so a good hour reads as a calm *present* band.

The midpoint is neutral (chroma ≈ 0.02), not green. Hue at a diverging midpoint
makes the centre read as a third category; the meaning is carried by the axis label
"Good kinesia" and by the tick, which is where it belongs.

> **Never treat this scale as monotone severity.** Any ramp that runs good → bad in
> one direction is factually wrong about the disease.

### 3.3 Sequential — tremor probability, confidence

One hue (violet), unused by any categorical slot and by both diverging arms, so it
can never be mistaken for a series or a state.

| | steps, low → high |
|---|---|
| Dark, continuous | `#491067` `#612683` `#783e9d` `#9056b6` `#a86ed1` `#c287ec` `#d5a8f7` |
| Dark, discrete cells | `#783e9d` `#9056b6` `#a86ed1` `#c287ec` `#d5a8f7` |
| Light, continuous | `#ead4fb` `#d9b1f8` `#c58aef` `#a86ed1` `#8d53b3` `#723896` `#581c7a` |
| Light, discrete cells | `#c58aef` `#a86ed1` `#8d53b3` `#723896` `#581c7a` |

Use the full range only for continuous fills where the light end genuinely means
"near zero". For **discrete hourly cells use the trimmed 5-step span** — every step
there clears 2:1 against the surface, so no cell disappears.

### 3.4 Ink and chrome

| Role | Dark | Light |
|---|---|---|
| Chart surface | `#10151F` | `#FAF8F3` |
| Page plane | `#080B11` | `#F3F0E8` |
| Primary ink | `#ECE7DB` | `#12151C` |
| Secondary ink | `#8D97AB` | `#585F6E` |
| Muted / axis labels | `#6B7488` | `#7A8090` |
| Gridline (hairline) | `#1B2231` | `#E4E0D6` |
| Baseline / axis | `#2A3244` | `#C9C4B6` |

**Text always wears ink tokens, never a series colour.** A coloured mark sits
*beside* the label and carries identity; the label itself stays neutral.

---

## 4. Chart rules

Non-negotiable, and each of these is a way demos lose credibility:

- **One y-axis. Never two.** Motor state and tremor probability are different
  scales — that is two stacked charts sharing an x-axis, not a dual axis.
- **Colour follows the entity, never its rank.** Toggling a wrist off must not
  repaint the surviving series.
- **Thin marks.** 2px lines, ≥8px markers, 4px rounded data-ends, a 2px surface gap
  between adjacent fills and a 2px surface ring where marks overlap.
- **Legend present for ≥2 series**, and direct-label them too — identity is never
  carried by colour alone. One series needs no legend; the title names it.
- **Never a number on every point.** Label the endpoints, the extremes, and the
  hour under the cursor.
- **Recessive grid.** Hairline gridlines, no chart borders, no shadows, no gradients
  on data marks.
- **Uncertainty is a band, not error bars.** Filled at low alpha, with the hatch
  texture where the region is inferred.
- **Hover is default.** Crosshair + tooltip on the timeline; per-cell tooltip on the
  heatmap. The tooltip states the evidence tier in words.
- **A table view exists.** It is also the fallback if anything renders wrong on the
  projector, and it is what makes the sub-3:1 relief rule satisfiable.

---

## 5. Projector rules

The demo is judged on a projector at three metres. This is a design constraint, not
an afterthought, and it is why the palette was validated with headroom.

- **Minimum type on screen: 16px.** Axis labels 14px mono minimum. Nothing at
  11px survives projection, however comfortable it looks on a laptop.

---

## 6. Motion — the reveal

The reveal is the pitch, so it gets the only real animation in the product.

| Beat | Motion |
|---|---|
| Load participant | Raw signal draws left→right, 600 ms, ease-out |
| Hide diary | Truth line fades to 0 over 200 ms |
| Reconstruct | Band grows from the centreline outward, 500 ms |
| **Unmask** | Truth line draws over the top, 400 ms, **no easing on the fade** — it should arrive definitively, not drift in |
| Error readout | Counts up over 300 ms |
| Drop a wrist | Band widens, 400 ms; abstention holes punch in with a 150 ms dashed-outline fade |

Everything else: 150–200 ms, or instant. Always respect `prefers-reduced-motion`.

---

## 7. Light mode — the clinician page only

The product and its timeline are dark. **The clinician handoff page is light.**

A page a neurologist reads on a hospital monitor, or prints, should not be a dark
interface — and the contrast is itself a statement: the handoff page belongs to
them, not to us. Use the light column of every table above, on `#FAF8F3`.

Everything else about it is unchanged: the same evidence tiers, the same diverging
ramp, the same refusal to render an inferred value as though it were measured.

## 8. Interaction spec

The UI is not a viewer, it is an instrument. A judge should be able to take the
mouse and interrogate it — that is what separates this from every unfalsifiable
demo in the room. Build in this order; each is independently demo-able.

### 8.1 The reveal wipe — the money shot, made interactive

A draggable handle sweeps left→right across the timeline. Behind it, truth is drawn
over the reconstruction; ahead of it, only the reconstruction and its band.

- Handle: 2px vertical rule in `--parchment`, 44px hit target, `col-resize` cursor.
- Truth is **clipped to the swept region** (`clipPath` on an animated rect), so it
  looks like it is being uncovered rather than faded in.
- A running **error readout** above the handle updates continuously: `MAE 0.44 · 6h
  revealed`. This is the number that makes the claim testable, so it moves as they drag.
- Snap to hour boundaries at the end of the drag; free movement during it.
- `R` runs the full sweep automatically over 1.6 s — use this on stage, and let the
  judge drag it themselves in Q&A.

**Why this over a button:** a click is a claim you are making. A drag is a claim
*they* verify. Same data, completely different epistemic weight.

### 8.2 Scrub the day

Pointer anywhere over the plot:

- Crosshair rule + a tooltip anchored to the nearest hour.
- Tooltip states the evidence tier **in words** — "reconstructed", "you told us",
  "measured" — never a colour swatch alone.
- All linked panels (posterior inspector, tremor row, raw signal) update together.
- Touch: same behaviour on drag, tooltip flips side near the right edge.

### 8.3 Posterior inspector

Click an hour → the full 7-way distribution as a small horizontal diverging strip
using the KinesiaScore ramp (§3.2), with the MAP marked and the 90% interval
bracketed.

This is what turns "calibrated posterior" from a phrase into a thing on screen.
When the model is confident it is a spike; when it abstains it is nearly flat —
and that contrast is the whole argument, visible in one glance.

### 8.4 Sensor toggles

Two switches, left wrist and right wrist. Turning one off swaps to the `_nowrist`
bundle and animates:

- band widens (400 ms),
- abstention holes punch in (150 ms, staggered 20 ms each),
- the metrics panel recomputes with the numbers counting, not jumping.

Two clicks, and it demonstrates the entire uncertainty claim.

### 8.5 Evidence layers

Three independent toggles: observed / reported / inferred. Turning `inferred` off
should leave the screen looking *sparse* — that emptiness is the honest picture of
how little was actually measured, and it is a strong thing to show deliberately.

### 8.6 Keyboard

| Key | Action |
|---|---|
| `←` `→` | step one hour |
| `⇧←` `⇧→` | step one day |
| `space` | play/pause the day |
| `R` | run the reveal sweep |
| `1` `2` | toggle left / right wrist |
| `?` | shortcut overlay |

Keyboard control looks rehearsed even when it is improvised, and it saves you from
mouse fumbling under lights. Every shortcut also has a visible control — keyboard
is an accelerator, never the only path.

### 8.7 Interaction rules

- **Hit targets ≥ 44px**, always larger than the mark they select.
- **Filters in one row above the charts**, never floating over data.
- **Nothing animates on hover except the crosshair and tooltip.** Marks do not grow,
  glow, or reflow — the data must not appear to move when you point at it.
- **Every state is linkable**: participant, hour, sensor mask and reveal position
  live in the URL. You can reset to any moment of the demo instantly, which matters
  when a question sends you backwards.
- **Loading is a skeleton in the final layout**, never a spinner and never a jump.
- **Respect `prefers-reduced-motion`**: the reveal becomes an instant cut, the wipe
  becomes a toggle. It still works, it just stops moving.

## 9. Regenerating

```bash
# categorical, both modes, with the semantic slot order held fixed
node scripts/palette_search.mjs

# diverging + sequential ramps
node scripts/palette_ramps.mjs
```

Both print the full validation report. **A colour that has not been through them
does not go in the product.**
