"""End-to-end smoke check: archives -> diary -> aligned accelerometry -> splits.

Run this after any change to io_cops.py or splits.py. It touches real data and
prints numbers you can eyeball against DATA.md.

    python ml/scripts/smoke.py
"""

from __future__ import annotations

import os
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import pandas as pd

from astrolabe.io_cops import (
    KINESIA_LABELS,
    assert_alignment,
    iter_usable_hours,
    list_participants,
    load_diary,
)
from astrolabe.splits import demo_split, eligible_participants, group_kfold, summarise

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RAW = str(ROOT / "data" / "cops" / "raw")
COVERAGE = ROOT / "data" / "cops" / "derived" / "participants.csv"


def main() -> None:
    people = list_participants(RAW)
    print(f"archives on disk: {len(people)}\n")

    # ── 1. alignment across the whole cohort ─────────────────────────────────
    t0 = time.time()
    checked = usable = 0
    for pid in people:
        for h in load_diary(pid, RAW):
            if h.left_csv or h.right_csv:
                assert_alignment(h)
                checked += 1
            usable += h.usable
    print(f"[1] alignment verified on {checked:,} hours carrying accelerometry "
          f"({time.time() - t0:.1f}s, no unpacking)")
    print(f"    usable hours (label + both wrists): {usable:,}   "
          f"[DATA.md says 6,530]\n")

    # ── 2. actually read a labelled hour ─────────────────────────────────────
    t0 = time.time()
    hour, left, right = next(iter_usable_hours("COPS-29", RAW, downsample=4))
    dt = time.time() - t0
    score = hour.kinesia_score
    print(f"[2] COPS-29 day {hour.day}, diary stamp {hour.hour_end}h "
          f"=> window [{hour.hour_start}, {hour.hour_end})")
    print(f"    label     : {score:+d}  {KINESIA_LABELS[score]}  (state index {hour.state})")
    print(f"    left file : {hour.left_csv}")
    print(f"    samples   : {len(left):,} left / {len(right):,} right @25Hz "
          f"in {dt:.2f}s")
    mag = ((left[['X', 'Y', 'Z']] ** 2).sum(axis=1) ** 0.5).median()
    print(f"    median |a|: {mag:.2f} g  (a worn wrist sits near 1 g)\n")

    # ── 3. splits ────────────────────────────────────────────────────────────
    coverage = pd.read_csv(COVERAGE)
    ok = eligible_participants(coverage)
    print(f"[3] eligible to hold out (>=40 usable hours, has accelerometry): "
          f"{len(ok)} of {len(people)}")

    demo = demo_split(ok)
    print(f"    {summarise(demo, coverage)}")
    for s in group_kfold(ok, n_folds=5):
        print(f"    {summarise(s, coverage)}")

    assert "COPS-29" not in demo.train, "demo participant leaked into training"
    print("\n    COPS-29 is NOT in any training set. The reveal is honest.")

    print("\nsmoke check passed")


if __name__ == "__main__":
    main()
