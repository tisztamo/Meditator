# Perceptual membrane — Phase 1 implementation plan: the contracts

**Status: plan, 2026-09-06. Not implemented.** Realizes step 1 of the
[perceptual membrane](../architecture/perceptual-membrane.md#proposed-development-order):

> *Establish explicit contracts for processing, awareness, evidence identity,
> evaluations, control requests, and frame receipts. Preserve existing text
> rendering and trusted provenance through the compatibility path.*

Companions that constrain this phase without being part of it:
[enclosure by role](../improvements/enclosure-by-role.md) (how gates will later
compose and how providers will be found),
[prediction and search](../improvements/prediction-mismatch.md) (who will later
produce evaluations and control requests),
[port contracts](../improvements/schema-guided-connections.md) (the vocabulary the
declarations grow into), and the
[deterministic wiring fixture](../improvements/deterministic-wiring-fixtures.md)
(the test body these tests would like to share).

Plans for phases 2–6 will be written separately. Read this one as: *give the
membrane its nouns, and make the two boundaries it claims to have actually be two
boundaries* — without changing what any existing mind does.

## 1. What this phase is

Today the sketch works but has no vocabulary. Source policy is read ad hoc inside
`MRegion.registerSource`, the acquisition and awareness decisions are the same
`if`, a receipt is "the same JavaScript object came back", a control request is
`entry.sample?.()` with no arguments, a tier is an unwritten assumption, and an
evaluation does not exist. Every later phase — composition across nested regions,
replaceable regulators, prediction, search, tier 1, native media — needs these
records to exist first, and needs them to be the *same* records for every
provider, not private fields of one component.

Phase 1 therefore adds types, seams, and tests. It should add almost no behavior.

### In scope

1. **Source contract** — architecture-owned identity, provenance, tier, and the
   three bypass powers, read once at registration, frozen, never from a payload.
2. **Evidence identity** — candidate → annotated candidate → percept → receipt,
   with one stable id carried the whole way and lineage back to the request that
   asked for the sample.
3. **Processing vs awareness** — two named gate stages with typed verdicts and a
   policy-version chain, even though at tier 0 the second stage is a documented
   no-op that mirrors the first.
4. **Control requests** — a typed `sample` / `focus` / `detail` request that
   reaches sources *before* detection, and a typed rendition request that reaches
   materializers *before* processing.
5. **Evaluations** — the record type and its non-mutation rule. Nothing produces
   one yet; fixing the shape now stops phase-3 components inventing three of them.
6. **Frame receipts** — an authoritative typed receipt issued by frame assembly,
   credited **by percept id**, carrying the rendition actually placed in the frame.
7. **The compatibility path, hardened** — the legacy provenance mapping made
   explicit and tested, byte-for-byte rendering preserved.

### Out of scope (and which phase owns it)

| Not now | Owner |
|---|---|
| Composing gates across nested regions; `percept-candidate` bubbling; role lookup | [enclosure by role](../improvements/enclosure-by-role.md) phases 0–2, then membrane phase 2 |
| Splitting the mutable bid off the evidence record (the arbiter must change with it) | membrane phase 2 |
| Replaceable regulator / aggregator wiring; `part(mind, 'aperture')` | membrane phase 2 |
| Prediction producers, comparators, the `expect` envelope, search controller | membrane phase 3 |
| Tier 1 or tier 2 *implementations*; grounding queries; edge models | after the lean-vs-edge-grounded experiment |
| `orient` hand, cooldown lane, body-schema language | membrane phase 3 |
| Native media, rendition selection, model-capability advertising | membrane phase 5 |
| Studio timelines for aperture dynamics | membrane phase 6 |
| Migrating existing eager `feel()` senses under aperture control | separate, per sense |

Do not start any of these because a type here makes them look close. If a stub is
needed to keep a signature honest, it is named below; anything else is scope creep.

### The compatibility promise

This phase is a refactor with new nouns. It must hold that:

- every existing `.archml` in `architecture/` behaves exactly as before;
- `renderForFrame()` output and the assembled prefill are byte-for-byte unchanged
  for every legacy record class (there is already a test for this — extend it);
- trusted in-process `InterruptRecord`s keep their powers, coerced payloads still
  cannot acquire any;
- `bun run test` stays green and `bun scripts/dev/demo-membrane.mjs` still runs
  offline with no model call;
- nothing content-bearing appears in a topic, log line, or Studio event that did
  not appear there before.

## 2. Where the code goes

| File | Change |
|---|---|
| `src/infrastructure/perceptionContracts.js` | **new** — every record type below, their validation, the provenance and tier vocabularies, and the pure gate-decision function |
| `src/infrastructure/percept.js` | `PerceptCandidate` gains lineage + typed annotation; `Percept` gains `tier`, `requestId`, `toReceipt()`; `fromInterrupt` delegates provenance to the legacy map |
| `src/infrastructure/aperture.js` | `observe()` accepts only a `PerceptCandidate`; the aperture-state decision moves to the pure function; `attended()` unchanged |
| `src/mindComponents/mind/mRegion.js` | registration builds a `SourceContract`; the offer path runs two named stages; version chain; id-based receipt credit; a non-semantic decision topic |
| `src/mindComponents/mind/mSense.js` | `onSense(request)`; `candidate()` passes lineage; docs for `tier` |
| `src/mindComponents/mind/mMind.js` | frame assembly issues typed receipts (with the rendered text and a frame id) |
| `src/mindComponents/mind/mMemory.js` | index entries built from receipts, now including tier and request lineage |
| `src/mindComponents/mind/mInterrupts.js` | no behavior change; only whatever the receipt/typed-record rename forces |
| `scripts/dev/demo-membrane.mjs` | print the two stage verdicts and the receipt instead of `toIndexEntry()` directly |
| `architecture/tests/unit/perceptual-membrane.test.js` | extend; update the `observe()` call that passes a bare object |
| `architecture/tests/wiring/perceptual-membrane.test.js` | extend with the contract tests of §5 |
| `doc/architecture/perceptual-membrane.md`, `doc/architecture/components.md` | honest status update (§7) |

Keep `src/infrastructure/` flat and camelCase, like its neighbours
(`interruptRecord.js`, `interruptState.js`). One new module is enough; if it grows
past ~250 lines, split by contract, not by "types vs helpers".

## 3. The contracts

Shapes below are direction, not literal source. Prefer small frozen classes or
factory functions with `Object.freeze` over plain object literals, so that
"payloads cannot grant authority" is enforced by construction rather than by
review. Every constructor validates and throws on an unknown enum value: a wiring
mistake in an `.archml` should fail loudly at connect time, the way a duplicate
component does, not degrade into `unspecified` at runtime.

### 3.1 Source contract and the tier declaration

Built once per registered source element by the *provider* (today `m-region`),
from that element's attributes only.

```js
SourceContract {
  name,            // element `name` attribute, else localName; unique within the provider
  modality,        // from the provider, not the source
  provenance,      // one of PROVENANCE (below); attribute `provenance`, default 'unspecified'
  tier,            // 0 | 1 | 2; attribute `tier`, default 0
  privacy,         // 'resident-private' for now; declared so retention has a field to read
  powers: { bypassAperture, bypassAdmission, preempt },   // three independent booleans
  element,         // non-enumerable back-reference for attachment checks
}
```

- `PROVENANCE = ['physical', 'simulated', 'other-mind', 'generated', 'internal',
  'unspecified', 'legacy-unspecified']`. `legacy-unspecified` is reserved for the
  compatibility path and must be rejected if an author writes it on a source.
- `tier="1"` or `tier="2"` **throws at registration** with a message naming the
  slice ("edge-grounded sources are declared but not implemented; see
  perceptual-membrane.md#processing-tiers"). Declaring the field now, and refusing
  it honestly, is the point: it means no source is *silently* tier 0 any more.
- The contract is the only thing downstream code may read for policy. Nothing may
  re-read the element's attributes later in the path.
- Give it a `toProvenanceRecord()` returning the flat, journalable subset
  (`{ source, modality, provenance, tier }`).

**Do not** turn `Percept.provenance` into an object. It is a string in tests and in
`percepts.jsonl` today; add `tier` (and `requestId`) as sibling fields instead.

### 3.2 Evidence identity

Three records, one id.

```js
PerceptCandidate   // unchanged in spirit: private, non-semantic, frozen
  { id, occurredAt, changeMagnitude, changeKey /* hashed */, requestId? }
  #materialize(kinds, renditionRequest)

AnnotatedCandidate // what the trusted adapter makes; never leaves the provider chain
  { candidate, contract, versions: [{ gate, version }], annotatedAt }

Percept            // as today, plus:
  { …, tier, requestId, gateTrail: [GateVerdict], receivedKind }
```

Invariants to enforce and test:

- `Percept.id === candidate.id`. One observation, one identity, from header to
  journal line. (Today `mRegion` already passes `id: candidate.id` — make it a
  tested invariant rather than a coincidence.)
- The materializer stays in a private field; `JSON.stringify` of a candidate must
  not reveal a caption, filename, provenance, policy, or the change-key preimage.
  The existing unit test covers part of this; extend it to the annotated form.
- `versions` is a **list** even though there is exactly one gate today. After
  materialization the provider re-checks *every* recorded version and drops the
  percept if any changed. That is the single-region check generalized, and it is
  what phase 2's conjunction will fill with more entries without touching this code.
- `requestId` is acquisition lineage only: it says which sample request produced
  this observation. It is explicitly **not** causal attribution — write that in the
  comment where a future reader will be tempted to conflate them.

### 3.3 Processing and awareness as two stages

The heart of the phase. Two named methods on the provider, each returning a typed
verdict, each delegating to one pure function:

```js
// perceptionContracts.js — no DOM, no component state
decideGate({ stage, apertureState, focus, contract }) → GateVerdict
GateVerdict { stage: 'acquisition'|'awareness', permitted, reason, bypass, apertureState, gate }
```

```js
// mRegion.js — the offer path, in order
this.aperture.observe(candidate)                    // debt/habituation: header only
const acquisition = this.permitAcquisition(annotated)
if (!acquisition.permitted) return null             // nothing materializes, nothing is retained
const percept = await materialize(...)              // versions re-checked here
const awareness = this.permitAwareness(percept, annotated)   // tier 0: mirrors acquisition
if (!awareness.permitted) return null
dispatch interrupt-request
```

- At tier 0 `permitAwareness` returns a verdict with `reason: 'tier-0-mirror'`.
  It must be a real call with a real verdict recorded in `gateTrail`, not a
  comment saying the stages coincide — the point is that phase 2 and tier 1 have a
  place to stand.
- `bypassAperture` is consulted at the acquisition stage; `bypassAdmission` and
  `preempt` remain the *arbiter's* business and must not be read here. Keep the
  three powers independent in code, not only in prose.
- Verdicts are announced on a **non-semantic** topic (e.g. `pub('perceptDecision',
  {stage, source, permitted, reason, changeMagnitude, apertureState})`). No text,
  no materializer, no un-hashed key: "Studio and logs receive at most what the
  regulator receives". Add a test that asserts the suppressed text never appears
  in any published payload.
- The regulator's typed input: `Aperture.observe` accepts a `PerceptCandidate`
  and throws otherwise. Also define an `EdgeEvidence` type (tier-1 match scores,
  `{ targetId, score, sourceName, tier }`) in the contracts module *purely* so the
  regulator can refuse it by type, with a test. Nothing produces one; this is the
  "no side path" guarantee made mechanical rather than documentary. Keep it under
  twenty lines. The existing unit test calls `observe()` with a bare object —
  update it to build a candidate.

### 3.4 Control requests

```js
ControlRequest { id, kind: 'sample'|'focus'|'detail', issuedBy, target?, reason,
                 detail?, budget?, deadline?, issuedAt, template? /* reserved, tier 1 */ }
RenditionRequest { kinds: ['text'], detail?, requestId, budget? }
```

- `MRegion._transition` currently calls `entry.sample?.()`. It should build a
  `ControlRequest { kind: 'sample', reason: 'reopening' | 'orientation' }` and pass
  it. `MSense.onSense(request)` takes it as an optional argument; every existing
  subclass ignores it and keeps working. The request id then rides the candidate
  header as `requestId`.
- The materializer is called with `(kinds, renditionRequest)` — additive, so a
  source written against today's `requestedKinds` array is unaffected. Do not swap
  the first argument for an object.
- Implement `sample` and `detail` end to end. Accept `focus` into the same path
  (validated, delivered, recorded) but let it change no policy: the search
  controller that owns focus is phase 3, and a region must not grow a search
  conclusion. Say so in the comment.
- Add `region.requestControl(request)` as the single public entry point, so a
  future controller that is not the region itself has something to call, and the
  reopening reflex uses the same door. Requests to a detached or sleeping source
  are dropped, and dropping is not an error.

### 3.5 Evaluations

Type and rule only:

```js
Evaluation { id, producer, subject: {kind: 'prediction'|'target', id}, evidenceIds: [],
             verdict: 'match'|'mismatch'|'insufficient', confidence?, coverage?,
             basisAt, createdAt }
```

Rules to encode in the constructor and in tests: it references evidence **by id**;
it never holds or mutates a `Percept`; two evaluations of the same evidence are
independent and neither may touch the other; `insufficient` is a first-class
verdict, and absence of an evaluation is not a match.

Nothing constructs an `Evaluation` in this phase. Do not add a producer, a
comparator, or a registry to "prove it works" — the unit test is the proof.

The companion record, `AttentionBid` (salience, gain trail, decisions, referring to
`evidenceId`), is deliberately **not** added here: introducing it without changing
`m-interrupts` would leave two truths about salience in the tree. Phase 2 adds the
type and the arbiter change together.

### 3.6 Frame receipts

Frame assembly is the authority. `m-mind` keeps firing `percepts-attended`, but
the detail becomes an array of frozen receipts:

```js
PerceptReceipt { perceptId, frameId, sourceId, modality, provenance, tier,
                 occurredAt, attendedAt, receivedKind, renditionText, requestId }
```

- `renditionText` is what actually went into the prefill (the rendered `> ⟂`
  line's content), not what the source offered. "Memory therefore knows both what
  occurred and what this incarnation of the mind could perceive."
- `m-region` credits contact debt **by `perceptId`**, against a bounded map of ids
  it issued (id → issuedAt), replacing the `WeakSet` identity check. Crediting
  removes the id, so a replayed receipt credits nothing; `Aperture.attended` keeps
  its freshness window. This is exactly enclosure-by-role's "nearest credits,
  by id" rule, arriving one phase early because it is cheap and because object
  identity is the thing the design says must not be load-bearing.
- `m-memory` builds `percepts.jsonl` entries from receipts. Keep the existing
  field names and add `tier`, `requestId`, `frameId`. Keep `journal="off"` honoring.
- Legacy stimuli coerced at frame time still get receipts, with
  `provenance: 'legacy-unspecified'` and `tier: null`; they credit no aperture
  because no provider issued them.
- If some consumer genuinely needs the record itself, hang it off the receipt as a
  **non-enumerable** `percept` property so it cannot reach a journal line by
  accident. Prefer not to need it.

## 4. Milestones

Each milestone is independently committable with the suite green. Order matters:
1–2 are pure additions, 3–6 are the seams, 7 is the honesty pass.

| # | Milestone | Done when |
|---|---|---|
| M1 | `perceptionContracts.js` with `SourceContract`, `AnnotatedCandidate`, `GateVerdict`, `ControlRequest`, `RenditionRequest`, `Evaluation`, `EdgeEvidence`, the vocabularies, and `decideGate` | Unit tests cover construction, freezing, enum rejection, and that no type accepts policy from a payload. No component imports it yet |
| M2 | Legacy provenance mapping extracted and enumerated; compatibility rendering test extended to every current event class (`UserInput`, `ConsoleInput`, `Peer`, `Internal`, consequence, loop break, sleep notice, `Sense-*`) | Byte-for-byte assertions pass; unknown class → `legacy-unspecified` with no powers |
| M3 | `m-region` registration builds a `SourceContract`; `tier` parsed and 1/2 refused; `Aperture.observe` typed | Existing wiring tests pass unchanged except the one bare-object `observe` call |
| M4 | Two gate stages with verdicts, the version chain as a list, and the non-semantic decision topic | New tests: awareness verdict recorded at tier 0; no text in any published payload; a mid-materialization orientation still drops the percept |
| M5 | Control requests: `requestControl`, `sample` on reopening, lineage on the candidate, `RenditionRequest` to the materializer, `onSense(request)` | Reopening test asserts the sample request id appears on the resulting percept and receipt |
| M6 | Typed receipts from frame assembly; id-based credit in `m-region`; receipt-driven journal entries in `m-memory` | Credit survives a rebuilt record with the same id; a replayed receipt credits once; stale receipt still refused; `percepts.jsonl` gains `tier`/`requestId` |
| M7 | Demo, docs, and status honesty (§7) | `bun scripts/dev/demo-membrane.mjs` prints both verdicts and a receipt; docs claim exactly what runs |

If the [deterministic wiring fixture](../improvements/deterministic-wiring-fixtures.md)
has landed by M4, use it and drop the `delay(40)` setup. If it has not, do **not**
build it here — leave the tests in their present shape and note it.

## 5. Contract tests (the seed of the conformance suite)

Write these as one describable group, ideally in a file that a future provider
(the `m-test-aperture` of enclosure-by-role fixture S1/C1) can be run against by
swapping the mounted architecture. That is the cheapest way to make this phase pay
for the next one.

1. **Identity** — id is stable from candidate to journal line; two observations
   never share an id.
2. **Blindness** — a closed aperture yields zero materializer calls, zero bids,
   zero journal lines, and no published payload containing the withheld text
   (already partly covered; extend to the decision topic).
3. **Two stages** — the awareness verdict exists and is recorded even when it
   mirrors the acquisition verdict; a percept refused at the awareness stage never
   reaches `interrupt-request`.
4. **Authority** — a payload claiming `provenance`, `tier`, `policy`, or `urgent`
   changes nothing; the source element's attributes decide; a coerced string gains
   no power.
5. **Tier honesty** — `tier="1"` refuses registration; `EdgeEvidence` cannot enter
   `Aperture.observe`; every percept and index entry carries its tier.
6. **Versions** — an orientation change during materialization drops the percept,
   with the check driven by the recorded list, not a single scalar.
7. **Lineage** — a sample request id reaches the percept and the receipt; a
   spontaneous observation has none; lineage is never read as causation anywhere.
8. **Receipts** — credit by id once and only once; a rebuilt-but-equal record
   credits; a replay does not; opening an aperture credits nothing; a queued but
   unattended bid credits nothing (existing test).
9. **Legacy path** — rendering byte-for-byte identical; trusted powers preserved;
   receipts issued with `legacy-unspecified` and crediting nothing.
10. **Evaluations** — independent, id-referencing, non-mutating; `insufficient`
    round-trips.

## 6. Forward compatibility — things to get right the first time

These cost nothing now and are expensive to retrofit:

- **One lookup site per file.** Wherever a component finds its region/mind today
  (`closest('m-region[modality]')`, `closest('m-mind')`), route it through a single
  private helper in that file. Enclosure-by-role phase 1 then replaces one line per
  file with `this.enclosing('aperture')` / `this.membrane()`. Do not add new
  scattered `closest()` calls, and do not pre-emptively implement role lookup here.
- **Gate policy is a pure function.** `decideGate` must not read component state or
  the DOM, so phase 2 can call it once per gate on a bubbling `percept-candidate`
  and conjoin the results.
- **Everything that will be plural is already a list.** `versions`, `gateTrail`,
  `evidenceIds`, `renditions`.
- **Everything that will cross a process boundary is keyed by id**, never by object
  identity: receipts, evaluations, control requests.
- **Nothing new reads a payload for policy.** The one place that maps element
  attributes to authority is `SourceContract`; keep it that way, and phase 2's
  alternative provider can reuse it verbatim.
- **No new mutation of a `Percept` after issue.** Salience mutation by the arbiter
  already exists and stays for now (phase 2 removes it); do not add a second.

## 7. Honesty and documentation

When the code is in, update — briefly and without overclaiming:

- `doc/architecture/perceptual-membrane.md`: the *Implementation sketch* section
  (two stages exist; tier is declared and refused above 0; receipts are typed and
  id-credited; control requests reach sources) and the **known-issues row 5**
  ("Processing tier is implicit"), which this phase resolves for the declaration
  and the typed regulator input but *not* for tier-1 admission. Rows 1–4 stay open
  and keep pointing at their phases. Add a link to this plan from the development
  order.
- `doc/architecture/components.md`: `m-region` and `m-sense` `@interface` blocks —
  the `tier` attribute, `requestControl`, the decision topic, the receipt event.
- Class-level comments in `mRegion.js` / `mSense.js` in the existing voice: what a
  source may declare, what it may never assert.
- Say plainly what still does not exist: composed gates, replaceable regulation,
  prediction, search, tiers 1–2, native media, the `orient` hand. A reader of the
  repo should not be able to mistake a type for a faculty.

No user-facing `docs/` page is needed: this phase adds no operator-visible feature.

## 8. Definition of done

- `bun run test` green (unit + wiring), including the new contract tests.
- `bun scripts/dev/demo-membrane.mjs` runs offline, no model call, and shows the
  acquisition verdict, the awareness verdict, the sample lineage, and one receipt.
- No behavior change for any architecture in `architecture/`: a spot-check with
  `architecture/tests/dry-fast.archml` (or the equivalent dry run) produces the
  same frames as before the change.
- The docs of §7 updated in the same series of commits as the code they describe.
- Commits in the repo's voice, one per milestone or per coherent pair, e.g.
  `feat: give the membrane typed source contracts and two gate stages`, ending with
  the docs commit.

## 9. Judgment calls left to the implementer

State the choice in the commit message; do not ask for a decision that the code
can settle.

1. **Receipt detail shape.** The plan assumes `percepts-attended` keeps its name
   and carries receipts. If keeping the percept objects in the event and adding a
   parallel `receipts` field turns out materially simpler for `m-memory`, take that
   — provided crediting is by id and no journal line gains a field by accident.
2. **Where `decideGate` lives** — `perceptionContracts.js` or `aperture.js`. Prefer
   the contracts module if `aperture.js` would then import it circularly.
3. **How much of `Percept` moves into the receipt.** Duplicating four fields is
   fine; making the receipt the only readable source of provenance is not, while
   `recent`/`story` still exist as lossy prose.
4. **Thresholds and time constants stay as they are.** They are provisional
   experiment settings; this phase has no evidence to retune them and must not
   silently do so.
