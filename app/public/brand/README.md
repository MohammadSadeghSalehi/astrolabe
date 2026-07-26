# Brand & visual assets

Palette: page `#080B11` · surface `#10151F` · ink `#ECE7DB` · ink-2 `#8D97AB` ·
axis `#2A3244` · brass `#C8963E` · brass-hi `#EFD39B` · truth `#16A897` · violet `#A86ED1`.

Encoding: solid = observed · dashed empty = abstained. Never decorative hatch.

## VISUAL-ASSETS-2 (photoreal + identity)

| File | Notes |
|------|--------|
| `render-watch.png` | Generic square watch, blank screen, transparent |
| `render-ring.png` | Generic titanium ring, transparent |
| `render-band.png` | Research actigraphy band, transparent |
| `astrolabe-mark-v2.svg` | Open arcs + sight-line, `currentColor`, 20px-safe |
| `astrolabe-lockup.svg` | Mark + ASTROLABE wordmark |
| `favicon.svg` | Brass simplified mark |
| `hero-plate.png` | Museum plate, top-left darkened for type |
| `avatar-01.svg` … `avatar-04.svg` | 24h ring abstractions, no faces |
| `plate-edge.png` | Milled brass ticks divider |
| `hero-loop.mp4` / `hero-loop.webm` | 6s subtle Ken Burns on plate, &lt;2 MB |

## VISUAL-ASSETS-1 (diagrams)

`hero-field.svg` · `pipeline.svg` · `dev-*.svg` · `bilateral.svg` · `completion.svg` ·
`rule-plate.svg` · `state-quiet.svg` · `og-image.svg`

## VISUAL-ASSETS-3 (film + landing gaps)

| File | Part | Notes |
|------|------|--------|
| `intro-diary.mp4` | A1 | 8s · 1920×1080 · push-in to blank diary rows (film open) |
| `intro-diary-still.jpg` | A1 | Frame 1 still |
| `end-plate.mp4` | A2 | 5s · 1920×1080 · locked plate, highlight rise (not a redo of hero-loop) |
| `end-plate-still.jpg` | A2 | Frame 1 still |
| `hero-loop-portrait.mp4` / `.webm` | A3 | 12s · 3:4 · webm ≈130 KB · full plate for phone hero |
| `hero-plate-portrait.png` | A3 | Portrait still of the plate |
| `where-it-stops.svg` | B1 | Hand diagram: solid measured vs dashed declined (no type) |
| `device-pairing.png` | B2 | 1200×800 · two research bands + face-down watch sensors |
| `why-now.png` | B3 | 1600×900 · empty chair / window — sits under type at ~0.25 |

Film copies live in `film/remotion/public/` (higher-bitrate mp4s). B4 title plates skipped (optional).

Native Imagine video is blocked on this account (ZDR requires `upload_url`); A1–A3 motion is Ken Burns / light-ramp from the generated stills via local ffmpeg. Swap for true generative video when that path is available.

## Usage notes

- Device renders: place on `#080B11` / `#10151F`; alpha already knocked out.
- Hero video: silent loop; pair with headline over dark left third.
- Prefer `astrolabe-mark-v2.svg` for nav at ≥20px; `favicon.svg` for tab icon.
- `where-it-stops.svg`: composite labels in the app — solid = measured, dashed = declined.
- `why-now.png`: background only; keep opacity low so citations stay legible.
