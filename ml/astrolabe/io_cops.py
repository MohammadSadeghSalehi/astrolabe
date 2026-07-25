"""Read COPS participant archives without unpacking 45 GB.

Layout inside `COPS-N.zip`:

    COPS-N/COPS-N_symptomdiary.csv                          <- the labels
    COPS-N/Accelerometry/COPS-N_Day0_15h-16h_leftWrist.zip   <- one nested zip
        └── COPS-N_Day0_15h-16h_leftWrist.csv                   per hour per wrist

Each accelerometry CSV is `Time;X;Y;Z;Photo;Temp` at 100 Hz — 360 000 rows,
~15.7 MB uncompressed, ~2.4 MB zipped. Reading the two members you actually need
straight out of the archive costs milliseconds; unpacking a participant costs
~5 GB of disk. So nothing here ever unpacks.

═══════════════════════════════════════════════════════════════════════════════
THE ALIGNMENT TRAP — the reason this module exists as its own file
═══════════════════════════════════════════════════════════════════════════════

A diary row stamped `Time = T hr` describes the hour that *ends* at T, i.e. the
window [T-1, T).

Two independent confirmations:

  1. In COPS-11's diary, the row with `Time = 17 hr` carries
     `WearableDataLeftCSV = COPS-11_Day0_16h-17h_leftWrist.csv`.
  2. The authors' own plotting code (COPS_03_CreateSummaryFigure.m) draws every
     bar at `symptomdiary.Time(i) - hours(.5)` — centred half an hour *before*
     the stamp.

Get this wrong and every label shifts by one hour. Nothing crashes. The loss
still falls. Every number you report is quietly wrong.

**So we never reconstruct a timestamp to join on.** The diary row names its own
accelerometry files, and we read exactly those. The filename is unambiguous and
self-checking — `assert_alignment()` below verifies the hour encoded in the
filename really is `T-1`, and raises if the dataset ever disagrees with us.
"""

from __future__ import annotations

import io
import os
import re
import zipfile
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterator

import numpy as np
import pandas as pd

SAMPLE_RATE_HZ = 100
ACCEL_COLUMNS = ["Time", "X", "Y", "Z", "Photo", "Temp"]

# COPS-29_Day6_14h-15h_leftWrist.csv  ->  day 6, window [14, 15), left
_ACCEL_NAME = re.compile(
    r"^(?P<pid>COPS-\d+)_Day(?P<day>\d+)_(?P<h0>\d+)h-(?P<h1>\d+)h_"
    r"(?P<side>left|right)Wrist\.csv$"
)

# The 7-point kinetic scale. Model index = KinesiaScore + 3, so index 3 is
# "Good kinesia" and the scale is DIVERGING, not monotone severity.
KINESIA_LABELS = {
    -3: "Severe akinesia",
    -2: "Discomforting akinesia",
    -1: "Slight akinesia",
    0: "Good kinesia",
    1: "Slight dyskinesia",
    2: "Discomforting dyskinesia",
    3: "Severe dyskinesia",
}
N_STATES = 7


def score_to_index(score: int) -> int:
    """KinesiaScore (-3..+3) -> model state index (0..6)."""
    return int(score) + 3


def index_to_score(index: int) -> int:
    return int(index) - 3


class AlignmentError(AssertionError):
    """The diary and the accelerometry filenames disagree about which hour a
    row describes. Never suppress this."""


@dataclass(frozen=True)
class Hour:
    """One labelled participant-hour, with the accelerometry it points at."""

    participant: str
    day: int
    hour_end: int          # the diary's own stamp, `Time = T hr`
    hour_start: int        # T - 1; the window is [hour_start, hour_end)
    kinesia_score: int | None
    kinesia_text: str
    tremor_score: int | None
    freezing_score: int | None
    fall_score: int | None
    wear: str
    asleep: bool
    medication: str
    dose_mg_1: float | None
    dose_mg_2: float | None
    left_zip: str
    left_csv: str
    right_zip: str
    right_csv: str

    @property
    def bilateral(self) -> bool:
        return bool(self.left_csv and self.right_csv)

    @property
    def labelled(self) -> bool:
        return self.kinesia_score is not None

    @property
    def usable(self) -> bool:
        """Has a label AND both wrists. This is the 6,530-hour subset."""
        return self.labelled and self.bilateral

    @property
    def state(self) -> int | None:
        return None if self.kinesia_score is None else score_to_index(self.kinesia_score)


# ──────────────────────────────────────────────────────────────────────────────
# archive access
# ──────────────────────────────────────────────────────────────────────────────

def archive_path(participant: str, raw_dir: str) -> str:
    return os.path.join(raw_dir, f"{participant}.zip")


def list_participants(raw_dir: str) -> list[str]:
    """Every participant with an archive on disk, in numeric order."""
    names = [
        f[:-4] for f in os.listdir(raw_dir)
        if f.startswith("COPS-") and f.endswith(".zip")
    ]
    return sorted(names, key=lambda p: int(p.split("-")[1]))


@lru_cache(maxsize=8)
def _open_archive(path: str) -> zipfile.ZipFile:
    """Keep a few archives open — reopening per hour is the slow path."""
    return zipfile.ZipFile(path)


def _as_int(value) -> int | None:
    s = str(value or "").strip()
    if s in ("", "NaN", "nan", "None"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _as_float(value) -> float | None:
    s = str(value or "").strip()
    if s in ("", "NaN", "nan", "None"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_duration(value) -> int | None:
    """'15 hr' -> 15 ; '0 days' -> 0. The diary writes MATLAB durations as text."""
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return int(float(s.split()[0]))
    except (ValueError, IndexError):
        return None


# ──────────────────────────────────────────────────────────────────────────────
# the diary
# ──────────────────────────────────────────────────────────────────────────────

def load_diary(participant: str, raw_dir: str) -> list[Hour]:
    """Every diary row for one participant, in chronological order.

    Reads only the small `*_symptomdiary.csv` member — never any accelerometry.
    """
    z = _open_archive(archive_path(participant, raw_dir))
    member = next((n for n in z.namelist() if n.endswith("_symptomdiary.csv")), None)
    if member is None:
        raise FileNotFoundError(f"{participant}: no symptomdiary.csv in the archive")

    text = z.read(member).decode("utf-8-sig", "replace")
    df = pd.read_csv(io.StringIO(text), sep=";", dtype=str, keep_default_na=False)

    hours: list[Hour] = []
    for _, r in df.iterrows():
        hour_end = _parse_duration(r.get("Time"))
        day = _parse_duration(r.get("Day"))
        if hour_end is None or day is None:
            continue
        hours.append(
            Hour(
                participant=participant,
                day=day,
                hour_end=hour_end,
                # ── the whole point of this module ──
                hour_start=hour_end - 1,
                kinesia_score=_as_int(r.get("KinesiaScore")),
                kinesia_text=str(r.get("Kinesia", "")).strip(),
                tremor_score=_as_int(r.get("TremorScore")),
                freezing_score=_as_int(r.get("FreezingScore")),
                fall_score=_as_int(r.get("FallScore")),
                wear=str(r.get("WearableDataAvailability", "")).strip(),
                asleep=str(r.get("Kinesia", "")).strip() == "Sleep",
                medication=str(r.get("Medication", "")).strip().strip('"'),
                dose_mg_1=_as_float(r.get("Dosage_1")),
                dose_mg_2=_as_float(r.get("Dosage_2")),
                left_zip=str(r.get("WearableDataLeftZIP", "")).strip(),
                left_csv=str(r.get("WearableDataLeftCSV", "")).strip(),
                right_zip=str(r.get("WearableDataRightZIP", "")).strip(),
                right_csv=str(r.get("WearableDataRightCSV", "")).strip(),
            )
        )
    hours.sort(key=lambda h: (h.day, h.hour_end))
    return hours


def diary_frame(participants: list[str], raw_dir: str) -> pd.DataFrame:
    """All diary rows for many participants as one tidy frame."""
    rows = [vars(h) for p in participants for h in load_diary(p, raw_dir)]
    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# medication timing
# ──────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Dose:
    """One reported medication intake.

    The diary resolves intake only to the hour that contains it, so `minute` is
    the midpoint of that hour, not a measured time. Everything downstream that
    uses it — `minutes_since_dose` above all — inherits roughly +/-30 min of
    slack. Say that out loud rather than implying the timing is exact.
    """

    day: int
    minute: int              # minutes from midnight, hour midpoint
    drugs: tuple[str, ...]
    total_mg: float

    @property
    def absolute_minute(self) -> int:
        """Minutes from the start of day 0, so doses order across midnight."""
        return self.day * 24 * 60 + self.minute


def dose_events(hours: list[Hour]) -> list[Dose]:
    """Every reported medication intake for a participant, chronologically.

    The `Medication` field packs multiple drugs into one `;`-separated string,
    with `Dosage_1`/`Dosage_2` matched positionally.
    """
    doses: list[Dose] = []
    for h in hours:
        if not h.medication:
            continue
        drugs = tuple(d.strip() for d in h.medication.split(";") if d.strip())
        if not drugs:
            continue
        mg = sum(v for v in (h.dose_mg_1, h.dose_mg_2) if v is not None)
        doses.append(
            Dose(
                day=h.day,
                # the diary only says "during [T-1, T)" — take the midpoint
                minute=h.hour_start * 60 + 30,
                drugs=drugs,
                total_mg=float(mg),
            )
        )
    doses.sort(key=lambda d: d.absolute_minute)
    return doses


def minutes_since_dose(doses: list[Dose], day: int, minute_of_day: int
                       ) -> tuple[float | None, float]:
    """(minutes elapsed since the last dose at or before this time, its mg).

    Returns (None, 0.0) before the first recorded dose — the caller decides how
    to encode "no dose yet", which is genuinely different from "a very long time
    ago" and must not be silently conflated with it.
    """
    now = day * 24 * 60 + minute_of_day
    prior = [d for d in doses if d.absolute_minute <= now]
    if not prior:
        return None, 0.0
    last = prior[-1]
    return float(now - last.absolute_minute), last.total_mg


# ──────────────────────────────────────────────────────────────────────────────
# the alignment check
# ──────────────────────────────────────────────────────────────────────────────

def parse_accel_name(csv_name: str) -> dict:
    """Pull participant / day / window / side out of an accelerometry filename."""
    m = _ACCEL_NAME.match(csv_name)
    if not m:
        raise ValueError(f"unparseable accelerometry filename: {csv_name!r}")
    d = m.groupdict()
    return {
        "participant": d["pid"],
        "day": int(d["day"]),
        "hour_start": int(d["h0"]),
        "hour_end": int(d["h1"]),
        "side": d["side"],
    }


def assert_alignment(hour: Hour) -> None:
    """Verify the diary row and its accelerometry filenames describe the SAME hour.

    A diary row stamped `Time = T hr` must point at the `(T-1)h-Th` files. If it
    ever does not, the convention documented at the top of this module is wrong
    for that row and every downstream number is suspect — so this raises rather
    than warns.
    """
    for csv_name, side in ((hour.left_csv, "left"), (hour.right_csv, "right")):
        if not csv_name:
            continue
        meta = parse_accel_name(csv_name)

        if meta["participant"] != hour.participant:
            raise AlignmentError(
                f"{hour.participant} day {hour.day} {hour.hour_end}h: "
                f"{side} file belongs to {meta['participant']}"
            )
        if meta["day"] != hour.day:
            raise AlignmentError(
                f"{hour.participant} day {hour.day} {hour.hour_end}h: "
                f"{side} file is day {meta['day']}"
            )
        # `23h-00h` wraps to 0 rather than 24
        expected_end = hour.hour_end % 24
        if meta["hour_start"] != hour.hour_start or meta["hour_end"] != expected_end:
            raise AlignmentError(
                f"{hour.participant} day {hour.day}, diary stamp {hour.hour_end}h "
                f"=> expected window [{hour.hour_start}, {expected_end}), but the "
                f"{side} file is [{meta['hour_start']}, {meta['hour_end']}) "
                f"({csv_name}). The diary/accelerometry convention has changed - "
                f"do NOT proceed until this is understood."
            )


# ──────────────────────────────────────────────────────────────────────────────
# accelerometry
# ──────────────────────────────────────────────────────────────────────────────

def load_accel(
    participant: str,
    zip_name: str,
    csv_name: str,
    raw_dir: str,
    downsample: int = 1,
) -> pd.DataFrame:
    """One hour of one wrist, read from the nested zip without unpacking.

    `downsample=4` takes every 4th sample (100 Hz -> 25 Hz), which is ample for
    an hourly label and roughly a 4x speedup over the whole pipeline.

    Returns columns Time (float seconds from the hour's start), X, Y, Z, Photo, Temp.
    """
    outer = _open_archive(archive_path(participant, raw_dir))
    member = f"{participant}/Accelerometry/{zip_name}"
    try:
        blob = outer.read(member)
    except KeyError as exc:
        raise FileNotFoundError(f"{member} not in {participant}.zip") from exc

    with zipfile.ZipFile(io.BytesIO(blob)) as inner:
        with inner.open(csv_name) as fh:
            df = pd.read_csv(
                fh,
                sep=";",
                names=ACCEL_COLUMNS,
                header=0,
                dtype={"X": np.float32, "Y": np.float32, "Z": np.float32,
                       "Photo": np.float32, "Temp": np.float32},
            )

    if downsample > 1:
        df = df.iloc[::downsample].reset_index(drop=True)

    # `Time` is a wall-clock time-of-day string that restarts each file. Seconds
    # from the start of the hour is what every downstream window wants.
    t = pd.to_timedelta(df["Time"].astype(str))
    df["Time"] = (t - t.iloc[0]).dt.total_seconds().astype(np.float32)
    return df


def load_hour(
    hour: Hour,
    raw_dir: str,
    downsample: int = 1,
    check: bool = True,
) -> tuple[pd.DataFrame | None, pd.DataFrame | None]:
    """Both wrists for one diary hour, as (left, right). Either may be None.

    `check=True` asserts the filenames really describe this hour. Leave it on.
    """
    if check:
        assert_alignment(hour)
    left = (
        load_accel(hour.participant, hour.left_zip, hour.left_csv, raw_dir, downsample)
        if hour.left_csv else None
    )
    right = (
        load_accel(hour.participant, hour.right_zip, hour.right_csv, raw_dir, downsample)
        if hour.right_csv else None
    )
    return left, right


def iter_usable_hours(
    participant: str,
    raw_dir: str,
    downsample: int = 1,
    include_sleep: bool = False,
) -> Iterator[tuple[Hour, pd.DataFrame, pd.DataFrame]]:
    """Yield (hour, left, right) for every hour with a label and both wrists.

    Sleep is excluded by default: reconstructing sleep well is not evidence of
    anything, and including it inflates every metric.
    """
    for hour in load_diary(participant, raw_dir):
        if not hour.usable:
            continue
        if hour.asleep and not include_sleep:
            continue
        left, right = load_hour(hour, raw_dir, downsample)
        if left is None or right is None:
            continue
        yield hour, left, right
