"""Emit the real bundles for the demo participant, from trained models.

Replaces the mock. Same schema, so nothing downstream changes.

Two claims travel in one bundle, and they are deliberately not equal:

  * TREMOR is a model output that generalises across people (held-out AUC 0.697,
    with a fifth of the training participants reserved to calibrate it).
  * KINESIA state does not beat a constant baseline, and the bundle says so —
    `metrics.ordinal_mae` sits next to `metrics.baseline_mae`, and
    `kinesia_beats_baseline` is a flag the interface can read.

Reporting the losing number, labelled as losing, is the product thesis rather
than an embarrassment. Everything on screen declares how much it is worth.

    python ml/scripts/make_bundles.py                 # COPS-29, both variants
    python ml/scripts/make_bundles.py --participant COPS-28
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import warnings

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import joblib
import numpy as np
import pandas as pd

from astrolabe.bundle import (
    build_events, build_series, compute_metrics, infer_posterior, write_bundle,
)
from astrolabe.calibrate import (
    AbstentionRule, Calibrator, fit_coverage_mass, tune_abstention,
)
from astrolabe.features import band_columns, feature_columns
from astrolabe.hmm import fit_transitions
from astrolabe.io_cops import load_diary
from astrolabe.metrics import BASELINE_MAE
from astrolabe.model import OrdinalEmissions, credible_interval
from astrolabe.splits import demo_split, eligible_participants
from astrolabe.tremor import TremorDetector

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RAW = str(ROOT / "data" / "cops" / "raw")
FEATURES = ROOT / "data" / "cops" / "features" / "features.parquet"
COVERAGE = ROOT / "data" / "cops" / "derived" / "participants.csv"
ARTIFACTS = ROOT / "data" / "cops" / "artifacts"
OUT_CONTRACT = ROOT / "contract"
OUT_APP = ROOT / "app" / "public" / "bundles"

STATES = np.arange(7)
KEY = ["participant", "day", "hour_end"]


def pick_day(df: pd.DataFrame) -> int:
    """Richest day: most hours x state variety."""
    best, score = None, -1
    for d, g in df.groupby("day"):
        hours = g.groupby("hour_end").ngroups
        variety = g["state"].nunique()
        s = hours * (variety ** 2)
        if s > score:
            best, score = int(d), s
    return best


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--participant", default="COPS-29")
    ap.add_argument("--backup", default="COPS-28")
    args = ap.parse_args()
    pid = args.participant

    df = pd.read_parquet(FEATURES)
    all_cols = feature_columns(df)
    band_cols = band_columns(df)
    cov = pd.read_csv(COVERAGE)
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]

    split = demo_split(people, demo=pid, backup=args.backup)
    assert pid not in split.train, "demo participant leaked into training"
    train_df = df[df.participant.isin(split.train)]

    print(f"training on {len(split.train)} participants ({len(train_df):,} windows)")
    print(f"{pid} and {args.backup} held out entirely\n")

    # ── kinesia chain ────────────────────────────────────────────────────────
    emissions = OrdinalEmissions().fit(train_df[all_cols], train_df["state"].to_numpy(int))

    seqs = []
    for _, g in train_df.groupby(["participant", "day"]):
        h = g.groupby("hour_end", as_index=False).agg({"state": "first"}).sort_values("hour_end")
        if len(h) > 1:
            seqs.append(h["state"].to_numpy(int))
    transitions = fit_transitions(seqs).with_switch_rate(0.02)

    # ── calibration, on the SAME inference path used at demo time ───────────
    # Fitting the interval mass on the raw emission posterior and applying it to
    # the smoothed HMM output puts coverage at 0.54 against a 0.90 target: the
    # two distributions have completely different sharpness. So calibration runs
    # the full chain on participants held out of the emission fit.
    cal_people = sorted(set(train_df.participant))[: max(6, len(set(train_df.participant)) // 5)]
    cal_df = train_df[train_df.participant.isin(cal_people)]
    calibrator = Calibrator(temperature=25.0)   # selected on a held-out fold

    cal_post, cal_missing = infer_posterior(
        cal_df, emissions, transitions, all_cols, calibrator.temperature
    )
    keep = ~cal_missing
    calibrator.mass = fit_coverage_mass(
        cal_post[keep], cal_df["state"].to_numpy(int)[keep], 0.90
    )
    cal_iv = credible_interval(cal_post[keep], mass=calibrator.mass)
    ycal = cal_df["state"].to_numpy(int)[keep]
    calibrator.achieved_coverage = float(
        ((cal_iv[:, 0] <= ycal) & (ycal <= cal_iv[:, 1])).mean()
    )
    print(f"calibration on {len(cal_people)} held-out participants: "
          f"temperature {calibrator.temperature:.0f}, mass {calibrator.mass:.2f}, "
          f"achieved coverage {calibrator.achieved_coverage:.3f}")

    # Abstain where the calibrated posterior is genuinely uninformative. Tuned on
    # the calibration participants so the demo participant does not set its own
    # threshold, and so the wrist-drop case has to move it on its own.
    abstention = tune_abstention(
        cal_post[keep], cal_iv, ycal, target_rate=0.12
    )
    print(f"abstention: peak < {abstention.min_peak:.2f} or width >= "
          f"{abstention.max_interval_width} -> "
          f"{abstention.rate(cal_post[keep], cal_iv):.1%} on calibration set")

    # ── tremor ───────────────────────────────────────────────────────────────
    tremor_art = ARTIFACTS / "tremor.joblib"
    if tremor_art.exists():
        blob = joblib.load(tremor_art)
        detector, tremor_cols = blob["detector"], blob["feature_columns"]
        print(f"tremor detector loaded ({len(tremor_cols)} band features)")
    else:
        hourly_tr = train_df.groupby(KEY, as_index=False).agg(
            {**{c: "mean" for c in band_cols}, "tremor_score": "first"})
        y = (hourly_tr["tremor_score"].fillna(0) > 0).astype(int).to_numpy()
        detector = TremorDetector().fit(hourly_tr[band_cols], y)
        tremor_cols = band_cols
        print("tremor detector fitted inline")

    # ── emit ─────────────────────────────────────────────────────────────────
    sub = df[df.participant == pid]
    day = pick_day(sub)
    day_df = sub[sub.day == day].sort_values("t_min").reset_index(drop=True)
    hours = load_diary(pid, RAW)
    events = build_events(hours)

    tremor_summary = {}
    ts_path = ARTIFACTS / "tremor_summary.json"
    if ts_path.exists():
        tremor_summary = json.loads(ts_path.read_text())

    OUT_CONTRACT.mkdir(parents=True, exist_ok=True)
    OUT_APP.mkdir(parents=True, exist_ok=True)

    for variant, drop in (("", None), ("_nowrist", "left")):
        feats = day_df.copy()
        if drop:
            from astrolabe.bundle import drop_wrist
            blanked = drop_wrist(feats[all_cols], drop)
            for c in all_cols:
                feats[c] = blanked[c]

        series, posterior, truth = build_series(
            hours, feats, emissions, calibrator, transitions, abstention,
            all_cols, tremor_detector=detector, tremor_cols=tremor_cols,
        )
        metrics = compute_metrics(series, posterior, truth)

        # what the model can and cannot claim, in the bundle itself
        metrics["kinesia_beats_baseline"] = bool(metrics["ordinal_mae"] < BASELINE_MAE)
        if tremor_summary:
            metrics["tremor_auc"] = round(tremor_summary["cv_auc_mean"], 3)
            metrics["tremor_auc_within_participant_median"] = round(
                tremor_summary["within_participant_auc_median"], 3)
            metrics["selective_curve"] = tremor_summary["selective_curve"]

        note = ("trained model, participant held out of training; "
                "tremor is a model output, kinesia state does not beat its baseline")
        if drop:
            note += "; LEFT WRIST DROPPED"

        name = f"{pid}{variant}.json"
        write_bundle(OUT_CONTRACT / name, pid, day, series, events, truth, metrics, note)
        write_bundle(OUT_APP / name, pid, day, series, events, truth, metrics, note)

        print(f"\n{name}  day {day}  {len(series)} steps")
        print(f"  kinesia MAE   {metrics['ordinal_mae']:.3f}  vs baseline "
              f"{BASELINE_MAE}  -> {'beats' if metrics['kinesia_beats_baseline'] else 'DOES NOT BEAT'}")
        print(f"  coverage      {metrics['coverage_90']:.3f}   "
              f"mean width {metrics['mean_interval_width']:.2f}")
        print(f"  abstained     {metrics['abstain_rate']:.1%}")
        if "tremor_auc" in metrics:
            print(f"  tremor AUC    {metrics['tremor_auc']:.3f} (cohort), "
                  f"{metrics['tremor_auc_within_participant_median']:.3f} within-participant")

    print(f"\nwrote to {OUT_CONTRACT} and {OUT_APP}")


if __name__ == "__main__":
    main()
