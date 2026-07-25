"""Participant-level splits.

═══════════════════════════════════════════════════════════════════════════════
Windows from one person must NEVER appear in both train and test.
═══════════════════════════════════════════════════════════════════════════════

Hours from the same person are enormously correlated — same wrists, same watch
placement, same medication schedule, same gait. Split them randomly and the
model memorises the participant instead of the disease. Every metric inflates,
nothing crashes, and the number you report on stage is fiction.

This is the single easiest way to void the whole result, so:

  * every split here is keyed on `participant`, never on rows;
  * `assert_no_leakage()` is called *inside* every split function, not left for
    the caller to remember;
  * `tests/test_splits.py` fails loudly if any of that stops being true.

Held-out folds also get a minimum-size guard. Four participants have under 31
usable hours, and a test fold of 26 hours produces a confident-looking number
that means nothing.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# Below this, a held-out participant cannot support a meaningful error estimate.
MIN_TEST_HOURS = 40

# Participants that cannot be tested on, whatever the split says.
#   COPS-24 — 105 labelled hours, zero accelerometry references.
EXCLUDE_ALWAYS = frozenset({"COPS-24"})


class LeakageError(AssertionError):
    """A participant appears in more than one side of a split. Never suppress."""


@dataclass(frozen=True)
class Split:
    """One train/test partition, by participant."""

    train: tuple[str, ...]
    test: tuple[str, ...]
    name: str = ""

    def __post_init__(self) -> None:
        # Validated on construction, so an invalid Split cannot exist.
        assert_no_leakage(self.train, self.test)

    def mask(self, df: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
        """Boolean row masks for a frame carrying a `participant` column."""
        if "participant" not in df.columns:
            raise KeyError("frame has no 'participant' column — cannot split safely")
        return df["participant"].isin(self.train), df["participant"].isin(self.test)

    def apply(self, df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
        tr, te = self.mask(df)
        train_df, test_df = df[tr].copy(), df[te].copy()
        # belt and braces: re-check on the actual rows, not just the name lists
        assert_frames_disjoint(train_df, test_df)
        return train_df, test_df

    def __repr__(self) -> str:
        return (f"Split({self.name!r}, {len(self.train)} train / "
                f"{len(self.test)} test participants)")


# ──────────────────────────────────────────────────────────────────────────────
# the guards
# ──────────────────────────────────────────────────────────────────────────────

def assert_no_leakage(train, test) -> None:
    """Raise if any participant appears on both sides."""
    tr, te = set(train), set(test)
    overlap = tr & te
    if overlap:
        raise LeakageError(
            f"{len(overlap)} participant(s) in BOTH train and test: "
            f"{sorted(overlap)}. Every reported metric would be inflated."
        )
    if not tr:
        raise LeakageError("empty training set")
    if not te:
        raise LeakageError("empty test set")


def assert_frames_disjoint(train_df: pd.DataFrame, test_df: pd.DataFrame) -> None:
    """Raise if the split frames share a participant. Checks rows, not lists."""
    overlap = set(train_df["participant"]) & set(test_df["participant"])
    if overlap:
        raise LeakageError(
            f"split frames share participant(s): {sorted(overlap)}"
        )


def eligible_participants(coverage: pd.DataFrame,
                          min_hours: int = MIN_TEST_HOURS) -> list[str]:
    """Participants with enough usable hours to be held out and believed.

    `coverage` needs columns `participant` and `usable_hours`
    (data/cops/derived/participants.csv has both).
    """
    ok = coverage[
        (coverage["usable_hours"] >= min_hours)
        & (~coverage["participant"].isin(EXCLUDE_ALWAYS))
    ]
    return sorted(ok["participant"], key=lambda p: int(p.split("-")[1]))


# ──────────────────────────────────────────────────────────────────────────────
# the splits
# ──────────────────────────────────────────────────────────────────────────────

def group_kfold(participants, n_folds: int = 5, seed: int = 20260725) -> list[Split]:
    """Shuffle participants, deal into `n_folds` folds, hold each out in turn.

    Deterministic: the same seed gives the same folds, so a metric that moves
    between runs is a real change and not a reshuffle.
    """
    people = sorted(set(participants) - EXCLUDE_ALWAYS)
    if len(people) < n_folds:
        raise ValueError(f"{len(people)} participants cannot make {n_folds} folds")

    rng = np.random.default_rng(seed)
    order = list(rng.permutation(people))
    folds = [order[i::n_folds] for i in range(n_folds)]

    return [
        Split(
            train=tuple(sorted(p for p in people if p not in fold)),
            test=tuple(sorted(fold)),
            name=f"fold{i}",
        )
        for i, fold in enumerate(folds)
    ]


def holdout(participants, test_participants, name: str = "holdout") -> Split:
    """Hold out named participants explicitly — the demo participant and its backup.

    COPS-29 is the demo; it must never be trained on, or the reveal is a lie.
    """
    test = tuple(sorted(set(test_participants)))
    missing = set(test) - set(participants)
    if missing:
        raise ValueError(f"held-out participant(s) not in the cohort: {sorted(missing)}")
    train = tuple(sorted(set(participants) - set(test) - EXCLUDE_ALWAYS))
    return Split(train=train, test=test, name=name)


def demo_split(participants, demo: str = "COPS-29", backup: str = "COPS-28") -> Split:
    """The split the demo runs on. Both the demo participant and its backup are
    held out, so discovering a problem with one late does not cost the reveal."""
    return holdout(participants, [demo, backup], name="demo")


def chronological(hours: pd.DataFrame, calib_days: int = 2
                  ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Within ONE participant: early days calibrate, later days test.

    For the personalisation claim ("calibrate on a few labelled hours, then
    reconstruct the rest of the week"). Splitting one person by time is correct;
    it is not a substitute for participant-level splits when reporting
    generalisation, and must never be described as one.
    """
    if hours["participant"].nunique() != 1:
        raise ValueError("chronological() is for a single participant at a time")
    days = sorted(hours["day"].unique())
    cutoff = days[min(calib_days, len(days) - 1)]
    return hours[hours["day"] < cutoff].copy(), hours[hours["day"] >= cutoff].copy()


def summarise(split: Split, coverage: pd.DataFrame) -> str:
    """One line per split, for the log. Makes an accidental tiny fold obvious."""
    idx = coverage.set_index("participant")["usable_hours"]
    tr = int(idx.reindex(split.train).fillna(0).sum())
    te = int(idx.reindex(split.test).fillna(0).sum())
    smallest = int(idx.reindex(split.test).fillna(0).min()) if split.test else 0
    warn = "  ** small test fold **" if smallest < MIN_TEST_HOURS else ""
    return (f"{split.name:<10} train {len(split.train):>2}p/{tr:>5}h   "
            f"test {len(split.test):>2}p/{te:>5}h   "
            f"smallest test participant {smallest:>4}h{warn}")
