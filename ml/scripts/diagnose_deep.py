"""Deep diagnostic: is anything in this dataset learnable across people?

The kinesia result is poor. Before accepting that as the finding, four checks
that separate "the pipeline is broken" from "this particular target is hard".

  1. TREMOR. TremorScore is a 4-8 Hz mechanical oscillation — a physical event
     an accelerometer directly measures. KinesiaScore is a subjective functional
     state ("how well did you move this hour"). These should NOT be equally
     learnable, and if tremor also fails at chance then something upstream is
     broken rather than the target being hard.

  2. ACTIVITY STRATIFICATION. A still wrist at 3am looks identical whether the
     person feels good or severely akinetic. If accuracy is much better on
     active hours, that is an identifiability map rather than a failure — and it
     is what makes abstention meaningful instead of arbitrary.

  3. WITHIN-PARTICIPANT, adequately sized. Earlier personalisation used ~22
     calibration hours and overfitted. Leave-one-day-out uses most of the week.

  4. RAW FEATURE-LABEL ASSOCIATION. If no single feature separates states even
     within a participant, no model will.

    python ml/scripts/diagnose_deep.py
"""

from __future__ import annotations

import pathlib
import sys
import warnings

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from scipy import stats
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
    agg.update({"state": "first", "tremor_score": "first", "asleep": "first"})
    return df.groupby(KEY, as_index=False).agg(agg)


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = feature_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]
    h = to_hourly(df, cols)
    folds = group_kfold(people, n_folds=3)

    print(f"{len(h):,} labelled hours, {h.participant.nunique()} participants\n")

    # ── 1. TREMOR vs KINESIA, same pipeline, same folds ─────────────────────
    print("=" * 70)
    print("1. TREMOR (physical oscillation) vs KINESIA (subjective state)")
    print("=" * 70)

    for name, ymaker, desc in [
        ("tremor  (any vs none)", lambda d: (d["tremor_score"].fillna(0) > 0).astype(int),
         "diary TremorScore > 0"),
        ("kinesia (OFF vs ON)", lambda d: (d["state"] <= 2).astype(int),
         "state <= 2, i.e. akinetic"),
    ]:
        aucs, bals, prev = [], [], []
        for sp in folds:
            tr, te = sp.apply(h)
            ytr, yte = ymaker(tr).to_numpy(), ymaker(te).to_numpy()
            if len(np.unique(ytr)) < 2 or len(np.unique(yte)) < 2:
                continue
            w = np.where(ytr == 1, (ytr == 0).sum() / max((ytr == 1).sum(), 1), 1.0)
            clf = HistGradientBoostingClassifier(
                max_iter=300, learning_rate=0.06, random_state=0, early_stopping=True
            ).fit(tr[cols], ytr, sample_weight=w)
            p = clf.predict_proba(te[cols])[:, 1]
            aucs.append(roc_auc_score(yte, p))
            bals.append(balanced_accuracy_score(yte, (p > 0.5).astype(int)))
            prev.append(yte.mean())
        print(f"\n  {name:<24} {desc}")
        print(f"    AUC {np.mean(aucs):.3f} +/- {np.std(aucs):.3f}   "
              f"balanced acc {np.mean(bals):.3f}   prevalence {np.mean(prev):.1%}")

    # ── 2. stratify by activity ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("2. Does accuracy depend on whether there was movement to measure?")
    print("=" * 70)
    act_col = "left_enmo_mean"
    sp = folds[0]
    tr, te = sp.apply(h)
    m = OrdinalEmissions().fit(tr[cols], tr["state"].to_numpy(int))
    p = m.predict_proba(te[cols])
    err = np.abs(p @ STATES - te["state"].to_numpy(int))

    q = pd.qcut(te[act_col], 4, labels=["Q1 stillest", "Q2", "Q3", "Q4 most active"])
    print(f"\n  {'activity quartile':<18} {'n':>6} {'model MAE':>10} {'const MAE':>10} {'better?':>8}")
    for lab in q.cat.categories:
        sel = (q == lab).to_numpy()
        const = np.abs(3 - te["state"].to_numpy(int)[sel]).mean()
        mm = err[sel].mean()
        print(f"  {str(lab):<18} {sel.sum():>6} {mm:>10.3f} {const:>10.3f} "
              f"{'yes' if mm < const else 'no':>8}")

    # ── 3. within-participant, leave-one-day-out ───────────────────────────
    print("\n" + "=" * 70)
    print("3. WITHIN participant: train on their other days, test on one")
    print("=" * 70)
    rows = []
    for pid, g in h.groupby("participant"):
        days = sorted(g["day"].unique())
        if len(days) < 4 or len(g) < 60:
            continue
        errs, base, n = [], [], 0
        for d in days:
            tr_d, te_d = g[g["day"] != d], g[g["day"] == d]
            ytr = tr_d["state"].to_numpy(int)
            if len(te_d) < 5 or len(np.unique(ytr)) < 2:
                continue
            mm = OrdinalEmissions(max_iter=150, min_samples_leaf=10).fit(tr_d[cols], ytr)
            pe = mm.predict_proba(te_d[cols]) @ STATES
            y = te_d["state"].to_numpy(int)
            own = float(np.median(ytr))
            errs.append(np.abs(pe - y).sum())
            base.append(np.abs(own - y).sum())
            n += len(y)
        if n >= 40:
            rows.append({"participant": pid, "n": n,
                         "model": sum(errs) / n, "own_const": sum(base) / n})
    r = pd.DataFrame(rows)
    w = r["n"]
    print(f"\n  {len(r)} participants with enough days")
    print(f"    model MAE            {np.average(r['model'], weights=w):.3f}")
    print(f"    their own constant   {np.average(r['own_const'], weights=w):.3f}")
    print(f"    model wins on        {int((r['model'] < r['own_const']).sum())}/{len(r)}")

    # ── 4. raw association, within participant ─────────────────────────────
    print("\n" + "=" * 70)
    print("4. Do ANY features track state within a single participant?")
    print("=" * 70)
    best = []
    for c in cols:
        rhos = []
        for pid, g in h.groupby("participant"):
            if g["state"].nunique() < 3 or len(g) < 50:
                continue
            rho, _ = stats.spearmanr(g[c], g["state"])
            if np.isfinite(rho):
                rhos.append(rho)
        if len(rhos) >= 20:
            best.append((c, float(np.mean(rhos)), float(np.mean(np.abs(rhos)))))
    bdf = pd.DataFrame(best, columns=["feature", "mean_rho", "mean_abs_rho"])
    print("\n  strongest CONSISTENT association (mean rho, sign matters):")
    print(bdf.reindex(bdf.mean_rho.abs().sort_values(ascending=False).index)
          .head(8).to_string(index=False))
    print("\n  strongest association ignoring sign (mean |rho|):")
    print(bdf.sort_values("mean_abs_rho", ascending=False).head(8).to_string(index=False))
    print("\n  A feature with high mean|rho| but near-zero mean rho tracks state")
    print("  strongly within people but in OPPOSITE DIRECTIONS between them -")
    print("  which is exactly what makes a global model impossible.")


if __name__ == "__main__":
    main()
