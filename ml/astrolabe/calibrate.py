"""Calibration and abstention.

"It shows its work" is the product claim, and an uncalibrated confidence makes
that claim false. Two steps, both fitted on held-out participants:

  1. **Temperature.** One scalar on the emission log-likelihoods, chosen to
     minimise hourly NLL. Boosted trees are usually over-confident; this pulls
     the whole distribution back without changing which state is on top.

  2. **Coverage.** Do NOT assume that taking 90% of the posterior mass yields
     90% empirical coverage — it does not, and asserting otherwise is exactly
     the sort of unfalsifiable claim this project exists to avoid. Sweep the
     mass on a calibration fold until the achieved coverage is 90%, then use
     that mass at test time and report what was actually achieved.

Abstention then keys off the calibrated posterior: refuse when the interval is
too wide or the peak too low. The threshold is tuned so the abstention rate
rises materially when a wrist is dropped — a rule that does not respond to
degraded evidence proves nothing.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize_scalar

from .io_cops import N_STATES
from .model import credible_interval

_EPS = 1e-12


def apply_temperature(log_lik: np.ndarray, temperature: float) -> np.ndarray:
    """Scale log-likelihoods and renormalise to a distribution."""
    z = log_lik / max(temperature, 1e-3)
    z -= z.max(axis=1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(axis=1, keepdims=True)


def fit_temperature(log_lik: np.ndarray, y: np.ndarray,
                    bounds: tuple[float, float] = (0.25, 6.0)) -> float:
    """The temperature minimising NLL on held-out data.

    T > 1 softens (the model was over-confident), T < 1 sharpens.
    """
    y = np.asarray(y, dtype=int)

    def nll(t: float) -> float:
        p = apply_temperature(log_lik, t)
        return float(-np.log(p[np.arange(len(y)), y] + _EPS).mean())

    res = minimize_scalar(nll, bounds=bounds, method="bounded")
    return float(res.x)


def fit_coverage_mass(p: np.ndarray, y: np.ndarray, target: float = 0.90) -> float:
    """The posterior mass whose contiguous interval achieves `target` coverage.

    Returns the mass to request, not the coverage achieved. If even the full
    posterior under-covers, returns the largest mass tried and the caller
    reports the shortfall rather than pretending.
    """
    y = np.asarray(y, dtype=int)
    for mass in np.arange(0.50, 0.996, 0.01):
        iv = credible_interval(p, mass=float(mass))
        covered = ((iv[:, 0] <= y) & (y <= iv[:, 1])).mean()
        if covered >= target:
            return float(mass)
    return 0.99


@dataclass
class Calibrator:
    """Fitted temperature + interval mass. Fit on held-out participants only."""

    temperature: float = 1.0
    mass: float = 0.90
    target_coverage: float = 0.90
    achieved_coverage: float = float("nan")

    def fit(self, log_lik: np.ndarray, y: np.ndarray) -> "Calibrator":
        self.temperature = fit_temperature(log_lik, y)
        p = apply_temperature(log_lik, self.temperature)
        self.mass = fit_coverage_mass(p, y, self.target_coverage)
        iv = credible_interval(p, mass=self.mass)
        self.achieved_coverage = float(
            ((iv[:, 0] <= np.asarray(y)) & (np.asarray(y) <= iv[:, 1])).mean()
        )
        return self

    def transform(self, log_lik: np.ndarray) -> np.ndarray:
        return apply_temperature(log_lik, self.temperature)

    def intervals(self, p: np.ndarray) -> np.ndarray:
        return credible_interval(p, mass=self.mass)

    def __str__(self) -> str:
        direction = "softened" if self.temperature > 1 else "sharpened"
        return (f"temperature {self.temperature:.2f} ({direction}), "
                f"interval mass {self.mass:.2f} -> "
                f"achieved coverage {self.achieved_coverage:.3f} "
                f"(target {self.target_coverage:.2f})")


# ──────────────────────────────────────────────────────────────────────────────
# abstention
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class AbstentionRule:
    """Refuse to answer when the evidence cannot support one.

    Two independent triggers, because they catch different failures: a wide
    interval means the evidence is diffuse, a low peak means no state is
    actually preferred. Either alone leaves a hole.
    """

    max_interval_width: int = 4        # states, inclusive
    min_peak: float = 0.30

    def should_abstain(self, p: np.ndarray, intervals: np.ndarray) -> np.ndarray:
        width = intervals[:, 1] - intervals[:, 0] + 1
        return (width >= self.max_interval_width) | (p.max(axis=1) < self.min_peak)

    def rate(self, p: np.ndarray, intervals: np.ndarray) -> float:
        return float(self.should_abstain(p, intervals).mean())


def reason_for(
    abstain: bool,
    wear: str,
    both_wrists: bool,
    peak: float,
    width: int,
) -> str | None:
    """A specific reason, in words, drawn from the data rather than generated.

    `WearableDataAvailability` gives non-wear directly, so the honest reason is
    the recorded one — not a sentence a language model invented after the fact.
    """
    if not abstain:
        return None
    if wear == "Wearable Not Worn":
        return "non-wear on both wrists for most of this window"
    if wear == "Wearable Partially Worn":
        return "wearable only partially worn; coverage below threshold"
    if not both_wrists:
        return "single wrist only; bilateral asymmetry unavailable"
    if width >= 5:
        return f"posterior spans {width} states; activity pattern ambiguous"
    return f"no state preferred (peak probability {peak:.2f})"


def tune_abstention(
    p: np.ndarray,
    intervals: np.ndarray,
    y: np.ndarray,
    target_rate: float = 0.12,
) -> AbstentionRule:
    """Pick the peak threshold giving roughly `target_rate` abstention.

    Tuned on the normal case so that the DEGRADED case (a wrist dropped) rises
    above it on its own. Tuning on the degraded case instead would bake the
    stress result in and prove nothing.
    """
    best = AbstentionRule()
    best_gap = float("inf")
    for peak in np.arange(0.20, 0.65, 0.01):
        rule = AbstentionRule(min_peak=float(peak))
        gap = abs(rule.rate(p, intervals) - target_rate)
        if gap < best_gap:
            best, best_gap = rule, gap
    return best


def selective_risk(p: np.ndarray, y: np.ndarray, abstain: np.ndarray) -> dict:
    """Error on answered hours vs error on the ones we refused.

    The rule only earns its place if the hours it declines are the ones it would
    have got wrong. If MAE is no better on the answered subset, abstention is
    just throwing away data.
    """
    y = np.asarray(y, dtype=int)
    expected = p @ np.arange(N_STATES)
    err = np.abs(expected - y)
    answered = ~abstain
    return {
        "abstain_rate": float(abstain.mean()),
        "mae_answered": float(err[answered].mean()) if answered.any() else float("nan"),
        "mae_abstained": float(err[abstain].mean()) if abstain.any() else float("nan"),
        "mae_all": float(err.mean()),
    }
