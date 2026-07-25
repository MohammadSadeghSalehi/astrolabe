"""Does the model work WITHIN a person, calibrated on their own early days?

The cross-participant result is poor and the reason is visible in the AUCs:
several cumulative classifiers score below 0.5 on held-out participants, which
means the feature-to-state relationship inverts between people. What reads as
dyskinesia in one person reads as ordinary activity in another.

That is a real finding, not a bug — and it points at a different protocol.
Astrolabe is a *personal* diary: someone wears it for a week and labels part of
it. So the honest test is the one in DATA.md's own table:

    calibrate on early labelled days, reconstruct later days chronologically

The bar here is NOT 0.594. It is the per-participant median (0.380) — the
oracle that always predicts that person's own most common state. Beating a
global constant would prove nothing in a personalised setting.

    python ml/scripts/diagnose_personalised.py
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from astrolabe.features import feature_columns
from astrolabe.metrics import BASELINE_MAE, ORACLE_PERSONALISED_MAE
from astrolabe.model import OrdinalEmissions, hourly_posterior
from astrolabe.splits import eligible_participants

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
FEATURES = ROOT / "data" / "cops" / "features" / "features.parquet"
COVERAGE = ROOT / "data" / "cops" / "derived" / "participants.csv"

CALIB_DAYS = 2          # days of self-labelling before reconstruction begins
MIN_TEST_HOURS = 20


def evaluate_one(g: pd.DataFrame, cols: list[str]) -> dict | None:
    """Calibrate on this participant's early days, reconstruct the later ones."""
    days = sorted(g["day"].unique())
    if len(days) < CALIB_DAYS + 2:
        return None
    cutoff = days[CALIB_DAYS]
    tr, te = g[g["day"] < cutoff], g[g["day"] >= cutoff]

    ytr = tr["state"].to_numpy(dtype=int)
    if len(tr) < 40 or len(np.unique(ytr)) < 2:
        return None

    hourly_te = te.groupby(["participant", "day", "hour_end"], as_index=False).agg(
        {"state": "first"})
    if len(hourly_te) < MIN_TEST_HOURS:
        return None

    model = OrdinalEmissions(max_iter=200, min_samples_leaf=15).fit(tr[cols], ytr)
    hourly = hourly_posterior(te, model.predict_proba(te[cols]))
    y = hourly["state"].to_numpy(dtype=int)

    # This person's own most common state, from the calibration days only.
    # A GLOBAL constant is not the right comparison in a personalised setting.
    own = int(np.bincount(ytr, minlength=7).argmax())

    return {
        "participant": g["participant"].iloc[0],
        "calib_hours": int(tr.groupby(["day", "hour_end"]).ngroups),
        "test_hours": len(hourly),
        "n_states": int(len(np.unique(ytr))),
        "mae": float(np.abs(hourly["expected"] - y).mean()),
        "mae_argmax": float(np.abs(hourly["map"] - y).mean()),
        "mae_own_constant": float(np.abs(own - y).mean()),
        "mae_global_constant": float(np.abs(3 - y).mean()),
    }


def main() -> None:
    df = pd.read_parquet(FEATURES)
    cols = feature_columns(df)
    coverage = pd.read_csv(COVERAGE)
    people = [p for p in eligible_participants(coverage) if p in set(df.participant)]

    print(f"PERSONALISED protocol: calibrate on the first {CALIB_DAYS} days, "
          f"reconstruct the rest\n")
    print(f"cross-participant result for reference: MAE 0.684 "
          f"(vs global constant {BASELINE_MAE})")
    print(f"bar in THIS setting: the participant's own constant "
          f"(cohort oracle {ORACLE_PERSONALISED_MAE})\n")

    rows = []
    for pid in people:
        r = evaluate_one(df[df.participant == pid], cols)
        if r:
            rows.append(r)

    res = pd.DataFrame(rows)
    res["beats_own"] = res["mae"] < res["mae_own_constant"]
    res["beats_global"] = res["mae"] < res["mae_global_constant"]
    res = res.sort_values("mae").reset_index(drop=True)

    print(f"{len(res)} participants had enough days for this protocol\n")
    print("pooled over all held-out hours:")
    w = res["test_hours"]
    print(f"  MAE (posterior mean)       {np.average(res['mae'], weights=w):.3f}")
    print(f"  MAE (argmax)               {np.average(res['mae_argmax'], weights=w):.3f}")
    print(f"  their own constant         {np.average(res['mae_own_constant'], weights=w):.3f}")
    print(f"  global constant            {np.average(res['mae_global_constant'], weights=w):.3f}")

    print(f"\n  beats their own constant:  {int(res.beats_own.sum())}/{len(res)} participants")
    print(f"  beats the global constant: {int(res.beats_global.sum())}/{len(res)} participants")
    print(f"\n  median MAE {res['mae'].median():.3f}   "
          f"IQR [{res['mae'].quantile(.25):.3f}, {res['mae'].quantile(.75):.3f}]")

    print("\nbest 8 participants:")
    print(res.head(8)[["participant", "calib_hours", "test_hours", "n_states",
                       "mae", "mae_own_constant", "beats_own"]].to_string(index=False))

    demo = res[res.participant.isin(["COPS-29", "COPS-28", "COPS-39", "COPS-52"])]
    if not demo.empty:
        print("\ndemo candidates:")
        print(demo[["participant", "calib_hours", "test_hours", "n_states",
                    "mae", "mae_own_constant", "beats_own"]].to_string(index=False))


if __name__ == "__main__":
    main()
