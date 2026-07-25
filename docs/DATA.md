# COPS — dataset reference

Everything here was verified against the downloaded files on 25 Jul 2026, not from
the paper. Numbers come from `scripts/scan_diaries.py` and `scripts/baselines.py`;
the held-out model numbers come from `ml/scripts/` and are recorded in full in
[FINDINGS.md](FINDINGS.md).

## Source & licence

| | |
|---|---|
| Name | **COPS** — Continuous Observation of Parkinsonian Symptoms |
| Repository | OSF `5xvwn` — <https://osf.io/5xvwn/> |
| DOI | `10.17605/OSF.IO/5XVWN` |
| Paper | Nesser et al., *Scientific Data* (2026), `10.1038/s41597-026-06999-6` |
| **Licence** | **CC-BY 4.0** — attribution only |
| Device | GENEActiv, bilateral wrist, 100 Hz |
| Local copy | `data/cops/raw/` — 66 zips, 45 GB, all verified downloaded |

**Note the licence.** CC-BY 4.0 permits commercial use with attribution — so the "public data proves feasibility, production needs
licensed collection" line is still true for *scale and consent*, but not for
*licensing*. Do not claim COPS blocks commercial use; it does not. (PADS is the
CC BY-NC-SA one. Still not needed.)

## What is actually in a participant archive

```
COPS-11.zip
├── COPS-11_symptomdiary.csv        <- the labels. semicolon-delimited. TINY.
├── COPS-11_symptomdiary.mat
├── COPS-11_UPDRS_ON.csv            <- clinical MDS-UPDRS III, ON state
├── COPS-11_UPDRS_OFF.csv           <- ... and OFF state
├── COPS-11_Summary.png             <- the authors' own summary figure
└── Accelerometry/
    ├── COPS-11_Day0_15h-16h_leftWrist.zip   -> one CSV inside
    ├── COPS-11_Day0_15h-16h_rightWrist.zip
    └── ...                          one nested zip per hour per wrist
```

**There is a CSV of everything — you never need to parse a MATLAB `.mat` table.**
This was the single biggest ingestion risk and it is gone.

Nested zips are per-hour per-wrist, so **you can read exactly the hours you need
straight out of the archive** with `zipfile.ZipFile` twice, without unpacking
anything. Do not run the authors' `COPS_01_UnzipData.m` — it expands to ~5 GB per
subject (~330 GB for the cohort).

### `*_symptomdiary.csv` — one row per participant-hour

`;`-delimited. Columns:

| Column | Notes |
|---|---|
| `ID` | e.g. `COPS-11` |
| `Day` | MATLAB duration text, `"0 days"`, `"1 days"`, … |
| `Time` | MATLAB duration text, `"16 hr"` — **see the alignment trap below** |
| `Visit` | `inpatient` / `outpatient` |
| `Kinesia` | text label, incl. `Sleep` and `No Data` |
| **`KinesiaScore`** | **−3 … +3, the 7-point target.** `NaN` when unlabelled |
| `Tremor` / `TremorScore` | 0 none, 1 weak, 2 severe |
| `Freezing` / `FreezingScore` | 0/1 |
| `Fall` / `FallScore` | 0/1 |
| `Medication` | `"Levodopa / Benserazid;Opicapone"` — `;` separates drugs *inside* a quoted field |
| `Dosage_1`, `Dosage_2` | mg, positionally matched to `Medication` |
| `WearableDataAvailability` | `Wearable Worn` / `Partially Worn` / `Not Worn` |
| `WearableDataLeftCSV` / `…ZIP` | filename of the matching accelerometry hour |
| `WearableDataRightCSV` / `…ZIP` | " |

`KinesiaScore` decodes as:

| −3 | −2 | −1 | 0 | +1 | +2 | +3 |
|---|---|---|---|---|---|---|
| Severe akinesia | Discomforting akinesia | Slight akinesia | **Good kinesia** | Slight dyskinesia | Discomforting dyskinesia | Severe dyskinesia |

Note the scale is **diverging, not ordinal-bad-to-good**: 0 is the *good* state and
both ends are impairment in opposite directions (too little vs too much movement).
Any model, metric, or colour ramp that treats it as monotone severity is wrong.

### `Accelerometry/…/*.csv` — 100 Hz raw

```
Time;X;Y;Z;Photo;Temp
16:00:00.010;0.8799;0.152;-0.444;14;26.6
```

360 000 rows/hour/wrist, ~15.7 MB uncompressed, ~2.4 MB zipped. `Time` is a
time-of-day duration and **restarts each file**; `Photo` is lux, `Temp` is °C.
X/Y/Z are in g.

---

## ⚠ The alignment trap — read this before writing the loader

**A diary row stamped `Time = T hr` describes the hour that *ends* at T, i.e.
the window `[T−1, T)`.**

Proof, two independent ways:

1. In `COPS-11_symptomdiary.csv`, the row with `Time = 17 hr` carries
   `WearableDataLeftCSV = COPS-11_Day0_16h-17h_leftWrist.csv`.
2. In the authors' `COPS_03_CreateSummaryFigure.m`, every bar is drawn at
   `symptomdiary.Time(i) - hours(.5)` — i.e. centred half an hour *before* the
   stamp.

Get this wrong and every label is shifted by one hour. The model will still
train, the loss will still fall, and every number you report will be quietly
wrong. **Join on the CSV filename in the row, never on a timestamp you
reconstruct yourself** — the filename is unambiguous and self-checking.

## Other gotchas found in the data

- **`Kinesia` text and `KinesiaScore` disagree on some rows.** `COPS-11` day 0
  hour 15 has `Kinesia = "No Data"` but `KinesiaScore = -2`. Trust the *score*,
  and assert on the mismatch rather than silently dropping.
- **`Sleep` is a `Kinesia` value, not a score.** Sleep hours still carry a
  `KinesiaScore`. Decide explicitly whether to train on them (recommend: exclude
  from training and from the headline metric, show them as a distinct band on the
  timeline — a model that "reconstructs" sleep well is not impressive).
- **Non-wear is labelled for you.** `WearableDataAvailability` gives 1 388 not-worn
  and 327 partially-worn hours. You do not have to build a non-wear detector for
  the demo; you have ground truth for abstention.
- **`COPS-24` has 105 labelled hours but zero accelerometry references** — every
  `WearableData*CSV` cell is empty. It contributes labels and nothing to learn
  from, so the usable cohort is **65 participants, not 66**. Filter on
  `left_csv AND right_csv`, not on the label, or your participant count is wrong.
- **Four participants are very thin**: `COPS-11` (8 usable hours), `COPS-18` (26),
  `COPS-44` (26), `COPS-3` (30). Fine for training, useless as a test fold — a
  participant-level split can hand you a 26-hour test set and a meaningless number.
  Require a minimum usable-hour count for anything you hold out.
- Medication field packs multiple drugs into one quoted `;`-separated string —
  split *inside* the field after the CSV reader has done its job.

## Cohort numbers (measured, all 66 archives)

| | |
|---|---|
| Participant-hours in diaries | 11 424 |
| Hours with a `KinesiaScore` | 7 033 |
| **Usable (score + both wrists)** | **6 530** |
| Participants with labels | 65 |
| Typical week | 8 days, ~120 usable hours |

Class support on the usable set:

| score | −3 | −2 | −1 | **0** | +1 | +2 | +3 |
|---|---|---|---|---|---|---|---|
| hours | 170 | 532 | 1 432 | **3 696** | 554 | 117 | 29 |
| share | 2.6% | 8.1% | 21.9% | **56.6%** | 8.5% | 1.8% | 0.4% |

**Three classes (−3, +2, +3) have under 200 hours in the entire cohort.** A 7-way
classifier will not learn them. Use ordinal regression and report MAE.

## The baselines you must beat

| Baseline | Ordinal MAE | Meaning |
|---|---|---|
| **A — always predict 0** | **0.594** | the number to beat. Accuracy 56.6% |
| B — always predict median | 0.594 | same thing |
| C — per-participant median | 0.380 | *oracle* personalisation floor |
| D — previous hour's label | 0.215 | how autocorrelated the state is |

**Sanity-check every reported MAE against 0.594 before believing it.** An error of
0.61 looks like a working model and is in fact worse than predicting "Good
kinesia" every hour. The bar was set at ≤ 0.45 for a real claim; ≤ 0.40 would
beat oracle personalisation.

Baseline D is not achievable at inference time — it needs the true previous label,
and the whole point is that the diary is hidden. It is reported as evidence that
the state is autocorrelated enough for a temporal model to be worth building.

**20 of 65 participants show ≤ 2 distinct states all week.** Participant-level
splits will therefore have high variance. Report the per-participant spread, not
just a pooled mean, or one lucky test participant will flatter you.

### The bar was not met

The kinesia target is not reachable from this sensor across people, and that is
a property of the target rather than of the tuning.

| Method, held-out participants | Ordinal MAE |
|---|---|
| Baseline A — always "Good kinesia" | **0.594** |
| Ordinal emission model | 0.684 |
| … with HMM smoothing, tempered likelihoods | 0.696 |

Nine feature sets over five participant-level folds were swept and none beat
0.594. The reason is visible in the cumulative-threshold AUCs on held-out
participants — 0.428, 0.530, 0.587, 0.324, 0.455 — several of them below chance,
which is systematic inversion: the feature-to-state relationship flips between
people. Per-participant offset calibration does not fix it either. Given the
same calibration labels, a personal constant scores MAE 0.400 and the model
scores 0.474 — worse than a constant given equal information.

**The baselines above are still correct and still the right bar.** What changed
is that nothing clears it. Tremor presence does generalise across people —
held-out AUC 0.697 ± 0.075 on the same folds — so that is what the product
claims. The
full record, including the caveats, is in [FINDINGS.md](FINDINGS.md).

## Demo-participant shortlist

Ranked by usable bilateral hours × state variety × transitions × medication events:

| Participant | Usable h | Distinct states | Transitions | Med events | Tremor h | Days |
|---|---|---|---|---|---|---|
| **COPS-29** | 124 | 6 | 64 | 66 | 78 | 8 |
| COPS-39 | 110 | 7 | 54 | 45 | 0 | 7 |
| COPS-52 | 106 | 6 | 68 | 53 | 0 | 8 |
| COPS-28 | 129 | 6 | 50 | 64 | 2 | 8 |
| COPS-65 | 116 | 6 | 49 | 54 | 0 | 8 |
| COPS-16 | 117 | 5 | 47 | 30 | 41 | 8 |

**Pick COPS-29 as the demo participant.** It is the only one in the top tier with
substantial tremor *and* dense medication events *and* a state that actually
moves — so the timeline has something to show, the tremor row is not empty, and
the medication-alignment story has marks to align to.

Hold it out of training entirely. Choose a backup (COPS-28) and hold that out too,
so a late discovery about COPS-29 does not cost you the reveal.

## Derived files already built

| Path | Contents |
|---|---|
| `data/cops/derived/diary_all.csv` | 11 424 rows, all participants, one row per hour, with `win_start_hour` precomputed |
| `data/cops/derived/participants.csv` | 66 rows of coverage/variety stats |
| `data/cops/meta/` | `Demographics.csv`, the blank diary form, the authors' MATLAB scripts — fetched by `scripts/osf_download.py`, not vendored here |

`Demographics.csv` carries age, sex, handedness, PD subtype, dominant side,
Hoehn & Yahr, years since diagnosis, and DBS status. Measured cohort profile:

- 41 male / 25 female; median age 62 (range 47–76)
- Hoehn & Yahr: 3 (n=31), 2 (n=24), 4 (n=5), 1–1.5 (n=4), 2.5 (n=2)
- Subtype: akinetic-rigid 24, equivalence 21, tremor-dominant 21
- **46 of 66 have deep brain stimulation**

That last one is the caveat to say out loud before a judge finds it: this is an
advanced, device-treated cohort, not a newly-diagnosed one, and DBS changes both
the movement signature and the fluctuation pattern. It is the strongest argument
for phase-two consented collection, so use it as one rather than hiding it.

## Citation

> Nesser, T. et al. COPS — Continuous Observation of Parkinsonian Symptoms. OSF (2025).
> <https://doi.org/10.17605/OSF.IO/5XVWN>
>
> Nesser, T. et al. Continuous observation of Parkinsonian symptoms using symptom
> diaries & wearable accelerometry. *Scientific Data* (2026).
> <https://doi.org/10.1038/s41597-026-06999-6>

Put this on the README and on the last slide. CC-BY requires it.
