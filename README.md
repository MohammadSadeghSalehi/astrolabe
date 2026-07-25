# Astrolabe

**Read the hours you couldn't record.**

Reconstructs the Parkinson's motor diary from wrist accelerometry — shows how
certain it is, and abstains when the evidence is too weak.

---

## The problem

Parkinson's symptoms fluctuate hour to hour. The paper diary meant to capture that
gets abandoned within days, and recall after the fact is unreliable. Clinic visits
are twenty-minute snapshots, months apart.

> *"My meds felt off all week. My neurologist asked when it was worse and I honestly
> couldn't tell her. I'd stopped filling in the diary by Wednesday."*

## What this does

Reconstructs a continuous motor-state trajectory from bilateral wrist accelerometry
and reported medication times, with **calibrated uncertainty** — and refuses to
answer when the evidence cannot support one.

The claim is testable, and testing it is the demo: hide a real participant's diary,
reconstruct it, then reveal the truth on screen.

### The design thesis

Every element on screen declares where it came from:

| Tier | Meaning | Treatment |
|---|---|---|
| `observed` | Off the sensor | Solid fill |
| `reported` | The patient told us | Solid fill + diamond marker |
| `reconstructed` | The model inferred it | 45° hatch, wrapped in its uncertainty band |
| *abstained* | We do not know | **No fill** — a dashed hole, with the reason in words |

Treatments differ by **texture, not hue**, so they survive a projector, greyscale
and colour-blind vision. **Abstention is drawn as absence** — "we don't know" must
never look like a value.

## Status

| Component | State |
|---|---|
| Dataset tooling, diary extraction, baselines | ✅ |
| Bundle contract + mock bundles | ✅ |
| Design system, validated palettes | ✅ |
| Feature pipeline, model, calibration | 🔨 |
| Web app | 🔨 |

## The numbers that matter

From `scripts/baselines.py` over all 66 COPS archives:

| | |
|---|---|
| Usable hours (label + bilateral accelerometry) | **6,530** |
| Participants with usable data | **65** of 66 |
| **Baseline to beat** — always predict "Good kinesia" | **ordinal MAE 0.594** |
| Oracle per-participant median | MAE 0.380 |

Any reported error is meaningless without that baseline beside it, so
`baseline_mae` is a required field in the output contract.

## Quick start

```bash
# 1. fetch the dataset (45 GB, CC-BY 4.0, from OSF)
python scripts/osf_download.py data/cops/raw --manifest scripts/cops_manifest.txt

# 2. extract every diary and compute coverage stats  (seconds; stdlib only)
python scripts/scan_diaries.py

# 3. the baselines the model must beat
python scripts/baselines.py

# 4. build mock bundles from the real diary, for UI development
python scripts/make_mock_bundle.py COPS-29
```

Steps 2–4 need no dependencies beyond the standard library.

## The output contract

One JSON bundle per participant-day. Frozen — everything downstream builds against
it, and the mock and the trained model emit the same shape.

```jsonc
{
  "participant": "COPS-29",
  "resolution_min": 10,
  "series": [
    { "t": "09:10",
      "state": { "posterior": [...7 floats...], "map": 3, "ci": [2, 5] },
      "tremor_p": 0.71, "confidence": 0.83,
      "abstain": false, "evidence": "reconstructed", "reason": null },
    { "t": "09:20", "abstain": true, "confidence": 0.21,
      "evidence": "reconstructed",
      "reason": "non-wear on left wrist > 8 min; activity pattern ambiguous" }
  ],
  "events":  [{ "t": "08:45", "type": "medication", "source": "reported",
                "drug": "Levodopa / Benserazid", "dose_mg": 100 }],
  "truth":   [3, 3, 4, 4, 5],
  "metrics": { "ordinal_mae": 0.44, "coverage_90": 0.88, "baseline_mae": 0.594 }
}
```

`posterior` is a 7-vector over the KinesiaScore states, indexed `0..6` →
`−3..+3`. **Index 3 is the *good* state.** The scale is diverging, not monotone
severity: both ends are impairment in opposite directions — too little movement
(akinesia) and too much (dyskinesia).

## Repository layout

```
contract/   the frozen output contract + mock bundles
scripts/    dataset download, diary extraction, baselines, palette generators
docs/       DATA.md — dataset reference · DESIGN.md — design system
            design-system.html — visual reference, open it in a browser
data/       derived label CSVs (tracked); raw archives (fetched, ignored)
```

## Data

**COPS** — Continuous Observation of Parkinsonian Symptoms. 66 people with
Parkinson's, bilateral wrist accelerometry at 100 Hz (GENEActiv) paired with hourly
symptom diaries, ~394 days total.

Licensed **CC-BY 4.0** — commercial use permitted with attribution:

> Nesser, T. et al. *COPS — Continuous Observation of Parkinsonian Symptoms.*
> OSF (2025). https://doi.org/10.17605/OSF.IO/5XVWN
>
> Nesser, T. et al. *Continuous observation of Parkinsonian symptoms using symptom
> diaries & wearable accelerometry.* Scientific Data (2026).
> https://doi.org/10.1038/s41597-026-06999-6

See [docs/DATA.md](docs/DATA.md) for the schema, the hourly alignment convention,
and the data quirks worth knowing before writing a loader.

## Limitations

Stated up front, because they bound what this can honestly claim:

- **46 of 66 participants have deep brain stimulation.** This is an advanced,
  device-treated cohort, not a newly diagnosed one, and DBS changes both the
  movement signature and the fluctuation pattern.
- **Labels are hourly.** The model infers at 10-minute resolution, but every
  reported metric is scored at the hourly resolution the labels actually have.
- **No causal claim.** Trajectory shape around recorded medication times is
  *temporal alignment*, not treatment response. Establishing response needs a
  controlled protocol.
- **Not a medical device.** No diagnostic, dosing or treatment claim is made.
- Three of the seven states have under 200 labelled hours across the whole cohort,
  so the extremes are not learnable from this data alone.

## Licence

Code: MIT. Data: CC-BY 4.0, © the COPS authors, cited above.
