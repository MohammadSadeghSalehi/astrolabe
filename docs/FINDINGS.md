# Findings — what generalises across people, and what does not

The experimental record. Numbers come from `ml/scripts/diagnose*.py` and
`ml/scripts/train_tremor.py`; each script's docstring states the hypothesis it
was written to test, and this document states what came back.

Every figure below is measured on **held-out participants** — people whose data
the model never saw during training. That is the only split that answers the
question the product asks: put this on someone new, does it work.

---

## 1. What we set out to predict

| Target | Definition | Scored as |
|---|---|---|
| **Kinesia state** | `KinesiaScore`, the 7-point diverging diary scale | ordinal MAE, against the 0.594 constant baseline in [DATA.md](DATA.md) |
| **Tremor presence** | diary `TremorScore` > 0 | AUC |

Both are read from the same feature vector — bilateral wrist accelerometry
band-passed into the COPS authors' own 0.1–3 Hz movement and 4–8 Hz tremor
bands — over the same participant-level folds. The headline result is that the
two targets do not behave alike, and the reason is mechanical rather than
incidental.

---

## 2. The kinesia state does not generalise across people

Reconstruction of the 7-state ordinal scale on held-out participants is worse
than predicting "Good kinesia" every hour.

| Method | Ordinal MAE |
|---|---|
| Constant — always "Good kinesia" (baseline A) | **0.594** |
| Ordinal emission model, held-out participants | 0.684 |
| … with HMM smoothing, untempered likelihoods | 0.812 |
| … with HMM smoothing, tempered likelihoods | 0.696 |

Nine candidate feature sets were swept over five participant-level folds. None
beat 0.594. Temporal smoothing does not rescue it: the sticky chain suppresses
the wobble, but the wobble was not the problem.

### Why — the feature-to-state relationship inverts between people

The ordinal model decomposes the scale into cumulative classifiers, one per
threshold. Their held-out AUCs:

| Cumulative threshold | AUC on held-out participants |
|---|---|
| P(z>0) | 0.428 |
| P(z>1) | 0.530 |
| P(z>2) | 0.587 |
| P(z>3) | 0.324 |
| P(z>4) | 0.455 |

Three of the five are **below chance**. A classifier at 0.5 has no signal; a
classifier at 0.324 has signal pointing the wrong way. That is systematic
inversion — what reads as dyskinesia in one person reads as ordinary activity in
another — and no amount of regularisation fixes a sign that flips between
people. (The remaining threshold has too few positives in the cohort to score;
see the class-support table in [DATA.md](DATA.md).)

### Personal calibration does not rescue it either

If the mapping is personal, the obvious fix is to let each person label part of
their week and shift the global mapping to fit. Scored on identical hours, with
both predictors given the **same** calibration labels:

| Predictor, same hours, same calibration labels | Ordinal MAE |
|---|---|
| Their own constant — the median of their calibration hours | **0.400** |
| Global model + per-participant offset | 0.474 |

Given equal information, the model is worse than a constant. The offset was
learning the person's average, and the global mapping it was shifting added
nothing on top. An earlier reading of the offset result as a success was an
unfair comparison — the model had been scored against a global baseline that
never saw the calibration labels at all.

---

## 3. Tremor does generalise

Same folds, same pipeline, same features, different target.

| Target | Held-out AUC |
|---|---|
| **Tremor present** (`TremorScore` > 0), 50 band-power features | **0.697 ± 0.075** |
| Kinesia OFF/ON, binarised | 0.567 |

That gap is the finding. Tremor is a 4–8 Hz mechanical oscillation an
accelerometer measures directly. Kinesia is a subjective judgement about how an
hour went — how well the person felt they moved — and the sensor has no access
to it. One target is in the signal; the other largely is not.

Operating characteristics of the tremor detector:

| | |
|---|---|
| Prevalence of tremor hours | 30.5% |
| Average precision | 0.496 |
| Brier score | 0.210 |

---

> **Which tremor AUC to quote.** Two figures appear in this document and both are
> real. **0.722** comes from the feature-selection sweep, which trained on every
> training participant. **0.697 ± 0.075** is the shipped detector, which reserves
> a fifth of the training participants to fit its calibrator — costing roughly
> 0.025 AUC and buying confidence values that mean something on a new person.
> **0.697 is the number the product stands behind**, because it is the number for
> the model that is actually in the bundle. The ablation table below keeps 0.722,
> since that table is about choosing features rather than about what ships.

## 4. The model was over-featured

Held-out tremor AUC rose monotonically as features were **removed**:

| Feature set | Held-out AUC |
|---|---|
| All 122 features | 0.672 |
| minus medication timing | 0.688 |
| minus medication timing and environment | 0.702 |
| **50 band-power features only** | **0.722** |

Medication-timing features on their own score **AUC 0.433** — below chance. Who
takes which drug on what schedule is close to a participant fingerprint, so
those columns hand the model an identity cue that cannot transfer to a new
person. With weak signal over this many participants, every extra column is
another chance to latch onto something that does not generalise.

The shipped detector uses the 50 band features only.

---

## 5. Selective prediction works

Abstention is only meaningful if the hours the model declines are the hours it
would have got wrong. Ranking held-out hours by confidence and answering only
the most confident fraction:

| Hours answered | Accuracy | Balanced accuracy |
|---|---|---|
| All | 0.713 | 0.610 |
| Most confident 50% | 0.785 | — |
| Most confident 25% | **0.825** | **0.708** |

Accuracy rises as the answered fraction shrinks, which is what makes abstention
a behaviour rather than a way of quietly discarding data. Balanced accuracy is
reported at the endpoints, because at 30.5% prevalence raw accuracy alone can be
bought by predicting the majority class.

---

## 6. The caveat that has to be stated

Pooled AUC and within-participant AUC answer different questions, and the pooled
figure is the flattering one.

| Figure | AUC |
|---|---|
| Pooled over all held-out hours | 0.68 |
| **Median within-participant** | **0.550** |
| Participants above chance | 25 of 36 |

Much of the pooled number comes from separating tremor-dominant people from
everyone else, not from telling a tremulous hour from a calm one in the same
person. For a diary, within-person discrimination is what matters — the user
already knows whether they have tremor, and wants to know *when*.

So the within-participant figure goes in the bundle next to the pooled one.
Reporting only the pooled AUC would overstate the result, and anyone asking the
right question would find it.

---

## 7. What this means for the product

- **The tremor row is a claim; the kinesia row is not.** Tremor can be shown as
  reconstructed, wrapped in its uncertainty. The 7-state motor trajectory cannot
  be reconstructed from this sensor across people, so it belongs on screen as
  *reported* — what the patient told us — or as abstained, never as inferred.
- **Abstention is evidenced, not asserted.** §5 is the measurement behind the
  design thesis: declining the low-confidence hours raises accuracy on the ones
  that remain.
- **Personalisation is not the shortcut it looks like.** §2 shows a person's own
  constant beating the model given the same labels. A personalised state model
  needs either more per-person labelled data than a week of diary provides, or a
  target the sensor can actually measure.
- **Report the within-participant spread everywhere.** §6 is the number a
  careful reader will ask for, and it should already be on screen when they do.

A negative result that is properly established is a result. The kinesia target
was pursued through nine feature sets, per-participant normalisation, rank
transforms, hourly feature aggregation, per-person offsets and temporal
smoothing before it was accepted as negative, and its failure mode is identified
rather than merely observed.

---

## Reproducing

Each of these sweeps folds over the full feature table and takes a long time.

| Script | Establishes |
|---|---|
| `ml/scripts/diagnose.py` | per-threshold AUCs; per-participant normalisation |
| `ml/scripts/diagnose_push.py` | hourly features, per-participant offset, OFF/ON, rank transform |
| `ml/scripts/diagnose_fair.py` | the offset scored against constants given the same labels |
| `ml/scripts/diagnose_hmm.py` | smoothing and selective risk |
| `ml/scripts/diagnose_temper.py` | tempered likelihoods |
| `ml/scripts/diagnose_deep.py` | tremor versus kinesia on identical folds |
| `ml/scripts/diagnose_featureset.py` | the nine-feature-set sweep |
| `ml/scripts/diagnose_tremor.py` | how good tremor detection gets |
| `ml/scripts/train_tremor.py` | the shipped detector, calibration, selective curve |
