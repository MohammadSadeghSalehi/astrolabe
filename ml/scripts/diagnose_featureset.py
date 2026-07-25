"""The model is over-featured. Find the set that actually generalises.

The ablation showed two things worth acting on:

  * dropping the medication-timing features RAISED held-out AUC from 0.713 to
    0.751 — they are actively harmful. Dose schedule is close to a participant
    fingerprint (who takes what, when), so it hands the model an identity cue
    that cannot transfer.

  * the 39 tremor-band features ALONE scored 0.731, above the full 122-feature
    model. Classic over-featuring: with weak signal and 65 participants, extra
    columns are extra opportunities to latch onto the wrong thing.

This sweeps candidate feature sets for both targets on the same folds.

    python ml/scripts/diagnose_featureset.py
"""

from __future__ import annotations

import pathlib
import sys
import warnings

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import balanced_accuracy_score, roc_auc_score

from astrolabe.features import feature_columns
from astrolabe.metrics import BASELINE_MAE
from astrolabe.model import OrdinalEmissions
from astrolabe.splits import eligible_participants, group_kfold

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
STATES = np.arange(7)
KEY = ["participant", "day", "hour_end"]


def to_hourly(df, cols):
    agg = {c: "mean" for c in cols}
    agg.update({"state": "first", "tremor_score": "first"})
    return df.groupby(KEY, as_index=False).agg(agg)


def _uniq(*groups):
    """Concatenate feature groups, dropping duplicates, preserving order.

    The groups overlap by construction — `asym_tr_rms` is both a tremor-band
    feature and an asymmetry feature — and a duplicated column name makes the
    estimator raise rather than silently mis-fit.
    """
    seen, out = set(), []
    for g in groups:
        for c in g:
            if c not in seen:
                seen.add(c)
                out.append(c)
    return out


def sets_for(cols):
    asym = [c for c in cols if c.startswith("asym_")]
    asym_s = set(asym)
    # per-wrist only, so the groups below are disjoint from asymmetry
    tr_b = [c for c in cols if ("_tr_" in c or "tremor_ratio" in c) and c not in asym_s]
    mv_b = [c for c in cols if "_mv_" in c and c not in asym_s]
    enmo = [c for c in cols if "enmo" in c and c not in asym_s]
    dose = [c for c in cols if "dose" in c]
    envr = [c for c in cols if ("temp" in c or "light" in c) and c not in asym_s]
    tod = [c for c in cols if c.startswith("tod_")]
    asym_tr = [c for c in asym if "_tr_" in c or "tremor_ratio" in c]

    return {
        "all 122": cols,
        "all minus medication": [c for c in cols if c not in set(dose)],
        "all minus med, minus env": [c for c in cols if c not in set(dose) | set(envr)],
        "bands only (tr + mv)": _uniq(tr_b, mv_b),
        "bands + asymmetry": _uniq(tr_b, mv_b, asym),
        "bands + asym + enmo": _uniq(tr_b, mv_b, asym, enmo),
        "bands + asym + tod": _uniq(tr_b, mv_b, asym, tod),
        "tremor band only": tr_b,
        "tremor band + tremor asym": _uniq(tr_b, asym_tr),
    }


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = feature_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]
    h = to_hourly(df, cols)
    h["tremor_score"] = h["tremor_score"].fillna(0)
    folds = group_kfold(people, n_folds=5)
    candidates = sets_for(cols)

    # ── tremor ──────────────────────────────────────────────────────────────
    print("=" * 74)
    print("TREMOR present vs absent — 5-fold held-out AUC")
    print("=" * 74)
    print(f"  {'feature set':<28} {'n':>4} {'AUC':>16} {'bal acc':>9}")
    best_t = (None, 0.0)
    for name, fc in candidates.items():
        if not fc:
            continue
        aucs, bals = [], []
        for sp in folds:
            tr, te = sp.apply(h)
            ytr = (tr.tremor_score > 0).astype(int).to_numpy()
            yte = (te.tremor_score > 0).astype(int).to_numpy()
            if len(np.unique(ytr)) < 2 or len(np.unique(yte)) < 2:
                continue
            w = np.where(ytr == 1, (ytr == 0).sum() / max((ytr == 1).sum(), 1), 1.0)
            clf = HistGradientBoostingClassifier(
                max_iter=400, learning_rate=0.05, min_samples_leaf=40,
                l2_regularization=1.0, random_state=0, early_stopping=True,
            ).fit(tr[fc], ytr, sample_weight=w)
            p = clf.predict_proba(te[fc])[:, 1]
            aucs.append(roc_auc_score(yte, p))
            bals.append(balanced_accuracy_score(yte, (p > 0.5).astype(int)))
        m, s = float(np.mean(aucs)), float(np.std(aucs))
        mark = ""
        if m > best_t[1]:
            best_t, mark = (name, m), "  <--"
        print(f"  {name:<28} {len(fc):>4} {m:>9.3f} +/-{s:>5.3f} {np.mean(bals):>9.3f}{mark}")

    # ── kinesia ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 74)
    print(f"KINESIA 7-state — 5-fold held-out MAE (bar {BASELINE_MAE:.3f})")
    print("=" * 74)
    print(f"  {'feature set':<28} {'n':>4} {'MAE':>9} {'argmax':>9}")
    best_k = (None, 9.9)
    for name, fc in candidates.items():
        if not fc:
            continue
        maes, ams = [], []
        for sp in folds:
            tr, te = sp.apply(h)
            m = OrdinalEmissions().fit(tr[fc], tr["state"].to_numpy(int))
            p = m.predict_proba(te[fc])
            y = te["state"].to_numpy(int)
            maes.append(np.abs(p @ STATES - y).mean())
            ams.append(np.abs(p.argmax(1) - y).mean())
        mm, ma = float(np.mean(maes)), float(np.mean(ams))
        mark = ""
        if min(mm, ma) < best_k[1]:
            best_k, mark = (name, min(mm, ma)), "  <--"
        print(f"  {name:<28} {len(fc):>4} {mm:>9.3f} {ma:>9.3f}{mark}")

    print("\n" + "-" * 74)
    print(f"best tremor : {best_t[0]}  AUC {best_t[1]:.3f}")
    print(f"best kinesia: {best_k[0]}  MAE {best_k[1]:.3f}  "
          f"(bar {BASELINE_MAE:.3f})")


if __name__ == "__main__":
    main()
