# A model that decides — what a System-One primitive buys a mind

**Status: four measurements in one day, 2026-09-18, plus a control repeat that
evening (§2.2a).** This is Phase 6 of
[the Jev plan](../plans/jev-system-one-integration.md): the report and the
residency call. Everything below was run on `jev-1.13.0` (the version the
endpoint pinned `jev-latest` to in every call of every run) through
[`src/modelAccess/decide.js`](../../src/modelAccess/decide.js). The detailed
tables live in the studies this note summarises —
[expect-study §2.7–2.8](expect-study.md), [`prediction-mismatch.md`
"First edge-grounded search"](../improvements/prediction-mismatch.md),
[loop-detector-scoring.md §4](loop-detector-scoring.md) — and nothing here is a
number those do not carry.

**The one-line version.** A decision model is a real new primitive: it made
tier 1 implementable after a year of being a declared-but-throwing tier, it
grades the mind's evidence at 0.94 blind agreement in 300 ms for four
hundredths of a cent, and its confidence is honestly calibrated where a text
model's self-reported number is not. It also bought us, so far, **no measured
behavioural gain in a live mind**, because the three places its confidence
could have mattered either do not read it (the loop breaker), read it into a
`max` that already exceeds it (the bidder), or were never calibrated against it
(`matchThreshold`). And it costs the one thing `local-voice` exists to protect:
the mind's own evidence leaves the box.

## 1. What a System-One model is, in this project's vocabulary

TypeSafe's Jev is a frontier-class model that **generates nothing**. One
endpoint takes a `state` (text) and a named map of `questions` — `noul` (a
probability of yes), `choice` (a labelled option with `probabilities` and a
`confidence`), `score` (an expected level over 2–10 ordered levels) — and
returns answers under the same keys. There is no message list, no completion,
no token stream. It is therefore not an OpenAI-shaped provider and cannot hide
behind `complete()`: `decide()` is its sibling transport, and `kind: decision`
on the provider is what routes to it. A completion provider asked to decide,
and a decision provider asked to complete, both throw at resolve time, because
that is a config bug and never heals by waiting.

**It is a tier-1 primitive, not a voice.** The
[perceptual membrane](../architecture/perceptual-membrane.md#processing-tiers)
defined tier 1 as "a query-conditioned perception model producing structured,
non-linguistic evidence: match scores against declared targets". That tier threw
at registration since phase 2 — not because the membrane was unfinished, but
because we had no primitive that answers a question about a state without
producing language. Every place in this codebase where a prompt ends in *Reply
in EXACTLY this format* was a question wearing a completion's clothes.

The inversion-of-control framing the project uses for minds against agents
([inversion-of-control](../improvements/inversion-of-control-framing.md)) reads
across cleanly here. A voice model is *called by the world and may be ignored*;
it produces something new and the mind decides what to do with it. A decision
model is *asked about the state that already exists and can only answer*. It
cannot volunteer, cannot narrate, cannot confabulate a result it did not see,
because the only channel out is a distribution over options someone else named.
That is a smaller thing than a voice, and the smallness is the feature: the
state stays in the caller's hands, the vocabulary stays closed, and the answer
is a number that can be thresholded, multiplied or journalled without being
read as speech.

Two consequences we hit immediately:

- **A `noul` carries no confidence.** Where strength matters, ask a `choice` or
  a `score`, or derive `|p − 0.5|·2` and label the provenance
  `strengthIsDerived` — which is what tier 1 and the loop sense both do.
- **Dropping language costs something real.** The loop detector's `VOCABULARY`
  and `WHY` cannot exist on this engine. §4 below is the price.

## 2. The four measurements

### 2.1 Offline judge benchmark (Phase 2) — [expect-study §2.7](expect-study.md#27-a-system-one-judge-jev-offline--phase-2)

123 arm-P prediction/consequence pairs from a live lemma run, graded against a
**second reader's** blind labels (all 123 labelled before any Jev call; the
pre-registered 50 is a hash-chosen subset declared in advance). Two question
sets crossed with two state shapes, three repeats each: 738 calls, no soft
failures, no 429, **$0.032**.

| arm | agree/50 | agree/123 | false `match` (50/123) | conf <0.5 | 0.5–0.9 | >0.9 |
|---|---|---|---|---|---|---|
| `verdict/narrated` (r1) | **0.940** | 0.927 | 0 / 1 | 0.667 (15) | 0.882 (34) | **1.000 (74)** |
| `decomp/narrated` (r1) | 0.940 | 0.927 | 0 / 2 | 0.700 (30) | 1.000 (72) | 1.000 (21) |
| `verdict/raw` (r1) | 0.920 | 0.919 | 0 / 1 | 0.722 (18) | 0.848 (33) | 1.000 (72) |
| `llm/cloud` (text judge) | 0.880 | 0.854 | 0 / 0 | — | 0.182 (11) | 0.920 (112) |
| `llm/local` (text judge) | 0.880 | 0.886 | 0 / 0 | — | 0.364 (11) | 0.938 (112) |

Every pre-registered gate passes for `verdict/narrated`: agreement ≥ 0.90, no
`match` the reader did not call `match`, no `mismatch` on an `insufficient`
(that one holds on all 123 pairs of all twelve arms), calibration monotone with
the top band at 1.000. p50 300 / p95 419 ms; **$0.0000437 a pair**.

**The honest reading.** The headline the study actually earns is the
*calibration* row, not the agreement row. 74 of 123 answers land above 0.9
confidence and **all 74 are right, three runs running**; the text judge says
≥ 0.9 on 112 of 123 and is right on 92% of them. A decoded confidence is a
token; this one is a statistic of the distribution, and it behaves like one.
Against that: the 0.94 shares a rubric with the reader (the three verdict
glosses go verbatim into `criteria` *and* into the labelling instructions), it
is one reader on one mind's ledger on one topic, and the winner beats the text
judges by 0.06 — six pairs. The two subsidiary results are cleaner: the `noul`
decomposition is **worse** (2–3 false `match`es against `verdict`'s consistent
1), and the raw consequence payload is **worse than the narration** by one pair
in every run, closing §2.5's open point in the opposite direction from the
guess.

### 2.2 Live judge (Phase 3) — [expect-study §2.8](expect-study.md#28-the-judge-live--phase-3)

Two hours of `lemma-lab-judge.archml` with the decision comparator, then two
hours with the text comparator as a control. The live judge had never been run
on either engine, so this is two arms, not a comparison against a baseline.

| | jev arm | llm arm (control) |
|---|---|---|
| judge | `jev-1.13.0`, `compareDeadline` 2 s | `gpu-local` (ardincoder-1), 8 s |
| judgements | 109 (54.5/h) | — (provenance not logged; see §2.2a) |
| verdicts (m/mm/ins) | 89 / 7 / 13 | 96 / 12 / 7 |
| soft failures | **1** (ours: an aborted compare) | — |
| 429 / 529 | **0** | — |
| latency p50 / p95 / max | **311 / 480 / 978 ms** | — |
| `match` on failed evidence | **0** of 8 real failures | **0** of 3 |
| cost | **$0.002577** ($0.0013 per hour of mind) | free, on the box |

**The honest reading, and it is the negative one.** The engine swap is
invisible: M1–M7 differ between the arms by less than between two runs of one
arm, and both engines spread across the three verdicts where B1's
`exactTextCompare` called all 236 pairs `insufficient`. B2's founding error —
30 of 34 error pairs called `match` — does not reappear live on either engine.
Reliability at this cadence is a non-issue.

But **the verdict did not move a single bid in four hours.** `decideBid` is a
max over floors, not a multiplier over the base:
`salience = max(changeMagnitude, requested·requestedFloor,
predictionMatch·expectedFloor, predictionMismatch·mismatchWeight)`. With
`expectedFloor` 0.3 and `mismatchWeight` 0.6 against a per-hand
`changeMagnitude` of 0.6–0.8, the floors never bound: salience was one constant
per hand (note 0.6, terminal 0.7, recall 0.8), identical across all three
verdicts, in **both** arms. Everything Phase 2 measured about calibration was
computed, published, and discarded. The apparent by-verdict differences are
hand-mix artefact, which is why `judge-live.mjs` now prints the per-hand
breakdown beside it.

And the control did the same job for free. The local text judge scored the same
as the cloud one offline (§2.6, both 0.900), produced a comparable verdict
spread live, made the same zero `match`-on-failure calls, and cost nothing and
disclosed nothing. On the evidence we have, the case for residency is close.

Two caveats on this pair of runs: the arms are not cost-comparable (different
hand and thought mixes), and the LLM arm's per-call latency and self-reported
confidence were **not captured**, because `m-judge` logged its provenance line
only on the decision path when the runs were made. That is fixed (both engines
write it), and the repeat below closes the row.

#### 2.2a The control arm, repeated (19:37–21:37 UTC, same day)

A third two-hour arm, `local-voice` again on the fixed provenance line and a quiet
box, purely to fill the missing row —
[expect-study §2.8](expect-study.md#the-control-arm-repeated--the-row-that-was-missing).
113 judgements, 0 soft failures, 78 / 8 / 27 verdicts.

| | jev | **llm repeat** |
|---|---|---|
| latency p50 / p95 / p99 | 311 / 480 / 845 ms | **1346 / 1941 / 2316 ms** |
| confidence <0.5 / 0.5–0.9 / >0.9 | 16 / 32 / 61 | **0 / 2 / 111** (mean 0.994) |
| failed evidence → `insufficient` | 8 of 8 | **25 of 25** |
| clean terminal → `insufficient` | 0 of 17 | **0 of 72** |
| salience per hand | note 0.6 / term 0.7 / recall 0.8 | **identical**, across all three verdicts |

It sharpens the comparison in both directions and changes the residency call in
neither. **For the decision model:** the latency gap is 4× and real, its p99 of
845 ms sits inside a 2 s deadline the text judge's 2316 ms p99 would breach, and the
calibration contrast of §2.7 reproduces live on a run with no reader — the text
judge answers above 0.9 confidence on 111 of 113 and cannot tell its good answers
from its bad ones. **Against it:** this arm is the cleanest verdict table in the
whole study. Terminal-dominated, so the externally checkable sub-population is 25
pairs rather than 8, and the local text judge separates them perfectly in both
directions — 25 of 25 failed runs called `insufficient`, 0 of 72 clean ones. The
free, on-box control is not worse. And the bidder finding reproduces a **third**
time on a hand mix inverted from the first two arms: one salience per hand,
identical across verdicts, floors never binding.

### 2.3 Tier-1 search (Phase 4) — [prediction-mismatch, "First edge-grounded search"](../improvements/prediction-mismatch.md#first-edge-grounded-search-tier-1-live)

The *lean versus edge-grounded sense* experiment, designed long ago and unrunnable
until there was a tier-1 tool. The same feed at tier 0 and tier 1, the same
template, the same budget; each probe twice.

| | arm E — edge-grounded (tier 1) | arm L — lean (tier 0, control) |
|---|---|---|
| aperture | `world`, **closed** | `lean`, open |
| matcher | the source itself, one `noul` per headline | `m-judge` after materialization |
| outcome | **`found`**, `reason: edge-match`, both rounds | `not-detected-in-inspected-area`, both rounds |
| score | 0.86 / 0.87 against `matchThreshold` 0.7 | verdict `mismatch` |
| cost / latency | **$0.000096**, 2 140 ms for 6 candidates | one local LLM call, ~1 300 ms for 1 |

**The honest reading.** The stop condition is met and it is a genuine first: a
search over a *closed* aperture answered `found` on a number made behind the
gate. Nothing materialized, no percept was offered, no text reached the region,
the mind's stream never saw the item. What crossed was the score and a
**closed-vocabulary** provenance record — engine, decider ref, model version,
question keys, derived strength and its formula, candidate count, calls,
latency, tokens, cost, aperture state — with anything else dropped at
construction. The tier-1 score never reached the contact regulator as a change
header, so a channel being searched does not thereby feel more contact.

What it does not show is longer than what it does. `matchThreshold="0.7"` was
picked from four offline probes and is **not a measured operating point**. The
arms are not equal in reach: one sample of a tier-1 source scores a whole
poll's worth of candidates inside the source, one sample of a tier-0 source
offers exactly one item, so the lean arm ended after judging the feed's *first*
headline and never reached the item arm E found — a finding about tier 0's
sampling grain, not a demonstration that tier 0 cannot recognise the target.
One run, one template, two matches of the same item, text only, and the search
was started by a probe on a clock because live minds produce no organic
searches. And the template *did* leak to the decider, which is what a grounding
query is; here that was six public BBC headlines, but the same source shape over
an interoceptive channel would be sending something else entirely.

### 2.4 Loop detector, fourth arm (Phase 5) — [loop-detector-scoring §4](loop-detector-scoring.md#the-fourth-arm-a-calibrated-sub-second-sensor-2026-09-18)

The isolation study that dissociates the loop organ's **sensor** from its
**effector** gained a fourth variant: the same breaker, a decision-model sensor.
Scored on the corrected DCM engine (reconciled 2026-07-21) so all four arms are
mutually comparable.

| System | DCM (paper scale) | Δ from V1 | SAS-1 % | Δ from V1 |
|---|---:|---:|---:|---:|
| V0 · basic mind | 0.194 | — | 24.5% | — |
| V1 · matcher + break | 0.234 | — | 31.3% | — |
| V2 · LLM + break | **0.257** | +0.023 | **35.5%** | +4.2 pt |
| **V3 · Jev + break** | **0.245** | **+0.011** | **34.4%** | **+3.1 pt** |

Measured behaviour, 120 real loop-detector tails replayed through both engines
(`jev-1.13.0` against `local/ardincoder-1`): 93.3% binary agreement on the 0.5
gate, latency p50/p95 **294 / 380 ms** against 1128 / 1514, **$0.00006** a
check. Every one of the eight disagreements sat in Jev's own low-confidence band
(agreement 80.0% below 0.5, 98.8% in 0.5–0.9, 100% above 0.9). A 25-minute live
wake made 29 detections, 23 breaks, zero soft failures, zero 429s.

**The honest reading.** A calibrated sub-second sensor does **not** overturn
"the effector beats the sensor" — the gap is wider than for the LLM, not
narrower. Three reasons worth keeping apart. The high-weight signals (gating
w3, action-selection w2) are the *breaker's*, and it is the same breaker in all
three armed arms. Dropping language costs a real signal *in the effector*: with
no `vocabulary`, `m-resurface`'s farthest-note search has nothing to steer away
from and degenerates to the newest kept note, so action-selection is held at
V1's 0.40 (V2: 0.44) — V3 is strictly worse than V2 in exactly the place the
sensor was supposed to help. Where it gains is the sensor's own ground
(metacognition 0.52→0.60, persistent self-model 0.30→0.40, a judged valence
from five explicit criteria and a confidence) plus one signal V2 never touched:
at 294 ms against a ~1.1 s burst the monitor genuinely runs on a faster
timescale (async temporal dynamics 0.12 vs 0.08).

Three caveats that bound this arm hard. **93.3% is concordance with the LLM
sensor, not accuracy against a reader** — neither engine is ground truth and
the corpus has no blind labels, so the B2-style reader study the judge got has
not been run for the loop detector. The two engines share a rubric (the glosses
in `criteria` are the glosses in the format prompt). And the live wake's 29
verdicts ran **0.00–0.83 confidence, median 0.32, only 6 at or above 0.5** —
the sensor mostly fires from inside the band its own replay calls ~80%
trustworthy, and **nothing in the mind reads that number**: the breaker treats
a 0.02-confidence loop and a 0.83-confidence loop alike. That is a finding
about our wiring, not about the model.

## 3. Cost

Against a mind's other spend, a decision model is not a cost centre. The voice
is.

| workload | unit | per hour of mind |
|---|---|---|
| judging (109 judgements, 54.5/h) | $0.0000236 each | **$0.0013** |
| tier-1 grounding (6 candidates / 8 min) | $0.000096 a search | **≈ $0.0007** (estimate) |
| loop check | $0.00006 each | cadence-dependent; not measured per hour |
| offline judge benchmark | $0.0000437 a pair | 738 calls = $0.032 |

In the live judge arm, judging was **7.5%** of a two-hour bill of ≈$0.0342, the
rest being the cloud utility model; the voice was local and therefore free in
money and not in GPU. The comparison that matters is not Jev against the
utility model's *price* but against what the utility model *is doing*: at
$0.042 per million input tokens with output free, a question is roughly an
order of magnitude cheaper than the same judgement asked in prose, and about
four times faster. Whole-project spend on this integration, across all five
phases and every run, is on the order of **$0.10** against a $5 budget, of which
roughly **$0.042** is the decision endpoint itself.

So cost is not an argument for or against residency in either direction. The
arguments are calibration on one side and privacy on the other.

## 4. The residency call

The rule the four measurements support: **a decision model earns its place
where its answer is compared against a threshold or multiplied into a
decision, and where the state it reads is not the mind's own interiority.**
Buying calibration for a term of a `max` buys nothing (§2.2). Buying it for a
signal no consumer reads buys nothing (§2.4).

Privacy is the line, and it is per role, not per project. `local-voice` exists
so that a mind's own evidence is not graded off-box; any role moved to Jev
gives that up for that role. Every such choice is a **profile** decision a human
makes per run — named in `config/models.yaml`, in
[`components.md`](../architecture/components.md), and in the covenant
compatibility note — and never a component default.

| role | residency | why |
|---|---|---|
| **judge** (`m-judge`) | **Opt-in only**, under `local-voice-jev`; not in `local-voice`, not in `local-dev`, and not a default anywhere. Keep the text judge in the same role behind the profile switch. | It works (0.94, 300 ms, one soft failure in 109, that one ours) and the calibration is real. But the local control scored the same offline and behaved comparably live, for free and on the box, and at current bidder weights the calibration changed nothing. The repeat (§2.2a) sharpens both sides without moving the call: 4× the latency and a useless self-reported confidence on the control, against the control's perfect 25-of-25 on failed evidence. Choose Jev when you want a versioned, sub-second, calibrated verdict and have decided the disclosure is acceptable for that run. |
| **tier-1 search decider** (`m-sense`/`m-feed` `decider=`) | **Per source, in the architecture** — the only place in the design where naming a decision model is *required* rather than optional, because a tier-1 source with no decider is refused at registration. | It is the only way we have to search behind a closed aperture without materializing text into the region. The disclosure is the *source's* candidates plus the template, which is why `decider` is declared per source next to `tier`: a public feed and an interoceptive channel are not the same decision. Never declare one on a source whose candidates are the mind's own state. |
| **loop sense** (`m-loop-detector`) | **No — not by default and not under `local-voice`.** Available on any profile that names a decision preset, with the privacy note. | The state is the mind's **verbatim inner monologue**; sending it off-box undoes the reason `local-voice` exists. And the measurement does not pay for it: V3 sits below V2 (34.4% vs 35.5% SAS-1, 0.245 vs 0.257 DCM) because the engine cannot hand the breaker any vocabulary. Reasonable to choose on a cloud profile where the monologue already leaves the box, for the 4× latency win and the confidence — but only once something reads the confidence. |
| **m-interrupts urgency** (plan §5, later) | **No.** Keep it model-free. | Phase 4 did not show that salience needs semantics. The plan's own condition for revisiting has not been met. |
| **memory-compression keep/drop** (plan §5, later) | **Not yet — and the reader study first.** | Shaped exactly right for a `noul` or a `score`, and the decision is a threshold, which is where calibration pays. But the state is the mind's memory, the most private thing it has, and we have no accuracy measurement for keep/drop at all. A local benchmark against a reader comes before a residency question. |
| **m-agent govern-seam checks** (plan §5, later) | **The best remaining candidate.** | A govern check is a threshold decision on text the agent is already handling, often not the mind's interiority at all, and a calibrated yes/no with a refusal band is exactly the shape of the question. Unbuilt and unmeasured; worth a benchmark next. |
| **Stereotic news relevance** (Phase 4's second candidate) | **Unblocked, unbuilt.** | Tier 1 now works, so a `score` over `["noise", "mentions", "material to a watched asset"]` before the aperture is implementable. Public headlines, so the disclosure is mild. Needs a live URL and a committed Stereotic.  |

## 5. The unclaimed gains, as experiments

Each of these is a thing the four runs *showed we are not getting*, stated as
the next measurement rather than a promise.

1. **Confidence-weighted breaker bid.** Nothing reads `loop.confidence`; the
   live wake's median was 0.32, in the band the replay calls ~80% trustworthy.
   Wire arousal or the bidder to multiply by it, rerun the V3 arm, and see
   whether neuromodulatory control (held at 0.25 as an explicitly *unclaimed*
   gain) and the false-break rate move. The prediction is that V3 closes on V2.
2. **Jev sensor + `loopMath` vocabulary.** V3 loses to V2 in one place only:
   the breaker gets no words. A hybrid — the decision model judges, the
   deterministic matcher supplies the vocabulary for `m-resurface` to steer away
   from — costs $0.00006 plus a regex and should recover action-selection and
   selective attention. Nobody has scored it.
3. **`mismatchWeight` above the evidence.** The bidder finding is a lab decision
   about weights, not about models: for a verdict to move salience at all,
   `mismatchWeight` must exceed the hands' own `changeMagnitude`, which in these
   runs means **above 0.6–0.8**. Set it deliberately, rerun the judge arms, and
   measure whether an expect envelope can change behaviour through the bidder —
   rather than discovering the floor again.
4. **A `noul` calibration study for `matchThreshold`.** 0.7 came from four
   offline probes. Do for tier 1 what §2.7 did for the judge: a blind-labelled
   candidate set, agreement by confidence band, and an operating point chosen
   from a curve. Until then every tier-1 `found` is a threshold we guessed.
5. **Retention horizon for tier-1 scores.** The tier table promises "a declared
   budget and horizon"; today a score lives as long as the attempt. Decide
   whether a below-threshold score counts as coverage ("looked and did not
   recognise") or as nothing — they are different claims about absence — and
   give scores a declared lifetime.
6. **A reader study for the loop sense.** 93.3% is concordance between two
   models that share a rubric. Blind-label a sample of the 120 tails and find
   out which engine is *right*, not which agree.

## 6. What this note does not claim

- Not that a decision model improves a mind's functioning. No measurement here
  is a functioning claim; the judge arms differ from each other by less than two
  runs of one arm differ, and the loop arm's scores are structural marks, not
  behaviour.
- Not that Jev is more accurate than a text model in general. It beat two text
  judges by six pairs on one ledger against one reader whose rubric it shared.
- Not that any of this generalizes past text. Every measurement is English text
  on one box against one vendor's one model version, pinned in each record;
  another version is another measurement.
- Not that the vendor's published claims were tested. Latency, price and the
  rate-limit path were observed from this box; "RLCD" and the workflow evals were
  not evaluated.

*Single vendor, one endpoint, limits the vendor says are adjusting dynamically.
Every role above keeps its text engine in the same role behind a profile switch,
with no code change, which is the whole reason the engine is chosen by the
resolved provider's kind and never by a flag.*
