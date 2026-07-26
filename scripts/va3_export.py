"""VISUAL-ASSETS-3: export stills + Ken Burns mp4s (ZDR blocks Imagine video)."""
from __future__ import annotations

import math
import os
import shutil
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageEnhance

SESSION = Path(
    r"C:\Users\sadeg\.grok\sessions\C%3A%5CUsers%5Csadeg%5CHackathon"
    r"\019f9944-9806-7321-8c82-ef0a7c1adb15\images"
)
BRAND = Path(r"C:\Users\sadeg\Hackathon\app\public\brand")
FILM = Path(r"C:\Users\sadeg\Hackathon\film\remotion\public")
FILM.mkdir(parents=True, exist_ok=True)


def load(p: Path) -> Image.Image:
    return Image.open(p).convert("RGB")


def crop_zoom(
    img: Image.Image,
    t: float,
    zoom0: float = 1.0,
    zoom1: float = 1.38,
    pan_y0: float = 0.40,
    pan_y1: float = 0.64,
    pan_x: float = 0.5,
    out: tuple[int, int] = (1920, 1080),
) -> Image.Image:
    """Push-in toward blank lower diary rows."""
    w, h = img.size
    z = zoom0 + (zoom1 - zoom0) * t
    cw, ch = max(2, int(w / z)), max(2, int(h / z))
    # even dims for yuv420
    cw -= cw % 2
    ch -= ch % 2
    cx = pan_x * w
    cy = (pan_y0 + (pan_y1 - pan_y0) * t) * h
    left = int(np.clip(cx - cw / 2, 0, w - cw))
    top = int(np.clip(cy - ch / 2, 0, h - ch))
    crop = img.crop((left, top, left + cw, top + ch))
    return crop.resize(out, Image.Resampling.LANCZOS)


def brightness_ramp(
    img: Image.Image,
    t: float,
    b0: float = 0.74,
    b1: float = 1.10,
    out: tuple[int, int] = (1920, 1080),
) -> Image.Image:
    b = b0 + (b1 - b0) * t
    frame = ImageEnhance.Brightness(img).enhance(b)
    frame = ImageEnhance.Contrast(frame).enhance(1.0 + 0.1 * t)
    return frame.resize(out, Image.Resampling.LANCZOS)


def portrait_drift(
    img: Image.Image,
    t: float,
    size: tuple[int, int] = (900, 1200),
) -> Image.Image:
    """Slow drift that returns to start (loop-friendly)."""
    z = 1.0 + 0.065 * math.sin(t * math.pi)
    pan_x = 0.5 + 0.018 * math.sin(t * 2 * math.pi)
    pan_y = 0.5 + 0.012 * math.cos(t * 2 * math.pi)
    w, h = img.size
    cw, ch = max(2, int(w / z)), max(2, int(h / z))
    cw -= cw % 2
    ch -= ch % 2
    left = int(np.clip(pan_x * w - cw / 2, 0, w - cw))
    top = int(np.clip(pan_y * h - ch / 2, 0, h - ch))
    crop = img.crop((left, top, left + cw, top + ch))
    return crop.resize(size, Image.Resampling.LANCZOS)


def write_mp4(path: Path, frames: list[Image.Image], fps: int = 24) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Prefer ffmpeg backend if present; imageio-ffmpeg ships a binary.
    writer = imageio.get_writer(
        str(path),
        fps=fps,
        codec="libx264",
        quality=7,
        pixelformat="yuv420p",
        macro_block_size=1,
    )
    try:
        for f in frames:
            arr = np.asarray(f)
            if arr.shape[0] % 2:
                arr = arr[:-1]
            if arr.shape[1] % 2:
                arr = arr[:, :-1]
            writer.append_data(arr)
    finally:
        writer.close()
    print(f"wrote {path}  frames={len(frames)}  bytes={os.path.getsize(path)}")


def main() -> None:
    # ── stills ────────────────────────────────────────────────────────
    device = load(SESSION / "10.jpg").resize((1200, 800), Image.Resampling.LANCZOS)
    device.save(BRAND / "device-pairing.png", "PNG", optimize=True)
    device.save(FILM / "device-pairing.png", "PNG", optimize=True)

    why = load(SESSION / "8.jpg").resize((1600, 900), Image.Resampling.LANCZOS)
    why.save(BRAND / "why-now.png", "PNG", optimize=True)
    why.save(FILM / "why-now.png", "PNG", optimize=True)

    port = load(SESSION / "13.jpg").resize((900, 1200), Image.Resampling.LANCZOS)
    port.save(BRAND / "hero-plate-portrait.png", "PNG", optimize=True)
    port.save(FILM / "hero-plate-portrait.png", "PNG", optimize=True)

    diary = load(SESSION / "11.jpg")
    diary_full = diary.resize((1920, 1080), Image.Resampling.LANCZOS)
    diary_full.save(BRAND / "intro-diary-still.jpg", quality=92)
    diary_full.save(FILM / "intro-diary-still.jpg", quality=92)

    end = load(SESSION / "12.jpg").resize((1920, 1080), Image.Resampling.LANCZOS)
    end.save(BRAND / "end-plate-still.jpg", quality=92)
    end.save(FILM / "end-plate-still.jpg", quality=92)

    if (BRAND / "where-it-stops.svg").exists():
        shutil.copy2(BRAND / "where-it-stops.svg", FILM / "where-it-stops.svg")

    print("stills ok")

    # ── A1 intro-diary 8s push-in ─────────────────────────────────────
    n1 = 8 * 24
    frames1 = [crop_zoom(diary, i / (n1 - 1)) for i in range(n1)]
    write_mp4(FILM / "intro-diary.mp4", frames1)
    write_mp4(BRAND / "intro-diary.mp4", frames1)

    # ── A2 end-plate 5s highlight rise ────────────────────────────────
    n2 = 5 * 24
    frames2 = [brightness_ramp(end, i / (n2 - 1)) for i in range(n2)]
    write_mp4(FILM / "end-plate.mp4", frames2)
    write_mp4(BRAND / "end-plate.mp4", frames2)

    # ── A3 portrait loop 12s ──────────────────────────────────────────
    n3 = 12 * 24
    frames3 = [portrait_drift(port, i / (n3 - 1), (900, 1200)) for i in range(n3)]
    write_mp4(BRAND / "hero-loop-portrait.mp4", frames3)
    write_mp4(FILM / "hero-loop-portrait.mp4", frames3)

    print("done")


if __name__ == "__main__":
    main()
