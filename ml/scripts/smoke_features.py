"""Smoke check for the feature pipeline on real COPS hours.

    python ml/scripts/smoke_features.py [participant] [n_hours]
"""

from __future__ import annotations

import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from astrolabe.features import (
    BAND_MOVEMENT,
    BAND_TREMOR,
    feature_columns,
    hour_features,
)
from astrolabe.io_cops import (
    KINESIA_LABELS,
    dose_events,
    iter_usable_hours,
    load_diary,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RAW = str(ROOT / "data" / "cops" / "raw")

PID = sys.argv[1] if len(sys.argv) > 1 else "COPS-29"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 8
DOWNSAMPLE = 4
FS = 100.0 / DOWNSAMPLE


def main() -> None:
    doses = dose_events(load_diary(PID, RAW))
    print(f"{PID}: {len(doses)} reported medication intakes")

    t0 = time.time()
    frames = []
    for i, (hour, left, right) in enumerate(
        iter_usable_hours(PID, RAW, downsample=DOWNSAMPLE)
    ):
        frames.append(hour_features(hour, left, right, fs=FS, doses=doses))
        if len(frames) >= N:
            break
    elapsed = time.time() - t0

    df = pd.concat(frames, ignore_index=True)
    cols = feature_columns(df)
    X = df[cols].to_numpy(dtype=np.float64)

    print(f"{PID}: {len(frames)} hours -> {len(df)} windows x {len(cols)} features")
    print(f"  {elapsed:.1f}s at {FS:.0f} Hz  "
          f"({elapsed / max(len(frames), 1):.2f}s per hour, both wrists)")
    print(f"  projected for 6,530 usable hours: "
          f"{elapsed / max(len(frames), 1) * 6530 / 60:.0f} min single-core\n")

    # ── the checks that matter ───────────────────────────────────────────────
    n_nan = int(np.isnan(X).sum())
    n_inf = int(np.isinf(X).sum())
    print(f"  NaN: {n_nan}   inf: {n_inf}   "
          f"{'OK' if n_nan == n_inf == 0 else '<-- FIX BEFORE TRAINING'}")

    const = [c for c in cols if df[c].nunique() <= 1]
    print(f"  constant columns: {len(const)}"
          + (f"  {const[:6]}" if const else ""))

    windows_per_hour = df.groupby(["day", "hour_end"]).size()
    print(f"  windows per hour: min {windows_per_hour.min()}, "
          f"max {windows_per_hour.max()}  (6 = a fully worn hour)")
    print(f"  states present: {sorted(df.state.unique())} "
          f"({', '.join(KINESIA_LABELS[s - 3] for s in sorted(df.state.unique()))})\n")

    # ── does the tremor band actually respond to tremor? ─────────────────────
    print(f"  movement band {BAND_MOVEMENT} Hz, tremor band {BAND_TREMOR} Hz")
    if df.tremor_score.nunique() > 1:
        watch = ["left_tremor_ratio", "right_tremor_ratio", "left_tr_rms", "right_tr_rms"]
        by_tremor = df.groupby("tremor_score")[watch].agg(["mean", "count"])
        print("\n  tremor-band energy by DIARY tremor score:")
        print(by_tremor.round(4).to_string())

        # Group means over a handful of windows are noise. Rank correlation over
        # every window is the honest check, and it comes with a sample size.
        from scipy import stats as _st
        print("\n  Spearman rho vs reported tremor score (all windows):")
        for col in watch:
            rho, p = _st.spearmanr(df["tremor_score"], df[col])
            flag = "" if p < 0.05 else "   (n.s.)"
            print(f"    {col:<22} rho {rho:+.3f}  p {p:.3g}  n={len(df)}{flag}")
        print("\n  Weak positive rho is EXPECTED, not a bug: the diary score is a\n"
              "  whole-hour self-report, tremor is intermittent, and voluntary\n"
              "  movement overlaps the 4-8 Hz band. Separating them is the problem\n"
              "  this project exists to solve - it is not meant to fall out of one\n"
              "  feature. Investigate the filters only if rho is negative across\n"
              "  BOTH wrists on a high-tremor participant.")
    else:
        print(f"  (only tremor_score={df.tremor_score.iloc[0]} present in this sample)")

    # ── asymmetry: the block that should carry the signal ────────────────────
    asym = [c for c in cols if c.startswith("asym_")]
    spread = df[asym].abs().mean().sort_values(ascending=False)
    print(f"\n  {len(asym)} asymmetry features; most active:")
    for name, val in spread.head(5).items():
        print(f"    {name:<28} mean |asym| {val:.3f}")


if __name__ == "__main__":
    main()
