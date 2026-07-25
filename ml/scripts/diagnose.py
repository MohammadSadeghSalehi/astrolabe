"""Why is the emission model not beating 0.594?

Runs four cheap comparisons on one held-out fold, to separate "the ordinal
decomposition is buggy" from "the features do not generalise across people".

    python ml/scripts/diagnose.py

The hypothesis being tested: absolute activity level means something different
for every participant. A 62-year-old with DBS and a sedentary 70-year-old have
completely different baseline `enmo_mean`, so a tree splitting on its raw value
learns *who* rather than *what state they are in*. Per-participant
normalisation should fix that if it is the problem.
"""

from __future__ import annotations

import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import roc_auc_score

from astrolabe.features import feature_columns
from astrolabe.metrics import BASELINE_MAE
from astrolabe.model import OrdinalEmissions, hourly_posterior
from astrolabe.splits import eligible_participants, group_kfold

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
FEATURES = ROOT / "data" / "cops" / "features" / "features.parquet"
COVERAGE = ROOT / "data" / "cops" / "derived" / "participants.csv"


def zscore_within_participant(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Standardise every feature within each participant.

    This is the fix under test. It removes "how active is this person in
    general", which is not a symptom, and keeps "how does this window compare
    with the rest of their week", which is.

    Legitimate at inference: it uses only that participant's own sensor data,
    never their labels and never anyone else's.
    """
    out = df.copy()
    g = out.groupby("participant")[cols]
    mu, sd = g.transform("mean"), g.transform("std").replace(0.0, 1.0)
    out[cols] = (out[cols] - mu) / sd
    return out.fillna({c: 0.0 for c in cols})


def hourly_mae(test_df: pd.DataFrame, proba: np.ndarray) -> tuple[float, float]:
    """(MAE from posterior mean, MAE from argmax) at hourly resolution."""
    hourly = hourly_posterior(test_df, proba)
    y = hourly["state"].to_numpy(dtype=int)
    return (float(np.abs(hourly["expected"] - y).mean()),
            float(np.abs(hourly["map"] - y).mean()))


def main() -> None:
    df = pd.read_parquet(FEATURES)
    cols = feature_columns(df)
    coverage = pd.read_csv(COVERAGE)
    people = [p for p in eligible_participants(coverage) if p in set(df.participant)]

    split = group_kfold(people, n_folds=3)[0]
    train_df, test_df = split.apply(df)
    ytr = train_df["state"].to_numpy(dtype=int)

    print(f"fold: {len(train_df):,} train / {len(test_df):,} test windows, "
          f"{len(split.test)} held-out participants")
    print(f"bar to beat: hourly ordinal MAE {BASELINE_MAE:.3f}\n")
    print(f"{'approach':<46} {'MAE(mean)':>10} {'MAE(argmax)':>12}")
    print("-" * 70)

    # ── 1. is there ANY signal? per-threshold AUC ───────────────────────────
    print("\n[1] cumulative classifier AUC on held-out participants")
    print("    (0.5 = no signal at all; the ordinal model can only be as good "
          "as these)")
    yte = test_df["state"].to_numpy(dtype=int)
    for k in range(6):
        tr_t, te_t = (ytr > k).astype(int), (yte > k).astype(int)
        if tr_t.min() == tr_t.max() or te_t.min() == te_t.max():
            print(f"    P(z>{k}): degenerate")
            continue
        clf = HistGradientBoostingClassifier(
            max_iter=120, learning_rate=0.1, random_state=0, early_stopping=True
        ).fit(train_df[cols], tr_t)
        auc = roc_auc_score(te_t, clf.predict_proba(test_df[cols])[:, 1])
        share = tr_t.mean()
        print(f"    P(z>{k}): AUC {auc:.3f}   (positive class {share:.1%})")

    # ── 2. plain regressor — is the decomposition the problem? ──────────────
    t0 = time.time()
    reg = HistGradientBoostingRegressor(
        max_iter=300, learning_rate=0.08, random_state=0, early_stopping=True
    ).fit(train_df[cols], ytr)
    pred = reg.predict(test_df[cols])
    tmp = test_df[["participant", "day", "hour_end", "state"]].copy()
    tmp["pred"] = pred
    h = tmp.groupby(["participant", "day", "hour_end"], as_index=False).agg(
        {"pred": "mean", "state": "first"})
    reg_mae = float(np.abs(h["pred"] - h["state"]).mean())
    print(f"\n{'2. plain regressor, raw features':<46} {reg_mae:>10.3f} "
          f"{'-':>12}   ({time.time() - t0:.0f}s)")

    # ── 3. the ordinal model as it stands ──────────────────────────────────
    t0 = time.time()
    m = OrdinalEmissions().fit(train_df[cols], ytr)
    a, b = hourly_mae(test_df, m.predict_proba(test_df[cols]))
    print(f"{'3. ordinal decomposition, raw features':<46} {a:>10.3f} {b:>12.3f}"
          f"   ({time.time() - t0:.0f}s)")

    # ── 4. THE FIX UNDER TEST: per-participant normalisation ────────────────
    t0 = time.time()
    dfz = zscore_within_participant(df, cols)
    ztr, zte = split.apply(dfz)
    m2 = OrdinalEmissions().fit(ztr[cols], ztr["state"].to_numpy(dtype=int))
    c, d = hourly_mae(zte, m2.predict_proba(zte[cols]))
    print(f"{'4. ordinal + per-participant z-score':<46} {c:>10.3f} {d:>12.3f}"
          f"   ({time.time() - t0:.0f}s)")

    # ── 5. both raw and normalised, so the model can use either ────────────
    t0 = time.time()
    zcols = [f"z_{c}" for c in cols]
    dfb = df.copy()
    dfb[zcols] = dfz[cols].to_numpy()
    btr, bte = split.apply(dfb)
    both = cols + zcols
    m3 = OrdinalEmissions().fit(btr[both], btr["state"].to_numpy(dtype=int))
    e, f = hourly_mae(bte, m3.predict_proba(bte[both]))
    print(f"{'5. ordinal + raw AND z-scored':<46} {e:>10.3f} {f:>12.3f}"
          f"   ({time.time() - t0:.0f}s)")

    print("-" * 70)
    print(f"{'baseline (always Good kinesia)':<46} {BASELINE_MAE:>10.3f}")

    best = min(a, b, c, d, e, f, reg_mae)
    print(f"\nbest here: {best:.3f}  vs baseline {BASELINE_MAE:.3f}  "
          f"-> {'BEATS' if best < BASELINE_MAE else 'still short'}")
    if c < a:
        print(f"\nper-participant normalisation helps: {a:.3f} -> {c:.3f}. "
              "Absolute activity level was encoding WHO rather than WHAT STATE.")


if __name__ == "__main__":
    main()
