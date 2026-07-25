# Astrolabe

**Read the hours you couldn't record.**

**→ [astrolabe-flame.vercel.app](https://astrolabe-flame.vercel.app)**

Reconstructs the tremor row of the Parkinson's motor diary from wrist
accelerometry — shows how certain it is, and abstains when the evidence is too
weak.

---

## The problem

Parkinson's symptoms fluctuate hour to hour. The paper diary meant to capture that
gets abandoned within days, and recall after the fact is unreliable. Clinic visits
are twenty-minute snapshots, months apart.

> *"My meds felt off all week. My neurologist asked when it was worse and I honestly
> couldn't tell her. I'd stopped filling in the diary by Wednesday."*

## What we found

Tremor is detectable across people. The subjective motor state is not.

| Target, held-out participants | Result |
|---|---|
| **Tremor present** — diary `TremorScore` > 0 | **AUC 0.697 ± 0.075** |
| Kinesia OFF/ON, same folds and same pipeline | AUC 0.567 |
| 7-state kinesia reconstruction | ordinal MAE 0.684, against a 0.594 constant |

Tremor is a 4–8 Hz mechanical oscillation the accelerometer measures directly.
Kinesia is a subjective judgement about how an hour went, and the sensor has no
access to it. Nine feature sets over five participant-level folds were swept;
none beat the constant.

Two consequences, both of them in the product. Answering only the most confident
quarter of hours raises tremor accuracy from 0.713 to 0.825 — that is the
evidence behind abstention, rather than an assertion of it. And the pooled AUC
of 0.68 falls to a median **within-participant** AUC of 0.550, above chance on
25 of 36 participants: much of the pooled figure separates tremor-dominant
people from others rather than a tremulous hour from a calm one in the same
person, and within-person is what a diary needs.

### What holds up best

The uncertainty itself, which is the part the product is actually built on.

| Measured on 11 held-out participants, 6,838 hours | |
|---|---|
| 90% interval, achieved coverage | **0.903** |
| Abstains, both wrists | 12.4% of hours, at MAE 0.226 on the rest |
| Abstains, one wrist dropped | **77.3%**, at MAE 0.218 on the rest |

Both sensor configurations are held to the same error budget, so the refusal
rate is the thing that has to move. Losing a wrist does not make the model
slightly less sure — it takes away most of what it was willing to say.

[docs/FINDINGS.md](docs/FINDINGS.md) is the full record, including §7 on two
ways the pipeline was flattering itself before those numbers were trustworthy.

## What this does

Reconstructs a continuous tremor trajectory from bilateral wrist accelerometry,
against the medication times the patient reported, with **calibrated
uncertainty** — and refuses to answer when the evidence cannot support one. The
7-state motor status sits beside it as *reported*, never as inferred.

The claim is testable, and testing it is the demo: hide a real participant's diary,
reconstruct the tremor row, then reveal the truth on screen.

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
| Feature pipeline | ✅ |
| Tremor detector, calibration, abstention | ✅ |
| Real bundles from trained models, per sensor configuration | ✅ |
| 7-state kinesia reconstruction | ❌ does not generalise across people — [docs/FINDINGS.md](docs/FINDINGS.md) |
| Web app | 🔨 |

## The numbers that matter

From `scripts/baselines.py` over all 66 COPS archives:

| | |
|---|---|
| Usable hours (label + bilateral accelerometry) | **6,530** |
| Participants with usable data | **65** of 66 |
| **Baseline to beat** — always predict "Good kinesia" | **ordinal MAE 0.594** |
| Oracle per-participant median | MAE 0.380 |

And what the model does against it, on participants it never trained on:

| | |
|---|---|
| 7-state kinesia reconstruction | MAE 0.684 — **worse than the baseline** |
| Tremor presence | **AUC 0.697 ± 0.075** |
| … median within-participant AUC | 0.550 |
| … average precision, prevalence 30.5% | 0.496 |

Any reported error is meaningless without that baseline beside it, so
`baseline_mae` is a required field in the output contract. It is also what makes
the kinesia row a reported negative result rather than a number that would read
as fine on its own.

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
  "truth":        [3, 3, 4, 4, 5],   // the 7-state diary answer
  "tremor_truth": [1, 1, 0, 0, 1],   // the diary's own tremor answer, 0/1/null
  "metrics": {
    // this day only — context, never a headline: one day is ~19 labelled hours
    "ordinal_mae": null, "baseline_mae": 0.594, "abstain_rate": 1.0,
    // measured on held-out participants — these are the claims
    "coverage_calibration": 0.903, "holdout_abstain_rate": 0.124,
    "tremor_auc": 0.697, "tremor_auc_within_participant_median": 0.55
  }
}
```

`null` is a real value and never interchangeable with zero: an MAE over zero
answered steps has no value, and rendering it as `0.00` would claim a perfect
score for a day the model declined outright.

The values above illustrate the shape and are not measurements — the measured
numbers are in [docs/FINDINGS.md](docs/FINDINGS.md). `tremor_p` is the field the
model can stand behind; `ordinal_mae` records how far the state reconstruction
is from the baseline, and on held-out participants it is on the wrong side of
it.

`posterior` is a 7-vector over the KinesiaScore states, indexed `0..6` →
`−3..+3`. **Index 3 is the *good* state.** The scale is diverging, not monotone
severity: both ends are impairment in opposite directions — too little movement
(akinesia) and too much (dyskinesia).

## Repository layout

```
contract/   the frozen output contract + mock bundles
scripts/    dataset download, diary extraction, baselines, palette generators
docs/       DATA.md — dataset reference · DESIGN.md — design system
            FINDINGS.md — what generalises across people, and what does not
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
- **The 7-state motor status is not reconstructed.** It does not generalise
  across people — held-out MAE 0.684 against a 0.594 constant — so it is shown
  as reported or abstained, never as inferred.
- **Pooled AUC flatters the tremor result.** Median within-participant AUC is
  0.550, above chance on 25 of 36 participants. Much of the pooled 0.68
  separates tremor-dominant people from everyone else rather than a tremulous
  hour from a calm one in the same person.

## Licence

Code: MIT. Data: CC-BY 4.0, © the COPS authors, cited above.
