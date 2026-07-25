"""Scan every COPS participant zip and summarise the symptom diaries.

Pure stdlib on purpose: this runs before the conda env exists.

Reads only the small `*_symptomdiary.csv` member of each participant archive
(never the accelerometry), so a full 66-participant scan takes seconds.

Outputs:
  data/cops/derived/diary_all.csv       one row per participant-hour, all 66
  data/cops/derived/participants.csv    one row per participant, with coverage
  ... plus a shortlist of demo candidates printed to stdout.

usage: python scripts/scan_diaries.py [raw_dir] [out_dir]
"""

import csv
import io
import os
import pathlib
import sys
import zipfile
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data" / "cops" / "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "data" / "cops" / "derived")

# The 7-point kinetic scale, as coded in the diary CSV.
KINESIA_LABELS = {
    -3: "Severe Akinesia",
    -2: "Discomforting Akinesia",
    -1: "Slight Akinesia",
    0: "Good Kinesia",
    1: "Slight Dyskinesia",
    2: "Discomforting Dyskinesia",
    3: "Severe Dyskinesia",
}


def parse_duration_hours(value):
    """'15 hr' -> 15 ; '0 days' -> 0. The diary writes MATLAB durations as text."""
    value = (value or "").strip()
    if not value:
        return None
    tok = value.split()
    try:
        n = float(tok[0])
    except ValueError:
        return None
    return int(n)


def as_int(value):
    value = (value or "").strip()
    if value in ("", "NaN", "nan"):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def read_diary(zpath):
    """Yield diary rows (as dicts) for one participant archive."""
    with zipfile.ZipFile(zpath) as z:
        member = next((n for n in z.namelist() if n.endswith("_symptomdiary.csv")), None)
        if member is None:
            return
        text = z.read(member).decode("utf-8-sig", "replace")
    for row in csv.DictReader(io.StringIO(text), delimiter=";"):
        yield row


def main():
    os.makedirs(OUT, exist_ok=True)
    zips = sorted(
        (f for f in os.listdir(RAW) if f.startswith("COPS-") and f.endswith(".zip")),
        key=lambda f: int(f.split("-")[1].split(".")[0]),
    )
    print(f"scanning {len(zips)} participant archives in {RAW}\n")

    all_rows = []
    per_participant = []
    kin_hist = Counter()
    wear_hist = Counter()

    for fn in zips:
        pid = fn[:-4]
        rows = list(read_diary(os.path.join(RAW, fn)))
        if not rows:
            print(f"  {pid}: NO DIARY FOUND")
            continue

        labelled = both = single = none_worn = 0
        med_events = 0
        tremor_pos = freeze_pos = fall_pos = 0
        sleep_hours = 0
        days = set()
        kin_local = Counter()

        for r in rows:
            day = parse_duration_hours(r.get("Day"))
            hour = parse_duration_hours(r.get("Time"))
            kin = as_int(r.get("KinesiaScore"))
            trem = as_int(r.get("TremorScore"))
            wear = (r.get("WearableDataAvailability") or "").strip()
            left = (r.get("WearableDataLeftCSV") or "").strip()
            right = (r.get("WearableDataRightCSV") or "").strip()
            kinesia_text = (r.get("Kinesia") or "").strip()
            meds = (r.get("Medication") or "").strip().strip('"')

            wear_hist[wear] += 1
            if kinesia_text == "Sleep":
                sleep_hours += 1
            if kin is not None:
                kin_hist[kin] += 1
                kin_local[kin] += 1
                labelled += 1
            if left and right:
                both += 1
            elif left or right:
                single += 1
            else:
                none_worn += 1
            if meds:
                med_events += 1
            if trem:
                tremor_pos += 1
            if as_int(r.get("FreezingScore")):
                freeze_pos += 1
            if as_int(r.get("FallScore")):
                fall_pos += 1
            if day is not None:
                days.add(day)

            all_rows.append(
                {
                    "participant": pid,
                    "day": day,
                    "hour": hour,
                    # a diary row labelled `hour` describes the hour ENDING at
                    # `hour`, i.e. the window [hour-1, hour) -- see DATA.md
                    "win_start_hour": None if hour is None else hour - 1,
                    "visit": (r.get("Visit") or "").strip(),
                    "kinesia_text": kinesia_text,
                    "kinesia_score": kin,
                    "tremor_score": trem,
                    "freezing_score": as_int(r.get("FreezingScore")),
                    "fall_score": as_int(r.get("FallScore")),
                    "medication": meds,
                    "dosage_1": (r.get("Dosage_1") or "").strip(),
                    "dosage_2": (r.get("Dosage_2") or "").strip(),
                    "wear": wear,
                    "left_csv": left,
                    "right_csv": right,
                }
            )

        # usable = has a diary label AND bilateral accelerometry for that hour
        usable = sum(
            1
            for r in all_rows
            if r["participant"] == pid
            and r["kinesia_score"] is not None
            and r["left_csv"]
            and r["right_csv"]
        )
        # how much the state actually MOVES -- a flat participant is a boring demo
        n_states = len([k for k, v in kin_local.items() if v >= 2])
        transitions = 0
        seq = [
            r["kinesia_score"]
            for r in all_rows
            if r["participant"] == pid and r["kinesia_score"] is not None
        ]
        for a, b in zip(seq, seq[1:]):
            if a != b:
                transitions += 1

        per_participant.append(
            {
                "participant": pid,
                "n_days": len(days),
                "diary_rows": len(rows),
                "labelled_hours": labelled,
                "bilateral_hours": both,
                "single_wrist_hours": single,
                "no_wear_hours": none_worn,
                "usable_hours": usable,
                "sleep_hours": sleep_hours,
                "distinct_states": n_states,
                "transitions": transitions,
                "med_events": med_events,
                "tremor_hours": tremor_pos,
                "freezing_hours": freeze_pos,
                "fall_hours": fall_pos,
            }
        )
        print(
            f"  {pid:9s} days={len(days):2d}  labelled={labelled:4d}  "
            f"bilateral={both:4d}  usable={usable:4d}  states={n_states}  "
            f"transitions={transitions:3d}  meds={med_events:3d}  tremor={tremor_pos:3d}"
        )

    # ---- write outputs -------------------------------------------------------
    diary_path = os.path.join(OUT, "diary_all.csv")
    with open(diary_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
        w.writeheader()
        w.writerows(all_rows)

    part_path = os.path.join(OUT, "participants.csv")
    with open(part_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(per_participant[0].keys()))
        w.writeheader()
        w.writerows(per_participant)

    # ---- summary -------------------------------------------------------------
    total_lab = sum(p["labelled_hours"] for p in per_participant)
    total_use = sum(p["usable_hours"] for p in per_participant)
    print(f"\nwrote {diary_path}  ({len(all_rows)} participant-hours)")
    print(f"wrote {part_path}  ({len(per_participant)} participants)")
    print(f"\ntotal labelled hours      : {total_lab}")
    print(f"total usable (label+2 wrists): {total_use}")

    print("\nKinesiaScore distribution (all participants):")
    for k in sorted(kin_hist):
        pct = 100 * kin_hist[k] / max(total_lab, 1)
        bar = "#" * int(pct / 2)
        print(f"  {k:+d} {KINESIA_LABELS[k]:<24} {kin_hist[k]:6d}  {pct:5.1f}%  {bar}")
    maj = max(kin_hist.values()) / max(total_lab, 1)
    print(f"\n  majority-class baseline accuracy = {maj:.1%}  <- the number to beat")

    print("\nWearableDataAvailability:")
    for k, v in wear_hist.most_common():
        print(f"  {k or '(blank)':<26} {v:6d}")

    # demo candidates: lots of usable bilateral hours, several distinct states,
    # plenty of transitions, and medication events to align against.
    print("\n=== demo-participant shortlist ===")
    print("(usable bilateral labelled hours x state variety x transitions x meds)")
    ranked = sorted(
        per_participant,
        key=lambda p: (
            min(p["usable_hours"], 120)
            * p["distinct_states"]
            * min(p["transitions"], 60)
            * (1 if p["med_events"] else 0)
        ),
        reverse=True,
    )
    for p in ranked[:10]:
        print(
            f"  {p['participant']:9s} usable={p['usable_hours']:4d}  states={p['distinct_states']}  "
            f"transitions={p['transitions']:3d}  meds={p['med_events']:3d}  "
            f"tremor={p['tremor_hours']:3d}  days={p['n_days']}"
        )


if __name__ == "__main__":
    main()
