"""Does tempering the likelihoods before smoothing fix the HMM?

The HMM made things worse (0.812 vs 0.701 emission-only), and the calibrator
independently asked for temperature 6.0 — the ceiling of its range. Both point
at the same thing: the per-window likelihoods are grossly overconfident, so
multiplying roughly a hundred of them across a day drives the whole day onto one
state, confidently and often wrongly.

Tempering divides the log-likelihoods by T before the recursion, which flattens
each window's contribution so accumulating many of them does not explode. This
sweeps T against the switch rate.

    python ml/scripts/diagnose_temper.py
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from astrolabe.features import feature_columns
from astrolabe.hmm import fit_transitions, forward_backward, uniform_where_missing
from astrolabe.metrics import BASELINE_MAE
from astrolabe.model import OrdinalEmissions, credible_interval
from astrolabe.splits import eligible_participants, group_kfold

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
STATES = np.arange(7)


def main() -> None:
    df = pd.read_parquet(ROOT / "data/cops/features/features.parquet")
    cols = feature_columns(df)
    cov = pd.read_csv(ROOT / "data/cops/derived/participants.csv")
    people = [p for p in eligible_participants(cov) if p in set(df.participant)]

    split = group_kfold(people, n_folds=3)[0]
    tr, te = split.apply(df)
    te = te.reset_index(drop=True)

    model = OrdinalEmissions().fit(tr[cols], tr["state"].to_numpy(int))

    seqs = []
    for _, g in tr.groupby(["participant", "day"]):
        h = g.groupby("hour_end", as_index=False).agg({"state": "first"}).sort_values("hour_end")
        if len(h) > 1:
            seqs.append(h["state"].to_numpy(int))
    tm = fit_transitions(seqs)

    base_ll = uniform_where_missing(
        model.log_likelihood(te[cols]), (te["coverage"] < 0.6).to_numpy()
    )

    def to_hourly(post: np.ndarray):
        t = te[["participant", "day", "hour_end", "state"]].copy()
        for k in range(7):
            t[f"p{k}"] = post[:, k]
        a = t.groupby(["participant", "day", "hour_end"], as_index=False).agg(
            {**{f"p{k}": "mean" for k in range(7)}, "state": "first"})
        p = a[[f"p{k}" for k in range(7)]].to_numpy()
        p = p / p.sum(axis=1, keepdims=True)
        return p, a["state"].to_numpy(int)

    header = f"{'temper':>7} {'switch':>7} {'MAE':>7} {'MAEargmax':>10} {'cov90':>7} {'width':>6}"
    print(header)
    print("-" * len(header))

    best = (None, 9e9)
    for T in [1, 3, 6, 12, 25, 50, 100]:
        ll = base_ll / T
        for s in [0.02, 0.08, 0.2, 0.4]:
            cand = tm.with_switch_rate(s)
            post = np.zeros_like(ll)
            for _, g in te.groupby(["participant", "day"], sort=False):
                pos = g.index.to_numpy()
                order = np.argsort(g["t_min"].to_numpy())
                gamma, _ = forward_backward(ll[pos][order], cand)
                out = np.empty_like(gamma)
                out[order] = gamma
                post[pos] = out

            p, y = to_hourly(post)
            mae = float(np.abs(p @ STATES - y).mean())
            mae_am = float(np.abs(p.argmax(1) - y).mean())
            iv = credible_interval(p, 0.90)
            c = float(((iv[:, 0] <= y) & (y <= iv[:, 1])).mean())
            w = float((iv[:, 1] - iv[:, 0] + 1).mean())
            if mae < best[1]:
                best = ((T, s), mae)
            print(f"{T:>7} {s:>7.2f} {mae:>7.3f} {mae_am:>10.3f} {c:>7.3f} {w:>6.2f}")

    print("-" * len(header))
    print(f"baseline {BASELINE_MAE:.3f}   emission-only 0.701 / argmax 0.588")
    print(f"best {best[1]:.3f} at (temper, switch) = {best[0]}   "
          f"-> {'BEATS baseline' if best[1] < BASELINE_MAE else 'still short'}")


if __name__ == "__main__":
    main()
