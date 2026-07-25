"""Extract features for the whole cohort, one participant per core.

    python ml/scripts/build_features.py                  # all participants
    python ml/scripts/build_features.py --limit 5        # a quick subset
    python ml/scripts/build_features.py --workers 12

Writes one parquet per participant to data/cops/features/, then a combined
features.parquet. Per-participant files mean a crash costs one participant, not
the whole run, and a rerun skips what already exists.

Participants are independent, so this parallelises perfectly. The work is
band-pass filtering, which releases the GIL only partially — hence processes,
not threads.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import pandas as pd

from astrolabe.features import feature_columns, hour_features
from astrolabe.io_cops import dose_events, iter_usable_hours, list_participants, load_diary

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RAW = ROOT / "data" / "cops" / "raw"
OUT = ROOT / "data" / "cops" / "features"

DOWNSAMPLE = 4                      # 100 Hz -> 25 Hz
FS = 100.0 / DOWNSAMPLE


def build_one(participant: str, include_sleep: bool = False) -> tuple[str, int, str]:
    """Features for one participant. Returns (pid, n_windows, status)."""
    out_path = OUT / f"{participant}.parquet"
    if out_path.exists():
        try:
            return participant, len(pd.read_parquet(out_path)), "cached"
        except Exception:
            out_path.unlink(missing_ok=True)   # corrupt from an interrupted run

    warnings.filterwarnings("ignore", category=RuntimeWarning)
    try:
        doses = dose_events(load_diary(participant, str(RAW)))
        frames = [
            hour_features(hour, left, right, fs=FS, doses=doses)
            for hour, left, right in iter_usable_hours(
                participant, str(RAW), downsample=DOWNSAMPLE, include_sleep=include_sleep
            )
        ]
        if not frames:
            return participant, 0, "no usable hours"

        df = pd.concat(frames, ignore_index=True)
        df.to_parquet(out_path, index=False)
        return participant, len(df), "ok"
    except Exception as exc:                     # one bad participant must not
        return participant, 0, f"FAILED: {exc}"  # take down the whole run


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--include-sleep", action="store_true",
                    help="sleep hours are excluded by default: reconstructing "
                         "sleep well is not evidence of anything and it inflates "
                         "every metric")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    people = list_participants(str(RAW))
    if args.limit:
        people = people[: args.limit]

    print(f"{len(people)} participants, {args.workers} workers, "
          f"{FS:.0f} Hz, sleep {'included' if args.include_sleep else 'excluded'}\n")

    t0 = time.time()
    done = total_windows = failed = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(build_one, p, args.include_sleep): p for p in people}
        for fut in as_completed(futures):
            pid, n, status = fut.result()
            done += 1
            total_windows += n
            if status.startswith("FAILED"):
                failed += 1
            mark = "!" if status.startswith("FAILED") else " "
            print(f"{mark} [{done:>2}/{len(people)}] {pid:<9} {n:>5} windows  "
                  f"{status}  ({time.time() - t0:.0f}s)", flush=True)

    print(f"\n{total_windows:,} windows in {time.time() - t0:.0f}s"
          + (f"   {failed} FAILED" if failed else ""))

    # ── combine ─────────────────────────────────────────────────────────────
    parts = sorted(OUT.glob("COPS-*.parquet"),
                   key=lambda p: int(p.stem.split("-")[1]))
    df = pd.concat([pd.read_parquet(p) for p in parts], ignore_index=True)
    combined = OUT / "features.parquet"
    df.to_parquet(combined, index=False)

    cols = feature_columns(df)
    print(f"\nwrote {combined}")
    print(f"  {len(df):,} windows x {len(cols)} features, "
          f"{df.participant.nunique()} participants")
    print(f"  hours represented: {df.groupby(['participant','day','hour_end']).ngroups:,}")
    print(f"  NaN: {df[cols].isna().sum().sum()}   "
          f"size: {combined.stat().st_size / 1e6:.0f} MB")
    print("\nstate distribution (window level):")
    for state, n in df.state.value_counts().sort_index().items():
        print(f"  {state} ({state - 3:+d}): {n:>6,}  {100 * n / len(df):5.1f}%")


if __name__ == "__main__":
    main()
