"""Train the emission model and answer the only question that matters today:

    does it beat ordinal MAE 0.594?

Everything is scored on HELD-OUT PARTICIPANTS at HOURLY resolution. The demo
participant and its backup are excluded from training entirely — if COPS-29 were
trained on, the reveal would be a lie.

    python ml/scripts/train.py                 # cross-validated, then the demo fit
    python ml/scripts/train.py --folds 3       # faster while iterating
    python ml/scripts/train.py --quick         # one fold, for a smoke check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import joblib
import numpy as np
import pandas as pd

from astrolabe.features import feature_columns
from astrolabe.metrics import (
    BASELINE_MAE,
    ORACLE_PERSONALISED_MAE,
    evaluate,
    per_participant,
    summarise_spread,
)
from astrolabe.model import OrdinalEmissions, credible_interval, hourly_posterior
from astrolabe.splits import demo_split, eligible_participants, group_kfold

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
FEATURES = ROOT / "data" / "cops" / "features" / "features.parquet"
COVERAGE = ROOT / "data" / "cops" / "derived" / "participants.csv"
ARTIFACTS = ROOT / "data" / "cops" / "artifacts"

DEMO = "COPS-29"
BACKUP = "COPS-28"


def fit_and_score(df: pd.DataFrame, split, cols: list[str], label: str):
    train_df, test_df = split.apply(df)
    if test_df.empty:
        return None, None, None

    model = OrdinalEmissions().fit(train_df[cols], train_df["state"].to_numpy())
    proba = model.predict_proba(test_df[cols])

    hourly = hourly_posterior(test_df, proba)
    intervals = credible_interval(hourly[[f"p{k}" for k in range(7)]].to_numpy())
    result = evaluate(hourly, intervals=intervals)

    print(f"\n── {label} ──")
    print(result)
    return model, hourly, result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()

    if not FEATURES.exists():
        sys.exit(f"{FEATURES} not found — run ml/scripts/build_features.py first")

    df = pd.read_parquet(FEATURES)
    cols = feature_columns(df)
    coverage = pd.read_csv(COVERAGE)
    people = [p for p in eligible_participants(coverage) if p in set(df.participant)]

    print(f"{len(df):,} windows / {df.participant.nunique()} participants / "
          f"{len(cols)} features")
    print(f"{len(people)} eligible to hold out")
    print(f"\nbar to beat: ordinal MAE {BASELINE_MAE:.3f} (always predict 'Good kinesia')")
    print(f"oracle personalisation: {ORACLE_PERSONALISED_MAE:.3f}\n")

    t0 = time.time()

    # ── cross-validated estimate over held-out participants ─────────────────
    folds = group_kfold(people, n_folds=args.folds)
    if args.quick:
        folds = folds[:1]

    results, hourlies = [], []
    for split in folds:
        _, hourly, result = fit_and_score(df, split, cols, split.name)
        if result is not None:
            results.append(result)
            hourlies.append(hourly)

    maes = np.array([r.ordinal_mae for r in results])
    all_hourly = pd.concat(hourlies, ignore_index=True)

    print("\n" + "═" * 72)
    print(f"CROSS-VALIDATED over {len(results)} folds, {int(sum(r.n_hours for r in results)):,} held-out hours")
    print(f"  ordinal MAE  {maes.mean():.3f} +/- {maes.std():.3f}   "
          f"(per fold: {', '.join(f'{m:.3f}' for m in maes)})")
    print(f"  baseline     {BASELINE_MAE:.3f}")

    beat = maes.mean() < BASELINE_MAE
    print(f"\n  {'PASS' if beat else 'FAIL'}: "
          f"{'beats' if beat else 'DOES NOT BEAT'} the baseline "
          f"({(BASELINE_MAE - maes.mean()) / BASELINE_MAE:+.1%})")
    if not beat:
        print("\n  -> MODEL.md section 10: drop to 3-class "
              "(akinetic / functional / dyskinetic) and lead with macro-F1.")
    print("═" * 72)

    pp = per_participant(all_hourly)
    print("\n" + summarise_spread(pp))
    print("\nworst 5 participants:")
    print(pp.tail(5).to_string(index=False))

    # ── the model the demo actually uses ────────────────────────────────────
    print("\n" + "═" * 72)
    print(f"DEMO FIT — {DEMO} and {BACKUP} held out of training entirely")
    split = demo_split(people, demo=DEMO, backup=BACKUP)
    model, hourly, result = fit_and_score(df, split, cols, "demo")

    assert DEMO not in split.train, "demo participant leaked into training"

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "feature_columns": cols}, ARTIFACTS / "emissions.joblib")
    hourly.to_parquet(ARTIFACTS / "demo_hourly.parquet", index=False)

    summary = {
        "cv_mae_mean": float(maes.mean()),
        "cv_mae_std": float(maes.std()),
        "cv_mae_per_fold": [float(m) for m in maes],
        "baseline_mae": BASELINE_MAE,
        "beats_baseline": bool(beat),
        "n_folds": len(results),
        "demo": result.as_dict() if result else None,
        "per_participant_median_mae": float(pp["mae"].median()),
        "elapsed_s": round(time.time() - t0, 1),
    }
    (ARTIFACTS / "train_summary.json").write_text(json.dumps(summary, indent=1))

    print(f"\nwrote {ARTIFACTS}/emissions.joblib, demo_hourly.parquet, train_summary.json")
    print(f"total {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
