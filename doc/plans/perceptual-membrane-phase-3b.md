# Perceptual membrane — Phase 3B implementation plan: from fixture to live

**Status: proposed, 2026-09-10.** Written from the
[phase 3A review](perceptual-membrane-phase-3a-review.md). It replaces the
"3B = orient + search" half of the [phase 3 roadmap](perceptual-membrane-phase-3.md)
with a staged sequence whose first three stages are prerequisites the roadmap did
not know it had. The roadmap's §2.3, §5, and §6 remain the specification for
orientation and search; this plan says what has to be true before they are built,
and in what order.

Sibling of the [phase 1](perceptual-membrane-phase-1.md),
[phase 2](perceptual-membrane-phase-2.md), and
[phase 3A](perceptual-membrane-phase-3a.md) plans. Constrained by
[the perceptual membrane](../architecture/perceptual-membrane.md),
[prediction and mismatch](../improvements/prediction-mismatch.md),
[efference](../architecture/efference.md),
[enclosure by role](../improvements/enclosure-by-role.md), and
[decoupling](../architecture/decoupling.md).

Read this one as: *a seam is proved by replacing what sits in it, and a
mechanism is proved by a mind that runs it.*

## 1. What this phase is

Phase 3A left two facts on the table that the roadmap does not state:

1. **No live mind has a sensory aperture.** Every `m-region` in `architecture/`
   and `architecture/lab/` is structural; none carries `modality`. Eager senses
   still `feel()` past every gate. The only evidence a thinking mind can compare
   is a hand's consequence.
2. **The reference comparator cannot read prose.** `exactTextCompare.js` answers
   `insufficient` whenever either text has eight or more tokens. A realizer's
   `expect` and a hand's `experience` are never equal. Live, every prediction
   expires.

Orientation has nothing to orient; search has no comparator that can say
`found`. Built now, 3B would be a second fixture-only proof, and the 3A stop
questions (is `expect` produced in a useful form? does comparison touch cadence?)
would stay unanswered although they are cheap to answer live.

So this phase runs in six stages, each with its own stop condition:

```text
B0  housekeeping      — the review's defects, the owed docs, the shared runner
B1  live expect study — prediction on, comparator on, no bidder, control arm
B2  m-judge           — a declared tier-2 comparator behind the same port;
                        offline over B1's pairs first, then live at small weights
B3  first live aperture — eddy's world region under modality="text"; feeds lazy
B4  orient            — roadmap §2.3, §5 (M5), against B3's aperture
B5  search            — roadmap §2.2, §6 (M6–M7), with B2 supplying targetMatch
```

B1 and B2 are the roadmap's own "act-bound mismatch" experiment row, finally
runnable. B3 is the per-sense migration the roadmap lists as out of scope and
which turns out to be the precondition of everything after it. B4 and B5 are the
old 3B, now with a subject and a comparator.

### In scope

1. **B0.** Role for `m-act`; ids on `evaluation-commit`, `perceptDecision`,
   `acted`; the outcome/progress rule for consequences; rebinding admits;
   duplicate comparator fails at connect; `mind-sleeping`; `EvidenceCase`
   extraction; `compareDeadline` attribute; five owed docs.
2. **B1.** A lab-gated `m-expect-ledger`, a lab architecture pair, a harness and
   pre-registered metrics under `experiments/expect-study/`.
3. **B2.** `m-judge` (tier-2 comparator, utility model), its pure prompt/parse
   module, the offline judge script, a live condition with `m-bid` at small
   weights. Optionally `m-contain`, a match-only containment comparator.
4. **B3.** `MSense.perceive()` choosing lazy `candidate()` under an aperture and
   eager `feel()` otherwise; `m-feed` migrated; `architecture/lab/eddy-world.archml`;
   an observation run with pre-registered contact metrics.
5. **B4.** `OrientationRequest`, `requestOrientation` on aperture providers,
   generic capability lanes, `m-orient`, intent-ledger fix, oscillation
   observability (roadmap M5, tests 17–24).
6. **B5.** `control-result`, `m-search`, attempt state machine, outcomes
   (roadmap M6–M7, tests 25–33), `targetMatch` from the judge.

### Out of scope (and who owns it)

| Not now | Owner |
|---|---|
| Tier-1 edge grounding, `EdgeEvidence` production, the lean-vs-edge experiment | phase 4 |
| Passive, learned, temporal, or competing predictors; comparator aggregation | phase 4 |
| Prediction-based attenuation; production weights; resident adoption | a lifecycle-governed study after B2 |
| Native media, model capability selection | membrane phase 5 |
| Studio timelines for predictions, apertures, searches | membrane phase 6 |
| Migrating `m-weather` and `m-daylight` | after B3 shows the helper holds for `m-feed`; same helper, per sense |
| The efference redesign (act-writing, grasp, manual mode) | its own decision |
| Generic port contracts / automatic wiring | port-contract work |

### The compatibility promise

- With no `prediction="on"`, no `m-compare`/`m-judge`, no `m-bid`, no `modality`
  region, and no `m-orient`/`m-search`, every existing architecture produces the
  same REALIZE schemas, bids, frames, deeds, journal text, and receipts as today.
- B0's refactors change no behaviour; the 34 tests in `act-prediction.test.js`
  and `membrane-compare.test.js` plus the phase-1/2 suites are the guard.
- B3's helper leaves a sense outside an aperture on the eager path, byte-for-byte.
  Under an `open` aperture at gain 1 with no bidder it yields the same salience
  `feel()` would have.
- `m-judge` is a declared tier-2 comparator. It sends expectation and evidence
  text to a model. An architecture that has not wired it makes no such call.
- The expect ledger connects only in a mind tagged `stage="experimental"`. A
  resident cannot acquire it by accident.

## 2. B0 — housekeeping

All items are small and behaviour-preserving with prediction off. Commit them
separately; each has a test.

### 2.1 A role for the hands

`MAct` gains `static provides = { hands: true }`. `enclosure.js` `bidOwnerOf`
becomes `providesOf(cur, 'aperture') || providesOf(cur, 'hands')`, dropping the
`localName === 'm-act'` test. If any wiring test stubs a bare `<m-act>`, give it a
tag fallback in a table beside `IDENTITY_BY_TAG`, used only when the constructor
has no `provides`, never in a production lookup. Test: a `<my-act>` from a test
`components/` bundle owns its interior `bidder`.

### 2.2 Ids on the three channels

- `evaluationCommitPayload` gains optional `requestId`; both producers pass
  `percept.requestId`. This is what B5 keys attempts on.
- `perceptDecision` gains `candidateId` and `requestId` (additive fields; Studio
  ignores unknown keys). This is what lets B5 tell a refused route from a slow one.
- `acted` gains `actId` and `predictionId` as the roadmap §3 specified. `args`
  stays the stripped `handArgs`. This is what lets B1 pair a deed with its
  prediction without reading any text channel.

### 2.3 The outcome rule

A hand's returned consequence may carry `progress: true`. `m-act` stamps it onto
the trusted `InterruptRecord` (a substrate-owned boolean like `urgent`, never read
from a coerced payload), the evidence view carries it, and a comparator returns
no evaluation for progress evidence. `m-terminal` sets it on `_startedConsequence`
and keeps the `-start` type suffix. Rule, stated in the class comment: *a
prediction is compared against outcome consequences only; a progress line is not
the world answering.* Test: a deferred hand whose progress line shares the outcome
type is not judged on the progress line.

### 2.4 Rebinding admits; duplicates fail at connect

- `mRegion.js` (the comparator re-check before awareness) and `mAct.js` (before
  `_dispatchOwnerBid`) set `evaluations = []` on comparator loss or rebinding
  instead of returning. The evidence bids with null prediction slots, exactly as
  timeout does. 3A test 13 changes accordingly: rebinding prevents the *evaluation
  commit and settlement*, not the bid.
- `MCompare.onConnect` throws if `part(membrane, 'comparator')` already holds
  another provider. The producers' runtime guard stays but degrades to "no
  comparator" with one warning, so a listener never throws.

### 2.5 `mind-sleeping`

`m-mind` fires `mind-sleeping` where it sets `_sleeping = true`. Both evidence
owners listen and abort live cases. Polling `_sleeping` stays as the final check.

### 2.6 `EvidenceCase`

Extract the choreography duplicated in `mAct._onLiveConsequence` and the
`m-region` offer path into `src/infrastructure/evidenceCase.js`:

```js
runEvidenceCase({
  owner,             // for isConnected, membrane(), deadline attr
  view,              // projected evidence view (private)
  comparator,        // resolved by the owner; may be null
  budget, order,     // owner's CompareBudget and per-lane CommitOrder
  aborts,            // owner's live AbortController set
  revalidate,        // () => boolean — owner-specific checks after the wait
  commit,            // (evaluations) => void — fire evaluation-commit, bid, dispatch
}) → Promise<void>
```

The runner owns: budget reservation before comparison, deadline and abort timer,
`awaitUntilAbort`, budget release, ordered wait, the deadline/abort re-check that
zeroes evaluations, `finally` cleanup, and the generation/bind checks passed in by
`revalidate`. The owners keep: claiming, view construction, awareness (region),
percept construction, and dispatch. Behaviour is identical; the existing 34 tests
must pass unchanged before and after.

### 2.7 `compareDeadline`

Replace the internal `_compareDeadlineOverride` with a `compareDeadline` attribute
on `m-region` and `m-act` (`parseTime`, default `2s`). B2 needs a longer window
for a model call.

### 2.8 The owed documentation

- `components.md`: `m-compare`, `m-bid`, `m-act`'s `prediction`, `compareDeadline`,
  `predictionTarget` and `progress` in the capability contract, the `bidRefusal`
  topic; in B1/B2 add `m-expect-ledger`, `m-judge`.
- `extending.md`: replacing a comparator or a bidder from a `components/` bundle,
  using the role-port rules below.
- `efference.md`: the additive `expect` envelope, `actId` in the execution
  context, the outcome rule; state that the efference redesign was not adopted.
- `prediction-mismatch.md`: the known-issues row "Prediction has no independent
  lifecycle" becomes *implemented in 3A (act ids, records, expiry, association)*;
  mark the act-bound reference condition implemented and the experiment matrix
  unrun until B1/B2 report.
- `decoupling.md`: name the third wiring kind. **Role port:** a method called on a
  component resolved by role via `part()`. Rules: resolved by role not tag;
  singleton per owner; duplicate fails at connect; port shape validated before
  use; same-batch custom waits for `whenDefined`; disconnect invalidates in-flight
  work. Existing instances: `regulator`, `aggregator`, `comparator`, `bidder`.
- `troubleshooting.md`: amanita 0.5 is required; a stale `node_modules` fails 115
  wiring tests with `'!scope' is not a valid selector`; run `bun install`.

## 3. B1 — the live `expect` study

**Question.** In a mind that thinks, is `expect` produced, in what form, how often
does its outcome arrive inside the horizon, and does offering the field change
which hand the realizer picks or how often it declines?

**Design.** Two arms of the same lab architecture, `architecture/lab/lemma-lab-expect.archml`,
a copy of `lemma-lab.archml` with:

```xml
<m-mind name="lemma-lab-expect" stage="experimental" …>
  …
  <m-compare name="compare"></m-compare>
  <m-expect-ledger name="ledger"></m-expect-ledger>
  <m-act name="hands" prediction="on" …>   <!-- arm P; arm C: prediction="off" -->
    <m-note …/> <m-recall …/> <m-terminal …/>
  </m-act>
```

No `m-bid` anywhere. Weights are zero, so attention, frames, and memory are those
of `lemma-lab`. The only behavioural difference between arms is the optional
`expect` property in the realizer's tool schemas. That is the perturbation the
phase-3 review worried about, and it is what arm C measures.

`lemma-lab` is chosen because it uses its hands most (note, recall, terminal at a
short cadence) and because the terminal's outcome is the one consequence with
checkable content.

### 3.1 `m-expect-ledger`

`src/mindComponents/mind/mExpectLedger.js`. Lab-gated: `onConnect` throws unless
`membrane().getAttribute('stage') === 'experimental'`. It listens at the membrane
for `prediction`, `prediction-settled`, `evaluation-commit`, `acted`
(`!scope/hands/@acted`), the mind's `interrupt-request` (bids whose evidence
carries an `actId`), and `percepts-attended`. It appends one JSON line per event
to `mindHome(this, 'predictions')/ledger.jsonl`, the same class of private record
as the terminal's `.runs/` transcripts. Nothing enters memory, the frame, Studio,
or the process log. Fields:

```text
prediction     id actId capability basisAt validUntil target expectText
acted          actId predictionId capability ok progress? experienceLength
consequence    perceptId actId type occurredAt progress text salience
commit         evidenceId actId predictionId verdicts
settled        predictionId status reason settledAt
attended       perceptId at
intent         gist accepted reason salience  (from the `intent` topic)
```

`expectText` and consequence `text` are the study's data. They are private to the
run directory and are read only by the analysis scripts. A component that writes
them anywhere else violates the roadmap's rule; this one writes them to the one
place the mind already keeps private transcripts.

### 3.2 Harness

`experiments/expect-study/`:

```text
README.md          question, design, metrics, decision rule (this section)
archml/            the two arms, generated from lemma-lab-expect.archml
bin/run.sh         MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js -a <arm> ; timed
analysis/
  summarize.mjs    ledger.jsonl + stream debug files → metrics table (json + md)
  rubric.md        the expect-shape categories, applied by a reader per prediction
```

At least three runs per arm, at least two hours each, same origin, local model
(`local-voice` profile, the one prior runs found robust). No voice probes.

### 3.3 Pre-registered metrics

| # | Metric | Arm | Reads |
|---|---|---|---|
| M1 | fill rate: acts with non-empty `expect` / acts | P | Q3 |
| M2 | `expect` shape: token length; category ∈ {checkable claim, restated intent, vague prose, other} per rubric | P | Q3 |
| M3 | settle rate: predictions whose outcome consequence arrived inside `validUntil` / predictions; latency | P | horizon |
| M4 | hand choice: capability distribution, realizer decline rate (no tool call), intent acceptance rate | P vs C | review §3 |
| M5 | verdicts: match / mismatch / insufficient per commit | P | expected ≈ all insufficient; this is the measurement |
| M6 | cadence: acts/hour, consequence latency, sense interrupts/hour, bursts/hour | P vs C | Q2 |
| M7 | attention: attended consequences / consequences | P vs C | must be equal at zero weights |

### 3.4 Decision rule for B2

- M1 ≥ 0.5 and M2 "checkable claim" ≥ 0.3 → B2 proceeds with the field as is.
- M1 < 0.5, or "restated intent" dominates → revise `EXPECT_FIELD`'s description
  (one sentence, e.g. *what the screen or note will actually show, as a checkable
  phrase*) and rerun arm P once before B2. Do not touch the realizer system prompt
  for this.
- M4 shows a hand-choice shift beyond run-to-run noise → record it as a cost of
  the envelope in `efference.md`; it does not block B2 but bounds resident
  adoption later.
- M6 differs between arms → find the cause before B2; comparison must not touch
  cadence.

B1 produces a short report at `doc/research/expect-study.md` with the table and
the decision. It makes no behavioural claim about prediction; it says what
`expect` is.

## 4. B2 — `m-judge`, the declared tier-2 comparator

**Claim under test.** A comparator that reads prose can be mounted behind the
existing `comparator` port without touching evidence, frame assembly, or memory;
and once mounted, the "act-bound mismatch" condition can run.

### 4.1 Shape

`src/infrastructure/judgeCompare.js` (pure):

```js
judgePrompt({ expectText, evidenceText })   → string
parseJudgeReply(text)                        → { verdict: 'match'|'mismatch'|'insufficient', confidence }
```

The prompt asks one question: *given what was expected and what was then
perceived, does the perception confirm the expectation, contradict it, or leave
it undecided? Reply `MATCH`, `MISMATCH`, or `INSUFFICIENT`, then a confidence
0–1.* It gives no world state and no third text. A reply that does not parse is
`insufficient`.

`src/mindComponents/mind/mJudge.js`: `static provides = { comparator: true }`;
the same membrane-event index of live predictions as `m-compare` (extract that
index into a shared `livePredictionIndex.js` so both comparators use one);
attributes `model` (default the ancestor `utilityModel`), `maxTokens` (60),
`temperature` (0). `evaluate(view, { deadline, signal })`:

- returns `[]` for progress evidence, empty text, or no live prediction with
  matching `actId` and target;
- one `complete()` call per evidence, aborted at `signal`; failure or timeout →
  `insufficient`;
- returns one `Evaluation` with `subject {kind:'prediction', id}`, `confidence`
  from the reply.

The owner's `compareDeadline` must cover a utility call; the B2 architecture sets
`compareDeadline="8s"` on `m-act`. Cost bound: at most one call per consequence
that answers a live prediction, which at act cadence is a handful per hour.

Tier and privacy: `m-judge` is tier 2 by declaration. It sends the expectation and
the evidence text to a model provider. Under the local profile that stays on the
box; under a cloud profile it does not, and the architecture author is making
that choice by wiring it. `promptDebug` dumps its prompt like every other call
when debugging is on; this is the one existing channel where the texts appear
outside the run directory, and it is already governed by the debug flag.

### 4.2 Offline first

`experiments/expect-study/analysis/judge-offline.mjs` reads B1's ledgers, pairs
each prediction with its outcome consequence, calls `complete()` with
`judgePrompt`/`parseJudgeReply`, and writes verdicts beside the pairs. A reader
labels a sample of at least thirty pairs blind; the script reports the confusion
matrix and the confidence calibration. This costs no live perturbation and is the
first replacement of a comparator the seam was built for.

Decision rule: agreement with the reader ≥ 0.8 on match-vs-mismatch, and no
mismatch verdict on a pair the reader calls insufficient, before the judge goes
live. Otherwise revise the prompt offline and rerun; the ledgers are fixed data.

### 4.3 Live at small weights

`architecture/lab/lemma-lab-judge.archml`: arm P plus `<m-judge>` in place of
`<m-compare>`, `compareDeadline="8s"`, and under the hands
`<m-bid name="act-bid" expectedFloor="0.3" mismatchWeight="0.6">`. Weights are the
fixture's guess, chosen to sit above lemma-lab's attention threshold (0.5) for a
mismatch and below it for a match, so the condition tests contradiction reaching
awareness without forcing confirmation in.

Pre-registered, against arm P:

- M5 verdict distribution; M3 settle rate now including matched/mismatched;
- M7 attended fraction for mismatch consequences vs match vs no-prediction;
- M6 unchanged (the judge runs after materialization and off the source);
- a qualitative read, per mismatch, of whether the stream registers the
  contradiction *against the recorded prior*: the prediction-mismatch doc's
  criterion that "a mismatch label followed by new prose is not proof of belief
  revision". Record the prediction text, the consequence, and the next two bursts.

B2 reports in `doc/research/expect-study.md` §2. This is the first behavioural
statement the membrane series makes, and it is about one lab mind under one
weight setting. It does not license resident weights.

### 4.4 Optional: `m-contain`

A zero-cost second condition: match when the normalized expectation (≤ 6 tokens)
occurs in the normalized evidence text, otherwise `insufficient`, never
`mismatch`. Useful only if B1 finds `expect` is often a short checkable phrase.
Skip it otherwise.

## 5. B3 — the first live aperture

**Claim under test.** A shipped sense can move under aperture control with one
attribute on the region and no change to its perception when the aperture is
open; contact regulation then runs against a real feed.

### 5.1 `MSense.perceive()`

Add to `mSense.js`:

```js
perceive(reason, { key = null, salience = null, type = null, changeKey = null } = {}) {
    if (!this.enclosing('aperture')) return this.feel(reason, { key, salience, type })
    const sal = this._salienceFor(key, salience)          // the same number feel() computes
    return this.candidate(
        { changeMagnitude: sal, changeKey: changeKey ?? key ?? reason, occurredAt: Date.now() },
        () => reason,
    )
}
```

`_salienceFor` is `feel()`'s salience computation factored out so the two paths
agree. The lazy materializer returns the same first-person line `feel()` would
have fired; at tier 0 the header carries only the magnitude and a hashed key.
`feel()` is untouched; a sense migrates by calling `perceive()` instead, and a
sense outside an aperture is unchanged.

`m-feed` migrates: `this.perceive(\`A scrap of the outside world drifts past — “${fresh}”.\`, { changeKey: fresh })`.
`m-weather` and `m-daylight` follow after B3 reports, each its own commit.

### 5.2 `eddy-world.archml`

`architecture/lab/eddy-world.archml`: a copy of `eddy.archml`, `stage="experimental"`,
with

```xml
<m-region name="world" modality="text" aperture="open" dwell="30s" contactHorizon="10m">
  <m-interrupts threshold="0.3" rateLimit="6m" gain="0.9"></m-interrupts>
  <m-feed name="earth" …/> <m-feed name="sky" …/> <m-feed name="ideas" …/>
</m-region>
```

Nothing else changes. No `m-bid`, no prediction.

### 5.3 Observation run and metrics

Headless, local profile, at least four hours, no probes. `m-ws`/Studio already
carry `apertureState` and `contactPressure`; the run reads them from the mind's
log or a small `m-ws` client. Pre-registered:

- feed percepts attended per hour vs `eddy` baseline (should match within noise;
  open gate, gain 0.9 as before);
- `contactPressure` trajectory: it must fall on each attended feed receipt and
  climb between them; a receipt that does not credit is a defect;
- `aperture-change` events: none expected (nothing closes the gate in B3); any
  transition is logged with its reason;
- no `perceptDecision` refusal other than `busy`; no `materializationFailure`;
- journal text of feed percepts identical in shape to `eddy`'s.

B3 reports in `doc/research/first-live-aperture.md`. If perception differs from
`eddy`'s with the gate open, the helper is wrong and B4 waits.

## 6. B4 — orientation

Specification: roadmap §2.3 (`OrientationRequest`), §5 (`m-orient`, lanes,
reflex rhythm), M5, tests 17–24. Deltas from what 3A and the decoupling migration
taught:

- **Provider enum derived, not authored.** `m-orient` builds its closed `aperture`
  enum from `part(membrane, 'aperture')` names at connect and re-registers its
  capability when an aperture connects later; `source` enum from the named
  provider's registered source names. The architecture cannot get the two lists
  out of step.
- **`requestOrientation` is a role port** on aperture providers, following the
  §2.8 rules; forwarding to child providers as the roadmap says.
- **Lineage forwarding is already half built.** `ControlRequest.actId` exists;
  `MRegion._transition` gains an `actId` argument and passes it on the sample
  request, so an `expect` on `orient` can settle (roadmap §2.3).
- **Intent ledger: claim at execute.** `_realize` stops claiming the slot at
  accept; `_execute` claims it when a hand actually runs. A reach the realizer
  declines may re-fire next cadence, bounded by DECIDE's own gate and the
  `_feelReachInMotion` throttle, which is unchanged. This is the judgment call
  the roadmap §12.7 left open; the reason for this side is that with a raised
  `intentThreshold` on `m-orient`, "offered no fitting hand" becomes common and
  a 15-minute burn per occurrence would be the dominant failure.
- **Oscillation observability before any grace period.** `experiments/expect-study`
  gains a sibling `experiments/orient-study/` that reads `aperture-change` events
  from an `eddy-world` run with `m-orient` and reports transitions per hour by
  issuer and reason, closed-to-softened intervals, and re-close latency. The grace
  period is decided from that report, as the roadmap intended.

Stop condition: tests 17–24 green; one `eddy-world` run in which the mind closes
or narrows the world channel at least once by its own hand, the reflex reopens
it, and no `bypassAperture` source was withheld.

## 7. B5 — search

Specification: roadmap §2.2 (records, attribution rule, `control-result`), §6
(`m-search`, state machine, outcomes, how a search reaches awareness), M6–M7,
tests 25–33. Deltas:

- `control-result` is fired by `m-region` for a requested candidate's refusal or
  acceptance, id-only, as the roadmap says; B0 already gave `perceptDecision` and
  `evaluation-commit` the ids `m-search` correlates on.
- `targetMatch` comes from a comparator that can read prose. `m-judge` gains a
  second subject kind, `target`, judging evidence against a live `SearchTarget`'s
  template with the same prompt shape; `m-compare` keeps exact text for fixtures.
  A search over a tier-0 exact comparator is a fixture condition and is labelled
  so.
- The `template` envelope field appears only on capabilities that declare
  `acceptsTemplate: true` (`m-orient`), never uniformly.

Stop condition: tests 25–33 green; one `eddy-world` run with a search that ends
`found` on a real feed item and one that ends `not-detected-in-inspected-area`
or `budget-exhausted`, with coverage recorded; the found item's bid shows
`targetMatch` and the mind's frame shows the item, not a report.

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| B0.1 | `hands` role, `bidOwnerOf` by role | a `components/` substitute act owns its bidder; no tag test in production lookups |
| B0.2 | ids on `evaluation-commit`, `perceptDecision`, `acted` | present and additive; no text fields; Studio unchanged |
| B0.3 | outcome rule (`progress`) | terminal's started line is never evaluated; a same-type progress line is not either |
| B0.4 | rebinding admits; duplicate comparator fails at connect; `mind-sleeping` | test 13 rewritten; a second `m-compare` throws on connect; sleep aborts live cases by event |
| B0.5 | `EvidenceCase` extraction, `compareDeadline` | both owners call the runner; 34 tests unchanged and green |
| B0.6 | docs | the six documents in §2.8 updated; `bun run test` green |
| B1.1 | `m-expect-ledger`, lab gate | refuses to connect outside `stage="experimental"`; writes only to the run home |
| B1.2 | arms, harness, `summarize.mjs` | three runs per arm; metrics table; `doc/research/expect-study.md` §1 with the decision |
| B2.1 | `judgeCompare.js`, `livePredictionIndex.js`, `m-judge` | unit tests on prompt/parse; conformance: a mind with `m-judge` and no `m-compare` passes the 3A comparator tests with a stubbed `complete` |
| B2.2 | offline judge over B1 pairs | confusion matrix vs a blind reader; decision rule met or prompt revised |
| B2.3 | live judge condition | report §2: verdicts, attended fractions, cadence unchanged, belief-revision read |
| B3.1 | `perceive()`, `m-feed` migrated | equal-salience test open-gate vs eager; eager path byte-identical outside an aperture |
| B3.2 | `eddy-world` run | `doc/research/first-live-aperture.md`; receipts credit; perception unchanged |
| B4 | roadmap M5 + deltas | roadmap tests 17–24; orient-study report; one voluntary closure reversed by the reflex live |
| B5 | roadmap M6–M7 + deltas | roadmap tests 25–33; one live `found`, one honest non-absence outcome |

B0 is one series. B1, B2, B3 are each a series ending in a report and a stop.
B4 and B5 are separate series and separate reviews, as the roadmap already said.

## 9. Contract tests

**B0**

1. `bidOwnerOf` finds a `provides hands` owner and no longer matches by tag.
2. `evaluation-commit` carries `requestId` when the percept has one; `acted`
   carries `actId`/`predictionId` and stripped args only.
3. `perceptDecision` carries `candidateId` and `requestId`; no text field.
4. A `progress: true` consequence is stamped on the trusted record, survives to
   the evidence view, and yields no evaluation from either comparator; a coerced
   payload cannot set it.
5. Comparator removal mid-flight admits the percept with null prediction slots and
   publishes no settlement; a second `m-compare` throws on connect.
6. `mind-sleeping` aborts every live case in both owners; a late completion is
   inert.
7. `EvidenceCase`: budget reserved before comparison and released after; timeout
   zeroes evaluations and advances the lane; commit order per lane holds; every
   existing 3A wiring test passes unchanged.
8. `compareDeadline="8s"` is honoured; the default is 2 s.

**B1**

9. `m-expect-ledger` throws on connect in a mind without `stage="experimental"`.
10. It writes to `mindHome(…, 'predictions')/ledger.jsonl` only; nothing on
    `pub`, `fire`, memory, or the process log carries expectation or consequence
    text.
11. Both arms produce identical REALIZE schemas except for the `expect` property.

**B2**

12. `parseJudgeReply` maps the three tokens and confidence; garbage is
    `insufficient`.
13. `m-judge` returns `[]` for progress evidence, empty text, and unmatched
    `actId`/target; one `complete` call per evidence; abort → `insufficient`.
14. With `complete` stubbed, `m-judge` passes 3A tests 8–13 in place of
    `m-compare` (the seam claim).
15. Two comparators of either class in one membrane fail at connect.

**B3**

16. `perceive()` outside an aperture fires the same `InterruptRecord` `feel()`
    fires.
17. Under an `open` aperture at gain 1 with explicit `salience`, the bid salience
    equals the eager record's salience; the frame text is identical.
18. Under `closed`, the feed materializes nothing; the header is observed; no text
    appears anywhere.
19. An attended feed receipt reduces `contactPressure`; a refused or unattended
    candidate does not.

**B4, B5:** roadmap tests 17–24 and 25–33, unchanged, plus one test each for the
derived provider enum and for claim-at-execute.

## 10. Honesty and documentation

Per stage, when its code lands:

- **B0:** the six documents in §2.8. `perceptual-membrane.md` known-issues row 2
  gains "outcome rule" and row 5 stays open.
- **B1:** `doc/research/expect-study.md` §1; `research-index` entry; components.md
  entry for the ledger with its lab gate stated.
- **B2:** report §2; `prediction-mismatch.md` marks the act-bound mismatch row
  *run once, one lab mind, one weight setting*; components.md `m-judge` with its
  tier-2 declaration and the provider-call privacy note; `extending.md` uses the
  judge as its worked example of a replaced comparator.
- **B3:** `doc/research/first-live-aperture.md`; `perceptual-membrane.md` says one
  shipped sense is under aperture control and names the two that are not;
  `components.md` `m-sense` documents `perceive()`.
- **B4, B5:** as roadmap §10, plus `decoupling.md`'s role-port list gains
  `requestOrientation` and `search`.

Every report states what ran, on which model, for how long, and what it does not
show. None of them says prediction improves functioning.

## 11. Definition of done

- B0: `bun run test` green; behaviour identical with prediction off; docs updated.
- B1: three runs per arm; the metrics table; a written decision for B2.
- B2: offline agreement met; one live judge run reported; the comparator was
  replaced without a change to `mRegion.js`, `mAct.js` beyond `compareDeadline`,
  `mMind.js`, or `mMemory.js`. If that last clause fails, the seam claim fails and
  the report says so.
- B3: one shipped sense lazy under a live aperture; perception unchanged with the
  gate open; receipts credit; report written.
- B4, B5: roadmap §11 applied to each, plus their live stop conditions in §6, §7.

## 12. Judgment calls left to the implementer

State the choice in the commit message.

1. **`progress` transport.** A boolean on `InterruptRecord` and the evidence view
   is proposed. A type-suffix convention alone is not acceptable; a flag the
   comparator can read is.
2. **Ledger format.** JSON lines, one event per line, is proposed. Any format the
   analysis script reads is fine; text must not leave the run home.
3. **Judge model.** The ancestor `utilityModel` by default. Under `local-voice`
   that is the local model; note in the report which model judged.
4. **Judge subject kinds.** Prediction only in B2; `target` added in B5. Do not add
   `target` earlier.
5. **`perceive()` salience.** Reuse `feel()`'s computation exactly, including the
   jitter, so the equal-salience test can pass with explicit `salience` and the
   live numbers are the same distribution.
6. **Which senses migrate.** `m-feed` in B3. `m-weather` and `m-daylight` after
   the B3 report, one commit each, no new helper.
7. **Intent ledger.** Claim at execute (§6). If a run shows declined reaches
   re-firing every cadence, key by intent and capability instead; say which.
8. **No opportunistic efference redesign, still.** `progress`, lanes, and the
   derived orient enum are the limit of `m-act` work here.
