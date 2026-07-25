# Brand & video assets

## Logo / mark

| File | Use |
|------|-----|
| `astrolabe-mark.svg` | Monoline mark, `currentColor` — header, inline UI |
| `astrolabe-mark-brass.svg` | Fixed brass `#C8963E` — favicon, title cards |
| `astrolabe-wordmark.svg` | `ASTROLABE` letterspaced 0.14em |

Geometry: 2 concentric arcs + one sight line + centre pivot. Reads at 24px.

## Cards (SVG — exact text, project palette)

| File | Spec |
|------|------|
| `title-card.svg` | 1920×1080, `#080B11`, mark + wordmark + tagline — video first 2s |
| `end-card.svg` | 1920×1080, claim + coverage 0.904 / 77.3% + repo URL — video last 3s |
| `og-image.svg` | 1200×630 link preview |

Palette: page `#080b11`, surface `#10151f`, ink `#ece7db`, brass `#c8963e`, teal `#16a897`, violet `#a86ed1`.

## B-roll

| File | Beat |
|------|------|
| `../video/diary-still.jpg` | Paper diary, hand paused over unfilled row |
| `../video/wrist-still.jpg` | Wrist + watch-style band at rest |

**Video generation** for 3–6s clips was blocked in this environment (ZDR requires `upload_url`). Animate the stills locally, e.g.:

```bash
# Ken Burns / subtle push with ffmpeg
ffmpeg -loop 1 -i diary-still.jpg -t 3 -vf "scale=1920:1080,zoompan=z='min(zoom+0.0008,1.08)':d=75:s=1920x1080" -c:v libx264 -pix_fmt yuv420p diary-broll.mp4
```

Or use any image-to-video tool with the stills as frame 1.
