"""Inspect an emitted bundle: confidence, abstention, tremor, coverage.

    python ml/scripts/inspect_bundle.py [contract/COPS-29.json ...]
"""

from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
paths = [pathlib.Path(a) for a in sys.argv[1:]] or [
    ROOT / "contract" / "COPS-29.json",
    ROOT / "contract" / "COPS-29_nowrist.json",
]


def show(path: pathlib.Path) -> None:
    b = json.loads(path.read_text())
    series = b["series"]
    truth = b["truth"]
    answered = [s for s in series if not s["abstain"]]
    conf = np.array([s["confidence"] for s in series])
    widths = np.array([s["state"]["ci"][1] - s["state"]["ci"][0] + 1 for s in answered]) \
        if answered else np.array([])
    tp = np.array([s["tremor_p"] for s in series if s.get("tremor_p") is not None])

    print(f"\n{'=' * 62}\n{path.name}  day {b['day']}  {len(series)} steps\n{'=' * 62}")
    print(f"  answered {len(answered)}  abstained {len(series) - len(answered)} "
          f"({100 * (1 - len(answered) / len(series)):.0f}%)")
    print(f"  confidence (peak posterior): min {conf.min():.3f}  "
          f"median {np.median(conf):.3f}  max {conf.max():.3f}")
    if widths.size:
        print(f"  interval width on answered: median {np.median(widths):.1f} states")
    if tp.size:
        print(f"  tremor_p: min {tp.min():.3f}  median {np.median(tp):.3f}  "
              f"max {tp.max():.3f}  (n={tp.size})")
        # tremor truth is not in the bundle; report the spread only
        print(f"    above 0.5 on {int((tp > 0.5).sum())}/{tp.size} steps")

    if answered:
        y = np.array([truth[i] for i, s in enumerate(series) if not s["abstain"]])
        post = np.array([s["state"]["posterior"] for s in answered])
        exp = post @ np.arange(7)
        iv = np.array([s["state"]["ci"] for s in answered])
        cov = ((iv[:, 0] <= y) & (y <= iv[:, 1])).mean()
        print(f"  kinesia MAE {np.abs(exp - y).mean():.3f} (baseline 0.594)  "
              f"coverage {cov:.3f}")

    m = b["metrics"]
    print(f"  metrics keys: {', '.join(sorted(m))}")


for p in paths:
    if p.exists():
        show(p)
    else:
        print(f"missing: {p}")
