"""The one number the landing page's "impact" framing rests on.

    python scripts/diary_completion.py

Reads data/cops/derived/participants.csv (tracked, ~1.5 MB, no raw signal).
`labelled_hours` counts diary rows with a non-null KinesiaScore — see
scripts/scan_diaries.py:94-118 for the exact increment. `n_days * 24` is every
possible hourly slot across the recording window, whether or not a diary row
exists for it at all.

This is diary completion under research conditions — participants supported by
study staff — not unsupervised real-world use, and the landing copy says so.
It is likely an upper bound on what an unsupervised patient would manage, which
is the more damning reading, not a less honest one.
"""

import csv
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "cops" / "derived" / "participants.csv"


def main() -> None:
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    n = len(rows)
    possible = sum(int(r["n_days"]) * 24 for r in rows)
    labelled = sum(int(r["labelled_hours"]) for r in rows)
    rate = labelled / possible

    per_participant = sorted(
        int(r["labelled_hours"]) / (int(r["n_days"]) * 24) for r in rows
    )
    below_half = sum(1 for p in per_participant if p < 0.5)

    print(f"participants               : {n}")
    print(f"possible hourly slots      : {possible}  (sum of n_days * 24)")
    print(f"labelled hours             : {labelled}  (diary rows with a KinesiaScore)")
    print(f"cohort completion rate     : {rate:.3f}  ({rate * 100:.1f}%)")
    print(
        f"per-participant completion : min {per_participant[0]:.2f}  "
        f"median {per_participant[n // 2]:.2f}  max {per_participant[-1]:.2f}"
    )
    print(f"participants below 50%     : {below_half} / {n}")


if __name__ == "__main__":
    main()
