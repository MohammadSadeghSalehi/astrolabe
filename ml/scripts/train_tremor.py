"""Train and evaluate the tremor detector, and save the demo artifact.

Reports pooled AUC, the within-participant spread, calibration and the selective
curve — then fits the model the demo uses, with COPS-29 and COPS-28 held out of
training entirely.

    python ml/scripts/train_tremor.py
"""

from __future__ import annotations

import json
import pathlib
import sys
import warnings

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from astrolabe.features import band_columns
from astrolabe.splits import demo_split, eligible_participants, group_kfold
from astrolabe.tremor import TremorDetector, per_participant_auc, selective_curve

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
ARTIFACTS = ROOT / "data" / "cops" / "artifacts"
KEY = ["participant", "day", "hour_end"]
DEMO, BACKUP = "COPS-29", "COPS-28"


def to_hourly(df, cols):
    agg = {c: "mean" for c in cols}
    agg.update({"state": "first", "tremor_score": "first"})
    return df.groupby(KEY, as_index=False).agg(agg)


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = band_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]

    h = to_hourly(df, cols)
    h["tremor_score"] = h["tremor_score"].fillna(0)
    h["y"] = (h["tremor_score"] > 0).astype(int)

    print(f"{len(h):,} hours / {h.participant.nunique()} participants / "
          f"{len(cols)} band features")
    print(f"tremor prevalence {h.y.mean():.1%}\n")

    # ── cross-validated, with calibration fitted inside each fold ───────────
    folds = group_kfold(people, n_folds=5)
    oof_p, oof_y, oof_pid, aucs = [], [], [], []

    for sp in folds:
        tr, te = sp.apply(h)
        ytr, yte = tr.y.to_numpy(), te.y.to_numpy()
        if len(np.unique(ytr)) < 2 or len(np.unique(yte)) < 2:
            continue

        # hold out a slice of TRAINING participants to calibrate on, so the
        # calibrator never sees the fold's test people
        cal_people = sorted(set(tr.participant))[: max(3, len(set(tr.participant)) // 5)]
        fit_mask = ~tr.participant.isin(cal_people)
        det = TremorDetector().fit(tr[fit_mask][cols], ytr[fit_mask.to_numpy()])
        det.calibrate(tr[~fit_mask][cols], ytr[(~fit_mask).to_numpy()])

        p = det.predict_proba(te[cols])
        aucs.append(roc_auc_score(yte, p))
        oof_p.append(p), oof_y.append(yte), oof_pid.append(te.participant.to_numpy())

    p = np.concatenate(oof_p)
    y = np.concatenate(oof_y)
    pid = np.concatenate(oof_pid)

    print("=" * 66)
    print("CROSS-VALIDATED, held-out participants")
    print("=" * 66)
    print(f"  AUC                {np.mean(aucs):.3f} +/- {np.std(aucs):.3f}")
    print(f"  pooled OOF AUC     {roc_auc_score(y, p):.3f}   ({len(y):,} hours)")
    print(f"  average precision  {average_precision_score(y, p):.3f}   "
          f"(prevalence {y.mean():.3f})")
    print(f"  Brier              {brier_score_loss(y, p):.3f}")

    pp = per_participant_auc(p, y, pid)
    print(f"\n  WITHIN-participant AUC — the figure that matters for a diary")
    print(f"    median {pp.auc.median():.3f}   "
          f"IQR [{pp.auc.quantile(.25):.3f}, {pp.auc.quantile(.75):.3f}]")
    print(f"    above chance on {int((pp.auc > 0.5).sum())}/{len(pp)} participants")
    print(f"    -> the pooled figure is partly separating tremor-dominant people")
    print(f"       from others. Say so before anyone asks.")

    sc = selective_curve(p, y)
    print(f"\n  SELECTIVE PREDICTION")
    print(sc.to_string(index=False, float_format=lambda v: f"{v:.3f}"))

    # ── the demo model ─────────────────────────────────────────────────────
    print("\n" + "=" * 66)
    print(f"DEMO FIT — {DEMO} and {BACKUP} never trained on")
    print("=" * 66)
    sp = demo_split(people, demo=DEMO, backup=BACKUP)
    tr, te = sp.apply(h)
    assert DEMO not in sp.train

    cal_people = sorted(set(tr.participant))[: len(set(tr.participant)) // 5]
    fit_mask = ~tr.participant.isin(cal_people)
    det = TremorDetector().fit(tr[fit_mask][cols], tr[fit_mask].y.to_numpy())
    det.calibrate(tr[~fit_mask][cols], tr[~fit_mask].y.to_numpy())

    pte = det.predict_proba(te[cols])
    yte = te.y.to_numpy()
    print(f"  {DEMO}+{BACKUP}: {len(yte)} hours, prevalence {yte.mean():.1%}, "
          f"AUC {roc_auc_score(yte, pte):.3f}")

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"detector": det, "feature_columns": cols}, ARTIFACTS / "tremor.joblib")
    summary = {
        "target": "tremor present (diary TremorScore > 0)",
        "n_features": len(cols),
        "cv_auc_mean": float(np.mean(aucs)),
        "cv_auc_std": float(np.std(aucs)),
        "pooled_oof_auc": float(roc_auc_score(y, p)),
        "average_precision": float(average_precision_score(y, p)),
        "prevalence": float(y.mean()),
        "brier": float(brier_score_loss(y, p)),
        "within_participant_auc_median": float(pp.auc.median()),
        "within_participant_above_chance": f"{int((pp.auc > 0.5).sum())}/{len(pp)}",
        "selective_curve": sc.to_dict(orient="records"),
        "demo_auc": float(roc_auc_score(yte, pte)),
    }
    (ARTIFACTS / "tremor_summary.json").write_text(json.dumps(summary, indent=1))
    print(f"\nwrote {ARTIFACTS}/tremor.joblib and tremor_summary.json")


if __name__ == "__main__":
    main()
