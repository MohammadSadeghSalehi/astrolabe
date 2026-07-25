"""No participant is ever in both train and test.

The failure this guards against is silent: leakage lowers the loss, raises every
metric, and crashes nothing. There is no second reviewer on this project, so
these tests are the reviewer.

    pytest ml/tests/test_splits.py -v
"""

from __future__ import annotations

import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from astrolabe.splits import (  # noqa: E402
    EXCLUDE_ALWAYS,
    MIN_TEST_HOURS,
    LeakageError,
    Split,
    assert_frames_disjoint,
    assert_no_leakage,
    chronological,
    demo_split,
    eligible_participants,
    group_kfold,
    holdout,
)

PEOPLE = [f"COPS-{i}" for i in range(1, 21)]


def frame(participants, hours_each=50):
    return pd.DataFrame([
        {"participant": p, "day": h // 12, "hour": h % 12, "y": h % 7}
        for p in participants for h in range(hours_each)
    ])


# ── the guards themselves ─────────────────────────────────────────────────────

def test_assert_no_leakage_catches_an_overlap():
    with pytest.raises(LeakageError, match="BOTH train and test"):
        assert_no_leakage(["COPS-1", "COPS-2"], ["COPS-2", "COPS-3"])


def test_assert_no_leakage_rejects_empty_sides():
    with pytest.raises(LeakageError):
        assert_no_leakage([], ["COPS-1"])
    with pytest.raises(LeakageError):
        assert_no_leakage(["COPS-1"], [])


def test_a_leaky_split_cannot_be_constructed():
    """Validation happens in __post_init__, so an invalid Split cannot exist."""
    with pytest.raises(LeakageError):
        Split(train=("COPS-1", "COPS-2"), test=("COPS-2",))


def test_assert_frames_disjoint_catches_row_level_overlap():
    a = frame(["COPS-1", "COPS-2"])
    b = frame(["COPS-2"])
    with pytest.raises(LeakageError):
        assert_frames_disjoint(a, b)


# ── group k-fold ──────────────────────────────────────────────────────────────

def test_group_kfold_folds_are_disjoint_and_complete():
    splits = group_kfold(PEOPLE, n_folds=5)
    assert len(splits) == 5

    seen = set()
    for s in splits:
        assert_no_leakage(s.train, s.test)
        assert not (seen & set(s.test)), "a participant is in two test folds"
        seen |= set(s.test)
    assert seen == set(PEOPLE) - EXCLUDE_ALWAYS, "some participant was never tested"


def test_group_kfold_never_splits_one_persons_rows():
    """The actual property that matters, checked on rows rather than names."""
    df = frame(PEOPLE)
    for s in group_kfold(PEOPLE, n_folds=5):
        train_df, test_df = s.apply(df)
        assert set(train_df["participant"]) & set(test_df["participant"]) == set()
        assert len(train_df) + len(test_df) == len(df)


def test_group_kfold_is_deterministic():
    a = group_kfold(PEOPLE, n_folds=5, seed=1)
    b = group_kfold(PEOPLE, n_folds=5, seed=1)
    c = group_kfold(PEOPLE, n_folds=5, seed=2)
    assert [s.test for s in a] == [s.test for s in b]
    assert [s.test for s in a] != [s.test for s in c]


def test_group_kfold_excludes_the_unusable_participant():
    people = PEOPLE + ["COPS-24"]
    for s in group_kfold(people, n_folds=4):
        assert "COPS-24" not in s.train
        assert "COPS-24" not in s.test


# ── the demo split ────────────────────────────────────────────────────────────

def test_demo_participant_is_never_trained_on():
    """If COPS-29 appears in training, the reveal is a lie."""
    people = PEOPLE + ["COPS-28", "COPS-29"]
    s = demo_split(people)
    assert "COPS-29" not in s.train
    assert "COPS-28" not in s.train, "the backup must be held out too"
    assert set(s.test) == {"COPS-28", "COPS-29"}


def test_holdout_rejects_an_unknown_participant():
    with pytest.raises(ValueError, match="not in the cohort"):
        holdout(PEOPLE, ["COPS-999"])


def test_demo_split_survives_apply():
    people = PEOPLE + ["COPS-28", "COPS-29"]
    df = frame(people)
    train_df, test_df = demo_split(people).apply(df)
    assert set(test_df["participant"]) == {"COPS-28", "COPS-29"}
    assert "COPS-29" not in set(train_df["participant"])


# ── minimum fold size ─────────────────────────────────────────────────────────

def test_eligible_participants_drops_tiny_and_unusable_ones():
    coverage = pd.DataFrame([
        {"participant": "COPS-1", "usable_hours": 120},
        {"participant": "COPS-11", "usable_hours": 8},     # too thin to believe
        {"participant": "COPS-18", "usable_hours": 26},    # ditto
        {"participant": "COPS-24", "usable_hours": 0},     # no accelerometry
        {"participant": "COPS-29", "usable_hours": 124},
    ])
    ok = eligible_participants(coverage)
    assert ok == ["COPS-1", "COPS-29"]
    assert all(coverage.set_index("participant").loc[p, "usable_hours"] >= MIN_TEST_HOURS
               for p in ok)


def test_eligible_participants_matches_the_real_coverage_table():
    path = os.path.join(os.path.dirname(__file__), "..", "..",
                        "data", "cops", "derived", "participants.csv")
    if not os.path.exists(path):
        pytest.skip("participants.csv not built yet — run scripts/scan_diaries.py")
    coverage = pd.read_csv(path)
    ok = eligible_participants(coverage)
    assert 45 <= len(ok) <= 65, f"{len(ok)} eligible participants looks wrong"
    assert "COPS-24" not in ok
    assert "COPS-29" in ok, "the demo participant must be eligible to hold out"


# ── chronological, within one person ──────────────────────────────────────────

def test_chronological_splits_one_person_by_time():
    df = frame(["COPS-29"], hours_each=96)     # 8 days x 12 hours
    early, late = chronological(df, calib_days=2)
    assert early["day"].max() < late["day"].min()
    assert len(early) + len(late) == len(df)


def test_chronological_refuses_multiple_participants():
    with pytest.raises(ValueError, match="single participant"):
        chronological(frame(["COPS-1", "COPS-2"]))


# ── the frame contract ────────────────────────────────────────────────────────

def test_apply_refuses_a_frame_without_a_participant_column():
    s = group_kfold(PEOPLE, n_folds=5)[0]
    with pytest.raises(KeyError, match="participant"):
        s.apply(pd.DataFrame({"x": [1, 2, 3]}))
