"""Features per 10-minute window, both wrists.

Why 10 minutes when labels are hourly: the emission model runs at 10-min, the
HMM runs at 10-min, and each hour's label supervises all 6 of its sub-windows.
That gives a trajectory finer than the diary — which is the product claim —
while every reported metric is still scored at the hourly resolution the labels
actually have. See MODEL.md §1.

Filter design is copied from the COPS authors' own summary script
(`data/cops/meta/COPS_03_CreateSummaryFigure.m`) rather than re-derived:
8th-order Butterworth, 0.1–3 Hz for voluntary movement and 4–8 Hz for tremor.
Using their bands means our features are comparable to their figures.

The block that actually carries Parkinson's signal is the **bilateral asymmetry**
group at the bottom. PD is asymmetric; ordinary movement mostly is not. Anything
computed from one wrist alone struggles to separate "symptomatic" from "busy".
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import signal, stats

from .io_cops import SAMPLE_RATE_HZ, Hour

WINDOW_MIN = 10
WINDOWS_PER_HOUR = 60 // WINDOW_MIN

# The authors' bands.
BAND_MOVEMENT = (0.1, 3.0)
BAND_TREMOR = (4.0, 8.0)
FILTER_ORDER = 8

# Below this much data a window cannot support a feature vector.
MIN_COVERAGE = 0.5

_EPS = 1e-9


def _sos(band: tuple[float, float], fs: float):
    """Second-order-sections Butterworth. SOS not b/a — an 8th-order bandpass in
    transfer-function form is numerically unstable and will quietly return NaN."""
    nyq = fs / 2
    low, high = band[0] / nyq, min(band[1] / nyq, 0.99)
    return signal.butter(FILTER_ORDER, [low, high], btype="bandpass", output="sos")


def _bandpass(x: np.ndarray, band: tuple[float, float], fs: float) -> np.ndarray:
    if len(x) < 3 * FILTER_ORDER * 2:
        return np.zeros_like(x)
    return signal.sosfiltfilt(_sos(band, fs), x)


def _magnitude(df: pd.DataFrame, band: tuple[float, float] | None, fs: float) -> np.ndarray:
    """|a| over the three axes, optionally band-passed first."""
    xyz = df[["X", "Y", "Z"]].to_numpy(dtype=np.float64)
    if band is not None:
        xyz = np.column_stack([_bandpass(xyz[:, i], band, fs) for i in range(3)])
    return np.sqrt((xyz ** 2).sum(axis=1))


def _spectral(x: np.ndarray, fs: float, band: tuple[float, float]) -> dict:
    """Dominant frequency in `band`, its relative power, and spectral entropy."""
    if len(x) < 256:
        return {"dom_hz": 0.0, "dom_power": 0.0, "entropy": 0.0, "band_frac": 0.0}
    nperseg = min(1024, len(x))
    freqs, psd = signal.welch(x, fs=fs, nperseg=nperseg)
    total = psd.sum() + _EPS

    sel = (freqs >= band[0]) & (freqs <= band[1])
    if not sel.any():
        return {"dom_hz": 0.0, "dom_power": 0.0, "entropy": 0.0, "band_frac": 0.0}

    band_psd = psd[sel]
    peak = int(np.argmax(band_psd))
    p = psd / total
    return {
        "dom_hz": float(freqs[sel][peak]),
        "dom_power": float(band_psd[peak] / total),
        # normalised so it does not depend on the FFT length
        "entropy": float(stats.entropy(p + _EPS) / np.log(len(p))),
        "band_frac": float(band_psd.sum() / total),
    }


def _distribution(x: np.ndarray, prefix: str) -> dict:
    """Shape of a magnitude series. Percentiles rather than max: a single jolt
    should not define an entire ten-minute window."""
    if len(x) == 0:
        return {f"{prefix}_{k}": 0.0 for k in
                ("mean", "std", "rms", "p10", "p50", "p90", "iqr", "skew")}
    q10, q25, q50, q75, q90 = np.percentile(x, [10, 25, 50, 75, 90])
    return {
        f"{prefix}_mean": float(np.mean(x)),
        f"{prefix}_std": float(np.std(x)),
        f"{prefix}_rms": float(np.sqrt(np.mean(x ** 2))),
        f"{prefix}_p10": float(q10),
        f"{prefix}_p50": float(q50),
        f"{prefix}_p90": float(q90),
        f"{prefix}_iqr": float(q75 - q25),
        f"{prefix}_skew": float(stats.skew(x)) if np.std(x) > _EPS else 0.0,
    }


def wrist_features(df: pd.DataFrame, fs: float, side: str) -> dict:
    """Every feature for one wrist over one window."""
    out: dict[str, float] = {}

    # ENMO — Euclidean norm minus one, clipped at zero. Standard actigraphy:
    # removes gravity without needing to know the sensor's orientation.
    raw = _magnitude(df, None, fs)
    enmo = np.clip(raw - 1.0, 0.0, None)
    out.update(_distribution(enmo, f"{side}_enmo"))

    for band, name in ((BAND_MOVEMENT, "mv"), (BAND_TREMOR, "tr")):
        mag = _magnitude(df, band, fs)
        out.update(_distribution(mag, f"{side}_{name}"))
        for k, v in _spectral(mag, fs, band).items():
            out[f"{side}_{name}_{k}"] = v

    # Tremor energy relative to voluntary movement. A wrist can be still and
    # tremulous, or busy and steady; the ratio separates those, the levels do not.
    mv_rms = out[f"{side}_mv_rms"]
    tr_rms = out[f"{side}_tr_rms"]
    out[f"{side}_tremor_ratio"] = float(tr_rms / (mv_rms + _EPS))

    # Non-wear evidence: a wrist off the arm is still, cool, and sees light.
    out[f"{side}_temp_mean"] = float(df["Temp"].mean())
    out[f"{side}_temp_slope"] = float(
        np.polyfit(np.arange(len(df)), df["Temp"].to_numpy(dtype=np.float64), 1)[0]
        if len(df) > 10 else 0.0
    )
    out[f"{side}_light_mean"] = float(df["Photo"].mean())
    out[f"{side}_light_p90"] = float(np.percentile(df["Photo"], 90))
    out[f"{side}_stillness"] = float(np.mean(enmo < 0.02))

    return out


def asymmetry(left: dict, right: dict) -> dict:
    """Normalised bilateral difference — the highest-value feature block.

    (L - R) / (L + R) is scale-free, so it does not simply re-encode "how much
    the person moved", which the per-wrist features already carry.
    """
    out: dict[str, float] = {}
    for key in left:
        if not key.startswith("left_"):
            continue
        stem = key[len("left_"):]
        r_key = f"right_{stem}"
        if r_key not in right:
            continue
        lo, ro = left[key], right[r_key]
        denom = abs(lo) + abs(ro)
        out[f"asym_{stem}"] = float((lo - ro) / denom) if denom > _EPS else 0.0
    return out


def context_features(hour: Hour, window_index: int,
                     minutes_since_dose: float | None) -> dict:
    """Everything that is not the accelerometer.

    `minutes_since_dose` is derived from REPORTED medication times, so it is a
    legitimate input — it is not leaked from the label.
    """
    minute_of_day = hour.hour_start * 60 + window_index * WINDOW_MIN
    theta = 2 * np.pi * minute_of_day / (24 * 60)
    since = 600.0 if minutes_since_dose is None else float(min(minutes_since_dose, 600.0))
    return {
        "tod_sin": float(np.sin(theta)),
        "tod_cos": float(np.cos(theta)),
        "minutes_since_dose": since,
        "dose_recent": float(since < 90.0),
    }


def window_slices(n_samples: int, fs: float) -> list[tuple[int, int]]:
    """Index ranges for the 6 ten-minute windows in an hour.

    Derived from the sample rate rather than by dividing the array into six, so
    a partially-worn hour yields fewer complete windows instead of six stretched
    ones that silently span the wrong durations.
    """
    per_window = int(WINDOW_MIN * 60 * fs)
    return [
        (i * per_window, min((i + 1) * per_window, n_samples))
        for i in range(WINDOWS_PER_HOUR)
        if i * per_window < n_samples
    ]


def hour_features(
    hour: Hour,
    left: pd.DataFrame,
    right: pd.DataFrame,
    fs: float = SAMPLE_RATE_HZ,
    minutes_since_dose: float | None = None,
) -> pd.DataFrame:
    """One row per complete 10-minute window in this hour.

    The hour's label is attached to every window it contains — that is the
    supervision broadcast described in MODEL.md §1. Windows with too little data
    are dropped rather than padded: a half-empty window is a worse input than no
    input, because the model cannot tell the difference.
    """
    rows = []
    per_window = int(WINDOW_MIN * 60 * fs)

    for i, (a, b) in enumerate(window_slices(len(left), fs)):
        lw, rw = left.iloc[a:b], right.iloc[a:b]
        coverage = min(len(lw), len(rw)) / per_window
        if coverage < MIN_COVERAGE:
            continue

        lf = wrist_features(lw, fs, "left")
        rf = wrist_features(rw, fs, "right")

        row: dict[str, float | int | str | None] = {
            "participant": hour.participant,
            "day": hour.day,
            "hour_end": hour.hour_end,
            "hour_start": hour.hour_start,
            "window": i,
            # minutes from midnight — the x-axis every downstream step joins on
            "t_min": hour.hour_start * 60 + i * WINDOW_MIN,
            "state": hour.state,            # 0..6, broadcast from the hour
            "kinesia_score": hour.kinesia_score,
            "tremor_score": hour.tremor_score,
            "asleep": hour.asleep,
            "wear": hour.wear,
            "coverage": float(coverage),
        }
        row.update(lf)
        row.update(rf)
        row.update(asymmetry(lf, rf))
        row.update(context_features(hour, i, minutes_since_dose))
        rows.append(row)

    return pd.DataFrame(rows)


def feature_columns(df: pd.DataFrame) -> list[str]:
    """The model's input columns — everything that is not metadata or a label."""
    meta = {
        "participant", "day", "hour_end", "hour_start", "window", "t_min",
        "state", "kinesia_score", "tremor_score", "asleep", "wear", "coverage",
    }
    return [c for c in df.columns if c not in meta]
