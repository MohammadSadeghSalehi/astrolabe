"""Is the per-participant offset a real result, or an unfair comparison?

Experiment B scored MAE 0.474 with 48 calibration hours, against a global
baseline of 0.594. Two reasons that is not yet a claim:

  1. It is measured on a SUBSET — participants with enough hours, minus the
     calibration hours themselves. The 0.594 baseline is over all usable hours.
     Different denominators.

  2. The offset consumes that participant's own labels. Any baseline it is
     compared against must be given the SAME labels, or the comparison rewards
     information rather than modelling.

So every method here is scored on identical hours, and the two constant
predictors get exactly the same calibration labels the model does:

    global constant        always "Good kinesia" — knows nothing about the person
    own constant           the median of THEIR calibration hours — same labels
    model, no offset       the global mapping alone
    model + offset         the global mapping, shifted by their calibration hours

If "model + offset" does not beat "own constant", the offset is just learning
the person's average and the model is contributing nothing.

    python ml/scripts/diagnose_fair.py
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from astrolabe.features import feature_columns
from astrolabe.model import OrdinalEmissions
from astrolabe.splits import eligible_participants, group_kfold

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
STATES = np.arange(7)
KEY = ["participant", "day", "hour_end"]


def to_hourly(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    agg = {c: "mean" for c in cols}
    agg["state"] = "first"
    return df.groupby(KEY, as_index=False).agg(agg)


def rank_within(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    out[cols] = df.groupby("participant")[cols].rank(pct=True)
    return out.fillna({c: 0.5 for c in cols})


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = feature_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]

    hdf = rank_within(to_hourly(df, cols), cols)
    folds = group_kfold(people, n_folds=3)

    for n_calib in (24, 48):
        rows = []
        for sp in folds:
            tr, te = sp.apply(hdf)
            model = OrdinalEmissions().fit(tr[cols], tr["state"].to_numpy(int))
            for pid, g in te.groupby("participant"):
                g = g.sort_values(["day", "hour_end"])
                if len(g) < n_calib + 15:
                    continue
                cal, rest = g.iloc[:n_calib], g.iloc[n_calib:]
                ycal = cal["state"].to_numpy(int)
                y = rest["state"].to_numpy(int)

                pred_cal = model.predict_proba(cal[cols]) @ STATES
                pred = model.predict_proba(rest[cols]) @ STATES
                offset = float(np.median(ycal - pred_cal))
                own = float(np.median(ycal))          # same labels, no model

                rows.append({
                    "participant": pid,
                    "n": len(y),
                    "global_constant": np.abs(3 - y).mean(),
                    "own_constant": np.abs(own - y).mean(),
                    "model_raw": np.abs(np.clip(pred, 0, 6) - y).mean(),
                    "model_offset": np.abs(np.clip(pred + offset, 0, 6) - y).mean(),
                })

        r = pd.DataFrame(rows)
        w = r["n"]
        print(f"\n{'=' * 66}")
        print(f"{n_calib} calibration hours — {len(r)} participants, "
              f"{int(w.sum()):,} evaluated hours (identical for every row)")
        print(f"{'=' * 66}")
        for name, label in [
            ("global_constant", "global constant (always Good kinesia)"),
            ("own_constant", "their own constant, from the same calib labels"),
            ("model_raw", "model, no offset"),
            ("model_offset", "model + per-participant offset"),
        ]:
            print(f"  {label:<48} MAE {np.average(r[name], weights=w):.3f}")

        beats_own = int((r["model_offset"] < r["own_constant"]).sum())
        beats_glob = int((r["model_offset"] < r["global_constant"]).sum())
        print(f"\n  model+offset beats their own constant on "
              f"{beats_own}/{len(r)} participants")
        print(f"  model+offset beats the global constant on "
              f"{beats_glob}/{len(r)} participants")

        gain = np.average(r["own_constant"], weights=w) - np.average(r["model_offset"], weights=w)
        verdict = ("the MODEL is contributing" if gain > 0.02
                   else "the offset alone explains it — the model adds nothing")
        print(f"\n  model gain over their own constant: {gain:+.3f}  ->  {verdict}")


if __name__ == "__main__":
    main()
