# Astrolabe — two-minute pitch

Spoken script for `astrolabe-deck.pdf`. ~290 words, which lands at 2:00 at a
calm 145 wpm. **Do not add a sentence without cutting one.**

Two rules that matter more than the words:

- **The pause on slide 5 is not dead air.** It is the only full stop in the
  pitch, and it is what makes the empty grid behind you land as a result rather
  than a bug. Hold it. Count to three.
- **Never read a number off the slide.** The slide has it. Say what it means.

---

### 1 · Title — 0:00–0:08

> Parkinson's changes hour to hour. The medication decision depends on knowing
> *when*. And almost none of it ever gets written down.

### 2 · The problem — 0:08–0:30

> Eleven point eight million people live with Parkinson's — the fastest-growing
> neurological condition in the world. Most of them develop fluctuations, where
> the same dose helps at one hour and not the next.
>
> Managing that needs an hour-by-hour record. The paper diary meant to provide
> it gets abandoned. Even in a supervised study, with research staff helping,
> only sixty-two percent of hours carry an entry.

### 3 · What we built — 0:30–0:50

> Astrolabe reconstructs those hours from two wrist sensors. Five stages, ending
> in a calibrated interval — or a refusal.
>
> Two things make that honest. Coverage is measured, not assumed: we widen the
> interval on held-out people until it really does contain the truth nine times
> in ten. And abstention holds an error budget, not a rate.

### 4 · The reveal — 0:50–1:06

> Here's the demo. Drag the handle, and the patient's real diary comes out from
> behind the model's reconstruction. This person was held out of training — the
> model is meeting them for the first time.

### 5 · The refusal — 1:06–1:32

> And here is the part nobody demos.
>
> **[pause — three seconds]**
>
> On this day the evidence is too thin. Peak confidence is 0.55; it answers at
> 0.58. So it answers nothing — a hundred and fourteen refusals out of a hundred
> and fourteen, each with a reason.
>
> That is not the system failing. That is the system working.

### 6 · Measured — 1:32–1:54

> Every figure is measured on people the model never trained on. The ninety
> percent interval contains the truth ninety point three percent of the time.
> Refusing lifts accuracy by eleven points. Drop a wrist and it declines six
> times more often, instead of quietly getting worse.
>
> And what didn't work is on the same slide. We could not predict how a day
> *felt* — so we don't. That row stays yours.

### 7 · Close — 1:54–2:04

> It's live, it's open, and every figure regenerates from a named script.
>
> Astrolabe. A diary that tells you when it doesn't know.

---

## If you get cut to 60 seconds

Slides **1 → 4 → 5 → 7**. Say the first line of §1, the whole of §4 and §5, and
the whole of §7. The reveal and the refusal are the pitch; everything else is
support for them.

## If someone interrupts with a question

The three you should expect, and the honest answers:

**"Does it actually work?"** — On tremor, across people, yes: 0.697 AUC on 55
held-out participants. Within a single person it drops to 0.550, and that is the
number a diary is really judged on. Both are on the site.

**"Why should I trust the uncertainty?"** — Because it was checked rather than
claimed. Asking a model for 90% of its posterior mass does not give you 90%
coverage — it gave us 0.535 the first time. We swept the interval width on
held-out people until measured coverage reached target.

**"What's the business?"** — Not one yet. It is a hackathon prototype, it is not
a medical device, and it makes no dosing claim. The interesting asset is a
calibration and abstention layer that would sit under any wearable-derived
clinical signal, not just this one.
