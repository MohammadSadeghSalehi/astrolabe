"""Four more attempts at beating 0.594, before accepting a calibration-led story.

Each targets the specific failure the AUCs revealed: the feature-to-state
relationship inverts between participants, so a globally-fitted absolute mapping
cannot hold.

  A. Hourly features. We currently build 10-minute features and average the
     resulting posteriors. Averaging the FEATURES first gives each estimate six
     times the data and should cut variance — and the label is hourly anyway.

  B. Global model + per-participant intercept. Keep the global mapping for
     "which way is worse", then shift it using a handful of that person's own
     labelled hours. This is exactly the product: you label a couple of days,
     it reconstructs the rest. It attacks the inversion directly.

  C. Binary OFF/ON. P(z>2) was the only threshold with real signal (AUC 0.587),
     and akinetic-versus-functional is the distinction that actually matters
     clinically. Reported as AUC and balanced accuracy, not MAE.

  D. Within-participant rank transform. Stronger than z-scoring for features
     this skewed, and it removes scale entirely rather than just centring it.

    python ml/scripts/diagnose_push.py
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import balanced_accuracy_score, roc_auc_score

from astrolabe.features import feature_columns
from astrolabe.metrics import BASELINE_MAE
from astrolabe.model import OrdinalEmissions
from astrolabe.splits import eligible_participants, group_kfold

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
STATES = np.arange(7)
KEY = ["participant", "day", "hour_end"]


def to_hourly_features(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Average the 10-minute features within each labelled hour."""
    agg = {c: "mean" for c in cols}
    agg["state"] = "first"
    return df.groupby(KEY, as_index=False).agg(agg)


def rank_within_participant(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    out[cols] = df.groupby("participant")[cols].rank(pct=True)
    return out.fillna({c: 0.5 for c in cols})


def mae_of(p: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    return float(np.abs(p @ STATES - y).mean()), float(np.abs(p.argmax(1) - y).mean())


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = feature_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]
    folds = group_kfold(people, n_folds=3)

    print(f"bar: hourly ordinal MAE {BASELINE_MAE:.3f}")
    print("reference: emission argmax on 10-min features = 0.588\n")

    # ── A. hourly features ───────────────────────────────────────────────────
    hdf = to_hourly_features(df, cols)
    a_mean, a_am = [], []
    for sp in folds:
        tr, te = sp.apply(hdf)
        m = OrdinalEmissions().fit(tr[cols], tr["state"].to_numpy(int))
        p = m.predict_proba(te[cols])
        y = te["state"].to_numpy(int)
        u, v = mae_of(p, y)
        a_mean.append(u), a_am.append(v)
    print(f"A. hourly features            MAE {np.mean(a_mean):.3f}   "
          f"argmax {np.mean(a_am):.3f}")

    # ── D. rank transform within participant ────────────────────────────────
    rdf = rank_within_participant(hdf, cols)
    d_mean, d_am = [], []
    for sp in folds:
        tr, te = sp.apply(rdf)
        m = OrdinalEmissions().fit(tr[cols], tr["state"].to_numpy(int))
        p = m.predict_proba(te[cols])
        y = te["state"].to_numpy(int)
        u, v = mae_of(p, y)
        d_mean.append(u), d_am.append(v)
    print(f"D. hourly + rank-within-person MAE {np.mean(d_mean):.3f}   "
          f"argmax {np.mean(d_am):.3f}")

    # ── B. global model + per-participant intercept ─────────────────────────
    #      calibrate the shift on that person's FIRST n labelled hours only
    for n_calib in (12, 24, 48):
        shifted = []
        for sp in folds:
            tr, te = sp.apply(rdf)
            m = OrdinalEmissions().fit(tr[cols], tr["state"].to_numpy(int))
            for pid, g in te.groupby("participant"):
                g = g.sort_values(["day", "hour_end"])
                if len(g) < n_calib + 15:
                    continue
                cal, rest = g.iloc[:n_calib], g.iloc[n_calib:]
                pc = m.predict_proba(cal[cols]) @ STATES
                pr = m.predict_proba(rest[cols]) @ STATES
                # median offset is robust to a few wild calibration hours
                offset = float(np.median(cal["state"].to_numpy() - pc))
                yr = rest["state"].to_numpy(int)
                shifted.append(np.abs(np.clip(pr + offset, 0, 6) - yr))
        allerr = np.concatenate(shifted)
        print(f"B. + per-person offset ({n_calib:>2}h)  MAE {allerr.mean():.3f}   "
              f"n={len(allerr):,} hours")

    # ── C. binary OFF/ON ────────────────────────────────────────────────────
    print("\nC. binary OFF (akinetic, state<=2) vs ON (state>=3)")
    aucs, bals, rates = [], [], []
    for sp in folds:
        tr, te = sp.apply(rdf)
        ytr = (tr["state"].to_numpy(int) <= 2).astype(int)
        yte = (te["state"].to_numpy(int) <= 2).astype(int)
        w = np.where(ytr == 1, (ytr == 0).sum() / max((ytr == 1).sum(), 1), 1.0)
        clf = HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.06, random_state=0, early_stopping=True
        ).fit(tr[cols], ytr, sample_weight=w)
        pr = clf.predict_proba(te[cols])[:, 1]
        aucs.append(roc_auc_score(yte, pr))
        bals.append(balanced_accuracy_score(yte, (pr > 0.5).astype(int)))
        rates.append(yte.mean())
    print(f"   AUC {np.mean(aucs):.3f} +/- {np.std(aucs):.3f}   "
          f"balanced acc {np.mean(bals):.3f}   OFF prevalence {np.mean(rates):.1%}")

    print(f"\n{'-' * 60}\nbaseline {BASELINE_MAE:.3f}")


if __name__ == "__main__":
    main()
