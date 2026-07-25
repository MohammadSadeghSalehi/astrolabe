"""Compute the trivial baselines the model has to beat, from the scanned diaries.

Whatever the model scores on Saturday is meaningless until it is compared with
these. Pure stdlib so it runs before the conda env exists.

usage: python scripts/baselines.py [derived_dir]
"""

import csv
import os
import pathlib
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
DERIVED = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "data" / "cops" / "derived")

rows = []
with open(os.path.join(DERIVED, "diary_all.csv"), newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["kinesia_score"] not in ("", None):
            r["kinesia_score"] = int(r["kinesia_score"])
            rows.append(r)

usable = [r for r in rows if r["left_csv"] and r["right_csv"]]
y = [r["kinesia_score"] for r in usable]
n = len(y)
hist = Counter(y)

print(f"usable labelled hours (label + bilateral accelerometry): {n}\n")

# ---- baseline 1: always predict the majority class -------------------------
maj = hist.most_common(1)[0][0]
acc_maj = hist[maj] / n
mae_maj = sum(abs(v - maj) for v in y) / n
print(f"BASELINE A  always predict {maj:+d} (majority class)")
print(f"  accuracy    {acc_maj:.3f}")
print(f"  ordinal MAE {mae_maj:.3f}   <-- the headline number to beat")

# ---- baseline 2: predict the value minimising MAE (the median) --------------
srt = sorted(y)
median = srt[n // 2]
mae_med = sum(abs(v - median) for v in y) / n
print(f"\nBASELINE B  always predict the median {median:+d}")
print(f"  ordinal MAE {mae_med:.3f}")

# ---- baseline 3: per-participant median (a 'personalised' floor) -----------
by_p = defaultdict(list)
for r in usable:
    by_p[r["participant"]].append(r["kinesia_score"])
tot = err = 0
for vals in by_p.values():
    s = sorted(vals)
    m = s[len(s) // 2]
    err += sum(abs(v - m) for v in vals)
    tot += len(vals)
print(f"\nBASELINE C  per-participant median (oracle personalisation)")
print(f"  ordinal MAE {err / tot:.3f}   <-- personalised models must beat THIS, not A")

# ---- baseline 4: persistence (carry the previous hour forward) --------------
by_pd = defaultdict(list)
for r in usable:
    by_pd[(r["participant"], r["day"])].append((int(r["hour"]), r["kinesia_score"]))
tot = err = 0
for seq in by_pd.values():
    seq.sort()
    for (h0, v0), (h1, v1) in zip(seq, seq[1:]):
        if h1 == h0 + 1:
            err += abs(v1 - v0)
            tot += 1
print(f"\nBASELINE D  persistence (previous hour's label, consecutive hours only)")
print(f"  ordinal MAE {err / tot:.3f}  over {tot} transitions")
print("  ^ an HMM/temporal model that cannot beat this is not earning its keep")

# ---- how flat is a typical participant? ------------------------------------
print("\nper-participant label entropy (how much the state actually moves):")
flat = sum(1 for v in by_p.values() if len(set(v)) <= 2)
print(f"  {flat}/{len(by_p)} participants show <= 2 distinct states across the whole week")
print("  -> participant-level splits will have high variance; report per-participant spread,")
print("     not just a pooled mean.")

# ---- class collapse options -------------------------------------------------
print("\nclass support (7-point):")
for k in sorted(hist):
    print(f"  {k:+d}: {hist[k]:5d}  ({100*hist[k]/n:4.1f}%)")
rare = [k for k in hist if hist[k] < 200]
print(f"\n  classes with <200 usable hours: {sorted(rare)}")
print("  -> a 7-way classifier cannot learn these. Options, in preference order:")
print("     1. ordinal regression, report MAE (keeps all 7 on screen, honest)")
print("     2. collapse to 5 by merging +-3 into +-2")
print("     3. collapse to 3: akinetic (<=-2) / functional (-1..+1) / dyskinetic (>=+2)")

for name, fn in [
    ("5-class (merge +-3 into +-2)", lambda v: max(-2, min(2, v))),
    ("3-class (akinetic/functional/dyskinetic)", lambda v: -1 if v <= -2 else (1 if v >= 2 else 0)),
]:
    yy = [fn(v) for v in y]
    h = Counter(yy)
    m = h.most_common(1)[0]
    print(f"\n  {name}: majority accuracy {m[1]/n:.3f} (class {m[0]:+d}), {len(h)} classes")
    print(f"    support: {dict(sorted(h.items()))}")
