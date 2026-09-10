# Review: perceptual membrane phase 3A, and the decoupling migration

**Date:** 2026-09-10
**Reviewer:** Claude (Fable 5.1)
**Subject:** the [phase 3A plan](perceptual-membrane-phase-3a.md) as implemented in
`1188bad..eb4cfdb`, and the wiring migration in `d700364`, `3564072`, `765fd93`,
`5b2d49b`. Read against the [phase 3 roadmap](perceptual-membrane-phase-3.md), its
[review](perceptual-membrane-phase-3-review.md), `mAct.js`, `mRegion.js`,
`mCompare.js`, `mBid.js`, `bidderPolicy.js`, `exactTextCompare.js`,
`compareContinuation.js`, `evidenceView.js`, `predictionContracts.js`,
`enclosure.js`, `mTerminal.js`, `mSense.js`, and the shipped `.archml` files.

## Short verdict

3A does what its plan says and nothing it says it will not. The compatibility
promise is literal (tests 3, 15, 20; weights default to zero; `prediction` is off
unless written), the three evidence shapes reach one comparator, the demo runs
offline and shows all seven items, and the suite is green: 404 unit and 393
wiring tests.

The plan's own stop questions, however, are not answered, and two of them cannot
be answered by anything 3A built. That is the real finding of this review, and it
changes the roadmap more than any defect below:

1. **No live architecture has a sensory aperture.** Every `m-region` in
   `architecture/` and `architecture/lab/` is structural (`drift`, `world`); none
   carries `modality`. Eager senses still `feel()`. The membrane path that phases
   1–3 built has no live producer. The only live evidence a resident can compare is
   a hand's consequence.
2. **The reference comparator cannot see natural language.** `exactTextCompare.js`
   returns `insufficient` whenever either side has eight or more tokens. A realizer's
   `expect` and a hand's first-person `experience` will never be equal and will
   almost always be that long. On a live mind every prediction expires.

So orientation and search, built now, would be a second fixture-only proof, and
the one question 3A exists to raise (*is `expect` produced in a useful form?*) is
unobservable with the shipped comparator. Section 5 argues for what follows from
that: a cheap live measurement first, a declared semantic comparator second, the
first live aperture third, and only then 3B, split in two.

Environment note, because it cost the first run: `package.json` wants amanita
0.5.0 and a stale `node_modules` has 0.4.0, which fails 115 wiring tests with
`'!scope' is not a valid selector`. `bun install` fixes it. Worth one line in
`doc/troubleshooting.md`.

## 1. 3A against its plan

| Milestone | Claimed | Verified | Where |
|---|---|---|---|
| A0 terminal trust | deferred consequence is an `InterruptRecord`, urgency survives at the arbiter | yes | `mTerminal.js:273-283`; `act-terminal.test.js` asserts at the arbiter |
| A1 prediction + lineage | frozen `Prediction`, bounded `validUntil`, `actId` on transport records, journal prose unchanged | yes | `predictionContracts.js`; `mMemory.js` and `mMind.js` each gained one additive `actId` line |
| A2 envelope + ownership | opt-in `expect`, stripped before `execute` and `acted`, publish before execute, local claim of live consequences | yes | `mAct.js:400-517`, `619-690` |
| A3 comparison | mind-scoped singleton, view not record, busy narrowed to materialization, deadline, abort, per-source/per-act commit order, id-only commit | yes | `mRegion.js:231-367`, `compareContinuation.js` |
| A4 bidding + demo | owner-local `bidder`, extended signal set, zero defaults, invalid output refuses the bid | yes | `bidderPolicy.js`, `mBid.js`; demo steps 1–7 pass |

The review-driven decisions all landed as recorded: seam (a), envelope opt-in,
`template` absent (it is out of 3A scope entirely), events not topics, live-record
caps (32 acts, 32 predictions), `causalAttribution: null`, stripped `acted.args`.

**The four stop questions.**

| Question | Answer today |
|---|---|
| 1. Did the seams need edits outside producers, contracts, bidding? | No. Outside those: `mMemory.js` +1, `mMind.js` +1 (lineage on the typed index and receipt), `enclosure.js` (`bidOwnerOf`), `mTerminal.js` (a hand, plus the trust fix). |
| 2. Did async comparison affect unrelated cadence? | Only demo-proven (step 5). No live run. One detail: the compare deadline is taken before materialization (`mRegion.js:239`), so a slow renderer eats the comparator's two seconds. |
| 3. Is `expect` reliably produced in a useful form? | Unanswerable by construction (finding 2 above) and unattempted live. |
| 4. Which findings justify orientation or search? | None yet. Nothing has run live, and nothing live can be oriented (finding 1). |

## 2. Defects and gaps

Ordered by what they would cost later.

**F1. `bidOwnerOf` is tag-bound.** `enclosure.js:202` returns the owner when
`providesOf(cur, 'aperture') || cur.localName === 'm-act'`. `MAct` declares no
`static provides`. A `components/` substitute for the hands would not own its
bidder, which is exactly the substitution failure `d700364` removed everywhere
else the same day. Fix: give `MAct` a role (`hands`, or `actor`) and look the owner
up by role.

**F2. The ids 3B needs were dropped with M1.** The roadmap's M1 put `candidateId`
and `requestId` on `perceptDecision`, a transient `control-result`, and a
`mind-sleeping` event. 3A, correctly, built none of them because nothing consumed
them. But the one channel 3A did build for consumers, `evaluation-commit`, carries
`evidenceId`, `actId`, `predictionId` and **no `requestId`**
(`predictionContracts.js`, `evaluationCommitPayload`). A search controller keys
attempts by request id (roadmap §6). Add `requestId` now; it is additive and the
producers already hold it. The other three stay 3B-M0.

**F3. Outcome versus progress is not a declared rule.** The terminal's *started*
line escapes comparison only because its type is `Sense-terminal-start` while the
default prediction target is `Sense-terminal` (`mTerminal.js:265`,
`mAct.js:939-942`). A future deferred hand whose progress line shares the outcome
type would have its progress judged as the outcome, and under a semantic
comparator that is a manufactured mismatch. Before any comparator that can read
prose, a hand must mark which consequence is the outcome (a flag on the returned
consequence, or a target rule that excludes a declared progress type).

**F4. Comparator removal drops admissible evidence.** If the comparator is unbound
or rebound between materialization and commit, both owners `return` without a bid
(`mRegion.js:305`, `mAct.js:663`). The roadmap says both "rebinding aborts cases
created under the old binding" and "optional interpretation must not become
backpressure that silences otherwise admissible evidence". The implementation
picked the first. Timeout already does the honest thing, admit with
`evaluations = []`; rebinding should match it.

**F5. Two copies of the evidence-case machinery.** `mAct.js:619-690` and
`mRegion.js:231-367` each implement claim, budget, deadline, abort, ordered
commit, revalidate, dispatch. The shared pieces (`CompareBudget`, `CommitOrder`,
`awaitUntilAbort`) are extracted; the choreography is not. A third evidence owner
(an eager sense migrated under an aperture, an ear) would copy it a third time.
Extract an `EvidenceCase` runner with owner hooks for *revalidate* and *commit*.
The 34 wiring tests in `act-prediction` and `membrane-compare` are the guard.

**F6. The documentation pass is half done.** The roadmap's §10 lists five docs.
`perceptual-membrane.md` was updated honestly. `components.md` does not mention
`m-compare`, `m-bid`, `prediction="on"`, or `predictionTarget`; `extending.md` has
no comparator/bidder replacement recipe; `efference.md` does not mention the
envelope or `actId`; and `prediction-mismatch.md`'s known-issues row still reads
"Act ids, prediction records, expiry, and observation association are not
implemented." That last line is now false in the repo's own design doc.

**F7. Smaller.**
- A duplicate comparator throws inside `_liveComparator()` at evaluation time, not
  at connect as the roadmap says. In `m-region` that rejects the offer promise and
  the sense logs "quiet"; in `m-act` it is an unhandled listener error. Either way
  comparison silently stops instead of failing loud once.
- `predictionSignalsFromEvaluations` is last-wins across several predictions on
  the same act. Fine at one prediction per act, undocumented beyond that.
- `mind-sleeping` is polled as `membrane()._sleeping` rather than fired.
- `bidRefusal` is a new retained topic and appears in no doc.

## 3. What the decoupling migration changed

`d700364` did more than swap ref strings. After it, the codebase has **three
wiring kinds**, and the decoupling doc names only two:

| Kind | Mechanism | Examples |
|---|---|---|
| Topic | `pub()` + `sub(*Src)` with `!scope/<slot>` defaults | `tail`, `compressed`, `arousal` |
| Event | `fire()` + `@event` ref or a standing bubbling listener | `spoken`, `acted`, `capability`, `prediction`, `evaluation-commit` |
| **Role port** | a method called on a component resolved by role via `part()` | `regulator`, `aggregator`, `comparator`, `bidder` |

The third kind is request/response, which pub/sub cannot express, and 3A added two
of them. Its rules are consistent and worth writing down once: resolved by role
not tag, singleton per owner, duplicate fails at connect, port shape validated
before use, `whenDefined` for same-batch customs, disconnect invalidates in-flight
work. That settles the roadmap's §12.1 (comparator binding syntax) in favour of
the role port, and `m-compare` subscribing to membrane events with a standing
listener is the same pattern the hands' `capability` fan-in already uses.

Two consequences for 3B. First, the slot convention (`hands`, `attention`,
`memory`, `voice`) plus `part(mind, 'aperture')` means `m-orient`'s closed enum of
provider names can be derived at connect rather than authored twice. Second,
`bidOwnerOf` (F1) is the one place the migration's own principle is broken.

`765fd93` and `5b2d49b` (landing opener switch, bridge docs) are orthogonal to the
membrane and correct as far as I read them.

## 4. What we learnt that changes the roadmap

**L1. The act path is the live path; the membrane path is fixture-only.** The
phase-3 review's finding 1 ("the evidence it most wants to compare never passes
through the comparison point") was treated as an edge case to be closed. It was
the whole live surface. No resident or lab mind has a `modality` region, and
`m-feed`, `m-weather`, `m-daylight` still `feel()` eagerly; only the `candidate()`
path is aperture-governed (`mSense.js:97-106`). The roadmap's centre of gravity
(orientation over apertures, search over routes and sources) therefore has no
subject in any mind that thinks. This is not a defect of 3A. It is a fact about
where the project stands that the roadmap does not state.

**L2. Semantic comparison is on the critical path, not optional.** The roadmap
lists an LLM text judge as an optional phase-4 condition. Every behavioural
question 3A raises (Q3), and every search outcome other than `abandoned`, depends
on a comparator that can read prose. The cost is bounded and small: one utility
call per piece of evidence carrying a *live* prediction, which is a handful per
hour at act cadence. The contracts already anticipate it: `Evaluation.confidence`
exists and the bidder uses it as signal strength. What is missing is only a
declared tier-2 comparator behind the existing port.

**L3. Orientation and search are separable and differently blocked.** Orientation
needs a live aperture and a hand; it needs no comparison, and it is the first
voluntary closer, so it is where the open–close oscillation and the grace-period
question become observable. Search needs a comparator that can say `found`, so it
is blocked on L2. The roadmap bundles them because both use control interfaces;
they should be sequenced separately.

**L4. "Evidence owner" is a role.** Two components now play it with duplicated
choreography (F5). Anything that brings a third owner should find a shared runner
waiting, not a third copy.

**L5. The prediction target needs an outcome rule** (F3) before L2 is acted on.

**L6. The stop questions are answerable cheaply, and only live.** With
`prediction="on"` and an `m-compare` but no `m-bid`, a lab mind's behaviour is
unchanged except that the realizer sees an optional `expect` field, which is
precisely the perturbation the phase-3 review worried about and which therefore
needs a control arm. Everything else is logging.

## 5. How to continue

Recommended order. Each step is small and each answers something the next
depends on.

**Step 0. Housekeeping, about a day.** F1 (role for `m-act`), F2 (`requestId` on
`evaluation-commit`; `candidateId` and `requestId` on `perceptDecision`), F4
(admit on rebinding), F6 (four docs), F7 (duplicate at connect), and the F5
extraction under the existing tests. None of this changes behaviour with
prediction off.

**Step 1. Live `expect` study, no new mechanism.** Clone `lemma-lab` (the mind
with the richest hand use) into a lab architecture with `prediction="on"` and
`m-compare`, no `m-bid`. Add private backstage logging of each prediction, its
settlement, and the paired consequence text to the run directory, never to
memory, Studio content, or the frame. Run a control arm with prediction off.
Pre-register: `expect` fill rate, length and shape; how often the outcome
consequence arrives inside the horizon; hand-choice distribution against the
control; comparator verdict distribution (expected to be almost all
`insufficient`, which is the measurement, not a failure); act and sense cadence
against the control (Q2). A few runs of a few hours each on the local model.

**Step 2. Comparator v2, a declared tier-2 judge.** `m-judge`: a utility-model
comparator behind the same `comparator` port, returning match, mismatch, or
insufficient with confidence. First run it *offline* over the logged pairs from
step 1, which costs nothing live and is also the first real test of 3A's stop
criterion, that a comparator can be replaced without touching evidence, frame, or
memory. Then run it live in the lab with `m-bid` at small weights: that is the
"act-bound mismatch" row of the experiment matrix, finally runnable. A zero-cost
containment comparator (a short expected phrase found in the evidence gives
match, absence gives insufficient, never mismatch) is a cheap second condition.

**Step 3. The first live aperture.** Put eddy's `world` region under
`modality="text"` and migrate `m-feed` from `feel()` to `candidate()`, the
per-sense migration the roadmap already lists. Now orientation and search have a
subject, and the receipt-only contact credit and the reflex run against real
feeds.

**Step 4. 3B-orient.** `m-orient`, the generic lane map, dwell arbitration,
oscillation observability, tests 17–24. Decide the grace period after watching
step 3's dynamics, as the roadmap intended.

**Step 5. 3B-search.** With `control-result`, the attempt state machine, and the
judge supplying `targetMatch`. Tests 25–33.

**Why not 3B now.** Three reasons. Built today it is a second fixture-only proof:
no live aperture to orient, no comparator that can find. The stop questions are
cheap to answer and their answers shape 3B: what a search `template` should look
like depends on what a realizer's `expect` actually looks like, which nobody has
seen. And it is the roadmap's own stop condition. I considered starting 3B-orient
with a fixture in parallel and rejected it: the questions orientation raises
(oscillation, grace, the `felt` line's effect on the stream) are also only
observable live, so it waits on step 3 either way.

## 6. Edits to the roadmap

**Disposition, 2026-09-10.** Items 1–3 are applied as a status paragraph at the
top of the roadmap pointing to the [phase 3B plan](perceptual-membrane-phase-3b.md),
which carries items 4–8 as stage B0 work (§2.2, §2.3, §2.4, §2.8 there). The
roadmap's §2.3, §5, §6 body text is left as the orient/search specification.

| # | Section | Change |
|---|---|---|
| 1 | §1 | State L1: no live sensory aperture exists; 3B needs step 3 before it has a subject |
| 2 | §1, §4.1 | Promote the semantic comparator from optional phase-4 condition to a prerequisite of any behavioural claim, with its bounded cost |
| 3 | §7 | Split 3B into 3B-orient (M5) and 3B-search (M6–M7) with separate stop conditions; insert the live `expect` study and comparator v2 before both |
| 4 | §2.1 | Add the outcome rule for consequence targets (F3) |
| 5 | §2.2, §6 | Note `requestId` on `evaluation-commit` and the ids on `perceptDecision` as 3B-M0 |
| 6 | §12.1 | Record the role-port decision and its rules; point `decoupling.md` at them |
| 7 | §4.1 | Rebinding admits without evaluations, like timeout (F4) |
| 8 | §10 | List the four docs still owed by 3A (F6) |
