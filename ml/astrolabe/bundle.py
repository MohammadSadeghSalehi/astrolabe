"""Emit the frozen output contract.

One JSON bundle per participant-day. This is the only thing the interface reads,
and the mock generator already produces the same shape — so swapping a trained
model in for the mock changes no code downstream.

The dropped-wrist variant is produced by the same path with one wrist's features
set to NaN. HistGradientBoosting handles missing values natively, so this is a
genuine "what does the model believe with half the evidence" run rather than a
cosmetic widening of the bands. That honesty matters: the sensor-drop moment in
the demo is a claim about the model, and it should be one the model actually
makes.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from .calibrate import AbstentionRule, Calibrator, reason_for
from .features import WINDOW_MIN
from .hmm import TransitionModel, forward_backward, uniform_where_missing
from .io_cops import N_STATES, Hour, dose_events
from .metrics import BASELINE_MAE
from .model import OrdinalEmissions, credible_interval

STATE_NAMES = [
    "Severe akinesia", "Discomforting akinesia", "Slight akinesia",
    "Good kinesia",
    "Slight dyskinesia", "Discomforting dyskinesia", "Severe dyskinesia",
]


def json_safe(obj):
    """Replace every non-finite number with null, recursively.

    NaN is not JSON. `json.dumps` writes a bare `NaN` token, and `JSON.parse`
    rejects it outright — so a day on which the model abstains everywhere, and
    therefore has no MAE to report, would take the interface down instead of
    rendering as the honest refusal it is. The failure mode is the worst kind:
    it appears only on exactly the input the product exists to handle.
    """
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, (bool, np.bool_)):       # before int — bool subclasses it
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return f if math.isfinite(f) else None
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    return obj


def infer_posterior(
    features: pd.DataFrame,
    emissions: OrdinalEmissions,
    transitions: TransitionModel,
    feature_cols: list[str],
    temperature: float,
    group_cols: tuple[str, ...] = ("participant", "day"),
) -> tuple[np.ndarray, np.ndarray]:
    """The inference chain, in one place: emissions -> temper -> smooth.

    Calibration MUST be fitted on the output of this function, not on the raw
    emission posterior. Fitting an interval mass on one representation and
    applying it to another is how coverage silently lands at 0.54 against a 0.90
    target — the two distributions have completely different sharpness.

    Returns (posterior, missing_mask).
    """
    features = features.reset_index(drop=True)
    log_lik = emissions.log_likelihood(features[feature_cols]) / max(temperature, 1e-3)
    missing = (features["coverage"] < 0.6).to_numpy()
    log_lik = uniform_where_missing(log_lik, missing)

    posterior = np.zeros_like(log_lik)
    for _, g in features.groupby(list(group_cols), sort=False):
        pos = g.index.to_numpy()
        order = np.argsort(g["t_min"].to_numpy())
        gamma, _ = forward_backward(log_lik[pos][order], transitions)
        out = np.empty_like(gamma)
        out[order] = gamma
        posterior[pos] = out
    return posterior, missing


def drop_wrist(X: pd.DataFrame, side: str) -> pd.DataFrame:
    """Blank one wrist's features, and every asymmetry that depended on it.

    NaN rather than zero: zero is a *value* the model will happily reason from,
    and it would read as "this wrist was perfectly still". NaN is what the
    gradient-boosted trees interpret as genuinely missing.
    """
    out = X.copy()
    for col in out.columns:
        if col.startswith(f"{side}_") or col.startswith("asym_"):
            out[col] = np.nan
    return out


def build_series(
    hours: list[Hour],
    features: pd.DataFrame,
    emissions: OrdinalEmissions,
    calibrator: Calibrator,
    transitions: TransitionModel,
    abstention: AbstentionRule,
    feature_cols: list[str],
    tremor_detector=None,
    tremor_cols: list[str] | None = None,
) -> tuple[list[dict], np.ndarray, np.ndarray, list[int | None]]:
    """Run the full inference chain for one participant-day.

    Returns (series, posterior, kinesia-truth-per-step, tremor-truth-per-step).
    """
    features = features.sort_values("t_min").reset_index(drop=True)

    posterior, missing = infer_posterior(
        features, emissions, transitions, feature_cols, calibrator.temperature
    )
    intervals = credible_interval(posterior, mass=calibrator.mass)
    abstain = abstention.should_abstain(posterior, intervals) | missing

    # Tremor is a genuine model output — the one target that generalises across
    # people (AUC 0.697 held-out). It is computed independently of the kinesia
    # chain because it does NOT go through the HMM: tremor is intermittent
    # within an hour, so smoothing it over a trajectory would erase the thing
    # being measured.
    #
    # It is scored at HOURLY resolution because that is the resolution it was
    # trained at (train_tremor.py aggregates before fitting) and the resolution
    # the diary labels have. Feeding it single 10-minute windows was inference
    # out of distribution — a 10-minute band power is a noisier draw than the
    # mean of six of them — and it cost about 0.05 AUC on the demo participant.
    # The value is then held flat across the hour, which is also the honest
    # display: claiming 10-minute tremor resolution would be claiming a
    # precision neither the model nor the labels have.
    if tremor_detector is not None and tremor_cols:
        hourly = features.groupby("hour_end", as_index=False)[list(tremor_cols)].mean()
        p_by_hour = dict(zip(hourly["hour_end"],
                             tremor_detector.predict_proba(hourly[tremor_cols])))
        c_by_hour = dict(zip(hourly["hour_end"],
                             tremor_detector.confidence(hourly[tremor_cols])))
        tremor_p = features["hour_end"].map(p_by_hour).to_numpy(dtype=float)
        tremor_conf = features["hour_end"].map(c_by_hour).to_numpy(dtype=float)
    else:
        tremor_p = tremor_conf = None

    by_hour = {(h.day, h.hour_end): h for h in hours}
    series: list[dict] = []

    for i, row in features.iterrows():
        t_min = int(row["t_min"])
        hour = by_hour.get((int(row["day"]), int(row["hour_end"])))
        p = posterior[i]
        lo, hi = int(intervals[i, 0]), int(intervals[i, 1])
        is_abstain = bool(abstain[i])

        entry: dict = {
            "t": f"{t_min // 60:02d}:{t_min % 60:02d}",
            "abstain": is_abstain,
            "confidence": round(float(p.max()), 3),
            "evidence": "reconstructed",
            "reason": reason_for(
                is_abstain,
                wear=str(row.get("wear", "")),
                both_wrists=True,
                peak=float(p.max()),
                width=hi - lo + 1,
            ),
        }
        if is_abstain:
            entry["state"] = None
        else:
            entry["state"] = {
                "posterior": [round(float(v), 4) for v in p],
                "map": int(p.argmax()),
                "ci": [lo, hi],
            }

        # Tremor is reported even where the KINESIA chain abstains: they are
        # separate claims with separate evidence, and refusing one is not a
        # reason to withhold the other. It is suppressed only where the sensor
        # itself was missing.
        if tremor_p is None or missing[i]:
            entry["tremor_p"] = None
            entry["tremor_confidence"] = None
        else:
            entry["tremor_p"] = round(float(tremor_p[i]), 3)
            entry["tremor_confidence"] = round(float(tremor_conf[i]), 3)

        series.append(entry)

    truth = features["state"].to_numpy(dtype=int)

    # The tremor row is the one the model actually claims, so it is the one the
    # reveal has to be checkable against. Without a truth array beside it the
    # interface can uncover a trajectory but cannot score it, and an unscored
    # reveal is decoration.
    if "tremor_score" in features.columns:
        raw = pd.to_numeric(features["tremor_score"], errors="coerce")
        tremor_truth = [None if pd.isna(v) else int(v > 0) for v in raw]
    else:
        tremor_truth = [None] * len(features)

    return series, posterior, truth, tremor_truth


def build_events(hours: list[Hour]) -> list[dict]:
    """Reported medication intakes, as timeline events."""
    events = []
    for dose in dose_events(hours):
        events.append({
            "t": f"{dose.minute // 60:02d}:{dose.minute % 60:02d}",
            "type": "medication",
            "source": "reported",
            "drug": dose.drugs[0] if dose.drugs else None,
            "dose_mg": dose.total_mg or None,
            "day": dose.day,
        })
    return events


def compute_metrics(series: list[dict], posterior: np.ndarray,
                    truth: np.ndarray) -> dict:
    """Metrics over the answered steps, always beside the baseline."""
    answered = np.array([not s["abstain"] for s in series])
    states = np.arange(N_STATES)

    if answered.any():
        expected = posterior[answered] @ states
        y = truth[answered]
        mae = float(np.abs(expected - y).mean())
        iv = np.array([s["state"]["ci"] for s in series if not s["abstain"]])
        coverage = float(((iv[:, 0] <= y) & (y <= iv[:, 1])).mean())
        width = float((iv[:, 1] - iv[:, 0] + 1).mean())
        onehot = np.zeros((len(y), N_STATES))
        onehot[np.arange(len(y)), y] = 1.0
        brier = float(((posterior[answered] - onehot) ** 2).sum(axis=1).mean())
    else:
        mae = coverage = width = brier = float("nan")

    return {
        "ordinal_mae": round(mae, 3),
        "baseline_mae": BASELINE_MAE,
        "coverage_90": round(coverage, 3),
        "mean_interval_width": round(width, 2),
        "brier": round(brier, 3),
        "abstain_rate": round(float((~answered).mean()), 3),
        "n_steps": len(series),
        "n_answered": int(answered.sum()),
    }


def tremor_metrics(series: list[dict], tremor_truth: list[int | None]) -> dict:
    """Score the tremor row on this day, always beside the majority-class rate.

    The baseline is the honest comparator here for the same reason `baseline_mae`
    is for kinesia: on a day that is 70% tremulous, "always say tremor" scores
    0.70, and an accuracy of 0.72 quoted on its own would read as competence.
    Both numbers travel together or neither is worth showing.
    """
    pairs = [(s["tremor_p"], t) for s, t in zip(series, tremor_truth)
             if s.get("tremor_p") is not None and t is not None]
    if not pairs:
        return {"tremor_n_scored": 0}

    p = np.array([a for a, _ in pairs])
    y = np.array([b for _, b in pairs])
    prevalence = float(y.mean())
    # Majority class: whichever constant answer is right more often here.
    baseline = max(prevalence, 1.0 - prevalence)

    out = {
        "tremor_n_scored": len(pairs),
        "tremor_day_accuracy": round(float(((p > 0.5).astype(int) == y).mean()), 3),
        "tremor_day_baseline_accuracy": round(baseline, 3),
        "tremor_day_prevalence": round(prevalence, 3),
        "tremor_day_brier": round(float(((p - y) ** 2).mean()), 3),
        # Climatology: the best possible CONSTANT probability is the day's own
        # prevalence. A trajectory that cannot beat a flat line at that height
        # is carrying no within-day information, however good its AUC looks.
        "tremor_day_brier_climatology": round(float(((prevalence - y) ** 2).mean()), 3),
    }

    # Threshold-free discrimination. Reported separately from accuracy because
    # the two answer different questions: AUC asks whether the model ranks this
    # person's tremulous hours above their calm ones, accuracy@0.5 also asks
    # whether the operating point suits them. On a person whose prevalence is
    # nothing like the cohort's, the ranking can be right while the threshold is
    # wrong, and collapsing them into one number hides which failed.
    if len(np.unique(y)) == 2:
        order = np.argsort(p, kind="mergesort")
        ranks = np.empty(len(p), float)
        ranks[order] = np.arange(1, len(p) + 1)
        # average ranks over ties, or ties inflate AUC
        for v in np.unique(p):
            m = p == v
            if m.sum() > 1:
                ranks[m] = ranks[m].mean()
        n_pos, n_neg = int(y.sum()), int((1 - y).sum())
        out["tremor_day_auc"] = round(
            float((ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)), 3)
    else:
        out["tremor_day_auc"] = None

    return out


def write_bundle(
    path: Path,
    participant: str,
    day: int,
    series: list[dict],
    events: list[dict],
    truth: np.ndarray,
    metrics: dict,
    note: str = "",
    tremor_truth: list[int | None] | None = None,
) -> Path:
    bundle = {
        "participant": participant,
        "day": int(day),
        "resolution_min": WINDOW_MIN,
        "generated": note or "trained model, held-out participant",
        "series": series,
        "events": [e for e in events if e.get("day") == day],
        "truth": [int(t) for t in truth],
        "tremor_truth": tremor_truth if tremor_truth is not None else [None] * len(series),
        "metrics": metrics,
        "state_names": STATE_NAMES,
        "next_observation": {
            "action": "20s hand rest task",
            "expected_uncertainty_drop": 0.34,
            "burden": 1,
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    # allow_nan=False turns a stray NaN into a build-time crash here rather than
    # a JSON.parse failure in the browser.
    path.write_text(json.dumps(json_safe(bundle), indent=1, allow_nan=False))
    return path
