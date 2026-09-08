# Perceptual membrane — Phase 3 implementation plan: prediction, orientation, and search

**Status: proposed, 2026-09-07; revised after
[review](perceptual-membrane-phase-3-review.md), then revised 2026-09-08 to make
the temporal model explicit.** Realizes step 3 of the
[perceptual membrane](../architecture/perceptual-membrane.md#proposed-development-order):

> *Assemble the existing deficit/reflex and inexpensive act-bound prediction as
> the first reference architecture. Add `orient` and bounded search through
> declared control interfaces; retain uncertainty in search outcomes.*

Sibling of the [phase 1 plan](perceptual-membrane-phase-1.md), which established
the contracts, and the [phase 2 plan](perceptual-membrane-phase-2.md), which made
the membrane compose. Phase 3 gives the open seams their first producers and
controllers. It adds the search controller and the `orient` hand to known-issues
row 5 — leaving that row's cadence-control gap open — and a real producer to row
2; it deliberately leaves processing tiers 1–2 (row 6) open.

**Implementation is split.** The focused
[phase 3A plan](perceptual-membrane-phase-3a.md) lands prediction, comparison,
and bidding first, then stops for review. Orientation and search remain the
phase 3B direction in this roadmap; they do not belong on the 3A implementation
branch.

The constraining companions are
[prediction, mismatch, and top-down search](../improvements/prediction-mismatch.md)
(responsibilities, uncertainty, and experiment conditions),
[efference](../architecture/efference.md) (the current `m-act` contract),
[efference redesigned](../improvements/efference-redesign.md) (a separate,
still-pending direction that this phase must not accidentally adopt),
[port contracts](../improvements/schema-guided-connections.md) (the eventual
declarative form of these bindings), and
[enclosure by role](../improvements/enclosure-by-role.md) (role lookup and
composed authority).

Read this one as: *an expectation is not an observation, looking is not finding,
and failing to find is not proof of absence.*

## 1. What this phase is

Phases 1 and 2 left six deliberate holes:

1. `Evaluation` exists, but nothing produces one.
2. `AttentionBid` has independent signal storage, but only sensory change and
   acquisition lineage are populated; no prediction or target relevance exists.
3. `m-act` has no act identity or execution envelope. A realizer cannot state an
   expectation before execution without teaching every hand a private argument.
4. `focus` is delivered to sources but changes no policy and has no owner.
5. `MRegion.orient()` exists for the deterministic reflex and direct callers, but
   the mind has no `orient` hand, no controller-facing orientation message, and no
   separate control cooldown lane.
6. **Evidence reaches attention by two paths, and only one of them has a seam.**
   A membrane percept travels `m-region`'s offer path; a hand's consequence is
   fired straight at the arbiter (`mAct.js`, `mTerminal.js`) and coerced by
   `AttentionBid.from` with default signals. Phase 2 built the bidding seam on
   the first path only, because it was the only producer that existed then.

The first reference architecture fills those holes with one inexpensive,
replaceable path:

```text
REALIZE supplies optional expect (and template, where a hand accepts one)
  → m-act publishes a typed prediction before execution

evidence, by either path, before its bid is built
  → a tier-0 comparator evaluates identified text evidence against live
    predictions and search targets
  → a replaceable bidder derives independent match/mismatch/target signals
  → composed awareness (membrane path) and the existing arbiters decide what
    reaches the frame

orient hand
  → typed orientation request to an aperture provider
  → optional bounded search target
  → focus/sample requests through the existing nested control path
  → found / not-detected-in-inspected-area / exhausted / abandoned
```

**The producer of the evidence consults the comparator and builds the bid.**
That is already true of `m-region`; this phase makes it true of `m-act`, which is
the one component holding the prediction, the `actId`, and an already-`await`ed
`execute`. The alternative — comparing inside `m-interrupts` — would make the
arbiter's listener asynchronous, and `_onRequest` is synchronous on purpose
([decoupling](../architecture/decoupling.md)); it also stops propagation for a
nested region, which an `await` would reorder.
The comparator itself is one mind-level role with two callers, not two seams.

### Synchronous claim, asynchronous work, synchronous commit

The synchronous part of this design is deliberately small. DOM
`dispatchEvent()` invokes listeners in the current call stack, so a nested owner
must call `stopPropagation()` before returning if it is to claim an event
reliably. An `await` inside `m-interrupts._onRequest` would return control to DOM
dispatch first; a later stop would be too late. This is an atomic routing rule,
not a requirement that perception, action, or minds run in lockstep.

Every evidence path therefore has three stages:

1. **Claim and snapshot synchronously.** The nearest owner claims the event,
   records ids, scope, gate versions, lineage, and a cancellation generation.
2. **Work asynchronously.** Materialization and comparison may finish on their
   own clocks, under per-owner concurrency caps, deadlines, and an `AbortSignal`.
   No global barrier waits for them and no source remains `busy` merely because a
   comparator is thinking.
3. **Commit synchronously.** The owner re-checks attachment, sleep, scope,
   deadline, and gate versions, builds one bid, and dispatches it to the existing
   synchronous arbiter. A stale continuation has no effect.

Lifecycle cancellation is an explicit protocol, not only a final boolean check.
Evidence owners increment a generation and abort their live cases on disconnect,
scope/binding change, or a new `mind-sleeping` event fired when the mind begins
sleep. Comparator rebinding aborts cases created under the old binding. Abort is
best-effort for external work; the generation tombstone is authoritative and
makes every late completion inert.

Ordering is causal, not globally total. `actId`, `requestId`, prediction id, and
evidence id establish which work answers which prior event; timestamps say when
each stage occurred. Two evidence cases may complete comparison in the opposite
order from their occurrence. A small owner-local sequencer commits them in order
for the same source, the consequences of the same act, or the attempts of the
same search target; unrelated sources and owners remain independent. Phase 3
does not make every source or mind share a clock.

Likewise, “simultaneous orientation requests” below means requests whose validity
windows overlap. JavaScript will still observe one first. First-accepted is an
arrival-order policy under dwell/version, not a claim of physical simultaneity.

The existing `Aperture` deficit/reflex and pressure aggregation are not rewritten.
The reference ArchML assembles them with the new predictor, comparator, bidder,
orientation hand, and search controller. Omitting every new component leaves the
phase-2 behavior exactly intact.

### In scope

1. **Prediction and search contracts** — frozen `Prediction`, `PredictionSettlement`,
   `ActEnvelope`, `ComparableEvidence`, `SearchTarget`, `SearchAttempt`,
   `SearchOutcome`, and `OrientationRequest` records with identity, scope,
   lifetime, and honest terminal states.
2. **An opt-in REALIZE envelope** — optional `expect` (and `template`, on hands
   that declare they accept one) added to the tool schemas assembled by `m-act`,
   stripped before a hand executes. Off unless the architecture asks for it, so
   no existing mind's realize request changes shape.
3. **Act lineage** — one `actId` created before execution and preserved through
   predictions, deeds, immediate/deferred consequences, orientation-triggered
   samples, percepts, and receipts.
4. **A prediction producer** — `m-act` publishes an expectation before the hand can
   cause a consequence. No extra model call.
5. **A comparator port and reference comparator** — identified tier-0 evidence may
   be evaluated against active predictions and search targets before its bid is
   built, and on the membrane path before awareness. Evaluations refer by id and
   never rewrite evidence.
6. **A replaceable bidder port** — prediction mismatch, prediction match, target
   match, requested lineage, novelty, and sensory change remain separate inputs.
7. **The `orient` hand** — an ordinary current-generation capability with a higher
   intent threshold and a separate control cooldown lane, addressing aperture
   providers by role and name.
8. **A bounded tier-0 search controller** — one active target, explicit source
   routes, sample/deadline budgets, distinct coverage, and uncertainty-preserving
   outcomes.
9. **The reference assembly and offline demonstration** — exact text comparison
   over a deterministic, viewpoint-bounded simulated source; no model call and no
   hidden world-state oracle.

### Out of scope (and which phase owns it)

| Not now | Owner |
|---|---|
| Tier-1 grounding, `EdgeEvidence` production, tier-2 description, edge retention | Phase 4's lean-vs-edge-grounded experiment, then a separate implementation plan |
| Native image/audio/video renditions or model capability selection | membrane phase 5 |
| Studio timelines and behavioral dashboards | membrane phase 6 |
| Passive, learned, temporal, or exact-simulator predictors | phase 4 experiments |
| An LLM text judge | optional phase 4 comparator condition |
| Automatic port discovery, connection, or growth | port-contract work |
| Full `membrane()` / `part()` / ref migration outside touched sites | enclosure-by-role phase 1 |
| Migrating eager `feel()` senses under aperture control | separate, per sense |
| Act-writing, grasp, manual mode, skills, forged-receipt handling | efference-redesign phases 0–4, if adopted |
| Native spatial search or claims of verified absence | a concrete world/sense experiment |
| Live resident tuning | a later lifecycle-governed study |

This phase uses the current `m-act` wish → REALIZE → hand path. Adding an `orient`
hand is not permission to implement the pending efference redesign inside this
series.

### The compatibility promise

- With no predictor, comparator, bidder, search controller, or orient hand wired,
  every existing architecture produces the same bids, frames, deeds, consequences,
  and journal text as phase 2.
- The envelope is **off unless declared**, so the tool schemas `m-act` sends to a
  realizer are byte-for-byte what they are today for every existing architecture.
  This is the promise the uniform-injection design could not make: adding two
  properties to every tool changes the request a live resident's realizer sees,
  and therefore can change which hand it picks and how it fills the arguments.
  Stripping the fields afterwards does not undo that.
- Where the envelope is declared, `expect` and `template` are never passed to
  `cap.execute(args)`, never reach `acted.args`, and do not mutate a hand's
  declared schema.
- Existing hand arguments, `renderForFrame()` output, the conscious prefill, and
  the `decision` / Studio payloads stay byte-for-byte compatible except for
  explicitly additive non-content ids.
- All new policy weights default to zero. Phase 3 provides a configured reference
  condition; it does not silently retune production architectures.
- Prediction text, search templates, and materialized evidence before awareness do
  not enter logs, Studio events, candidate events, memory, or the conscious frame.
- `bun run test` stays green and the phase-1/phase-2 membrane demos remain unchanged.

## 2. Contracts and ownership

`perceptionContracts.js` is already large and its current records are stable.
Put the new records in `src/infrastructure/predictionContracts.js`; import the
existing `Evaluation` rather than moving it during this phase.

### 2.1 Act envelope and prediction

```js
ActEnvelope {
  actId,
  expect: string | null,
  template: string | null,
  createdAt
}

Prediction {
  id,
  producer,
  scopeId,
  actId,
  kind: 'belief' | 'actuator',
  target: { sourceId?, modality?, eventType? },
  representation: { kind: 'text', value },
  basis: { kind: 'realize', text },
  basisAt,
  validFrom,
  validUntil,
  status: 'active'
}

PredictionSettlement {
  predictionId,
  status: 'matched' | 'mismatched' | 'expired' | 'cancelled',
  evaluationIds,
  settledAt,
  reason
}
```

Rules:

- `actId`, prediction id, and times are substrate-owned. A model may supply only
  the expectation text and optional search template.
- `basisAt` and publication occur before `cap.execute`. Evaluation cannot revise
  the prior after seeing the consequence.
- The first representation is text. Unknown representations produce
  `insufficient`, never an implicit string comparison.
- REALIZE produces a **belief** prediction from what the mind knows. A future
  exact simulator/actuator model must declare `kind: 'actuator'`; it cannot be
  substituted silently as the mind's remembered expectation.
- `scopeId` is the owning membrane's stable name. A prediction never crosses into
  a society sibling.
- `validUntil` is required and bounded by the producer's configured horizon.
  Expiry, execution failure, cancellation, sleep, detachment, and scope change
  settle the prediction. A missing consequence is not a mismatch without adequate
  observation coverage.
- `actId` is association, not causal proof. It links the command envelope to its
  declared consequences; it does not claim the act caused every change in an
  answering observation.

`ControlRequest`, `PerceptCandidate`, `InterruptRecord`, `Percept`, and
`PerceptReceipt` gain an optional `actId` sibling to `requestId`. Frame and journal
rendering do not include it in prose. Typed percept index entries may record it as
additive lineage. The terminal's deferred path must pass the same id it received
in `execute(args, ctx)` rather than minting one when the result arrives.

`actId` is trusted lineage, so it travels the same way powers do: only from an
in-process record, never from a coerced payload. `mTerminal._dispatch` currently
fires a **plain object**, which `Percept.fromInterrupt` treats as untrusted —
it already strips that consequence's `urgent` and `clearsTail` today, silently,
and it would strip an `actId` for the same reason. Fixing it (construct an
`InterruptRecord`) is M1 work, not a later cleanup; see §7.

Predictions, settlements, attempts, and outcomes are **events**, not retained
topics: `fire()` / `@event`, the convention `m-act` already follows for `acted`.
A retained topic would replay the last prediction to a comparator that connects
afterwards, which contradicts this phase's own rule that late or cancelled work
cannot become fresh evidence.

`Prediction` stays immutable and active; completion is a separate
`PredictionSettlement`, just as an evaluation is separate from evidence. The
producer publishes settlement only after a matching/mismatching evaluation batch
survives ordered commit. The prediction owner expires it at its horizon and leaves
`insufficient` active until then.

### 2.2 Search records

```js
SearchTarget {
  id,
  owner,
  scopeId,
  actId?,
  template,
  routes: [{ aperture, source }],
  sampleBudget,
  deadline,
  createdAt
}

SearchAttempt {
  id,                 // also the ControlRequest id
  targetId,
  actId?,
  route: { aperture, source },
  ordinal,
  issuedAt,
  deadline
}

SearchOutcome {
  id,
  targetId,
  status: 'found' | 'not-detected-in-inspected-area' | 'budget-exhausted' | 'abandoned',
  evidenceIds,
  evaluationIds,
  inspectedRoutes,
  attemptedSamples,
  coverage,
  settledAt,
  reason
}
```

The target says what matters; it does not say the target exists. An attempt maps a
control-request id to the target and route so later evidence can be associated
without putting a semantic template in the candidate header. An outcome is
internally derived, never a `Sense-*` percept.

Coverage in the first reference controller is structural: distinct completed
routes divided by declared routes. Repeating the same source does not increase it.
`not-detected-in-inspected-area` means every declared route produced comparable
evidence and none matched. A deadline, refused acquisition, detached source,
missing materialization, or exhausted budget yields `budget-exhausted` or
`abandoned`, not absence.

**What counts as this attempt's evidence.** A candidate's `requestId` is stamped
from the source's armed control (`mRegion._armControl`), so *any* candidate a
source emits inside the arming window inherits the attempt's id — including a
spontaneous one that never answered the request. The first controller therefore
lets **only the first candidate carrying an attempt's id** determine that
attempt's evidence state and records `attemptedSamples` separately from
`coverage`. Only a comparable match/nonmatch advances coverage. This is a real
limitation and it belongs next to the outcome, not in a footnote: a route may
still be marked inspected on the strength of an observation that arrived for its
own reasons. The honest repair is an explicit "answering request X"
acknowledgment in the source contract, which is a change to `MSense.onSense` and
belongs to the tier-1 work, not here.

`perceptDecision` gains `candidateId` and `requestId` for Studio-compatible
telemetry, but search does not use that retained topic as a command channel.
`m-region` also fires a transient, id-only `control-result` event for a requested
candidate's acquisition refusal or acceptance. Without that event a controller
cannot tell a refused route from a slow one and must spend a full deadline on
every closed route before its coverage can advance. This is the one result
protocol phase 1 would have been cheaper to add.

### 2.3 Orientation request

Orientation is provider control, not source acquisition, so do not overload
`ControlRequest.kind`:

```js
OrientationRequest {
  id,
  issuedBy,
  actId?,             // when a hand issued it; forwarded to the transition's sample
  aperture,           // stable provider name
  state,              // open | soft | narrow | closed
  source?,
  reason,
  issuedAt,
  deadline?
}
```

An accepted transition asks its sources for the present (`MRegion._transition`).
That `ControlRequest` carries the originating `actId`, so the observation which
answers a deliberate look is linked to the act that caused the look — and an
`expect` on an orient call can actually settle. Without this forwarding the
orient hand's prediction could only ever expire, since the transition's sample is
minted inside the provider with no lineage at all. It remains acquisition
lineage: looking caused the sample, not what the sample happens to contain.

An orientation carrying `expect` must resolve to one declared source. Its trusted
prediction target is derived from the validated closed-enum `source` argument and
the provider's architecture-owned route metadata, not from expectation text. An
untargeted orientation may still change a provider, but it cannot publish a
one-evidence prediction that whichever source answers first is allowed to settle.

Every aperture provider exposes `requestOrientation(request) → boolean` and
forwards an unmatched request to registered child providers. Provider names are
already unique within a membrane. The selected provider calls its existing
`orient`; it cannot grant bypass powers, clear deficit, or mark contact.

The reference arbitration for overlapping requests is deterministic
first-observed/first-accepted: provider dwell/version policy accepts one
transition and refuses later arrivals until dwell permits another. Reflex and
voluntary requests use the same policy. Every accepted transition keeps the existing backstage
`aperture-change` record with its issuer/reason; refusals are non-semantic
telemetry.

## 3. The REALIZE envelope and act-bound producer

`MAct._realize()` currently builds each tool directly from the hand's schema.
Build an augmented copy instead, **when the architecture declares the envelope**
(an attribute on `m-act`, default off):

```js
properties: {
  ...cap.parameters.properties,
  expect:   { type: 'string', description: 'the consequence expected from this act' },
  // only for a capability that registers acceptsTemplate: true
  template: { type: 'string', description: 'what this orientation should look for' }
}
```

`template` is per-capability, not uniform. On `m-note` or `m-terminal` it names
nothing the hand can do: it would spend prompt tokens on every realize call and
invite the realizer to invent a value for a field no one reads. The prediction
design's *uniform envelope* means uniform across the hands that have it, not
present on every hand by default.

Neither property is added to `cap.parameters`. `_execute` validates the augmented
shape, removes the two fields, validates the remaining object against the original
hand schema, creates `actId`, and calls:

```js
cap.execute(handArgs, {
  intent: decision.gist,
  actId,
  predictionId,
  template
})
```

If `expect` is non-empty, construct and publish `Prediction` before that call.
The target derives from trusted capability metadata (`consequenceType`,
`sourceId`, and modality), not from model text. Existing hands receive defaults
matching their current `Sense-${name}` consequence. A hand may declare a narrower
target as registration metadata; it may not supply prediction authority in its
output.

Note which namespace that default lives in. A hand's consequence is
`Sense-${capabilityName}`; a membrane percept is `Sense-${sourceName}`. They
coincide only by accidental collision, so a default target is matched on the act
path against the consequence `m-act` itself produces — not against sensory
evidence that happens to be named similarly. A prediction meant for a *sense*
declares that source explicitly.

Add `actId` and `predictionId` to the backstage `acted` payload. Its `args` are
the **stripped** `handArgs` — `acted` reaches Studio, and `expect` sitting in it
would be exactly the expectation text §1 promises never appears there. The two
ids are the record; the text is not.

Immediate consequences get `actId` when `m-act` constructs their `InterruptRecord`.
Deferred hands receive the id in context and must return it on their later
`interrupt-request`. Execution failure publishes a non-semantic settlement for
the prediction. A hand that returns no evidence leaves the prediction active only
until its horizon; expiry alone creates no mismatch.

The producer fires the frozen record to the explicitly bound comparator. It is not
retained into memory or mirrored into the conscious identity.

**`m-act` owns the bid for every consequence of one of its acts, including a
deferred one.** With the envelope enabled, it installs a local
`interrupt-request` listener. A trusted consequence carrying one of its live
`actId`s is claimed with `stopPropagation()` synchronously, then continued
through comparison and bidding asynchronously before `m-act` redispatches the
finished bid from its parent. An `AttentionBid` passes through untouched, so the
continuation cannot catch itself.

This local interposition covers both cases:

- after `cap.execute` returns an immediate experience, `_execute` fires the
  trusted `InterruptRecord` as today and the local listener claims it;
- a deferred hand fires its later trusted `InterruptRecord` from the hand, with
  the `actId` received in execution context, and the same listener claims it as
  it bubbles through `m-act`.

Without this rule the terminal's slow result would still bypass the comparator
even after the immediate path was repaired. `mTerminal._dispatch` therefore
constructs an `InterruptRecord`, rather than a plain object, and preserves the
execution `actId`. With the envelope disabled, `m-act` does not interpose and the
event follows the phase-2 path unchanged (apart from the terminal trust bug fix).

This is the seam hole 6 names, and `m-act` is where it costs least: the arbiter's
listener stays synchronous, immediate and deferred consequences share one local
owner, the percept id stays stable through to the receipt, and the component that
holds the prediction and `actId` is the one that does the matching.

The act adapter is exact, not implicit. It converts the trusted
`InterruptRecord` once through `Percept.fromInterrupt`, derives
`ComparableEvidence` from that percept's archival text rendition, and builds the
eventual bid over the same `Percept` object and id. Its `sourceId`, provenance,
policy powers, modality, tier, and empty gate trail therefore come from the
existing compatibility mapping rather than a second ad hoc constructor.

The trusted-adapter rule still holds: `m-act` does not read a payload for
identity or policy. The consequence's provenance and powers come from the same
`legacyCompatibility` mapping that governs it today (`External`, unspecified,
powers from the hand's own trusted `urgent`), so nothing about how a consequence
is classified changes — only where its bid is assembled.

## 4. Comparison and bidding

### 4.1 Comparison point

The tier-0 order on the membrane path becomes:

```text
acquisition gates
  → text materialization
  → construct frozen ComparableEvidence privately
  → invoke the bound comparator service (bounded by a deadline)
  → re-check attachment, sleep, and every aperture version
  → awareness gates
  → construct the frozen Percept with both gate verdicts and the same evidence id
  → build AttentionBid through the selected bidder
  → interrupt-request
```

and on the act path:

```text
cap.execute returns an experience
  → construct frozen ComparableEvidence privately (actId lineage, no aperture)
  → invoke the bound comparator service (bounded by a deadline)
  → build AttentionBid through the selected bidder
  → interrupt-request
```

A consequence has no aperture and therefore no gates: it is the mind's own reach
answering, not a channel it can close. That asymmetry is the point of naming both
paths rather than pretending there is one.

**Comparison does not run inside the source's busy window.** Today
`entry.busy = true` spans the whole offer path. Phase 3 narrows it to
materialization: once immutable `ComparableEvidence` exists, the source slot is
released and a private evidence case continues independently. A slow comparator
can delay that evidence's bid, but it cannot refuse the source's next candidate
as `busy` or wedge the source permanently.

Each producer caps in-flight evidence cases and assigns an owner-local sequence
before materialization. Capacity is decided before private text is produced. If
the comparison cap is already full, comparison is skipped for that case and the
ordinary baseline path may proceed with no match/mismatch signal; unnecessary
private text is never retained merely to wait for comparator capacity. Optional
interpretation must not become backpressure that silences otherwise admissible
evidence.

The comparator receives `{ now, deadline, signal }`; deadline or cancellation
aborts cooperatively, tombstones the case, and ignores late resolution by
generation/id. Expiry yields `insufficient` plus a non-content diagnostic and
advances the local commit sequence. Completed cases wait only for earlier cases
from the same owner; a deadline prevents one case from blocking that local lane
forever. Awareness, bid construction, and dispatch happen exactly once in this
ordered commit continuation.

`m-region` and `m-act` both discover the one top-level provider of `comparator`
in their membrane. Evidence judgment is mind-level, not per-aperture, and two
producers consulting one service is not two seams. Phase 3 does **not** support
competing comparators: doing so would require a separate aggregation/settlement
owner. A duplicate comparator fails at connect.

The comparator must implement:

```js
accepts(comparableEvidence) → boolean
evaluate(comparableEvidence, { now, deadline, signal }) → Evaluation[] | Promise<Evaluation[]>
```

Comparison may be asynchronous, so attachment, sleep, deadline, and every recorded
gate version are checked again afterward. A malformed comparator result fails that
comparison closed (no match/mismatch signal, plus a non-content diagnostic); it
does not suppress an otherwise valid baseline bid or convert private evidence into
an admitted percept. Cap the number of evaluations per percept.

Evaluation is side-effect-free. The comparator may index live predictions and
attempts, but `evaluate` cannot settle either one. After the producer's ordered
continuation revalidates the case, the producer commits the accepted evaluation
batch exactly once: it publishes any `PredictionSettlement`, emits an id-only
`evaluation-commit` event, and builds the bid. Timeout or invalidation therefore
cannot leave a prediction settled by work whose evidence was later refused.
`evaluation-commit` contains only case id, request/act id, evidence id, and frozen
`Evaluation` records — never `ComparableEvidence` text.

`ComparableEvidence` is a private frozen view containing the candidate id, trusted
source/provenance/tier, request/act lineage, occurrence time, and materialized text
representation. It has no policy powers and is never dispatched, published,
journaled, or framed. The final `Percept` reuses its id. This avoids mutating a
`Percept.gateTrail` after awareness while preserving one evidence identity.

The reference `m-compare` explicitly subscribes to prediction and search-attempt
sources named in ArchML. It retains only live records in its membrane, prunes on
expiry/settlement, and **caps how many it holds** — every other bounded structure
in this series has one (32 sources, 32 issued ids), and an uncapped map of live
predictions is the same failure waiting elsewhere. It compares normalized exact
text in the offline reference condition. This is intentionally narrow: no fuzzy
lexical score, no LLM judge, no simulator truth, and no use of opaque `changeKey`.
Its verdict means literal equality under the declared normalization, not semantic
agreement. Treat it as a transport/conformance comparator for the deterministic
fixture; ordinary natural-language expectations need a later declared comparator
and should otherwise yield `insufficient`, not a confident mismatch.

For a prediction it evaluates only evidence whose `actId` and trusted target match.
For a search target it evaluates only evidence whose `requestId` maps to a live
`SearchAttempt`. The result is the existing frozen `Evaluation`, subject kind
`prediction` or `target`, referring to evidence by id. Unknown representation,
late evidence, or incomplete text yields `insufficient`.

### 4.2 Bidder port

The bidder is local policy, not a mind-level singleton. Each evidence owner
resolves at most one interior `bidder`: `m-region` beneath the issuing aperture,
and `m-act` beneath the hand assembler. The reference fixture mounts the same
bidder class/configuration under both owners. With none, that owner uses the
current phase-2 `decideBid` path. This is what lets configured mismatch behavior
be tested on the act path without turning bidding into one global policy.

The port is:

```js
createBid({ evidence, evaluations, gainTrail, requestedFloor }) → AttentionBid
```

`AttentionBid` stores its selected pure recomputation function non-enumerably so
nested arbiters continue to append gain and recompute under the same policy.
The bid records evaluation ids, not mutable evaluation objects.

Binding follows the phase-2 hardening rules: a same-batch custom provider waits for
`customElements.whenDefined` instead of silently falling back, disconnect removes
the binding and invalidates in-flight work, duplicate bidders under one owner fail
at connect, and invalid output refuses that bid rather than falling back to a more
permissive policy. Validation requires an `AttentionBid` over the exact evidence
object/id supplied, unchanged authority powers, the committed evaluation ids and
signal set, a finite salience in `[0,1]`, and a recomputation function that retains
those invariants after nested gain. A trusted policy may value evidence; it may not
replace it or grant it powers.

The independent signal set becomes:

```js
{
  changeMagnitude,
  requested,
  novelty,
  predictionMatch,
  predictionMismatch,
  targetMatch,
  causalAttribution,
  confidence
}
```

Null means no signal. `0` means an evaluated zero. Absence of an evaluation never
becomes `predictionMatch: 1`.

`causalAttribution` has no producer and stays `null`, for the reason phase 2 gave
when it added `novelty` to a set of two: the design names six independent signals,
and a slot costs nothing now while reshaping a frozen signal set in phase 4 costs
every consumer. It is emphatically not `requested`, and not `actId`: an act
reference says a command and an observation are associated, never that the act
caused what the observation contains.

The reference policy is:

```text
base = max(
  changeMagnitude,
  requested ? requestedFloor : 0,
  predictionMatch * expectedFloor,
  predictionMismatch * mismatchWeight,
  targetMatch * targetFloor
)
salience = clamp each gain-trail hop exactly as phase 2 does
```

`novelty` and `confidence` remain separate and unused in the first policy.
`expectedFloor`, `mismatchWeight`, and `targetFloor` all default to `0`; the
existing `requestedFloor` default remains `0`. Match does not attenuate evidence in
this phase. The configured reference fixture may choose non-zero values to test the
condition, but no resident architecture inherits them.

## 5. Voluntary orientation

Add `m-orient` as an ordinary capability under `m-act`. Its closed schema names
only aperture providers and source names declared by its architecture; it cannot
invent a provider, address another membrane, set numeric gains/thresholds, or
grant policy powers.

Like every present hand, it contributes a `felt` body-schema line. The language
names world-facing affordances—letting a channel recede, opening outward, or
following one source—and never exposes modality ids, aperture states, thresholds,
or control mechanics to the conscious stream.

The capability registration contract gains optional generic policy metadata:

```js
{
  lane: 'control',
  cooldown: '...',
  intentThreshold: 0.75,
  acceptsTemplate: true,
  consequenceType: null    // orienting is not a sensation; see below
}
```

`m-act` replaces the hard-coded two timestamps with a lane map while preserving
the current behavior:

- unspecified read-only capability → current read lane when `readCooldown` exists,
  otherwise the legacy shared lane;
- unspecified world-changing capability → current world lane;
- `m-orient` → control lane with its declared cooldown;
- per-capability `intentThreshold` filters the menu after DECIDE and before the
  tool call; ordinary hands keep the current global threshold.

This is a generic capability policy, not an `if (name === 'orient')` branch.

`m-orient.execute` creates an `OrientationRequest` and sends it through every
top-level aperture until the uniquely named provider handles it. A plain
orientation stops there. If the REALIZE envelope contains `template`, the hand
also asks the wired search controller to start a `SearchTarget`; search, not the
region or the hand, owns attempts and stopping.

An aperture transition is not a percept and never clears contact deficit, so
`m-orient` returns **no `experience`**: its deed is journaled backstage (⌁) and
the provider's existing `aperture-change` note records the transition, but
nothing enters the frame. `consequenceType` is therefore `null`, not
`Sense-orient` — declaring a consequence type for a hand that produces no
consequence would give its prediction a target that can never be observed. What
the act *can* be expected against is the sample the transition asks for, which is
why the `actId` is forwarded (§2.3). The provider's existing transition path
requests that fresh sample. Only a later typed frame receipt credits contact.
Rejected orientation creates no synthetic observation.

**The hand does not get a grace period in this phase, and the reflex will
reverse it.** With the reference `Aperture`, a voluntary `closed` is softened
once the deficit passes 0.65 — about six and a half minutes at arousal 1 with the
ten-minute horizon — and may be re-closed after the 30-second dwell. That rhythm
is the design working as specified (voluntary closure influences the regulator,
it does not disable it), but it is also the *open–close oscillation* the design
names as a failure mode, and phase 3 is the first phase able to produce one,
because it ships the first voluntary closer. Two consequences:

- the `felt` line must not promise *let me remain inward a little longer*. It can
  offer letting a channel recede; it cannot offer a duration the runtime will not
  honour;
- the temporary grace period the design floats belongs to phase 4, with the
  oscillation observability to judge it by. Choosing a grace interval now would
  be tuning a dynamic nobody has watched run.

Two constraints get tests rather than prose (§8·22, 23): voluntary closure
cannot outlast the reflex, and it cannot suppress a `bypassAperture` source.
Phase 2's test 5 covers bypass across closed gates generically; the point here is
that a gate closed *by the mind itself* is not a special case.

The intent ledger interacts with the raised threshold. `_realize` claims an
intent's slot at accept time (`mAct.js`), so a reach that clears the global DECIDE
threshold but not `m-orient`'s `intentThreshold` burns that slot for
`intentCooldown` — 15 minutes by default — and then evaporates when the realizer
is offered no fitting hand. With a higher bar on orientation that becomes the
common case rather than the edge one. Key the ledger by intent *and* capability,
or claim it at execute; state which in the commit.

## 6. Bounded tier-0 search

Add `m-search` as a provider of the `search` role. The first controller supports
one active target. Its ArchML declares ordered routes as provider/source pairs;
there is no global source-name scan and no first-DOM-match ambiguity.

Port:

```js
start(SearchTarget) → accepted target id | null
observe({ requestId, evidenceId, evaluations }) → void
cancel(targetId, reason) → SearchOutcome | null
```

`m-search` listens for the transient `control-result` and `evaluation-commit`
events on its membrane. The evaluation handoff is id-only; search does not receive
or retain `ComparableEvidence` text. Producers commit evaluation batches, while
search alone changes attempt/target state and publishes outcomes.

Starting a target:

1. validates scope, routes, positive sample budget, and bounded deadline;
2. publishes the target before issuing any request;
3. creates a `SearchAttempt` and then a `ControlRequest(kind: 'focus')` for the
   first route, with the same id and optional originating `actId`;
4. sends it to the named top-level aperture, whose existing forwarding reaches the
   nearest owner exactly once;
5. waits for `control-result`, a committed evaluation, timeout, or cancellation
   before moving to the next route. A closed route's transient refusal ends its
   attempt immediately rather than spending its full deadline.

The first controller has an explicit one-at-a-time attempt state machine:

```text
issued
  → refused
  → comparable-match
  → comparable-nonmatch
  → insufficient
  → timed-out
  → cancelled
```

Routes are attempted in declared order and cycle in that order while target
sample/deadline budget remains. Every issued request increments
`attemptedSamples`. Only `comparable-match` or `comparable-nonmatch` completes
coverage for a route; refusal, insufficient evidence, malformed/expired
comparison, and timeout advance to the next route without increasing coverage.
The first candidate carrying an attempt id determines that attempt's evidence
state; later candidates with the same id are ignored.

At tier 0 the template does not enter the detector or materializer. It stays in the
comparator, and `ControlRequest.template` — the field phase 1 reserved for tier-1
grounding queries — **stays null**. Populating it would put a semantic template in
front of a detector, which is the one thing tier 0 forbids; the reserved field
must not be quietly filled just because a template now exists somewhere in the
runtime. Searching a closed route therefore cannot see through it: unless the
orientation request opened/narrowed that provider, acquisition refusal consumes an
attempt and contributes no evidence. This limitation is the baseline the phase-4
lean-vs-edge-grounded experiment compares.

Stopping:

- first target `match` → `found`;
- all declared routes completed with comparable non-matches →
  `not-detected-in-inspected-area`;
- no remaining sample/deadline budget with incomplete coverage →
  `budget-exhausted`;
- explicit cancellation, sleep, detachment, replacement, or scope change →
  `abandoned`.

Precedence is decided at the controller's serialized target transition: an
explicit lifecycle cancellation tombstones the target before later evidence;
a match committed while the target is active wins; complete comparable
nonmatch coverage wins next; only then does budget/deadline exhaustion apply.
Every transition checks the target id and active generation.

Late evaluations are ignored by target id and deadline. Replayed receipts cannot
restart or settle a search. Search fires a non-content outcome event for
observability; it does not fabricate a sensory event or a prose conclusion.
Another future component may render an internal conclusion from the typed outcome,
but that is not part of this phase.

**How a search reaches awareness at all**, then, is worth stating plainly, because
the paragraph above reads like *the mind learns nothing*. The route is indirect:
a target match produces an evaluation, the evaluation raises `targetMatch`, and
`targetMatch` raises the bid of **the very percept that matched**. The mind does
not receive a report that its search succeeded; it perceives the thing it was
looking for, more strongly than it otherwise would have. That is the honest
mechanism, and it has a corollary worth reading twice: down a closed route
nothing is materialized, so nothing is compared, so nothing is found — and down
an open route the awareness gate can still refuse the percept whose match the
controller already recorded. A search can conclude `found` about an observation
the mind never perceived. That is correct (private processing and disclosure are
different permissions) and it is exactly why the outcome is not a sensation.

## 7. Milestones

Each milestone is independently committable with the suite green. Treat this as
two implementation series: **phase 3A (M1–M4)** establishes
prediction/evaluation/bidding and lands first; **phase 3B (M5–M7)** adds
orientation/search only after 3A is stable. They may remain one design document,
but should not be one implementation branch or one review.

| # | Milestone | Done when |
|---|---|---|
| M1 | Contracts and lineage; `mTerminal._dispatch` fires an `InterruptRecord`; lifecycle cancellation event; ids on telemetry plus transient `control-result` | Constructors freeze and validate ids, scope, time, route, and outcome enums; rendering is unchanged; deferred terminal urgency survives at the arbiter; sleep/detach can abort owned work |
| M2 | Opt-in REALIZE envelope, prediction publication, synchronous `m-act` consequence interposition, and exact act-path `Percept` adapter | Existing schemas/requests are untouched with the envelope off; immediate and deferred consequences share one owner/id path; envelope text is stripped; prediction precedes execution |
| M3 | Singleton side-effect-free comparator; bounded producer continuations, abort/tombstone, local commit order, `evaluation-commit` | Late/version-invalid evidence never settles or bids; all three evidence cases (membrane, immediate act, deferred act) reach the service; slow work never holds a source/hand busy |
| M4 | Owner-local bidder ports, extended independent signals, reference policy with zero defaults | With no bidder every existing bid is numerically identical on both paths; the same configured fixture policy works beneath `m-region` and `m-act`; output cannot replace evidence or powers |
| M5 | `OrientationRequest`, provider forwarding, generic capability lanes, and `m-orient` | A nested named provider is oriented once; dwell arbitrates races; opening clears no debt and a receipt does |
| M6 | `m-search`, explicit attempt state machine, id-only result handoff, coverage and terminal outcomes | Route cycling/retry, found, not-detected-in-inspected-area, exhausted, abandoned, stale, and cancelled paths are deterministic and bounded |
| M7 | Reference ArchML/fixture, offline demo, docs, and honesty pass | One assembly demonstrates prediction match and mismatch, voluntary orientation, bounded search, and receipt-only contact credit without a model call |

Do not combine M3 and M6 merely because both mention `Evaluation`: comparison is
the evidence judgment; search is one consumer with its own lifecycle.

## 8. Contract tests

**Prediction and lineage**

1. `expect` and `template` appear only in the augmented REALIZE schema, never in
   the registered hand schema or `cap.execute` arguments.
2. Prediction id/act id are substrate-owned and publication occurs before the hand
   can produce an immediate consequence; REALIZE records a belief prediction, not
   simulator truth.
3. Immediate and deferred consequences preserve the same `actId` through percept
   and receipt; replay mints nothing and credits nothing. The deferred path's
   record is trusted (an `InterruptRecord`), so it keeps its urgency and its
   lineage **as the arbiter sees it** — a test that reads the raw fired payload
   proves nothing here.
4. An orientation-triggered sample carries the orient act's `actId` to the
   percept it produces; an orient `expect` requires one declared source and cannot
   be settled by whichever untargeted source answers first.
5. With the envelope undeclared, the tool schemas sent to the realizer are
   identical to phase 2 for every existing architecture.
6. No `expect` yields no prediction. A slipped/cancelled act settles its prediction;
   expiry without evidence yields no mismatch.
7. Sleep, detachment, and membrane scope changes invalidate pending predictions.

**Evaluation and bidding**

8. Match, mismatch, and insufficient evaluations leave the frozen `Percept`,
   other evaluations, and their bids untouched.
9. A second comparator in one membrane fails at connect; the reference comparator
   cannot settle a prediction or search target before producer commit.
10. A comparator that never settles expires at its deadline as `insufficient`;
    its source's busy flag was already cleared after materialization, so a second
    candidate can materialize and finish comparison first. It does not commit
    ahead of the first candidate; timeout advances the source-local sequence and
    the late first result is ignored.
11. Immediate and deferred act consequences carrying a mismatch bid higher
    without any aperture, gate verdict, or percept-candidate event existing for
    them; both are synchronously claimed by `m-act` before asynchronous comparison.
12. An exact-world oracle is unavailable to the reference comparator; only the
    materialized viewpoint-bounded text is accepted.
13. Missing evaluation is null, not match. Unknown representation is insufficient.
14. Defaults reproduce the phase-2 salience bit-for-bit, including nested
    amplification/attenuation hop order.
15. Configured mismatch can raise a bid without changing `changeMagnitude`;
    configured prediction match/requested confirmation can still bid when mismatch
    and change are zero.
16. Awareness refusal after comparison produces no bid, receipt, memory line, or
    content-bearing telemetry.

**Orientation**

17. A named request reaches a nested substitute aperture once through provider
    forwarding; another membrane cannot hear or satisfy it.
18. Orientation cannot carry bypass powers, exceed configured states, or address an
    undeclared provider/source.
19. The control lane does not consume read/world cooldowns and vice versa; existing
    lane behavior is unchanged for every old hand.
20. Two overlapping orientation requests are first-observed/first-accepted under
    dwell/version; test both arrival orders, and the loser cannot reverse the winner.
21. Opening or narrowing changes state and requests the present but does not clear
    debt; only an attended receipt does.
22. Voluntary closure cannot outlast the reflex: with the deficit past its
    threshold and dwell elapsed, the regulator softens a hand-closed aperture.
23. A `bypassAperture` source still crosses an aperture the mind closed itself —
    a gate closed by the hand is not a special case.
24. The orient `felt` line reaches embodiment without modality ids, state names,
    thresholds, or mechanism language.

**Search**

25. Target publication precedes the first attempt, which precedes source sampling.
26. A target match stops immediately as `found`; later evidence cannot reopen it.
27. Complete comparable coverage with no match is
    `not-detected-in-inspected-area`.
28. Missing, suppressed, failed, delayed, or partial evidence is exhausted/abandoned,
    never absence.
29. Repeating one route spends budget without increasing distinct-route coverage.
30. A second candidate arriving inside one attempt's arming window does not
    increase coverage; refused, insufficient, and timed-out attempts advance
    without coverage, while only comparable match/nonmatch completes a route.
31. One controller searches two modality routes without adding search logic to
    either region or source.
32. A closed tier-0 route leaks no template or text and cannot be searched through;
    an explicitly opened route can.
33. With no search controller wired, a standalone `focus` control remains
    accepted/recorded but changes no aperture state or policy.

**Privacy and compatibility**

34. Candidate events and decision topics contain no expectation text, template,
    materialized text, comparator basis, or hidden world state. `acted` carries
    the stripped `handArgs`, ids and no envelope text. `ControlRequest.template`
    is null on every request this phase issues.
35. Prediction/search records stop at their membrane; a society sibling sees none.
36. Existing phase-1/phase-2 conformance suites pass unchanged, including substitute
    aperture, nested fold, request lineage, and composition-hole regressions.
37. Every existing architecture with the new components absent has identical
    rendering, bid salience, frame selection, and hand arguments.
38. Same-batch custom comparator/bidder definitions bind after upgrade; sleep,
    disconnect, and rebinding abort/tombstone in-flight work; duplicate services,
    duplicate owner-local bidders, and identity/power-changing bidder output fail
    closed with finite attention state.
39. Saturating one producer's comparison cap does not block another producer or
    suppress the saturated producer's baseline evidence. Comparison may complete
    out of order, commits stay ordered within one source/act/target, and no test
    assumes a global completion order.

## 9. Reference demonstration and experiments

Extend the offline membrane demonstration or add
`scripts/dev/demo-membrane-phase-3.mjs` if keeping phase-2 output stable is clearer.
The demonstration defines a deterministic text source whose description is limited
to its declared viewpoint. It must show:

1. a REALIZE-shaped call publishing an expectation before a simulated act;
2. an expected unchanged sample that still bids through an explicitly configured
   floor and credits contact only after its receipt;
3. contradictory text producing a separate mismatch evaluation and a stronger bid
   without altering evidence;
4. an `orient` request reaching a nested aperture and asking for the present;
5. one search that finds its target and one that exhausts with
   `not-detected-in-inspected-area` or `budget-exhausted` according to coverage;
6. no model call, no semantic content in pre-awareness telemetry, and no simulator
   truth passed to the comparator.

Items 1–3 must be demonstrated on every consequence shape: a membrane percept,
an immediate hand consequence, and a deferred hand consequence. The latter two
are claimed locally by `m-act` before reaching the arbiter. A demo is free to wire
a simulated source that answers a simulated act, and doing only that would hide
precisely the hole this phase exists to close (§1, hole 6).

This is an executable reference condition, not the phase-4 experiment matrix. The
later comparison must hold sources, percept transport, and frame/memory code fixed
while swapping producer, comparator, bidder, controller, and tier.

## 10. Honesty and documentation

When the code lands:

- `doc/architecture/perceptual-membrane.md`: mark step 3 implemented; update the
  implementation sketch and known-issues rows 2 and 5; keep tiers 1–2, native
  media, passive prediction, and Studio timelines explicitly absent. Row 5 names
  four gaps — the search controller, the `orient` hand, **cadence control beyond
  the sense timer**, and the grounding query on `template`. This phase closes the
  first two only. Cadence stays open and belongs to nobody yet: `soft` still only
  halves gain, while the design promises "reduced frequency, resolution, or gain".
  Do not close the row.
- `doc/improvements/prediction-mismatch.md`: mark only the act-bound tier-0
  reference condition implemented. Keep the experiment matrix unrun.
- `doc/architecture/components.md`: document `m-compare`, `m-bidder`, `m-search`,
  `m-orient`, the REALIZE envelope, action lineage, and the two control ports.
- `doc/extending.md`: show how to replace a comparator/bidder and how a controller
  addresses an aperture without importing `MRegion`.
- `doc/architecture/efference.md`: document the additive envelope and control lane;
  do not claim the efference redesign was adopted.
- Class comments at the touched runtime sites must repeat the three easy-to-lose
  distinctions: request lineage is not causation; mismatch is not sensory change;
  search exhaustion is not absence.

While this plan is proposed, add only its link to the membrane development order.
Do not update the implementation sketch as though the components already exist.

## 11. Definition of done

- `bun run test` green, including all contract tests above.
- The phase-3 demo runs offline and deterministically with no provider/model call.
- Existing architecture behavior and textual rendering remain unchanged when the
  new components are absent.
- A substitute comparator and bidder can be mounted from a test `components/`
  bundle without editing source, region, arbiter, frame, or memory code.
- Membrane percepts plus immediate and deferred hand consequences reach the same
  comparator role and signal set, and none can wedge another owner.
- Search is bounded in attempts, time, retained targets, evaluations, and
  comparison wall-clock; sleep and detach leave no live work.
- Slow comparison delays only the evidence it evaluates: source materialization,
  later acts, other producers, and the arbiter continue independently.
- No withheld source text, expectation, or template appears in logs, Studio,
  candidate events, memory, or a conscious frame before awareness permits it.
- Commits follow milestone boundaries, ending with the documentation honesty pass.

## 12. Judgment calls left to the implementer

State the choice in the commit message; do not ask for a decision the code can
settle.

1. **Comparator binding syntax.** The plan assumes role discovery for the callable
   port and explicit `predictionSrc` / `searchSrc` refs inside `m-compare`. A small
   registration event is acceptable if it preserves membrane scope, singleton
   enforcement, teardown, and the same no-content telemetry rule. Comparator
   plurality requires a future aggregation owner; do not smuggle it into this phase
   or build general automatic port matching here.
2. **Placement of `ComparableEvidence`.** It now has two constructors (`m-region`
   and `m-act`), so it belongs somewhere both can import without either owning it
   — prediction contracts or beside `Percept`, whichever leaves the import graph
   acyclic. Do not construct a final `Percept` before the awareness verdict and
   then mutate its gate trail.
3. **Reference text normalization.** Unicode normalization, line-ending
   normalization, and outer whitespace trimming are enough. Do not add stemming,
   embeddings, or a judge under the name "deterministic".
4. **Search route syntax in ArchML.** Prefer a parseable provider/source pair over a
   global source string. Reject ambiguity at connect rather than choosing the first
   provider.
5. **Prediction horizon.** Use a bounded component attribute with a conservative
   default suitable for one action/consequence round trip. Do not infer infinity
   from a missing value.
6. **Reference weights.** Defaults are fixed at zero. Non-zero values belong only
   to the named fixture/demo until an experiment justifies production tuning.
7. **Intent-ledger keying under a raised threshold.** Key it by intent and
   capability, or claim the slot at execute rather than at accept. Either fixes a
   filtered-out orientation burning a 15-minute slot; pick one and say which.
8. **No opportunistic efference redesign.** The generic lane map, the execution
   envelope, and building its own consequence's bid are the limit of `m-act` work
   in this phase. Building the bid is not act-writing and not a govern gate: it
   moves where a bid is assembled, not what a hand may do. Silent-return
   discipline, govern gates, act-writing, and manual mode remain in their own
   decision process.
9. **Commit-order policy.** Phase 3 allows evidence cases to finish comparison out
   of occurrence order. Do not add a global sequencer. Serialize commit only
   within the smallest causal owner — one source, one act, or one search target —
   and retain the original occurrence timestamps.
