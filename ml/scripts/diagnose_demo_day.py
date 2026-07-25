"""Which participant-day should the demo show, and how should it be scored?

Two separate questions, deliberately kept apart:

  1. WHICH DAY — decided on properties of the LABELS only (how many hours are
     labelled, whether both tremor classes are present). Never on how well the
     model does. Choosing the day where the model looks best is the exact
     cheating this project is arguing against, and it would be indefensible.

  2. HOW TO SCORE IT — thresholded accuracy at 0.5 is the wrong instrument for a
     calibrated probability on a person whose prevalence is nothing like the
     cohort's. This prints the threshold-free numbers beside it so the choice
     can be made on evidence.

    python ml/scripts/diagnose_demo_day.py --participant COPS-29
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import warnings

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
FEATURES = ROOT / "data" / "cops" / "features" / "features.parquet"
ARTIFACTS = ROOT / "data" / "cops" / "artifacts"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--participant", default="COPS-29")
    args = ap.parse_args()

    df = pd.read_parquet(FEATURES)
    sub = df[df.participant == args.participant].copy()
    blob = joblib.load(ARTIFACTS / "tremor.joblib")
    detector, cols = blob["detector"], blob["feature_columns"]

    sub["y"] = pd.to_numeric(sub["tremor_score"], errors="coerce")
    sub = sub[sub["y"].notna()].copy()
    sub["y"] = (sub["y"] > 0).astype(int)

    # ── the resolution the detector was TRAINED at ───────────────────────────
    # train_tremor.py aggregates to one row per (participant, day, hour) before
    # fitting. Scoring 10-minute windows with it is inference out of
    # distribution: a 10-minute band power is a noisier draw than the hourly
    # mean of six of them, and the model has never seen that spread.
    hourly = sub.groupby(["day", "hour_end"], as_index=False).agg(
        {**{c: "mean" for c in cols}, "y": "first"})
    hourly["p"] = detector.predict_proba(hourly[cols])
    sub["p"] = detector.predict_proba(sub[cols])

    both_h = len(np.unique(hourly["y"])) == 2
    print("\n── resolution check ──────────────────────────────────────────────")
    print(f"  10-min windows (what the bundle ships): n={len(sub):>4}  "
          f"AUC {roc_auc_score(sub['y'], sub['p']):.3f}  "
          f"mean p {sub['p'].mean():.3f}")
    if both_h:
        print(f"  hourly means (what it was trained on): n={len(hourly):>4}  "
              f"AUC {roc_auc_score(hourly['y'], hourly['p']):.3f}  "
              f"mean p {hourly['p'].mean():.3f}")
    print(f"  prevalence {sub['y'].mean():.3f}")


    print(f"\n{args.participant}: {len(sub)} labelled windows across "
          f"{sub.day.nunique()} days, tremor prevalence "
          f"{sub['y'].mean():.2f}\n")

    print(f"{'day':>4} {'wins':>5} {'hrs':>4} {'prev':>6} {'AUC':>6} "
          f"{'acc@.5':>7} {'major':>6} {'brier':>6} {'clim':>6}  scorable")
    print("-" * 72)

    rows = []
    for d, g in sub.groupby("day"):
        y, p = g["y"].to_numpy(), g["p"].to_numpy()
        prev = y.mean()
        both = len(np.unique(y)) == 2
        auc = roc_auc_score(y, p) if both else float("nan")
        acc = ((p > 0.5).astype(int) == y).mean()
        major = max(prev, 1 - prev)
        brier = ((p - y) ** 2).mean()
        # Climatology: the best constant probability is the day's own prevalence.
        # Beating it means the trajectory carries information a flat line does not.
        clim = ((prev - y) ** 2).mean()
        rows.append({"day": int(d), "n": len(g), "hours": g.hour_end.nunique(),
                     "prev": prev, "auc": auc, "acc": acc, "major": major,
                     "brier": brier, "clim": clim, "both": both})
        print(f"{int(d):>4} {len(g):>5} {g.hour_end.nunique():>4} {prev:>6.2f} "
              f"{auc:>6.3f} {acc:>7.3f} {major:>6.3f} {brier:>6.3f} {clim:>6.3f}"
              f"  {'yes' if both else 'NO - one class only'}")

    r = pd.DataFrame(rows)
    scorable = r[r["both"]]
    print(f"\n{len(scorable)}/{len(r)} days are scorable at all (both classes present).")

    if not scorable.empty:
        # LABEL-ONLY criterion: the most labelled hours among scorable days.
        # Ties broken by hours, never by AUC.
        pick = scorable.sort_values(["hours", "n"], ascending=False).iloc[0]
        print(f"\nLabel-only pick: day {int(pick['day'])} "
              f"({int(pick['hours'])} labelled hours, prevalence {pick['prev']:.2f})")
        print(f"  its AUC {pick['auc']:.3f} | acc@0.5 {pick['acc']:.3f} vs "
              f"majority {pick['major']:.3f} | brier {pick['brier']:.3f} vs "
              f"climatology {pick['clim']:.3f}")
        best = scorable.sort_values("auc", ascending=False).iloc[0]
        print(f"  (for contrast, the day the model does BEST on is "
              f"{int(best['day'])}, AUC {best['auc']:.3f} — not used)")

    print(f"\nwhole-participant AUC {roc_auc_score(sub['y'], sub['p']):.3f}  "
          f"prevalence {sub['y'].mean():.2f}  "
          f"mean predicted p {sub['p'].mean():.3f}")
    print("A mean predicted probability far below the prevalence is a calibration"
          "\noffset, not a discrimination failure: the ranking can still be right.")


if __name__ == "__main__":
    main()
