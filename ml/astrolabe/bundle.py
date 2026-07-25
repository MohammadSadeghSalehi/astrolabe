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
) -> tuple[list[dict], np.ndarray, np.ndarray]:
    """Run the full inference chain for one participant-day.

    Returns (series, posterior, truth-per-step).
    """
    features = features.sort_values("t_min").reset_index(drop=True)

    posterior, missing = infer_posterior(
        features, emissions, transitions, feature_cols, calibrator.temperature
    )
    intervals = credible_interval(posterior, mass=calibrator.mass)
    abstain = abstention.should_abstain(posterior, intervals) | missing

    # Tremor is a genuine model output — the one target that generalises across
    # people (AUC 0.722 held-out). It is computed independently of the kinesia
    # chain because it does NOT go through the HMM: tremor is intermittent
    # within an hour, so smoothing it over a trajectory would erase the thing
    # being measured.
    if tremor_detector is not None and tremor_cols:
        tremor_p = tremor_detector.predict_proba(features[tremor_cols])
        tremor_conf = tremor_detector.confidence(features[tremor_cols])
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
    return series, posterior, truth


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


def write_bundle(
    path: Path,
    participant: str,
    day: int,
    series: list[dict],
    events: list[dict],
    truth: np.ndarray,
    metrics: dict,
    note: str = "",
) -> Path:
    bundle = {
        "participant": participant,
        "day": int(day),
        "resolution_min": WINDOW_MIN,
        "generated": note or "trained model, held-out participant",
        "series": series,
        "events": [e for e in events if e.get("day") == day],
        "truth": [int(t) for t in truth],
        "metrics": metrics,
        "state_names": STATE_NAMES,
        "next_observation": {
            "action": "20s hand rest task",
            "expected_uncertainty_drop": 0.34,
            "burden": 1,
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, indent=1))
    return path
