"""Ordinal emission model over the 7 motor states.

Why ordinal decomposition rather than 7-way classification: three of the seven
states have under 200 labelled hours in the entire cohort. A flat 7-way
classifier cannot learn them, and macro-F1 over them is noise. Frank & Hall
decomposition fits K-1 binary "is the state above k?" problems instead, each of
which sees the whole dataset, and recovers a proper distribution from them.

Why a distribution and not a point estimate: the HMM needs one, and the product
claim is a calibrated posterior. A regressor would dead-end here.

═══════════════════════════════════════════════════════════════════════════════
THE BUG THIS FILE EXISTS TO PREVENT
═══════════════════════════════════════════════════════════════════════════════

The classifiers give p(z | x) — a POSTERIOR, already carrying the class prior.
The HMM needs p(x | z), a LIKELIHOOD, because it applies the prior itself
through the initial distribution and the transition matrix.

Feed posteriors straight into the HMM and the prior is counted twice. "Good
kinesia" is 56.6% of the data, so everything collapses toward state 3, the
bands look beautifully tight, and MAE parks just under the 0.594 baseline while
meaning nothing.

`log_likelihood()` divides the prior back out. `predict_proba()` does not, and
is for direct evaluation only. Which one you want is never ambiguous: the HMM
takes log-likelihoods, metrics take probabilities.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from .io_cops import N_STATES

_EPS = 1e-9
#: Floor on any state's probability. Without it a single confident classifier
#: can drive a state to exactly zero, and the HMM can then never recover that
#: state no matter what later evidence arrives — one window would veto an
#: entire trajectory.
PROB_FLOOR = 1e-4


@dataclass
class OrdinalEmissions:
    """K-1 cumulative classifiers -> a 7-vector per window.

    Each classifier k answers "is the true state > k?". The differences between
    consecutive cumulative probabilities give the per-state distribution.
    """

    n_states: int = N_STATES
    learning_rate: float = 0.08
    max_iter: int = 300
    max_leaf_nodes: int = 31
    min_samples_leaf: int = 40
    l2_regularization: float = 1.0
    random_state: int = 20260725

    models: list = field(default_factory=list)
    class_prior: np.ndarray | None = None
    feature_names: list[str] = field(default_factory=list)

    # ── fitting ──────────────────────────────────────────────────────────────

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> "OrdinalEmissions":
        y = np.asarray(y, dtype=int)
        self.feature_names = list(X.columns)
        self.models = []

        # The prior is measured on TRAINING data only. Using the full dataset
        # would leak the test distribution into the likelihood conversion.
        counts = np.bincount(y, minlength=self.n_states).astype(float)
        self.class_prior = (counts + 1.0) / (counts.sum() + self.n_states)

        for k in range(self.n_states - 1):
            target = (y > k).astype(int)
            # A threshold no training row crosses has nothing to learn; record
            # None and treat it as a degenerate cumulative probability later.
            if target.min() == target.max():
                self.models.append(None)
                continue
            clf = HistGradientBoostingClassifier(
                learning_rate=self.learning_rate,
                max_iter=self.max_iter,
                max_leaf_nodes=self.max_leaf_nodes,
                min_samples_leaf=self.min_samples_leaf,
                l2_regularization=self.l2_regularization,
                random_state=self.random_state,
                early_stopping=True,
                validation_fraction=0.12,
            )
            clf.fit(X, target)
            self.models.append(clf)
        return self

    # ── prediction ───────────────────────────────────────────────────────────

    def _cumulative(self, X: pd.DataFrame) -> np.ndarray:
        """P(z > k | x) for k = 0..K-2, columns in order."""
        n = len(X)
        cum = np.zeros((n, self.n_states - 1))
        for k, clf in enumerate(self.models):
            if clf is None:
                # no training example above this threshold -> assume none here
                cum[:, k] = 0.0
            else:
                cum[:, k] = clf.predict_proba(X)[:, 1]

        # The K-1 classifiers are fitted independently, so P(z>k) is not
        # guaranteed to decrease in k. Enforce monotonicity before differencing,
        # or the differences go negative and the "distribution" is meaningless.
        return np.minimum.accumulate(cum, axis=1)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """p(z | x) — a proper distribution per row. For metrics, NOT the HMM."""
        cum = self._cumulative(X)
        n = len(X)
        p = np.zeros((n, self.n_states))
        p[:, 0] = 1.0 - cum[:, 0]
        for k in range(1, self.n_states - 1):
            p[:, k] = cum[:, k - 1] - cum[:, k]
        p[:, -1] = cum[:, -1]

        p = np.clip(p, PROB_FLOOR, None)
        return p / p.sum(axis=1, keepdims=True)

    def log_likelihood(self, X: pd.DataFrame) -> np.ndarray:
        """log p(x | z) up to a constant — THIS is what the HMM consumes.

        p(x | z) is proportional to p(z | x) / p(z). Dividing out the training
        prior stops the HMM applying it a second time. See the module docstring.
        """
        if self.class_prior is None:
            raise RuntimeError("fit() first — no class prior to divide out")
        return np.log(self.predict_proba(X)) - np.log(self.class_prior)[None, :]

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """MAP state per row."""
        return self.predict_proba(X).argmax(axis=1)

    def predict_expected(self, X: pd.DataFrame) -> np.ndarray:
        """Posterior mean state — continuous, and the better MAE estimate.

        MAE is minimised by the median, not the mode, and on an ordinal scale a
        confident-but-adjacent mistake should cost less than a distant one. The
        argmax throws that information away.
        """
        p = self.predict_proba(X)
        return p @ np.arange(self.n_states)


# ──────────────────────────────────────────────────────────────────────────────
# aggregation to the label's own resolution
# ──────────────────────────────────────────────────────────────────────────────

def hourly_posterior(df: pd.DataFrame, proba: np.ndarray) -> pd.DataFrame:
    """Collapse 10-minute posteriors to one row per labelled hour.

    The model runs at 10 minutes; the labels are hourly. Every reported metric
    is scored here, at the resolution the labels actually have — averaging the
    windows within an hour rather than scoring each window against a label it
    only partially covers.
    """
    out = df[["participant", "day", "hour_end", "state"]].copy()
    for k in range(proba.shape[1]):
        out[f"p{k}"] = proba[:, k]

    cols = [f"p{k}" for k in range(proba.shape[1])]
    agg = out.groupby(["participant", "day", "hour_end"], as_index=False).agg(
        {**{c: "mean" for c in cols}, "state": "first"}
    )
    p = agg[cols].to_numpy()
    p = p / p.sum(axis=1, keepdims=True)
    agg[cols] = p
    agg["map"] = p.argmax(axis=1)
    agg["expected"] = p @ np.arange(p.shape[1])
    return agg


def credible_interval(p: np.ndarray, mass: float = 0.90) -> np.ndarray:
    """Smallest CONTIGUOUS [lo, hi] index interval holding `mass`.

    Contiguity is required: this is an ordinal scale, so a scattered credible
    set would be meaningless to read off a chart.
    """
    n, k = p.shape
    out = np.zeros((n, 2), dtype=int)
    for i in range(n):
        best, best_w = (0, k - 1), k
        for lo in range(k):
            acc = 0.0
            for hi in range(lo, k):
                acc += p[i, hi]
                if acc >= mass:
                    if hi - lo < best_w:
                        best, best_w = (lo, hi), hi - lo
                    break
        out[i] = best
    return out
