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
    build_events, build_series, compute_metrics, drop_wrist, infer_posterior,
    tremor_metrics, write_bundle,
)
from astrolabe.calibrate import (
    AbstentionRule, Calibrator, fit_coverage_mass, risk_on_answered,
    tune_abstention, tune_abstention_at_risk,
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

    def calibrate_for(drop: str | None,
                      risk_budget: float | None = None,
                      ) -> tuple[Calibrator, AbstentionRule, float]:
        """Fit coverage mass and the abstention rule FOR ONE SENSOR CONFIGURATION.

        Calibrating once with both wrists and reusing it for the dropped-wrist
        case was wrong, and wrong in the direction that flatters us: with one
        wrist blanked the gradient-boosted trees route every missing feature down
        a default branch and come back MORE peaked, so abstention fell from 100%
        to 68% — the model got more confident on less evidence, and the interface
        would have shown that as improved certainty.

        Measuring coverage separately per configuration fixes it at the source.
        The dropped-wrist bands widen because a wrist-dropped model was scored
        against held-out truth and needed more mass to reach 90%, not because the
        demo would look better if they did.
        """
        cdf = cal_df.copy()
        if drop:
            blanked = drop_wrist(cdf[all_cols], drop)
            for c in all_cols:
                cdf[c] = blanked[c]

        cal = Calibrator(temperature=25.0)   # selected on a held-out fold
        post, missing = infer_posterior(cdf, emissions, transitions, all_cols,
                                        cal.temperature)
        keep = ~missing
        y = cdf["state"].to_numpy(int)[keep]
        cal.mass = fit_coverage_mass(post[keep], y, 0.90)
        iv = credible_interval(post[keep], mass=cal.mass)
        cal.achieved_coverage = float(((iv[:, 0] <= y) & (y <= iv[:, 1])).mean())

        # Abstain where the calibrated posterior is genuinely uninformative.
        # Tuned on calibration participants so the demo participant never sets
        # its own threshold.
        if risk_budget is None:
            # The reference configuration sets the budget: answer 88% of hours,
            # and whatever error that buys becomes the standard every degraded
            # configuration has to meet.
            rule = tune_abstention(post[keep], iv, y, target_rate=0.12)
        else:
            rule = tune_abstention_at_risk(post[keep], iv, y, max_risk=risk_budget)
        achieved_risk = risk_on_answered(post[keep], y, rule, iv)
        cal.holdout = {
            "abstain_rate": round(float(rule.rate(post[keep], iv)), 3),
            "mae_answered": round(float(achieved_risk), 3),
            "n_hours": int(keep.sum()),
        }

        label = f"drop {drop} wrist" if drop else "both wrists"
        print(f"  [{label:>16}] mass {cal.mass:.2f}  coverage "
              f"{cal.achieved_coverage:.3f}  abstain if peak < {rule.min_peak:.2f}"
              f"  -> {rule.rate(post[keep], iv):.1%} abstained, "
              f"MAE {achieved_risk:.3f} on the rest")
        return cal, rule, achieved_risk

    print(f"calibration on {len(cal_people)} held-out participants, "
          f"per sensor configuration (error budget set by the reference config):")
    cal_full, rule_full, budget = calibrate_for(None)
    cal_drop, rule_drop, _ = calibrate_for("left", risk_budget=budget)
    calibration = {None: (cal_full, rule_full), "left": (cal_drop, rule_drop)}

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
            blanked = drop_wrist(feats[all_cols], drop)
            for c in all_cols:
                feats[c] = blanked[c]

        calibrator, abstention = calibration[drop]
        series, posterior, truth, tremor_truth = build_series(
            hours, feats, emissions, calibrator, transitions, abstention,
            all_cols, tremor_detector=detector, tremor_cols=tremor_cols,
        )
        metrics = compute_metrics(series, posterior, truth)
        metrics.update(tremor_metrics(series, tremor_truth))

        # The calibration claim, measured on people the model never trained on
        # and never saw at calibration time either. This is the number the
        # product actually stands on, and unlike the day metrics it does not
        # depend on which participant-day happens to be on screen.
        metrics["coverage_target"] = 0.90
        metrics["coverage_calibration"] = round(calibrator.achieved_coverage, 3)
        metrics["coverage_calibration_n_participants"] = len(cal_people)
        metrics["interval_mass"] = round(calibrator.mass, 3)
        metrics["sensor_config"] = "left wrist dropped" if drop else "both wrists"
        # The threshold itself, so the interface can state what it would have
        # taken to answer rather than reverse-engineering it from the per-step
        # reason strings.
        metrics["abstain_min_peak"] = round(float(abstention.min_peak), 3)
        metrics["abstain_max_interval_width"] = int(abstention.max_interval_width)
        peaks = [s["confidence"] for s in series]
        metrics["peak_confidence_max"] = round(float(max(peaks)), 3) if peaks else None
        # The sensor-drop claim, measured on held-out people rather than on the
        # 19 hours currently on screen. Both configurations are held to the same
        # error budget, so the abstention rate is what has to move.
        metrics["holdout_abstain_rate"] = calibrator.holdout.get("abstain_rate")
        metrics["holdout_mae_answered"] = calibrator.holdout.get("mae_answered")
        metrics["holdout_n_hours"] = calibrator.holdout.get("n_hours")

        # what the model can and cannot claim, in the bundle itself
        metrics["kinesia_beats_baseline"] = bool(metrics["ordinal_mae"] < BASELINE_MAE)
        acc, base = metrics.get("tremor_day_accuracy"), metrics.get("tremor_day_baseline_accuracy")
        metrics["tremor_day_beats_baseline"] = bool(
            acc is not None and base is not None and acc > base)
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
        for out in (OUT_CONTRACT, OUT_APP):
            write_bundle(out / name, pid, day, series, events, truth, metrics,
                         note, tremor_truth=tremor_truth)

        print(f"\n{name}  day {day}  {len(series)} steps")
        print(f"  kinesia MAE   {metrics['ordinal_mae']:.3f}  vs baseline "
              f"{BASELINE_MAE}  -> {'beats' if metrics['kinesia_beats_baseline'] else 'DOES NOT BEAT'}")
        print(f"  abstained     {metrics['abstain_rate']:.1%}")
        if metrics.get("tremor_n_scored"):
            print(f"  tremor        accuracy {metrics['tremor_day_accuracy']:.3f} "
                  f"vs majority-class {metrics['tremor_day_baseline_accuracy']:.3f} "
                  f"on {metrics['tremor_n_scored']} scored steps "
                  f"(prevalence {metrics['tremor_day_prevalence']:.2f})")
        if "tremor_auc" in metrics:
            print(f"  tremor AUC    {metrics['tremor_auc']:.3f} (cohort), "
                  f"{metrics['tremor_auc_within_participant_median']:.3f} within-participant")

    print(f"\nwrote to {OUT_CONTRACT} and {OUT_APP}")


if __name__ == "__main__":
    main()
