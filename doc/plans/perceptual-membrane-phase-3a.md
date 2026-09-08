# Perceptual membrane — Phase 3A implementation plan: prediction and bidding

**Status: proposed, 2026-09-08.** This is the first implementation series split
from the broader [phase 3 roadmap](perceptual-membrane-phase-3.md). It implements
only:

> an act-bound expectation, comparison with later identified evidence, and
> independent match/mismatch inputs to attention.

Phase 3B will reconsider voluntary orientation and bounded search after this
smaller path has run. This plan does not prepare every anticipated extension. It
closes the correctness holes that would corrupt evidence, authority, ordering, or
compatibility, and leaves policy questions open.

The constraining documents are
[the perceptual membrane](../architecture/perceptual-membrane.md),
[prediction and mismatch](../improvements/prediction-mismatch.md),
[efference](../architecture/efference.md), and the
[phase 3 review](perceptual-membrane-phase-3-review.md).

Read this plan as:

> An expectation may change how evidence bids. It may not create evidence,
> rewrite evidence, or delay unrelated evidence.

## 1. Why split Phase 3

The previous plan combined four faculties:

1. act-bound prediction;
2. comparison and bidding;
3. voluntary orientation;
4. bounded search.

Only the first two are needed to test the immediate architectural claim: can a
mind record what it expects before acting, compare that prior with the consequence,
and preserve both confirmation and contradiction as independently valuable
attention signals?

Orientation and search introduce different lifecycles: provider arbitration,
control cooldowns, route coverage, retry, and uncertain stopping. Building them
now would enlarge the protocol before prediction has demonstrated that its seams
are useful. Phase 3A therefore ends with an offline reference condition and an
explicit stop for review.

## 2. Architectural stance

### 2.1 Keep the public vocabulary small

Phase 3A adds one public record:

- `Prediction` — a prior expectation with identity, target, basis, act lineage,
  and a bounded lifetime.

It reuses:

- `Percept` — immutable evidence;
- `Evaluation` — an independent judgment referring to evidence and a prediction
  by id;
- `AttentionBid` — the mutable competition record;
- `ControlRequest` — acquisition lineage when a fixture act asks a source to
  sample.

The REALIZE envelope, private comparison view, in-flight case, sequence number,
and cancellation generation are implementation details. Do not turn them into
public frozen classes unless another component must exchange them.

Prediction completion is a small event payload, not another mutable form of the
prediction:

```js
{
  predictionId,
  status: 'matched' | 'mismatched' | 'expired' | 'cancelled',
  evaluationIds,
  settledAt,
  reason
}
```

### 2.2 Keep synchronous work local

DOM dispatch is synchronous. A nested owner must claim an event with
`stopPropagation()` before returning; DOM does not await listener promises. That
is a local atomic handoff, not globally synchronous cognition.

Both evidence producers follow the same three-stage rule:

1. **Claim and snapshot synchronously.**
2. **Compare asynchronously under a deadline and local capacity bound.**
3. **Revalidate and dispatch one finished bid synchronously.**

No comparator runs inside `m-interrupts`. No global sequencer is introduced.
Cases commit in source order within one sensory source and consequence order
within one act; unrelated producers remain independent.

### 2.3 Keep policy replaceable and local

One comparator endpoint is bound at mind scope in the reference architecture so
both evidence paths see the same live predictions. This is a reference
multiplicity, not a claim that cognition has one true comparator. A future
composite endpoint can place several evaluators behind the same port.

Bidding stays owner-local:

- a sensory region may contain one `bidder`;
- an `m-act` may contain one `bidder`;
- absent one, the phase-2 policy is used unchanged.

The same reference bidder may be mounted under both owners in the fixture.

## 3. Scope

### In scope

1. Optional `actId` lineage through `ControlRequest`, `PerceptCandidate`,
   `InterruptRecord`, `Percept`, `PerceptReceipt`, and the typed percept index.
2. The existing deferred-terminal trust bug: its late consequence becomes an
   `InterruptRecord`, preserving urgency and `actId` at the arbiter.
3. An opt-in `expect` field in tool schemas built by `m-act`; it is absent from
   all existing REALIZE requests unless the architecture enables prediction.
4. Publication of `Prediction` before hand execution.
5. One comparator role and an offline exact-text reference implementation.
6. Comparison on both evidence paths:
   - a membrane percept produced by `m-region`;
   - an immediate or deferred hand consequence claimed by `m-act`.
7. Owner-local bidder ports and independent `predictionMatch` /
   `predictionMismatch` signal slots.
8. Bounded asynchronous continuation, stale-result rejection, and a deterministic
   offline demonstration.

### Out of scope

- `m-orient`, orientation requests, control cooldown lanes, and grace periods;
- search targets, attempts, coverage, and outcomes;
- `template` in the REALIZE envelope;
- multiple comparator aggregation;
- semantic, fuzzy, embedding, LLM, or simulator-oracle comparison;
- passive, learned, temporal, or competing prediction producers;
- causal attribution;
- prediction-based attenuation;
- tier-1/tier-2 processing and native media;
- production weights, live resident tuning, and behavioral claims;
- a general job queue, actor framework, durable event log, or global scheduler;
- the pending efference redesign.

## 4. Contracts

### 4.1 Prediction

Add `Prediction` to `src/infrastructure/predictionContracts.js`:

```js
Prediction {
  id,
  producer,
  scopeId,
  actId,
  kind: 'belief',
  target: {
    sourceId?,
    modality?,
    eventType?
  },
  representation: {
    kind: 'text',
    value
  },
  basis: {
    kind: 'realize',
    text
  },
  basisAt,
  validFrom,
  validUntil
}
```

Rules:

- ids and times are substrate-owned;
- publication and `basisAt` precede `cap.execute`;
- REALIZE produces a belief prediction, not simulator truth;
- target identity comes from trusted capability metadata, never expectation text;
- `actId` is association, not proof of causation;
- `validUntil` is required and bounded;
- expiry without adequate evidence is not mismatch;
- the record is immutable and never rewritten to carry settlement.

Existing hands default to their trusted consequence event type
`Sense-${capabilityName}`. A fixture hand predicting a sensory sample must declare
that source and modality explicitly.

### 4.2 Lineage

Add optional `actId` beside `requestId` on the existing transport records. The
field never changes frame prose or current journal text.

Only trusted in-process records preserve it. Plain objects cannot acquire lineage
through coercion, just as they cannot acquire urgency or bypass powers.

For the terminal slow path, the same `actId` received in execution context is
captured by the completion closure and placed on its later `InterruptRecord`.

### 4.3 Comparator port

The mind-scoped comparator endpoint implements:

```js
accepts(evidenceView) → boolean
evaluate(evidenceView, { now, deadline, signal })
  → Evaluation[] | Promise<Evaluation[]>
```

`evaluate` is side-effect-free. It does not settle predictions, publish bids, or
mutate evidence. It returns frozen `Evaluation` records referring to the prediction
and evidence by id.

The evidence view is a private frozen projection of the fields that form one
eventual `Percept`: its candidate/percept id, trusted source/provenance/tier,
request/act lineage, occurrence time, and archival text rendition. On the act
path that percept already exists; on the membrane path it is finalized only
after the awareness verdict. The view has no independent identity, authority,
publication, or retention contract.

The reference comparator:

- retains a bounded index of live predictions received from the configured
  prediction event source;
- compares only matching `actId` and trusted target metadata;
- performs Unicode/line-ending/outer-whitespace normalization and exact equality;
- returns `insufficient` for unknown representations, expired predictions,
  incomplete text, or natural-language cases not explicitly wired to the exact
  fixture;
- never reads hidden simulated-world state.

Its match/mismatch means literal equality in the fixture, not semantic truth.

### 4.4 Bidder port

An owner-local bidder implements:

```js
createBid({ evidence, evaluations, gainTrail, requestedFloor }) → AttentionBid
```

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

Phase 3A produces only `predictionMatch` and `predictionMismatch`.
`targetMatch`, `causalAttribution`, `novelty`, and `confidence` remain `null`.

The reference policy is:

```text
base = max(
  changeMagnitude,
  requested ? requestedFloor : 0,
  predictionMatch * expectedFloor,
  predictionMismatch * mismatchWeight
)

salience = clamp after each existing gain-trail hop
```

`expectedFloor` and `mismatchWeight` default to `0`. Existing `requestedFloor`
continues to default to `0`. No current architecture is retuned.

A bidder result is accepted only when it:

- is an `AttentionBid` over the exact supplied `Percept` object and id;
- preserves the percept's authority powers;
- preserves the committed evaluation ids and signal set;
- has finite salience in `[0,1]`;
- recomputes under nested gain without changing those invariants.

Invalid output refuses the bid rather than falling back to a more permissive
policy.

## 5. The two evidence paths

### 5.1 Membrane percept

The `m-region` path becomes:

```text
candidate
  → composed acquisition gates
  → reserve comparison capacity / assign source sequence
  → materialize text while source is busy
  → construct private evidence view
  → release source busy
  → compare asynchronously
  → wait for earlier case from this source
  → re-check attachment, sleep, deadline, binding generation, gate versions
  → composed awareness gates
  → construct final Percept with the same candidate id
  → commit evaluations
  → build owner-local bid
  → interrupt-request
```

The important change is narrow: `entry.busy` ends after materialization, not after
comparison. A slow comparator delays only its evidence case.

If comparison capacity is full, that case follows the baseline path without
match/mismatch signals. Optional interpretation cannot silence admissible
evidence.

### 5.2 Hand consequence

With prediction disabled, `m-act` behaves exactly as it does in phase 2.

With prediction enabled, `m-act` installs a local `interrupt-request` listener.
When a trusted raw consequence carries one of its live `actId`s, the listener:

1. calls `stopPropagation()` synchronously;
2. converts the `InterruptRecord` once through `Percept.fromInterrupt`;
3. derives the private evidence view from that same percept;
4. compares under the local deadline/capacity bound;
5. commits in consequence order for that act;
6. builds the bid through `m-act`'s bidder or the default policy;
7. redispatches the completed bid from above `m-act`.

An incoming `AttentionBid` passes through untouched, preventing a loop.

This catches:

- the immediate consequence created after `cap.execute`;
- the terminal's later deferred consequence bubbling from `m-terminal`.

Both use the same `Percept` object/id from comparison through receipt.

## 6. REALIZE envelope and settlement

Prediction is enabled by one `m-act` architecture attribute, default off.
`MAct._realize` augments copies of hand schemas with:

```js
expect: {
  type: 'string',
  description: 'the consequence expected from this act'
}
```

It does not mutate `cap.parameters`.

Before execution, `_execute`:

1. validates the augmented object;
2. removes `expect`;
3. validates the remaining `handArgs` against the original schema;
4. creates `actId`;
5. publishes `Prediction` when `expect` is non-empty;
6. calls `cap.execute(handArgs, { intent, actId, predictionId })`.

`acted.args` contains only `handArgs`. `expect` never reaches the hand, Studio,
memory, candidate telemetry, or the conscious frame.

After an evidence owner has revalidated and committed evaluations, it fires an
id-only `evaluation-commit` event. `m-act`, as prediction owner, publishes one
settlement for its live prediction. Expiry, execution failure, disconnect, or
scope invalidation publish `expired`/`cancelled` without manufacturing mismatch.
Late commits for a settled id are ignored.

## 7. Bounded asynchronous continuation

Do not add a public queue component. Each evidence owner keeps a small private map:

- case id and local sequence;
- deadline and `AbortController`;
- attachment/binding generation;
- comparison promise;
- terminal committed/cancelled flag.

Rules:

- capacity is bounded per owner;
- timeout aborts cooperatively and tombstones the case;
- late completion after timeout, detach, sleep, scope change, or comparator
  rebinding has no effect;
- completed cases commit in local order;
- timeout advances the local order;
- no case commits twice;
- no source remains busy while comparison runs;
- no act lane remains busy merely because consequence comparison runs;
- only frame assembly can issue contact credit.

No global completion order is promised. Original occurrence timestamps remain on
the percept even when comparison completion order differs.

## 8. Milestones

Each milestone is independently committable with the suite green.

### A0 — Terminal trust correction

- `mTerminal._dispatch` constructs an `InterruptRecord`.
- Deferred urgency survives coercion at the arbiter.
- This fix is useful independently of prediction.

### A1 — Prediction and lineage

- Add `Prediction`.
- Add optional `actId` across existing transport records/index.
- Preserve rendering and journal prose.
- Publish/expire/cancel prediction events.

### A2 — Opt-in producer and consequence ownership

- Add the `expect` envelope, default off.
- Strip it before hand execution and `acted`.
- Publish before execution.
- Add local `m-act` interposition for immediate and deferred consequences.

### A3 — Comparison continuation

- Add the singleton reference comparator endpoint.
- Add private evidence projection.
- Narrow `m-region` busy scope.
- Add deadlines, abort/tombstone, binding generations, and local commit ordering.
- Emit id-only evaluation commits after revalidation.

### A4 — Bidding and demonstration

- Add owner-local bidder binding under `m-region` and `m-act`.
- Extend independent signal storage with zero defaults.
- Add the exact-text fixture and offline demo.
- Update documentation honestly, then stop for review before Phase 3B.

## 9. Contract tests

1. Prediction publication precedes immediate hand execution.
2. `actId`, prediction id, and times are substrate-owned.
3. Prediction-disabled REALIZE schemas are identical to phase 2.
4. `expect` never enters `cap.execute`, `acted.args`, Studio, memory, or a frame.
5. Immediate and deferred consequences preserve one `actId` through percept and
   receipt.
6. Deferred terminal urgency survives at the arbiter, not merely in its raw event.
7. Trusted act conversion creates one `Percept` id used by evidence view, bid, and
   receipt.
8. Exact fixture text produces match/mismatch evaluations without rewriting the
   percept.
9. Unknown or ordinary natural-language comparison produces `insufficient`, not
   confident mismatch.
10. Comparator timeout cannot settle a prediction; late resolution is ignored.
11. A second sensory candidate can materialize while the first is comparing.
12. Faster later comparison does not overtake earlier commit from the same source;
    unrelated sources proceed independently.
13. Disconnect, sleep, scope change, and comparator rebinding prevent stale commit.
14. Immediate and deferred mismatches can raise their bids through the same
    configured bidder used by the membrane fixture.
15. All new weights at zero reproduce phase-2 salience and nested gain bit-for-bit.
16. Missing evaluation is `null`, not match; mismatch does not replace
    `changeMagnitude`.
17. A custom bidder cannot replace evidence, ids, powers, evaluations, or signals.
18. Awareness refusal after comparison produces no bid, receipt, memory line, or
    content-bearing telemetry.
19. Prediction events and private evidence remain inside their membrane.
20. Existing phase-1/phase-2 suites and demos pass unchanged.

## 10. Offline reference condition

Add `scripts/dev/demo-membrane-phase-3a.mjs`.

It uses no model or provider call and demonstrates:

1. an expectation published before a fixture act;
2. an exact confirmation that bids through a configured `expectedFloor`;
3. a contradiction that bids through `mismatchWeight` without changing evidence;
4. the same comparator and bidder policy on:
   - a membrane percept;
   - an immediate hand consequence;
   - a deferred hand consequence;
5. a slow comparison that does not hold a source busy;
6. cancellation that makes late work inert;
7. no expectation or private text in pre-awareness telemetry.

This proves transport and replacement seams only. It does not establish that exact
text is a useful cognitive comparator, that mismatch improves functioning, or
that the chosen non-zero fixture weights belong in a resident mind.

## 11. Compatibility promise

With prediction components absent or the `m-act` envelope disabled:

- existing REALIZE requests and hand schemas are unchanged;
- existing hands receive the same arguments;
- existing evidence renders identically;
- existing bids have the same salience;
- existing frames, journal prose, and contact credit are unchanged;
- no resident architecture acquires prediction policy.

The terminal trust correction is the sole deliberate baseline bug fix: a deferred
trusted consequence keeps the urgency it already intended to have.

## 12. Stop condition and questions carried forward

Phase 3A is done when the tests and offline reference condition pass and the
existing suite remains green. Do not begin Phase 3B in the same implementation
series.

The review after A4 asks:

1. Did the new seams require edits outside evidence producers, contracts, and
   bidding infrastructure?
2. Did asynchronous comparison affect unrelated source or act cadence?
3. Is `expect` reliably produced in a useful form, or should the producer change
   before semantic comparison is attempted?
4. Which findings actually justify orientation or search next?

Carry these questions without answering them in Phase 3A:

- semantic comparator design;
- competing evaluators and aggregation;
- production weights or attenuation;
- passive and learned prediction;
- orientation and reflex interaction;
- search coverage and tier-1 grounding;
- cross-process comparison workers;
- live resident adoption.

The criterion is not that prediction is complete. It is that a later architecture
can replace the producer, comparator, or bidder without changing evidence,
authority, frame assembly, or memory.
