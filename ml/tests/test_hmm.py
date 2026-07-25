"""Forward-backward correctness, on synthetic data where the answer is known.

An HMM that is subtly wrong does not crash. It returns a plausible-looking
posterior that is simply not the posterior, and every interval drawn from it is
wrong. So the maths is verified against cases with analytic answers before it
is trusted on COPS.

    pytest ml/tests/test_hmm.py -v
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from astrolabe.hmm import (  # noqa: E402
    TransitionModel,
    fit_transitions,
    forward_backward,
    tune_switch_rate,
    uniform_where_missing,
    viterbi,
)

K = 7


def flat_tm(switch_rate: float = 0.1) -> TransitionModel:
    off = (np.ones((K, K)) - np.eye(K))
    off /= off.sum(axis=1, keepdims=True)
    return TransitionModel(off_diagonal=off, initial=np.full(K, 1.0 / K),
                           switch_rate=switch_rate)


# ── the invariants ────────────────────────────────────────────────────────────

def test_posteriors_are_distributions():
    rng = np.random.default_rng(0)
    log_em = np.log(rng.dirichlet(np.ones(K), size=50))
    gamma, _ = forward_backward(log_em, flat_tm())

    assert gamma.shape == (50, K)
    assert np.allclose(gamma.sum(axis=1), 1.0)
    assert (gamma >= 0).all()


def test_uniform_emissions_give_the_stationary_prior():
    """With no information at any step, the posterior must be the initial
    distribution — not drift, not collapse."""
    tm = flat_tm()
    gamma, _ = forward_backward(np.zeros((30, K)), tm)
    assert np.allclose(gamma, 1.0 / K, atol=1e-9)


def test_a_confident_observation_dominates_its_own_step():
    log_em = np.zeros((11, K))
    log_em[5] = -20.0
    log_em[5, 2] = 0.0                      # step 5 says: definitely state 2
    gamma, _ = forward_backward(log_em, flat_tm(switch_rate=0.05))

    assert gamma[5].argmax() == 2
    assert gamma[5, 2] > 0.99


def test_evidence_propagates_to_neighbouring_steps():
    """The whole point of the temporal model: a confident observation should
    inform the steps around it, and its influence should decay with distance."""
    log_em = np.zeros((21, K))
    log_em[10] = -20.0
    log_em[10, 6] = 0.0
    gamma, _ = forward_backward(log_em, flat_tm(switch_rate=0.05))

    assert gamma[9, 6] > 1.0 / K, "neighbour not informed by the observation"
    assert gamma[11, 6] > 1.0 / K
    assert gamma[9, 6] > gamma[5, 6] > gamma[0, 6], "influence must decay with distance"


def test_low_switch_rate_smooths_more_than_high():
    """A sticky chain should resist a single contradicting observation."""
    log_em = np.zeros((21, K))
    for t in range(21):
        log_em[t] = -20.0
        log_em[t, 1] = 0.0
    log_em[10] = -20.0
    log_em[10, 5] = 0.0                     # one outlier against a run of state 1

    sticky, _ = forward_backward(log_em, flat_tm(switch_rate=0.01))
    jumpy, _ = forward_backward(log_em, flat_tm(switch_rate=0.5))
    assert sticky[10, 5] < jumpy[10, 5], "sticky chain should resist the outlier"


def test_log_likelihood_is_finite_over_a_long_sequence():
    """Linear-space implementations underflow silently here. 2000 steps is
    ~2 weeks at 10-minute resolution."""
    rng = np.random.default_rng(1)
    log_em = np.log(rng.dirichlet(np.ones(K), size=2000))
    gamma, ll = forward_backward(log_em, flat_tm())

    assert np.isfinite(ll)
    assert np.isfinite(gamma).all()
    assert np.allclose(gamma.sum(axis=1), 1.0)


# ── missing observations ──────────────────────────────────────────────────────

def test_missing_steps_widen_the_posterior():
    """Non-wear should raise uncertainty, and more so the longer it lasts.

    This is where abstention comes from: it falls out of the recursion rather
    than being a rule layered on top.
    """
    log_em = np.zeros((41, K))
    for t in range(41):
        log_em[t] = -8.0
        log_em[t, 3] = 0.0

    missing = np.zeros(41, dtype=bool)
    missing[15:30] = True                   # a 15-step gap
    gamma, _ = forward_backward(uniform_where_missing(log_em, missing), flat_tm())

    entropy = -(gamma * np.log(gamma + 1e-12)).sum(axis=1)
    assert entropy[22] > entropy[5], "posterior did not widen inside the gap"
    assert entropy[22] > entropy[16], "uncertainty did not grow with gap length"


def test_uniform_where_missing_leaves_observed_steps_alone():
    log_em = np.log(np.random.default_rng(2).dirichlet(np.ones(K), size=10))
    missing = np.zeros(10, dtype=bool)
    missing[3] = True
    out = uniform_where_missing(log_em, missing)

    assert np.allclose(out[3], 0.0)
    assert np.allclose(out[[0, 1, 2, 4, 5]], log_em[[0, 1, 2, 4, 5]])


# ── transitions ───────────────────────────────────────────────────────────────

def test_fit_transitions_captures_structure_without_the_diagonal():
    """Persistence is carried by switch_rate, so B must describe only where the
    state goes WHEN it moves. A diagonal here would double-count staying put."""
    sequences = [np.array([3, 3, 3, 4, 4, 3, 3]), np.array([3, 4, 4, 4, 3])]
    tm = fit_transitions(sequences)

    assert np.allclose(np.diag(tm.off_diagonal), 0.0, atol=0.02)
    assert np.allclose(tm.off_diagonal.sum(axis=1), 1.0)
    assert tm.off_diagonal[3].argmax() == 4, "3->4 is the observed move"


def test_transition_matrix_is_row_stochastic_at_every_rate():
    tm = fit_transitions([np.array([2, 3, 3, 4])])
    for s in (0.0, 0.01, 0.25, 1.0):
        T = tm.with_switch_rate(s).matrix
        assert np.allclose(T.sum(axis=1), 1.0)
        assert (T >= 0).all()


def test_unseen_transitions_stay_possible():
    """A zero would let a single window veto an entire trajectory."""
    tm = fit_transitions([np.array([3, 3, 3])])
    assert (tm.matrix > 0).all()


# ── viterbi & tuning ──────────────────────────────────────────────────────────

def test_viterbi_recovers_an_obvious_path():
    truth = np.array([1, 1, 1, 5, 5, 5, 2, 2])
    log_em = np.full((len(truth), K), -20.0)
    log_em[np.arange(len(truth)), truth] = 0.0
    assert (viterbi(log_em, flat_tm(switch_rate=0.3)) == truth).all()


def test_tune_switch_rate_prefers_stickiness_on_a_smooth_truth():
    """A truth that barely moves, observed noisily, should select a low rate."""
    rng = np.random.default_rng(3)
    truth = np.repeat([2, 2, 3, 3, 3, 3, 4, 4], 6)
    log_em = np.zeros((len(truth), K))
    for t, s in enumerate(truth):
        noisy = s if rng.random() > 0.35 else rng.integers(0, K)
        log_em[t] = -3.0
        log_em[t, noisy] = 0.0

    rate, mae = tune_switch_rate([(log_em, truth)], flat_tm())
    assert rate <= 0.13, f"selected switch rate {rate} is too jumpy for a smooth truth"
    assert mae < 1.0
