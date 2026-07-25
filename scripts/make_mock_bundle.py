"""Build contract/COPS-29.mock.json from the REAL diary, with fake posteriors.

Why real structure + fake numbers: the UI tracks need a bundle now, and one built
from the actual diary has the real timing, the real medication events, the real
non-wear gaps and the real label trajectory. Only the posteriors are invented — so
when the true model lands, nothing downstream changes shape.

Pure stdlib. Deterministic (fixed seed).

usage: python scripts/make_mock_bundle.py [participant] [--out DIR]
"""

import csv
import json
import math
import os
import pathlib
import random
import sys

PID = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "COPS-29"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = str(ROOT / "contract")
DERIVED = str(ROOT / "data" / "cops" / "derived")
RES_MIN = 10                      # contract resolution
STEPS_PER_HOUR = 60 // RES_MIN

random.seed(20260725)

STATE_NAMES = [
    "Severe akinesia", "Discomforting akinesia", "Slight akinesia",
    "Good kinesia",
    "Slight dyskinesia", "Discomforting dyskinesia", "Severe dyskinesia",
]


def load_rows(pid):
    with open(os.path.join(DERIVED, "diary_all.csv"), newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["participant"] == pid]
    for r in rows:
        r["day"] = int(r["day"]) if r["day"] else None
        r["hour"] = int(r["hour"]) if r["hour"] else None
        r["k"] = int(r["kinesia_score"]) if r["kinesia_score"] else None
    return rows


def pick_day(rows):
    """Best demo day: labelled hours x state variety x medication events, and
    -- deliberately -- WITH some non-wear.

    A mock that never abstains is a bad mock: the agents building the timeline
    would never render or test the abstention path, which is the component the
    whole product argues for. So a day with real non-wear beats a cleaner one.
    """
    best, best_score = None, -1
    days = sorted({r["day"] for r in rows if r["day"] is not None})
    for d in days:
        day_rows = [r for r in rows if r["day"] == d]
        labelled = [r for r in day_rows if r["k"] is not None]
        usable = [r for r in labelled if r["kinesia_text"] != "Sleep"]
        if len(usable) < 8:
            continue
        # State variety dominates: a trajectory that barely moves is a dull
        # reveal. Non-wear is nice but we can synthesise a gap if the day has
        # none (see inject_gap), so it must not outrank a richer trajectory.
        variety = len({r["k"] for r in usable})
        meds = sum(1 for r in day_rows if r["medication"])
        score = len(usable) * (variety ** 2) * (1 + meds)
        if score > best_score:
            best, best_score = d, score
    return best


def smooth_posteriors(series, passes=3, weight=0.55):
    """Give the mock trajectory temporal structure.

    Each step's posterior is generated independently, which produces a line that
    swings three states in ten minutes. Real motor state does not do that, and a
    clinician would find the shape obviously wrong -- so the interface would be
    developed against something the real model will never emit.

    The trained model gets this structure from the HMM. Here a few smoothing
    passes over neighbouring steps stand in for it.
    """
    idx = [i for i, p in enumerate(series) if not p["abstain"] and p["state"]]
    for _ in range(passes):
        prev = {i: list(series[i]["state"]["posterior"]) for i in idx}
        for pos, i in enumerate(idx):
            neigh = []
            if pos > 0 and idx[pos - 1] == i - 1:
                neigh.append(prev[i - 1])
            if pos < len(idx) - 1 and idx[pos + 1] == i + 1:
                neigh.append(prev[i + 1])
            if not neigh:
                continue
            cur = prev[i]
            blended = [
                weight * cur[k] + (1 - weight) * sum(n[k] for n in neigh) / len(neigh)
                for k in range(7)
            ]
            s = sum(blended)
            series[i]["state"]["posterior"] = [round(v / s, 4) for v in blended]

    # Smoothing alone tracks the truth almost perfectly, because the truth is
    # itself smooth (one hourly label repeated across six steps). A mock that is
    # never wrong would let the interface ship tuned for tight bands the real
    # model will never produce. So drift a slowly-varying bias across the day:
    # sustained, plausible error rather than per-step noise.
    bias, drift = 0.0, 0.0
    for pos, i in enumerate(idx):
        drift = 0.85 * drift + random.gauss(0, 0.10)
        bias = max(-0.9, min(0.9, bias + drift * 0.30))
        p = series[i]["state"]["posterior"]
        # shift mass along the ordinal axis by `bias` states
        out = [0.0] * 7
        for k in range(7):
            target = k + bias
            lo, frac = int(math.floor(target)), target - math.floor(target)
            if 0 <= lo < 7:
                out[lo] += p[k] * (1 - frac)
            if 0 <= lo + 1 < 7:
                out[lo + 1] += p[k] * frac
        s = sum(out) or 1.0
        series[i]["state"]["posterior"] = [round(v / s, 4) for v in out]

    for i in idx:
        p = series[i]["state"]["posterior"]
        series[i]["state"]["map"] = max(range(7), key=lambda k: p[k])
        series[i]["state"]["ci"] = interval(p)
        series[i]["confidence"] = round(max(p), 2)


def inject_gap(series, truth):
    """Force one abstention run if the day has none.

    The mock's job is to exercise every render path. A bundle that never
    abstains lets the timeline ship without anyone having seen the abstention
    treatment, which is the component the entire product argues for.
    """
    if any(p["abstain"] for p in series):
        return False
    n = len(series)
    start = int(n * 0.42)
    for p in series[start:start + 5]:          # ~50 minutes
        p["state"] = None
        p["tremor_p"] = None
        p["confidence"] = round(random.uniform(0.14, 0.26), 2)
        p["abstain"] = True
        p["reason"] = "non-wear on left wrist > 8 min; activity pattern ambiguous"
    return True


def widen(series, factor=2.2, extra_abstain=0.18):
    """Derive the one-wrist-dropped variant: flatter posteriors, wider
    intervals, more abstention. Same timestamps, same truth."""
    out = []
    for p in series:
        q = json.loads(json.dumps(p))
        if q["abstain"]:
            out.append(q)
            continue
        if random.random() < extra_abstain:
            q["state"] = None
            q["tremor_p"] = None
            q["confidence"] = round(random.uniform(0.13, 0.30), 2)
            q["abstain"] = True
            q["reason"] = "left wrist dropped; bilateral asymmetry unavailable"
            out.append(q)
            continue
        post = q["state"]["posterior"]
        flat = [(x ** (1 / factor)) for x in post]
        s = sum(flat)
        flat = [round(x / s, 4) for x in flat]
        q["state"]["posterior"] = flat
        q["state"]["map"] = max(range(7), key=lambda i: flat[i])
        q["state"]["ci"] = interval(flat)
        q["confidence"] = round(max(flat), 2)
        out.append(q)
    return out


def posterior_for(k, confident):
    """A plausible 7-vector peaked near the true state.

    Confident steps get a tight peak; ambiguous ones a broad, flatter shape.
    Roughly 1 step in 11 is deliberately WRONG (a larger shift) so that the
    90% intervals land near 90% coverage rather than a fake 100% -- a mock that
    is never wrong would let the UI ship a calibration panel nobody has seen fail.
    This is invented data; the real model replaces it wholesale.
    """
    idx = k + 3
    blunder = random.random() < 0.09
    spread = (0.62 if confident else 1.5) * (1.0 if not blunder else 0.8)
    sigma = (0.30 if confident else 0.85) + (1.9 if blunder else 0.0)
    centre = max(-0.4, min(6.4, idx + random.gauss(0, sigma)))
    w = [math.exp(-((i - centre) ** 2) / (2 * spread ** 2)) for i in range(7)]
    w = [x + 0.003 for x in w]
    s = sum(w)
    return [round(x / s, 4) for x in w]


def interval(post, mass=0.90):
    """Smallest contiguous [lo, hi] whose posterior mass >= `mass`."""
    best = (0, 6)
    best_w = 7
    for lo in range(7):
        acc = 0.0
        for hi in range(lo, 7):
            acc += post[hi]
            if acc >= mass:
                if hi - lo < best_w:
                    best, best_w = (lo, hi), hi - lo
                break
    return list(best)


def main():
    rows = load_rows(PID)
    if not rows:
        sys.exit(f"no diary rows for {PID}")
    day = pick_day(rows)
    if day is None:
        sys.exit(f"no usable day for {PID}")

    day_rows = sorted([r for r in rows if r["day"] == day], key=lambda r: r["hour"])
    day_rows = [r for r in day_rows if r["k"] is not None]

    series, truth, events = [], [], []
    for r in day_rows:
        hour = r["hour"]                     # row `hour` covers [hour-1, hour)
        start = hour - 1
        worn = r["wear"] == "Wearable Worn"
        bilateral = bool(r["left_csv"] and r["right_csv"])
        asleep = r["kinesia_text"] == "Sleep"

        if r["medication"]:
            drug = r["medication"].split(";")[0].strip()
            dose = r["dosage_1"] or None
            events.append({
                "t": f"{start:02d}:45",
                "type": "medication",
                "source": "reported",
                "drug": drug,
                "dose_mg": float(dose) if dose else None,
            })

        for s in range(STEPS_PER_HOUR):
            mm = s * RES_MIN
            t = f"{start:02d}:{mm:02d}"
            truth.append(r["k"] + 3)

            # abstain where the sensor genuinely was not there
            if not worn or not bilateral:
                series.append({
                    "t": t,
                    "state": None,
                    "tremor_p": None,
                    "confidence": round(random.uniform(0.12, 0.28), 2),
                    "abstain": True,
                    "evidence": "reconstructed",
                    "reason": ("non-wear on both wrists > 8 min"
                               if not worn else
                               "single wrist only; activity pattern ambiguous"),
                })
                continue

            confident = not asleep and random.random() > 0.22
            post = posterior_for(r["k"], confident)
            mp = max(range(7), key=lambda i: post[i])
            conf = round(max(post), 2)
            tp = int(r["tremor_score"] or 0)
            series.append({
                "t": t,
                "state": {"posterior": post, "map": mp, "ci": interval(post)},
                "tremor_p": round(min(0.97, max(0.02, tp / 2 + random.gauss(0, 0.12))), 2),
                "confidence": conf,
                "abstain": False,
                "evidence": "reconstructed",
                "reason": None,
            })

    smooth_posteriors(series)
    synthetic = inject_gap(series, truth)

    def metrics_for(ser):
        paired = [(p["state"]["map"], t) for p, t in zip(ser, truth) if not p["abstain"]]
        mae = sum(abs(m - t) for m, t in paired) / max(len(paired), 1)
        covered = sum(
            1 for p, t in zip(ser, truth)
            if not p["abstain"] and p["state"]["ci"][0] <= t <= p["state"]["ci"][1]
        )
        width = sum(
            p["state"]["ci"][1] - p["state"]["ci"][0] for p in ser if not p["abstain"]
        ) / max(len(paired), 1)
        return {
            "ordinal_mae": round(mae, 3),
            "macro_f1": 0.58,
            "brier": 0.14,
            "coverage_90": round(covered / max(len(paired), 1), 3),
            "mean_interval_width": round(width, 2),
            "baseline_mae": 0.594,
            "n_hours": len(day_rows),
            "abstain_rate": round(sum(1 for p in ser if p["abstain"]) / len(ser), 3),
        }

    def build(ser, note):
        return {
            "participant": PID,
            "day": day,
            "resolution_min": RES_MIN,
            "generated": note,
            "series": ser,
            "events": events,
            "truth": truth,
            "metrics": metrics_for(ser),
            "next_observation": {
                "action": "20s hand rest task",
                "expected_uncertainty_drop": 0.34,
                "burden": 1,
            },
        }

    note = "MOCK - real diary structure and truth, invented posteriors"
    if synthetic:
        note += "; abstention gap synthesised to exercise the render path"

    os.makedirs(OUT, exist_ok=True)
    outputs = [
        (f"{PID}.mock.json", build(series, note)),
        (f"{PID}_nowrist.mock.json",
         build(widen(series), note + "; LEFT WRIST DROPPED variant")),
    ]
    for name, b in outputs:
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(b, f, indent=1)

    print(f"day {day} · {len(day_rows)} labelled hours · {len(series)} steps @ {RES_MIN}min")
    print(f"states present : {sorted({t for t in truth})}")
    for i in sorted({t for t in truth}):
        print(f"                 {i} {STATE_NAMES[i]}")
    print(f"medication     : {len(events)} events")
    if synthetic:
        print("NOTE           : synthesised one ~50min abstention gap (day had none)")
    print()
    for name, b in outputs:
        m = b["metrics"]
        print(f"{name}")
        print(f"   MAE {m['ordinal_mae']} (baseline {m['baseline_mae']}) · "
              f"coverage {m['coverage_90']:.0%} · abstain {m['abstain_rate']:.0%} · "
              f"mean CI width {m['mean_interval_width']}")


if __name__ == "__main__":
    main()
