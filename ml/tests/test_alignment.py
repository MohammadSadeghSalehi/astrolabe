"""The join is off-by-one-proof.

A diary row stamped `Time = T hr` describes the window [T-1, T). If that is ever
wrong, every label shifts by an hour, the model still trains, and every reported
number is fiction. These tests run against the real archives — not fixtures —
because the thing being verified is a property of the dataset, not of our code.

    pytest ml/tests/test_alignment.py -v
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from astrolabe.io_cops import (  # noqa: E402
    AlignmentError,
    Hour,
    SAMPLE_RATE_HZ,
    assert_alignment,
    index_to_score,
    list_participants,
    load_accel,
    load_diary,
    parse_accel_name,
    score_to_index,
)

RAW = os.environ.get(
    "COPS_RAW",
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "cops", "raw"),
)

pytestmark = pytest.mark.skipif(
    not os.path.isdir(RAW) or not os.listdir(RAW),
    reason=f"COPS archives not found at {RAW}",
)


# ── the filename parser ───────────────────────────────────────────────────────

def test_parse_accel_name():
    m = parse_accel_name("COPS-29_Day6_14h-15h_leftWrist.csv")
    assert m == {
        "participant": "COPS-29", "day": 6,
        "hour_start": 14, "hour_end": 15, "side": "left",
    }


def test_parse_accel_name_midnight_wrap():
    """`23h-00h` wraps to 0, not 24."""
    m = parse_accel_name("COPS-11_Day1_23h-00h_rightWrist.csv")
    assert (m["hour_start"], m["hour_end"]) == (23, 0)


def test_parse_accel_name_rejects_junk():
    with pytest.raises(ValueError):
        parse_accel_name("not_an_accelerometry_file.csv")


# ── THE alignment property, over the whole cohort ─────────────────────────────

def test_alignment_holds_for_every_participant():
    """Every diary row in the dataset points at the [T-1, T) window.

    This is the assertion the whole pipeline rests on. It runs over all 66
    archives and reads no accelerometry, so it costs seconds.
    """
    participants = list_participants(RAW)
    assert len(participants) >= 60, f"only {len(participants)} archives found"

    checked = 0
    for pid in participants:
        for hour in load_diary(pid, RAW):
            if hour.left_csv or hour.right_csv:
                assert_alignment(hour)   # raises AlignmentError on any mismatch
                checked += 1

    assert checked > 5_000, f"only {checked} hours carried accelerometry references"


def test_diary_row_names_the_preceding_hour():
    """The documented convention, stated as an explicit equality.

    Deliberately redundant with assert_alignment: if someone ever "fixes" that
    function to be lenient, this still fails.
    """
    for pid in list_participants(RAW)[:12]:
        for hour in load_diary(pid, RAW):
            if not hour.left_csv:
                continue
            meta = parse_accel_name(hour.left_csv)
            assert meta["hour_start"] == hour.hour_end - 1, (
                f"{pid} day {hour.day}: diary stamp {hour.hour_end}h points at "
                f"a window starting {meta['hour_start']}h"
            )
            assert hour.hour_start == hour.hour_end - 1


def test_alignment_error_is_raised_on_a_shifted_row():
    """A deliberately shifted row must be caught. Guards the guard."""
    good = next(
        h for h in load_diary("COPS-29", RAW) if h.left_csv and h.right_csv
    )
    shifted = Hour(**{**vars(good), "hour_end": good.hour_end + 1,
                      "hour_start": good.hour_start + 1})
    with pytest.raises(AlignmentError):
        assert_alignment(shifted)


# ── the accelerometry actually behind those filenames ─────────────────────────

def test_accel_hour_has_the_expected_shape_and_rate():
    hour = next(h for h in load_diary("COPS-29", RAW) if h.left_csv)
    df = load_accel("COPS-29", hour.left_zip, hour.left_csv, RAW)

    assert list(df.columns) == ["Time", "X", "Y", "Z", "Photo", "Temp"]
    # a full hour at 100 Hz; allow for a partially worn hour at the edges
    assert 100_000 < len(df) <= 360_001, f"{len(df)} samples in one hour"
    assert df["Time"].iloc[0] == pytest.approx(0.0, abs=0.05)

    span = df["Time"].iloc[-1] - df["Time"].iloc[0]
    rate = (len(df) - 1) / span
    assert rate == pytest.approx(SAMPLE_RATE_HZ, rel=0.02), f"{rate:.1f} Hz"


def test_accel_values_are_plausible_accelerations():
    hour = next(h for h in load_diary("COPS-29", RAW) if h.left_csv)
    df = load_accel("COPS-29", hour.left_zip, hour.left_csv, RAW, downsample=50)

    for axis in ("X", "Y", "Z"):
        assert df[axis].abs().max() < 16.0, f"{axis} exceeds a wrist sensor's range"
    magnitude = (df[["X", "Y", "Z"]] ** 2).sum(axis=1) ** 0.5
    # a worn wrist sits around 1 g; wildly off means the columns are misread
    assert 0.5 < magnitude.median() < 2.0, f"median |a| = {magnitude.median():.2f} g"


def test_downsampling_preserves_the_hour():
    hour = next(h for h in load_diary("COPS-29", RAW) if h.left_csv)
    full = load_accel("COPS-29", hour.left_zip, hour.left_csv, RAW, downsample=1)
    quarter = load_accel("COPS-29", hour.left_zip, hour.left_csv, RAW, downsample=4)

    assert len(quarter) == pytest.approx(len(full) / 4, rel=0.01)
    # still spans the same hour — downsampling must not truncate it
    assert quarter["Time"].iloc[-1] == pytest.approx(full["Time"].iloc[-1], abs=0.05)


# ── the label encoding ────────────────────────────────────────────────────────

def test_state_index_round_trip():
    for score in range(-3, 4):
        assert index_to_score(score_to_index(score)) == score
    # index 3 is the GOOD state — the scale is diverging, not monotone severity
    assert score_to_index(0) == 3


def test_usable_requires_a_label_and_both_wrists():
    hours = load_diary("COPS-29", RAW)
    assert any(h.usable for h in hours)
    for h in hours:
        assert h.usable == (h.labelled and bool(h.left_csv) and bool(h.right_csv))


def test_cops_24_has_labels_but_no_accelerometry():
    """The known quirk: 105 labelled hours, zero wrist data. It must be
    excluded by `usable`, or the participant count is wrong."""
    hours = load_diary("COPS-24", RAW)
    assert sum(h.labelled for h in hours) > 50
    assert not any(h.usable for h in hours)
