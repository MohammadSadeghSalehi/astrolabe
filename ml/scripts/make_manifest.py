"""Describe every shipped bundle, from the bundle itself.

    python ml/scripts/make_manifest.py

Writes app/public/bundles/manifest.json — the list the "try a participant"
selector reads.

Every field is computed from the emitted file. Nothing here is typed by hand,
because a hand-written blurb saying "moderate tremor throughout" would drift
from the data the first time a model changes and nobody would notice. The
one-line character of each participant is derived from their own numbers, so it
cannot say something the bundle does not.
"""

from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
BUNDLES = ROOT / "app" / "public" / "bundles"


def describe(b: dict) -> str:
    """One honest sentence about what this day looks like."""
    m = b.get("metrics") or {}
    prev = m.get("tremor_day_prevalence")
    abst = m.get("abstain_rate")
    n = m.get("n_steps") or len(b.get("series") or [])

    bits: list[str] = []
    if prev is not None:
        if prev == 0:
            bits.append("no tremor reported all day")
        elif prev >= 0.7:
            bits.append(f"tremor reported in {prev:.0%} of hours")
        elif prev <= 0.3:
            bits.append(f"tremor in only {prev:.0%} of hours")
        else:
            bits.append(f"tremor in {prev:.0%} of hours")
    if abst is not None:
        bits.append(
            "the model declines every step" if abst >= 0.999
            else f"declines {abst:.0%} of steps"
        )
    bits.append(f"{n} steps")
    return " · ".join(bits)


def main() -> None:
    entries = []
    for path in sorted(BUNDLES.glob("*.json")):
        if path.name == "manifest.json" or path.stem.endswith("_nowrist"):
            continue
        b = json.loads(path.read_text(encoding="utf-8"))
        m = b.get("metrics") or {}
        entries.append({
            "participant": b.get("participant"),
            "file": path.name,
            "day": b.get("day"),
            "steps": m.get("n_steps") or len(b.get("series") or []),
            "hours": len({s["t"][:2] for s in b.get("series", [])}),
            "tremor_prevalence": m.get("tremor_day_prevalence"),
            "abstain_rate": m.get("abstain_rate"),
            "medications": len([e for e in b.get("events", [])
                                if e.get("type") == "medication"]),
            "has_nowrist": (BUNDLES / f"{path.stem}_nowrist.json").exists(),
            "summary": describe(b),
        })

    out = BUNDLES / "manifest.json"
    out.write_text(json.dumps({"participants": entries}, indent=1), encoding="utf-8")
    print(f"wrote {out} — {len(entries)} participants")
    for e in entries:
        print(f"  {e['participant']:<10} day {e['day']}  {e['summary']}")


if __name__ == "__main__":
    main()
