"""Push the tremor result — the one target that generalises across people.

Held-out AUC was 0.682 for tremor against 0.567 for kinesia, on the same folds
and the same pipeline. That gap is the point: tremor is a 4-8 Hz mechanical
oscillation the accelerometer directly measures, while kinesia is a subjective
judgement about how well an hour went. One is in the signal; the other largely
is not.

This establishes how good tremor detection actually gets, and — since the demo
turns on refusing when evidence is weak — how well it selects.

    python ml/scripts/diagnose_tremor.py
"""

from __future__ import annotations

import pathlib
import sys
import warnings

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    roc_auc_score,
)

from astrolabe.features import feature_columns
from astrolabe.splits import eligible_participants, group_kfold

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
KEY = ["participant", "day", "hour_end"]


def to_hourly(df, cols):
    agg = {c: "mean" for c in cols}
    agg.update({"state": "first", "tremor_score": "first"})
    return df.groupby(KEY, as_index=False).agg(agg)


def fit_eval(tr, te, cols, ytr, yte, **kw):
    w = np.where(ytr == 1, (ytr == 0).sum() / max((ytr == 1).sum(), 1), 1.0)
    clf = HistGradientBoostingClassifier(
        max_iter=kw.get("max_iter", 400), learning_rate=kw.get("lr", 0.05),
        max_leaf_nodes=kw.get("leaves", 31), min_samples_leaf=kw.get("leaf", 40),
        l2_regularization=1.0, random_state=0, early_stopping=True,
    ).fit(tr[cols], ytr, sample_weight=w)
    p = clf.predict_proba(te[cols])[:, 1]
    return clf, p


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = feature_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]
    h = to_hourly(df, cols)
    h["tremor_score"] = h["tremor_score"].fillna(0)
    folds = group_kfold(people, n_folds=5)

    print(f"{len(h):,} hours / {h.participant.nunique()} participants")
    print(f"tremor prevalence: any {100*(h.tremor_score>0).mean():.1f}%  "
          f"severe {100*(h.tremor_score>1).mean():.1f}%\n")

    # ── 1. how good does binary tremor get, 5 folds ─────────────────────────
    print("=" * 72)
    print("1. Tremor present vs absent — 5-fold, held-out participants")
    print("=" * 72)
    aucs, aps, bals, briers = [], [], [], []
    oof_p, oof_y, oof_pid = [], [], []
    for sp in folds:
        tr, te = sp.apply(h)
        ytr = (tr.tremor_score > 0).astype(int).to_numpy()
        yte = (te.tremor_score > 0).astype(int).to_numpy()
        if len(np.unique(ytr)) < 2 or len(np.unique(yte)) < 2:
            continue
        _, p = fit_eval(tr, te, cols, ytr, yte)
        aucs.append(roc_auc_score(yte, p))
        aps.append(average_precision_score(yte, p))
        bals.append(balanced_accuracy_score(yte, (p > 0.5).astype(int)))
        briers.append(brier_score_loss(yte, p))
        oof_p.append(p), oof_y.append(yte), oof_pid.append(te.participant.to_numpy())

    p = np.concatenate(oof_p); y = np.concatenate(oof_y)
    pid = np.concatenate(oof_pid)
    print(f"  AUC              {np.mean(aucs):.3f} +/- {np.std(aucs):.3f}")
    print(f"  average precision{np.mean(aps):.3f}   (prevalence {y.mean():.3f})")
    print(f"  balanced acc     {np.mean(bals):.3f}")
    print(f"  Brier            {np.mean(briers):.3f}")
    print(f"  pooled out-of-fold AUC {roc_auc_score(y, p):.3f} on {len(y):,} hours")

    # ── 2. per-participant spread ───────────────────────────────────────────
    rows = []
    for q in np.unique(pid):
        s = pid == q
        if len(np.unique(y[s])) < 2 or s.sum() < 25:
            continue
        rows.append({"participant": q, "n": int(s.sum()),
                     "prev": float(y[s].mean()), "auc": roc_auc_score(y[s], p[s])})
    r = pd.DataFrame(rows).sort_values("auc", ascending=False)
    print(f"\n  per-participant AUC (participants with both classes, n>=25):")
    print(f"    median {r.auc.median():.3f}   IQR [{r.auc.quantile(.25):.3f}, "
          f"{r.auc.quantile(.75):.3f}]   above 0.5 on {int((r.auc>0.5).sum())}/{len(r)}")

    # ── 3. SELECTIVE prediction: does confidence identify what it gets right? ──
    print("\n" + "=" * 72)
    print("2. Selective prediction — answer only the confident hours")
    print("=" * 72)
    conf = np.abs(p - 0.5) * 2                       # 0 = coin flip, 1 = certain
    print(f"\n  {'answer top':>11} {'n':>7} {'AUC':>7} {'balanced acc':>13} {'accuracy':>9}")
    for frac in (1.0, 0.75, 0.5, 0.35, 0.25):
        thr = np.quantile(conf, 1 - frac)
        s = conf >= thr
        if len(np.unique(y[s])) < 2:
            continue
        acc = ((p[s] > 0.5).astype(int) == y[s]).mean()
        print(f"  {frac:>10.0%} {s.sum():>7,} {roc_auc_score(y[s], p[s]):>7.3f} "
              f"{balanced_accuracy_score(y[s], (p[s]>0.5).astype(int)):>13.3f} {acc:>9.3f}")
    print("\n  Rising accuracy as the answered fraction shrinks means confidence")
    print("  is real and abstention selects. Flat means it is guessing.")

    # ── 4. which features carry it ──────────────────────────────────────────
    print("\n" + "=" * 72)
    print("3. What is the model actually using?")
    print("=" * 72)
    sp = folds[0]
    tr, te = sp.apply(h)
    ytr = (tr.tremor_score > 0).astype(int).to_numpy()
    yte = (te.tremor_score > 0).astype(int).to_numpy()
    _, base_p = fit_eval(tr, te, cols, ytr, yte)
    base = roc_auc_score(yte, base_p)

    groups = {
        "tremor-band (4-8 Hz)": [c for c in cols if "_tr_" in c or "tremor_ratio" in c],
        "movement-band (0.1-3)": [c for c in cols if "_mv_" in c],
        "ENMO / amplitude": [c for c in cols if "enmo" in c],
        "bilateral asymmetry": [c for c in cols if c.startswith("asym_")],
        "medication timing": [c for c in cols if "dose" in c],
        "temperature / light": [c for c in cols if "temp" in c or "light" in c],
    }
    print(f"\n  full model AUC {base:.3f}\n")
    print(f"  {'feature group':<24} {'n':>4} {'alone':>7} {'without':>8}")
    for name, gc in groups.items():
        if not gc:
            continue
        _, pa = fit_eval(tr, te, gc, ytr, yte)
        rest = [c for c in cols if c not in set(gc)]
        _, pw = fit_eval(tr, te, rest, ytr, yte)
        print(f"  {name:<24} {len(gc):>4} {roc_auc_score(yte, pa):>7.3f} "
              f"{roc_auc_score(yte, pw):>8.3f}")


if __name__ == "__main__":
    main()
