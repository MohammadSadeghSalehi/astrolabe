"""Does temporal smoothing rescue the emission model?

The emission model scores MAE 0.684 against a 0.594 constant baseline. Its
argmax scores 0.588. That gap is the signature of a noisy per-window estimate:
the model wobbles around the dominant state without enough information, and the
wobble costs more than it gains.

Removing exactly that wobble is what the HMM is for. Motor state is strongly
autocorrelated — carrying the previous hour's label forward scores 0.215 — so a
sticky chain should suppress implausible switching while keeping the excursions
that are genuinely supported.

Also reports SELECTIVE RISK: error on the hours the model answers versus the
hours it declines. If abstention is working, the hours it refuses are the ones
it would have got wrong, and that difference is the product claim.

    python ml/scripts/diagnose_hmm.py
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from astrolabe.calibrate import AbstentionRule, Calibrator, selective_risk
from astrolabe.features import feature_columns
from astrolabe.hmm import fit_transitions, forward_backward, uniform_where_missing
from astrolabe.metrics import BASELINE_MAE
from astrolabe.model import OrdinalEmissions, credible_interval
from astrolabe.splits import eligible_participants, group_kfold

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
FEATURES = ROOT / "data" / "cops" / "features" / "features.parquet"
COVERAGE = ROOT / "data" / "cops" / "derived" / "participants.csv"

STATES = np.arange(7)


def hourly_from_windows(df: pd.DataFrame, post: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Average window posteriors within each labelled hour."""
    tmp = df[["participant", "day", "hour_end", "state"]].copy().reset_index(drop=True)
    for k in range(7):
        tmp[f"p{k}"] = post[:, k]
    agg = tmp.groupby(["participant", "day", "hour_end"], as_index=False).agg(
        {**{f"p{k}": "mean" for k in range(7)}, "state": "first"})
    p = agg[[f"p{k}" for k in range(7)]].to_numpy()
    p = p / p.sum(axis=1, keepdims=True)
    return p, agg["state"].to_numpy(dtype=int)


def main() -> None:
    df = pd.read_parquet(FEATURES)
    cols = feature_columns(df)
    coverage = pd.read_csv(COVERAGE)
    people = [p for p in eligible_participants(coverage) if p in set(df.participant)]

    split = group_kfold(people, n_folds=3)[0]
    train_df, test_df = split.apply(df)
    ytr = train_df["state"].to_numpy(dtype=int)

    print(f"{len(train_df):,} train / {len(test_df):,} test windows, "
          f"{len(split.test)} held-out participants")
    print(f"bar: {BASELINE_MAE:.3f}\n")

    model = OrdinalEmissions().fit(train_df[cols], ytr)

    # transitions from TRAINING participants' hourly label sequences
    seqs = []
    for (_, _), g in train_df.groupby(["participant", "day"]):
        h = g.groupby("hour_end", as_index=False).agg({"state": "first"}).sort_values("hour_end")
        if len(h) > 1:
            seqs.append(h["state"].to_numpy(dtype=int))
    tm = fit_transitions(seqs)
    print(f"transitions from {len(seqs)} participant-days")

    # ── emission only, for reference ─────────────────────────────────────────
    p_em = model.predict_proba(test_df[cols])
    ph, y = hourly_from_windows(test_df, p_em)
    print(f"\nemission only            MAE(mean) {np.abs(ph @ STATES - y).mean():.3f}   "
          f"MAE(argmax) {np.abs(ph.argmax(1) - y).mean():.3f}")

    # ── HMM at several switch rates ─────────────────────────────────────────
    log_lik = model.log_likelihood(test_df[cols])
    missing = (test_df["coverage"] < 0.6).to_numpy()
    log_lik = uniform_where_missing(log_lik, missing)

    print(f"\n{'switch rate':>12}  {'MAE(mean)':>10}  {'MAE(argmax)':>12}  {'coverage90':>11}  {'width':>6}")
    print("-" * 60)

    best = None
    for s in [0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3]:
        cand = tm.with_switch_rate(s)
        parts = []
        for (_, _), g in test_df.groupby(["participant", "day"], sort=False):
            idx = g.index.to_numpy()
            pos = test_df.index.get_indexer(idx)
            order = np.argsort(g["t_min"].to_numpy())
            gamma, _ = forward_backward(log_lik[pos][order], cand)
            out = np.empty_like(gamma)
            out[order] = gamma
            parts.append((idx, out))

        post = np.zeros_like(log_lik)
        for idx, gam in parts:
            post[test_df.index.get_indexer(idx)] = gam

        ph, y = hourly_from_windows(test_df, post)
        mae = float(np.abs(ph @ STATES - y).mean())
        mae_am = float(np.abs(ph.argmax(1) - y).mean())
        iv = credible_interval(ph, mass=0.90)
        cov = float(((iv[:, 0] <= y) & (y <= iv[:, 1])).mean())
        wid = float((iv[:, 1] - iv[:, 0] + 1).mean())
        flag = "  <-- best" if best is None or mae < best[1] else ""
        if best is None or mae < best[1]:
            best = (s, mae, ph, y, post)
        print(f"{s:>12.3f}  {mae:>10.3f}  {mae_am:>12.3f}  {cov:>11.3f}  {wid:>6.2f}{flag}")

    s, mae, ph, y, post = best
    print("-" * 60)
    print(f"{'baseline':>12}  {BASELINE_MAE:>10.3f}")
    print(f"\nbest switch rate {s} -> MAE {mae:.3f}  "
          f"({'BEATS' if mae < BASELINE_MAE else 'still short of'} baseline)")

    # ── calibration + selective risk ────────────────────────────────────────
    n = len(ph)
    half = n // 2
    log_ph = np.log(np.maximum(ph, 1e-12))
    cal = Calibrator().fit(log_ph[:half], y[:half])
    print(f"\ncalibration (fitted on half the held-out hours): {cal}")

    p_cal = cal.transform(log_ph[half:])
    y2 = y[half:]
    iv = cal.intervals(p_cal)
    rule = AbstentionRule(min_peak=0.35)
    ab = rule.should_abstain(p_cal, iv)
    sr = selective_risk(p_cal, y2, ab)

    print(f"\nSELECTIVE RISK on the other half:")
    print(f"  abstain rate      {sr['abstain_rate']:.1%}")
    print(f"  MAE answered      {sr['mae_answered']:.3f}")
    print(f"  MAE abstained     {sr['mae_abstained']:.3f}")
    print(f"  MAE all           {sr['mae_all']:.3f}")
    print(f"  baseline          {BASELINE_MAE:.3f}")
    if sr["mae_answered"] < sr["mae_abstained"]:
        print("\n  -> abstention is REAL: the hours it declines are the ones it "
              "would have got wrong.")
    else:
        print("\n  -> abstention is NOT selecting well; it is discarding data at random.")


if __name__ == "__main__":
    main()
