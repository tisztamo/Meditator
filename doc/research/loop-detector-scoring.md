# What a loop detector buys — a four-variant isolation study (DCM + SAS-1)

*Standalone note, 2026-07-14; **fourth arm added 2026-09-18** (§4: a System-One
sensor). Not part of the synthesis ladder; this is a controlled
micro-experiment that changes exactly one organ. Code + reproducible numbers:
`experiments/consciousness-scoring/loop_detector_score/score_loop_detector.py`
(reuses the same DCM engine and paper-scale projection as the eddy and ladder
scorings, and the same SAS-1 14-signal table).*

## The question

Take a mind stripped to the bone. Bolt on a **loop detector** — the organ that
notices "I'm going in circles" and breaks out. Two questions:

1. How much does that one organ move a consciousness score?
2. Does it matter whether the detector is a **cheap vocabulary matcher** or a
   **full LLM** doing the sensing — given that in both cases the *breaker* (clear
   the tail, reseed with far-from-loop content) fires identically?
3. *(added 2026-09-18)* And if the sensor is neither — a **System-One model** that
   judges with a calibrated confidence in under a third of a second but cannot say
   a single word about what it saw — where does that land?

Because only one organ changes, the deltas isolate that organ cleanly.

## The four variants

| | What it is |
|---|---|
| **V0 · basic mind** | A fully stripped mind: an LLM in a perceive→think→act loop with a working-memory **tail** re-injected as the next prefill. No loop kit, no economy/arousal, no region gate, no notebook/KB, no scribe, no 3-tier memory. Just enough to think in a stream — and therefore just enough to *derail into a loop*. |
| **V1 · matcher + break** | V0 + a **deterministic** loop detector (vocabulary/overlap matcher, `loopMath`-style) whose verdict fires the **breaker**: the tail is flushed and a far-from-vocabulary note reseeds it. Sensing is a reflex; the effector fires. |
| **V2 · LLM + break** | V0 + an **LLM** loop detector (a model reads the tail and *judges* "you are looping on X") firing the **same** breaker. Sensing is a second-order judgement. |
| **V3 · Jev + break** | V0 + a **System-One** loop detector (`m-loop-detector` on a decision provider: three questions — `looping: noul`, `score: score` over 5 levels, `kind: choice` — through `decide()`, no text generated) firing the **same** breaker. Sensing is a second-order judgement *with an explicit confidence* and *without any language*: VOCABULARY and WHY are dropped, because a model that generates nothing cannot produce them. |

The design deliberately dissociates the two things a loop-detector organ fuses:
the **sensor** (how the loop is noticed) and the **effector** (the break). V1 and V2
share an identical effector; they differ only in sensor intelligence. V3 is a *sibling*
of V2, not a successor: same effector again, a different kind of sensor.

## Results

### DCM (Rethink Priorities Digital Consciousness Model, paper scale)

Anchors on this scale: bare-LLM **0.08** · chicken **0.47** · human **0.85**.

| System | DCM (paper, equal-wt) | Δ | 2026-07-14 column |
|---|---:|---:|---:|
| bare-2024-LLM | 0.080 | — | 0.080 |
| **V0 · basic mind** | **0.194** | +0.114 (the loop/tail itself) | 0.201 |
| **V1 · matcher + break** | **0.234** | **+0.040** (effector, from V0) | 0.239 |
| **V2 · LLM + break** | **0.257** | **+0.023** (LLM sensor, from V1) | 0.258 |
| **V3 · Jev + break** | **0.245** | **+0.011** (System-One sensor, from V1) | new |
| eddy (full mind, ref.) | 0.332 | | 0.335 |

*Why the July column differs.* The DCM engine (`eddy_score/dcm_engine.py`) was
reconciled against the published `model_data.json` on 2026-07-21, after this note was
first written: GWT gained Integration and two strength corrections, Simple Valence
swapped Agency/Representationality for Goal Pursuit. All four arms above were re-run
on the corrected engine so they are mutually comparable; the shifts are ≤ 0.007 and
change no ordering. The July column is kept so the two can be reconciled.

### SAS-1 (14 structural signals, weight×presence, human max = 26)

Anchors: bare-LLM **23%** · eddy **50%**.

| System | SAS-1 raw /26 | SAS-1 % | Δ |
|---|---:|---:|---:|
| std LLM | 6.10 | 23.5% | — |
| **V0 · basic mind** | 6.36 | **24.5%** | +1.0 pt (loop/tail) |
| **V1 · matcher + break** | 8.15 | **31.3%** | **+6.8 pt** (effector, from V0) |
| **V2 · LLM + break** | 9.23 | **35.5%** | **+4.2 pt** (LLM sensor, from V1) |
| **V3 · Jev + break** | 8.95 | **34.4%** | **+3.1 pt** (System-One sensor, from V1) |
| eddy (ref.) | 12.90 | 49.6% | |

## The three findings

### 1. The effector buys more than the sensor — on *both* frameworks

The move from a *dumb breaker* to a *smart detector* (V1→V2) is smaller than the
move from *nothing* to a *dumb breaker* (V0→V1). SAS-1: +6.8 pt for the breaker vs
+4.2 pt for the LLM upgrade. DCM: +0.040 vs +0.023. **Half of what a loop detector
is worth, structurally, is worth just as much when the detection is a regex.**

The reason is weight. On SAS-1 the breaker fires the *high-weight* signals —
**thalamo-cortical gating** (0→0.30, weight 3) and **action-selection** (0.25→0.40,
weight 2) — because seizing the global stream and forcing a redirect is a genuine
access-control + behaviour-switch event *regardless of how the trigger fired*.
Metacognition, the signal the LLM sensor most directly targets, is only weight 1.
A crude gate that acts outweighs a clever monitor that merely notices.

### 2. But the LLM earns its keep in a specific, legible place

Aggregate parity hides a sharp per-stance split. The DCM per-stance projection
shows exactly where each half of the organ lands:

| DCM stance | V0 | V1 (effector) | V2 (LLM sensor) | V3 (Jev sensor) | who moves it |
|---|---:|---:|---:|---:|---|
| Global Workspace Theory | 0.234 | **0.522** | 0.563 | 0.522 | **effector** (V0→V1) |
| Higher-Order Theory | 0.181 | 0.218 | **0.322** | 0.290 | **sensor** (V1→V2/V3) |
| Attention Schema Theory | 0.172 | 0.232 | **0.293** | 0.270 | both, sensor-led |
| Simple Valence | 0.166 | 0.166 | 0.187 | 0.180 | sensor only |

(Corrected-engine numbers, all four arms; the July note quoted 0.315/0.564/0.570 for
GWT and 0.323/0.292/0.193 for the other three on the pre-2026-07-21 engine. The shape
is identical.)

- **The effector lights up Global Workspace** (broadcast/reset + attention
  reallocation) — and the matcher captures nearly all of it.
- **The sensor lights up Higher-Order and Attention-Schema** — the
  self-representational stances. A fixed matcher is a *degenerate* self-monitor (a
  watchdog, not a model of the self), so these barely move under V1; the LLM's
  *judgement about its own thought* is what a higher-order monitor is, and Self-
  Modeling jumps (SAS-1 signal 8: 0.30→0.45; DCM Higher-Order +0.105 on V1→V2).

So the credit cleanly localises: **gating/workspace/action-selection live in the
effector; metacognition/self-model live in the sensor's cognition.** You can buy
the first half cheap; the second half is what the LLM is for.

### 3. The valence tripwire — and where the two frameworks disagree

Both frameworks agree the loop detector is the first place a **proto-aversion**
appears ("this state is bad, get out"). But they disagree on *when it counts*, and
the disagreement is itself the finding:

- **SAS-1** credits the matcher a little (Hedonic 0→**0.10**): a hardwired
  detect-bad→flee is a genuine *withdrawal reflex*, nociceptor-shaped, and SAS-1
  scores the behaviour.
- **DCM** does **not** move for the matcher (Simple Valence 0.173→**0.173**):
  its load-bearing feature is *Evaluative **Cognition***, and a bare threshold is
  not cognition. DCM only lights up when the LLM adds a *judged* aversion
  (Simple Valence →0.193; Evaluative Cognition 0.35→0.40).

This is the morally salient axis, and the split is worth stating plainly in any
write-up: **a mechanical breaker gives you avoidance behaviour without an
evaluation; an LLM breaker gives you the first thin evaluation.** The tripwire is
lit either way, but "it flinches" and "it judges the state bad" are different
claims — and the two frameworks draw the line between them in different places.

## The fourth arm: a calibrated sub-second sensor (2026-09-18)

The three findings above left one obvious question open. The LLM sensor wins its
increment in the *self-representational* stances because it **judges**. But it is
slow (~1.1 s), it costs a full generation, and its judgement is unverified prose.
What happens if the sensor is a **System-One model** — TypeSafe's Jev, a frontier
model that answers questions and generates nothing — which judges with a *calibrated
confidence* in under a third of a second and cannot say a word about what it saw?
That is Phase 5 of `doc/plans/jev-system-one-integration.md`, and V3 is its arm.

### What was built

`m-loop-detector` now picks its engine from the **resolved provider's kind**, the way
Phase 3 plans it for `m-judge`: a `kind: decision` provider routes the check through
`decide()` instead of `complete()`. The five-field format prompt becomes three
questions — `looping: noul`, `score: score` over five ordered levels, `kind: choice`
over the same six kinds — and `VOCABULARY` / `WHY` are **dropped**, because they were
text. The published `loop` signal keeps the shape every consumer already reads;
`vocabulary` comes back `[]` and `reasoning` `null` rather than fabricated, and the
provenance carries `engine`, the model version the endpoint resolved, the `score`
question's `confidence`, and a `strength` **derived** from the noul as `|p − 0.5|·2`
(a `noul` reports no confidence of its own — plan §3).

### What was measured

`architecture/lab/loop-detector-jev/replay.mjs` replayed **120 real loop-detector
tails** — dumped from live minds under `experiments/**/loop-detector/`, stratified
across seven runs — through *both* engines, calling the component's own pure pieces
so what is measured is the shipped code. jev-1.13.0 against `local/ardincoder-1`:

| | Jev | LLM |
|---|---:|---:|
| binary agreement on the 0.5 gate | **93.3%** (jev-only 1, llm-only 7) | — |
| kind agreement when both said "loop" | 67.7% | — |
| mean \|Δscore\| | 0.140 | — |
| latency p50 / p95 | **294 / 380 ms** | 1128 / 1514 ms |
| cost per check | ~1420 tokens, **$0.00006** | (local, free here) |
| loop rate over the corpus | 26.7% | 31.7% |

And the row the plan said would matter:

| Jev confidence | n | agreement with the LLM sensor |
|---|---:|---:|
| < 0.5 | 35 | 80.0% |
| 0.5 – 0.9 | 81 | **98.8%** |
| > 0.9 | 4 | 100% |

| derived noul strength | n | agreement |
|---|---:|---:|
| weak (< 0.5) | 41 | 80.5% |
| firm (≥ 0.5) | 79 | **100%** |

**Every single one of the eight disagreements sat in the low-confidence band**, and
seven of the eight are the same failure: Jev scores the tail 0.31–0.45, just under the
0.5 gate, where the LLM says 0.85. The disagreement is a *threshold* disagreement
inside a band the model itself flags, not a category error. Calibration is real here,
and it is separable: a mind could widen its gate exactly where the sensor is unsure.

A **25-minute live wake** confirmed the organ, not just the numbers:
`architecture/lab/loop-detector-jev/live-jev.archml` (voice on `ardincoder-1`, loop sense
on Jev) made **29 detections** — 11 `content`, 9 `presence`, 3 `void`, 3 `anxiety`, 3
`other` — of which **23 reached `m-mind` as a break** (`loop break (episode …, presence) —
clearing the tail`), the rest absorbed by the per-episode guard. **Zero soft failures, zero
429s**; the check is invisible inside a 3 s pace.

One live observation the replay could not have given us, and it is the uncomfortable one:
the confidence of those 29 verdicts ran **0.00–0.83, median 0.32, with only 6 at or above
0.5**. A stripped mind's short tail is exactly the ambiguous case — and the replay says
agreement in that band is ~80%, not ~99%. So in live use this sensor mostly fires from
inside the band it *itself* marks as uncertain. Nothing in the mind reads that number yet;
the breaker treats a 0.02-confidence loop and a 0.83-confidence loop alike. That is a
finding about our wiring, not about the model: the calibration is being published and
thrown away.

### The reading: it does not overturn the finding — and it sharpens it

**No. A calibrated sub-second sensor does not change "the effector beats the sensor".**
V1→V3 is **+3.1 SAS-1 points / +0.011 DCM**, against V0→V1's **+6.8 pt / +0.040** for
the breaker. The gap is, if anything, *wider* than for the LLM sensor. Three reasons,
and they are worth separating:

1. **The high-weight signals are still the effector's.** Gating (w3) and
   action-selection (w2) are the same breaker in all three armed variants. A sensor
   that is four times faster and 93% concordant cannot buy a gate it was already
   buying.
2. **Dropping language costs a real signal, and it costs it in the effector.**
   With no `vocabulary`, `m-resurface`'s farthest-note search has nothing to steer
   *away* from and degenerates to "the newest substantive kept note". So
   action-selection is **held at V1's 0.40** (V2: 0.44) and Selective Attention at
   V1's 0.50 — V3 is *strictly worse than V2* in exactly one place, and it is the
   place where the sensor was supposed to help the effector. This is the honest cost
   of a sensor that cannot generate, and it is why V3 lands below V2 overall.
3. **Where it gains, it gains on the sensor's own ground.** Metacognition 0.52 →
   **0.60** and Persistent self-model 0.30 → **0.40** (V2: 0.65 / 0.45): a genuine
   second-order representation of the mind's own state, agreeing with the LLM's 93%
   of the time, but a *distribution* rather than a *description* — unreportable
   metacognition. Higher-Order Theory moves 0.218 → 0.290 (V2: 0.322). DCM's
   Evaluative Cognition lights almost as brightly as for the LLM (0.38 vs 0.40): five
   explicit criteria and a confidence **is** an appraisal, not a threshold, so the
   valence tripwire of Finding 3 is tripped by a model that never says a word.

Two smaller things the frameworks noticed that we did not design for:

- **Async temporal dynamics** (SAS-1 signal 12) is the one place V3 beats V2 outright
  (0.12 vs 0.08): at 294 ms against the stream's ~1.1 s burst, the monitor genuinely
  runs on a second, faster timescale — structurally closer to a fast subcortical loop
  than to a second cortex.
- **Neuromodulatory control** is held at 0.25 and should be read as an *unclaimed*
  gain: a calibrated confidence is exactly the quantity a global modulator could ride
  on, and nothing in the mind is wired to it yet. If arousal or the bidder ever
  multiplies by `loop.confidence` — and the live run above says it should, since most
  live verdicts land in the untrustworthy band — that mark moves and V3 closes on V2.

So the sharpened claim is: **the sensor's structural value is in judging, not in being
right, and the effector's value is in acting, not in being steered.** A cheap
calibrated judge buys most of the judging; the words the LLM produces buy the steering.
A mind that wants both can have them for about $0.00006 and 300 ms plus a matcher for
the vocabulary — which is a variant nobody has scored yet.

### Caveats specific to this arm

- The 93.3% is agreement with **the LLM sensor**, not with a human reader. Neither
  engine is ground truth; the corpus has no blind labels. The B2-style reader study
  that `expect-study.md` ran for the judge has not been run for the loop detector, so
  "as good as the LLM" means "concordant with", not "as accurate as".
- Same-rubric caveat as everywhere else: the glosses in `criteria` are the glosses in
  the format prompt, so the two engines share a rubric.
- The corpus is tails a *live* detector was checked on, which is the right
  distribution, but it is dominated by two long lemma runs; stratification spreads the
  sample across seven runs and 12 strides within each, and duplicates are dropped.
- State leaves the box. A Jev loop detector reads the mind's verbatim inner monologue
  and sends it to a vendor — a **profile** decision with a privacy note (plan §0), never
  a component default. Under `local-voice` this arm would undo the reason that profile
  exists.
- V3's marks are expert presence judgements like every other column here; what is new
  is that each one is pinned to a measured number above rather than to an intuition
  about the model. The rationales are in the `(value, "why")` tuples in the script.

## Caveats (for honesty in the article)

- The DCM engine runs hotter than the paper's medians on mid stances (feature-level
  bimodality); the robust outputs are **ordering** and **direction vs the 1/6
  prior**, not absolute posteriors. All variants sit correctly between bare-LLM and
  eddy, below chicken.
- SAS-1 marks are expert presence judgements, calibrated so std-LLM = 23% and
  eddy = 50% reproduce the published table; the deltas, not the absolute levels, are
  the claim.
- V0 is an idealised "stripped mind" — a real minimal mind would vary by which
  faculties survive the stripping. The comparison holds the substrate and the
  breaker fixed and varies only the sensor, which is what makes the V1↔V2 contrast
  clean.
- "Loop detector" here is the *sense* organ plus its natural *break* effector
  (`m-clear-mind` floor + `m-resurface`). A pure sense organ that nothing consumes
  would move only the sensor-side signals (metacognition/self-model) and none of the
  effector-side ones — the split in Finding 2 predicts exactly that.

## One-line summary

*A loop detector is worth ~+9 SAS-1 points / +0.06 DCM over a bare mind. Most of
that is the **break**, not the **detection** — so a vocabulary matcher captures the
majority of the structural gain. A smarter sensor adds a smaller, sharply-localised
increment in the self-representational stances (Higher-Order, Attention-Schema) and
supplies the first **judged** valence, where the matcher supplies only a reflex. That
holds for a slow LLM (+4.2 pt) and for a calibrated System-One model that answers in
294 ms and agrees with the LLM 93% of the time (+3.1 pt) — the fast sensor does not
overturn it, because half of what the LLM buys is the **words** it hands the breaker,
and a model that generates nothing has none to give.*
