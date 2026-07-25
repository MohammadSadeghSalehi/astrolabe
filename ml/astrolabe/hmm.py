"""Forward-backward over the 7 motor states.

This is where the uncertainty becomes real. The emission model gives an
independent guess per 10-minute window; the HMM adds the fact that motor state
is a *trajectory* — it does not jump from severe akinesia to severe dyskinesia
and back within ten minutes. Smoothing over that structure is what turns a
sequence of softmaxes into a posterior you can honestly draw a band around.

Deliberately hand-written rather than `hmmlearn`:
  * we need smoothed posteriors gamma_t(k), not Viterbi's single best path;
  * emissions come from a fitted discriminative model, not a Gaussian family;
  * it is ~40 lines, and it costs less than bending a library's API to fit.

Everything is in log space. Products of 100+ probabilities underflow to zero in
linear space, and the failure is silent — a uniform posterior that looks like
honest uncertainty but is actually numerical death.

Missing observations are free: a window with no usable sensor data gets a
uniform log-emission, contributing nothing. The posterior then propagates from
the transition structure alone and widens on its own. That is the abstention
signal, and it falls out of the maths rather than being bolted on.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.special import logsumexp

from .io_cops import N_STATES

_LOG_EPS = -700.0     # ~log(1e-304); below this we are at float64's floor


@dataclass
class TransitionModel:
    """Hour-to-hour transition structure, re-expressed per 10-minute step.

    The diary gives hourly labels, so the empirical transition counts are
    hourly. Converting to a 10-minute step by taking the sixth matrix root is
    the principled route and a bad idea in practice: eigendecomposition of an
    empirical transition matrix routinely yields complex or negative entries,
    and debugging that is not a good use of a hackathon.

    Instead the per-step matrix is parameterised as

        T = (1 - s) * I + s * B

    where B is the row-normalised off-diagonal structure of the hourly counts
    and s is a scalar per-step switch rate. One parameter, tuned on validation,
    defensible in a sentence, and it cannot produce an invalid matrix.
    """

    off_diagonal: np.ndarray          # B, rows sum to 1
    initial: np.ndarray               # start-of-day distribution
    switch_rate: float = 0.06

    @property
    def matrix(self) -> np.ndarray:
        n = len(self.initial)
        T = (1.0 - self.switch_rate) * np.eye(n) + self.switch_rate * self.off_diagonal
        return T / T.sum(axis=1, keepdims=True)

    @property
    def log_matrix(self) -> np.ndarray:
        return np.log(np.maximum(self.matrix, 1e-12))

    @property
    def log_initial(self) -> np.ndarray:
        return np.log(np.maximum(self.initial, 1e-12))

    def with_switch_rate(self, s: float) -> "TransitionModel":
        return TransitionModel(self.off_diagonal, self.initial, float(s))


def fit_transitions(sequences: list[np.ndarray], n_states: int = N_STATES,
                    smoothing: float = 1.0) -> TransitionModel:
    """Estimate transition structure from TRAINING participants' label sequences.

    `sequences` is one array of hourly state indices per participant-day, in
    order. Laplace smoothing keeps unseen transitions merely unlikely rather
    than impossible — a zero here would let one window veto a whole trajectory.
    """
    counts = np.full((n_states, n_states), smoothing)
    starts = np.full(n_states, smoothing)

    for seq in sequences:
        seq = np.asarray(seq, dtype=int)
        if len(seq) == 0:
            continue
        starts[seq[0]] += 1
        for a, b in zip(seq[:-1], seq[1:]):
            counts[a, b] += 1

    # Strip the diagonal: persistence is carried by `switch_rate`, so B must
    # describe only *where it goes when it moves*. Leaving the diagonal in
    # would double-count staying put.
    off = counts.copy()
    np.fill_diagonal(off, 0.0)
    off += smoothing * 0.1
    off /= off.sum(axis=1, keepdims=True)

    return TransitionModel(off_diagonal=off, initial=starts / starts.sum())


def forward_backward(log_emissions: np.ndarray, tm: TransitionModel
                     ) -> tuple[np.ndarray, float]:
    """Smoothed posteriors gamma_t(k) and the sequence log-likelihood.

    `log_emissions` is (T, K) — log p(x_t | z_t = k), up to a constant. Use
    `OrdinalEmissions.log_likelihood`, NOT `predict_proba`: the prior must
    already have been divided out or it gets applied twice.
    """
    T, K = log_emissions.shape
    logT = tm.log_matrix

    alpha = np.full((T, K), _LOG_EPS)
    alpha[0] = tm.log_initial + log_emissions[0]
    for t in range(1, T):
        alpha[t] = log_emissions[t] + logsumexp(alpha[t - 1][:, None] + logT, axis=0)

    beta = np.zeros((T, K))
    for t in range(T - 2, -1, -1):
        beta[t] = logsumexp(logT + (log_emissions[t + 1] + beta[t + 1])[None, :], axis=1)

    log_gamma = alpha + beta
    log_gamma -= logsumexp(log_gamma, axis=1, keepdims=True)
    return np.exp(log_gamma), float(logsumexp(alpha[-1]))


def viterbi(log_emissions: np.ndarray, tm: TransitionModel) -> np.ndarray:
    """Most likely single path. Not used for the posterior — reported only when
    a single decoded trajectory is wanted for display."""
    T, K = log_emissions.shape
    logT = tm.log_matrix

    delta = np.full((T, K), _LOG_EPS)
    psi = np.zeros((T, K), dtype=int)
    delta[0] = tm.log_initial + log_emissions[0]
    for t in range(1, T):
        scores = delta[t - 1][:, None] + logT
        psi[t] = scores.argmax(axis=0)
        delta[t] = scores.max(axis=0) + log_emissions[t]

    path = np.zeros(T, dtype=int)
    path[-1] = int(delta[-1].argmax())
    for t in range(T - 2, -1, -1):
        path[t] = psi[t + 1, path[t + 1]]
    return path


def uniform_where_missing(log_emissions: np.ndarray, missing: np.ndarray
                          ) -> np.ndarray:
    """Blank out steps with no usable observation.

    A uniform log-emission contributes nothing to the recursion, so the
    posterior at that step is whatever the transitions imply — which widens as
    the gap lengthens, exactly as it should. This is where abstention comes
    from, and it is a consequence of the model rather than a rule layered on it.
    """
    out = log_emissions.copy()
    out[np.asarray(missing, dtype=bool)] = 0.0
    return out


def tune_switch_rate(
    sequences: list[tuple[np.ndarray, np.ndarray]],
    tm: TransitionModel,
    candidates: np.ndarray | None = None,
) -> tuple[float, float]:
    """Pick the per-step switch rate that minimises validation MAE.

    `sequences` is a list of (log_emissions, true_states) for held-out
    participant-days. Returns (best_rate, best_mae).

    Tuned on error rather than likelihood: the reported claim is MAE against the
    0.594 baseline, so the parameter should be chosen on the thing being claimed.
    """
    if candidates is None:
        candidates = np.array([0.01, 0.02, 0.04, 0.06, 0.09, 0.13, 0.2, 0.3, 0.45])

    states = np.arange(len(tm.initial))
    best_rate, best_mae = float(candidates[0]), float("inf")

    for s in candidates:
        cand = tm.with_switch_rate(float(s))
        errs, n = 0.0, 0
        for log_em, truth in sequences:
            if len(truth) == 0:
                continue
            gamma, _ = forward_backward(log_em, cand)
            expected = gamma @ states
            errs += float(np.abs(expected - truth).sum())
            n += len(truth)
        mae = errs / max(n, 1)
        if mae < best_mae:
            best_rate, best_mae = float(s), mae

    return best_rate, best_mae
