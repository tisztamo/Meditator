# Perceptual membrane — Phase 2 implementation plan: composition and the split

**Status: proposed, 2026-09-06.** Realizes step 2 of the
[perceptual membrane](../architecture/perceptual-membrane.md#proposed-development-order):

> *Correct nested boundary composition and separate evidence from bid state. Make
> contact regulation, pressure aggregation, and source control replaceable through
> wiring. Expected observations retain a route to attention.*

Sibling of the [phase 1 plan](perceptual-membrane-phase-1.md), which gave the
membrane its nouns. This one makes them compose. It closes known-issues rows 1, 3
and 4 of the sketch, moves row 2 as far as the membrane alone can move it, and
leaves rows 5 (partly) and 6 open by design.

Companions that constrain this phase: [enclosure by role](../improvements/enclosure-by-role.md)
(the mechanism this phase consumes and the fixtures it must pass),
[prediction and search](../improvements/prediction-mismatch.md) (who later produces
the independent relevance signal the bid record now has a slot for),
[port contracts](../improvements/schema-guided-connections.md) (what the two new
role ports grow into), and the
[deterministic wiring fixture](../improvements/deterministic-wiring-fixtures.md)
(the test body these tests want; see §4, M1).

Read this one as: *one observation, many boundaries, one identity; and the thing
that competes is not the thing that happened.*

## 1. What this phase is

Phase 1 established that a percept has an identity, two named gate stages, a
frozen source contract, typed control requests and typed receipts. Every one of
those records is still produced and consumed by exactly one component, at exactly
one depth, with exactly one policy object it constructed itself. The sketch is
correct and uncomposable.

Three concrete failures follow, all reproducible today:

1. **An inner `open` delivers through an outer `closed`.** `MSense.candidate()`
   resolves `closest('m-region[modality]')`, `registerSource` requires that the
   nearest modality region is itself, and permission is that one region's verdict.
   An enclosing region is never asked. A mind cannot have a compound sensory
   faculty whose boundary means anything.
2. **The arbiter edits the evidence.** `mInterrupts.js` does
   `record.salience = record.salience * gain` on the shared `Percept`. Two
   consumers of the same observation cannot weigh it differently, a promoted bid
   is indistinguishable from a rewritten fact, and the design's first stable
   boundary — *competing evaluations do not mutate one another* — is violated by
   the only competition that exists.
3. **A deliberate look at an unchanged world is inaudible.** `salience` is
   `changeMagnitude` times gain. Ask a source for a fresh sample through
   `requestControl`, get back a faithful description of a world that did not
   change, and it bids ~0, falls under the 0.35 threshold, is dropped, credits no
   contact, and leaves the deficit climbing toward a reflex that will ask again.
   Agency is punished for confirming.

Phase 2 fixes 1 and 2 outright and gives 3 a route: a bid record whose salience
comes from a replaceable policy reading *independent* signals, one of which is
"this observation answers a request I made". It does not decide what that signal
is worth — that is an experiment, not a refactor (§3.5).

### In scope

1. **Composed acquisition and awareness** — a cancelable, bubbling
   `percept-candidate` event; permission is the conjunction of every aperture
   provider on the path; the version chain fills with one entry per gate; the
   event stops at the membrane.
2. **Fail-closed composition** — a candidate is refused unless every provider the
   tree says is on the path actually recorded a verdict.
3. **`AttentionBid`** — the mutable competition record, split off the immutable
   evidence, carrying salience, a gain trail and the decision trail; the arbiter,
   `takePending()` and `assembleFrame` change with it.
4. **A bidding-policy seam** — `decideBid` as a pure function of independent
   signals, with `requested` (acquisition lineage) as a first-class input whose
   default weight preserves today's numbers exactly.
5. **A replaceable contact regulator** — the `regulator` role and its port; the
   built-in `Aperture` becomes the default policy, not the only one.
6. **A replaceable pressure aggregator and a fold** — each provider publishes
   `fold(own deficit, children)`; the mind-level consumer reads
   `part(mind, 'aperture')` instead of scanning for a tag.
7. **Source control that reaches through nesting** — `aperture-register`, an
   interior scan, downward forwarding of `sample` / `detail` / `focus`, and a
   nearest-owner rule for targeted requests.
8. **The conformance suite** — the executable form of the aperture role contract,
   proved by running it against a second, test-only provider.

### Out of scope (and which phase owns it)

| Not now | Owner |
|---|---|
| The full identity-root / `part()` migration across ~60 sites | [enclosure by role](../improvements/enclosure-by-role.md) phase 1, independently |
| Prediction producers, comparators, the `expect` envelope, mismatch as a bid signal | membrane phase 3 |
| Search / focus controller, the `orient` hand, cooldown lanes | membrane phase 3 |
| Choosing the weight of the `requested` signal | the experiment in §3.5, after this lands |
| Tier 1 / tier 2 implementations, grounding queries, edge models | after the lean-vs-edge-grounded experiment |
| Native media, rendition selection, model-capability advertising | membrane phase 5 |
| Studio timelines for aperture and pressure dynamics | membrane phase 6 |
| Splitting `m-region` into `m-region` + `m-aperture` | not now; see enclosure by role, *Still open* 2 |
| Migrating eager `feel()` senses under aperture control | separate, per sense |

An `AttentionBid` makes a mismatch signal look one line away. It is not. Adding a
producer for it here would ship an untested attention policy inside a refactor.

### The compatibility promise

As in phase 1, this is a refactor. It must hold that:

- every existing `.archml` in `architecture/` behaves exactly as before — none of
  them declares `modality`, and none nests regions, so the composed path is
  reached only by tests and the demo;
- effective salience at the global arbiter is **numerically identical** for every
  existing wiring: the aperture's `gain` and a nested arbiter's `gain` move from
  mutating a record to entries in a gain trail, and the product is unchanged;
- `renderForFrame()` output and the assembled prefill stay byte-for-byte
  identical for every legacy record class;
- the `decision` topic, `../@interrupt-request` (mWs, mSpeech) and the Studio
  payloads keep their field shapes;
- `bun run test` stays green and `bun scripts/dev/demo-membrane.mjs` still runs
  offline with no model call;
- nothing content-bearing appears in a topic, log line, DOM event or Studio event
  that did not appear there before — `percept-candidate` bubbles through the whole
  mind and is the new leak surface to prove closed (§6).

## 2. Prerequisite: the minimum slice of enclosure by role

This phase cannot be built on `closest()`. Composition means "every provider of
the aperture role on the path", and substitution means "a provider whose tag I do
not know". Both are exactly what
[enclosure by role](../improvements/enclosure-by-role.md) supplies.

Required before M2, and delivered as **M1 of this plan** because nothing else can
start without it:

- `static provides` on `MRegion` (`faculty`, plus `aperture` when `modality` is
  present), `MInterrupts` (`arbiter`), `MMind` / `MAgent` / `MSociety` (identity
  roots), and `MSense` (`source`);
- the role table and `provides` reflection in `loadMindComponents`'s inert window,
  plus reflection in `MBaseComponent.connectedCallback` for runtime-created
  elements;
- `enclosing(role)`, `enclosingAll(role)`, `membrane()`, `part(role)`,
  `provides(role)` on `MBaseComponent`;
- migration of exactly the aperture/faculty/arbiter lookups —
  `mSense.js:78`, `mRegion.js:87,88`, `mInterrupts.js:70,71`, `mMind.js:456` (`_arbiter()` becomes
  "top-level `arbiter` in the membrane"), and
  the `querySelectorAll('m-region[modality]')` scan at `mInterrupts.js:215` (which
  M8 needs anyway). Enclosure by role's migration table lists these at their
  pre-phase-1 line numbers; these are the current ones.

Explicitly **not** required: the `membrane()` sweep over ~20 files, the `part()`
sweep over ~15, and the `..[provides~="mind"]/…` ref rewrite. Those are enclosure
by role's own phase 1, they are mechanical, and they can land before, during or
after this phase without interacting with it. Do not fold them in to "finish the
migration"; a large mechanical diff inside a semantic refactor hides both.

If enclosure phase 0 has already landed, M1 is a no-op and this plan starts at M2.

## 3. The design

### 3.1 The composed gate

`registerSource`'s offer path stops deciding permission by itself. It dispatches a
cancelable event and reads the conjunction:

```js
// mRegion.js, in the offer path — once per stage
const detail = {
  stage,                       // 'acquisition' | 'awareness'
  header: candidate,           // the frozen PerceptCandidate; materializer stays private
  origin: element,             // the source element, for enclosingOf checks
  contract,                    // the frozen SourceContract built at registration
  verdicts: [],                // each gate pushes its GateVerdict
  versions: [],                // each gate pushes { gate, version }
  gainTrail: [],               // each gate may push { gate, factor } with factor <= 1
}
const event = new CustomEvent('percept-candidate', { bubbles: true, cancelable: true, detail })
element.dispatchEvent(event)
const permitted = !event.defaultPrevented && this._everyGateAnswered(detail)
```

Rules, each of which is a test:

- **Conjunction, not precedence.** Every aperture provider on the path listens;
  none calls `stopPropagation()`; a provider that forbids calls `preventDefault()`
  and pushes a refusing verdict. Permission is therefore order-independent.
- **Policy comes from the contract in the detail, not from the origin element.**
  Enclosure by role says each gate reads trusted policy from `origin`'s
  attributes; phase 1 says exactly one place maps attributes to authority. The
  second rule wins: the *registering* provider builds the frozen `SourceContract`
  once and puts it in the detail; outer gates read it and may not re-read the
  element. Same authority, one mapping site.
- **Monotone authority.** An enclosing gate may refuse and may attenuate
  (`factor <= 1`, enforced); it may never permit what a nearer gate refused, and it
  may not push a factor above 1. `bypassAperture` on the contract crosses every
  *voluntary* gate on the path, at the acquisition stage only.
- **Fail closed.** After dispatch the issuer compares the set of gates that
  recorded a verdict against `enclosingAll('aperture')` including itself. A missing
  verdict — a rogue `stopPropagation`, a provider that threw, an element removed
  mid-dispatch — refuses the candidate with reason `gate-missing`. A listener
  bug must not read as permission.
- **The membrane stops it.** `MMind` / `MAgent` / `MSociety` listen for
  `percept-candidate` and `stopPropagation()`. Structural events never cross a
  membrane; a society must not gate its members' perception.
- **Gate identity.** `GateVerdict.gate` and each version entry's `gate` become the
  provider's stable id (`name` attribute, else `localName`). Aperture provider
  names must be unique within a membrane; a duplicate throws at connect, like a
  duplicate source name in a region.

### 3.2 Awareness as a second composed pass

Phase 1's `permitAwareness` is a second real call. Phase 2 makes it a second
dispatch of the same event with `stage: 'awareness'`, after materialization and
before `interrupt-request`. At tier 0 every gate answers `tier-0-mirror` again, so
behavior is unchanged; the point is that a provider can now answer the two stages
*differently*, which is what a tier-1 source will need: acquire and score
privately, disclose nothing.

This supersedes enclosure by role's *Still open* 1, which proposed a capture-phase
veto on `interrupt-request` for the awareness gate. Reusing `percept-candidate`
needs no second mechanism, keeps the awareness decision on the same record as the
acquisition decision, and keeps arbiters entirely out of the membrane's business.
Record the choice in that note when this lands.

The version chain then does what phase 1 built it for. `_versionsHold` compares
every recorded `{ gate, version }` against that gate's live version — so an
orientation change in an *outer* region during materialization drops the percept
exactly as a local one does. Each version entry carries a non-enumerable
`provider` back-reference used only for the re-check; the enumerable pair stays
`{ gate, version }` so it can be journaled.

### 3.3 `AttentionBid`: the split

```js
// src/infrastructure/attentionBid.js
AttentionBid {
  id, evidenceId, createdAt,
  salience,                       // mutable — the only mutable number in the path
  gainTrail: [{ gate, factor }],  // appended, never rewritten
  decisions: [{ by, accepted, why, at }],
  urgent, bypassAdmission,        // copied from the evidence's frozen policy at creation
  // non-enumerable: evidence
}
AttentionBid.from(detail)         // a bid passes through; anything else is coerced via Percept.fromInterrupt
AttentionBid.evidenceOf(x)        // the bid's evidence, or Percept.fromInterrupt(x)
decideBid({ evidence, signals, gainTrail }) → number   // pure; §3.5
```

The bid delegates the read surface the existing listeners use — `source`, `type`,
`reason`, `dateTime`, `clearsTail`, `infoton`, `renderForFrame()` — to its
evidence, so `mWs`, `mSpeech`, the `decision` topic and Studio see the shapes they
see today, with `salience` now correctly reporting the *bid's* gained value rather
than a rewritten fact.

Changes that follow:

| Site | Today | After |
|---|---|---|
| `mRegion` offer path | builds a `Percept` with `salience = changeMagnitude * gain` | builds the `Percept` with the raw bidding-policy salience, then an `AttentionBid` carrying the composed `gainTrail`; dispatches the bid |
| `mInterrupts._onRequest` | `Percept.fromInterrupt(e.detail)` | `AttentionBid.from(e.detail)`; every gate/threshold/rate check reads `bid.salience` |
| nested promotion | `record.salience = clamp(record.salience * gain)` | `bid.gainTrail.push({ gate, factor })`; `bid.salience` recomputed from the trail; the evidence is untouched |
| `_publishDecision` | reads the record | reads the bid; also appends to `bid.decisions` |
| `takePending()` | returns records | returns bids (so `mMind._selectClear`'s salience sort is unchanged) |
| `assembleFrame` line 600 | `stimuli.map(s => Percept.fromInterrupt(s))` | `stimuli.map(AttentionBid.evidenceOf)` — **critical**: coercing a bid through `Percept.fromInterrupt` would mint a new id and silently break receipt crediting |

`Percept` is frozen at the end of its constructor. If the suite finds a legitimate
post-issue write, do not unfreeze quietly: name it in the commit and add a test
that it is the only one. Phase 1 §6 already forbade adding a second mutation; this
removes the first.

### 3.4 The regulator port and the two grains of replaceability

Two different things were tangled in "`m-region` owns a fixed `Aperture`":

- **Gate policy** — what a boundary permits. Replaced by substituting the whole
  provider (a class in a `components/` bundle declaring `static provides =
  { aperture: true }`). Fixtures S1 and C1 prove it.
- **Contact dynamics** — how debt grows, habituates, and triggers the reflex.
  Replaced without touching the gate, by placing a provider of the new `regulator`
  role inside the aperture provider.

```js
// role: 'regulator' — the port MRegion resolves with this.part('regulator') ?? new Aperture(...)
{ state, focus, deficit, gain, version,          // readable
  allows(sourceName, powers) → bool,
  observe(sourceName, candidate, now),           // PerceptCandidate only; EdgeEvidence refused
  advance(now, { awake, arousal }) → changed,
  orient(state, { source, now }) → accepted,
  attended(occurredAt, now) → credited }
```

`Aperture` stays exactly as it is and is documented as *the reference policy, not
the provider*. The port is validated at connect with a clear message naming the
missing method — a wiring mistake fails loudly, as phase 1 established.

### 3.5 The bidding policy and the route for expected observations

```js
decideBid({ evidence, signals, gainTrail }) → salience
signals = { changeMagnitude, requested, novelty }     // independent, never merged upstream
```

`requested` is true when the observation carries a `requestId` — it answers a
`sample` or `detail` request the mind itself issued. This is acquisition lineage,
not causal attribution and not a prediction: the membrane owns the control
request, so it may honestly say "I asked for this". It may not say "I expected
this", which needs a producer that does not exist.

The reference policy is:

```js
salience = clamp01(max(changeMagnitude, requested ? requestedFloor : 0)) * product(gainTrail factors)
```

with **`requestedFloor` defaulting to 0**, declared as an attribute on the aperture
provider. At the default it is arithmetically identical to today. Turning it on is
the smallest form of the "expected confirmations need independent relevance"
experiment, and it belongs to the experiment matrix, not to a refactor: phase 1
§9.4 fixed the rule that this phase does not silently retune anything.

So what phase 2 delivers for "expected observations retain a route to attention"
is the *route*, and a test that proves the route carries: with
`requestedFloor="0.5"`, a zero-change sample answering a control request reaches
the frame and credits contact. What it deliberately does not deliver is a chosen
number. Say this plainly in the docs; a reader must not mistake a seam for a
policy.

`novelty` is listed in the signal set and passed as `null`. It has a producer in
neither phase; the slot exists so phase 3 does not invent a fourth shape.

### 3.6 Registration, forwarding, and the pressure fold

- **`aperture-register`.** A source registers with `enclosing('aperture')`, which
  stops the event. An aperture provider registers *itself* once with its own
  enclosing provider, so providers form a tree. Providers also scan their interior
  with a `part`-style lookup on connect, so connect order does not matter (Law 1
  transparency, both directions).
- **Forwarding.** `requestControl` delivers to a provider's own sources and then
  forwards to registered child providers. A **targeted** request is delivered by
  the nearest provider that owns a source of that name and is not forwarded
  further; an untargeted one fans out, each provider applying its own
  `allows()` skip. Dropping remains not-an-error.
- **The fold.** Each provider publishes
  `contactPressure = fold(ownDeficit, ...childPressures)`, default fold `max`: an
  outer boundary should feel its most-starved interior channel, and a mean hides
  exactly the channel the reflex exists to rescue. A child notifies its registered
  parent after publishing; the parent refolds and republishes. Registration is a
  tree, so this terminates.
- **Aggregation.** `mInterrupts._updateContactPressure`'s global branch reads
  `part(mind, 'aperture')` — top-level providers only, each already folded — and
  keeps its 60-second mean. With no nesting this is the same set and the same
  number as the `querySelectorAll('m-region[modality]')` scan it replaces. A
  provider of the new `aggregator` role inside the mind, if present, supplies the
  published pressure instead; absent one, the built-in mean is the default (Law 2:
  the membrane supplies the default for every role).

Crediting needs no change: `_issued` is keyed by percept id and only the issuing
provider holds the id, so *nearest credits* already holds. Fixture P1 proves it
rather than asserting it, and design open question 6's double-counting half is
answered structurally: one issuer, one crediting gate, one fold.

## 4. Milestones

Each is independently committable with the suite green. **Split point after M5**:
M1–M5 are "composition and the split" and are worth landing as one series; M6–M9
are "replaceability and conformance".

| # | Milestone | Done when |
|---|---|---|
| M1 | Enclosure-by-role minimum slice (§2) | Fixtures R1, A1 pass; the five listed lookups are migrated; every other test untouched and green |
| M2 | `percept-candidate` at the acquisition stage: conjunction, contract-in-detail, gate identity, fail-closed, membrane stop | Fixtures W1, W2, W3 pass — W3 (outer `closed`, inner `open`) is the review's reproduction and **fails today** |
| M3 | Awareness as a second composed pass; version chain filled by every gate and re-checked per gate | An outer orientation during an inner materialization drops the percept; an awareness refusal at any depth never reaches `interrupt-request` |
| M4 | `AttentionBid`; arbiter, `takePending`, `assembleFrame` and the `decision` topic moved onto it; `Percept` frozen | Effective salience numerically identical for every existing wiring; no write to a `Percept` after issue; receipt ids still credit |
| M5 | `decideBid` with the independent signal set; `requestedFloor` declared, default 0 | Default is arithmetically identical to today; with the floor set, a zero-change requested sample reaches the frame and credits contact |
| M6 | `regulator` role and port; `Aperture` becomes the default policy; port validation at connect | A test regulator replaces the dynamics with the gate untouched; a malformed one fails loudly by name |
| M7 | `aperture-register`, interior scan, downward forwarding, nearest-owner targeting | A request issued at an outer provider reaches an inner source; a targeted request is delivered once |
| M8 | Pressure fold, `aggregator` role, `part(mind, 'aperture')` in `mInterrupts` | Fixture P1: outer pressure equals the fold, debt credited exactly once; global mean unchanged for flat architectures |
| M9 | Conformance suite C1 + `m-test-aperture` (S1); demo, docs, honesty pass (§7) | The suite passes against both providers; the demo prints a two-deep composed refusal, a bid with its gain trail, and one receipt |

If the [deterministic wiring fixture](../improvements/deterministic-wiring-fixtures.md)
has landed by M2, adopt it here and drop the `delay(40)` setup — this phase adds
nested mounts, in-flight materializers and cross-provider timing, which is exactly
the case it was proposed for. If it has not, do **not** build it inside this phase;
note the debt and keep the present test shape.

## 5. Contract tests

The phase-1 group stays and must keep passing unchanged except where a signature
moved. New groups:

**Composition**
1. **W3, the reproduction** — outer `closed`, inner `open`: zero materializer
   calls, zero bids, zero journal lines, no withheld text in any payload.
2. **Order independence** — the same nesting with the providers' listeners
   registered in the opposite order yields the same verdict.
3. **Fail closed** — a listener that calls `stopPropagation()` produces a refusal
   with reason `gate-missing`, not an admission.
4. **Monotone authority** — an outer gate cannot permit what an inner refused, and
   a gain factor above 1 from an enclosing gate is rejected at the push.
5. **Bypass** — a trusted `bypassAperture` source crosses two closed gates; a
   payload claiming the same crosses nothing.
6. **Membrane stop** — a `percept-candidate` inside a society member is not heard
   by another member or by the society.
7. **Versions across gates** — an *outer* orientation during materialization drops
   the percept, driven by that gate's recorded version.
8. **Wrap invariance (W1, W2)** — wrapping a sense in a role-less region, then in
   an identity aperture, changes no ordered receipt.

**Evidence and bid**
9. **No mutation** — after a two-level promotion the evidence's salience,
   renditions and gate trail are identical to issue; the bid carries the gain trail
   and their product equals today's number.
10. **Independence** — two bids on the same evidence take different gain and reach
    different verdicts without either seeing the other.
11. **Identity through the split** — the percept id survives bid creation,
    promotion, `takePending`, `assembleFrame` and the receipt; `evidenceOf` on a
    bid never mints a new id.
12. **Requested route** — zero change, `requestedFloor` set: the sample reaches the
    frame and credits; the same at the default floor does not. Both are recorded
    honestly on the `decision` topic.

**Replaceability**
13. **C1, the conformance suite** — the aperture message table run against a
    provider: veto, nearest-credits, id-based receipt, fold, forwarding, control
    delivery. Parameterized by mounted architecture.
14. **S1** — `m-test-aperture` from a `components/` bundle passes C1 and produces
    receipts identical to the baseline.
15. **Regulator substitution** — an alternative `regulator` changes the reflex
    timing and nothing else; a port-incomplete one throws at connect naming the
    missing method.
16. **P1** — nested providers, one suppressed header: the outer pressure equals the
    fold and the debt is credited exactly once.
17. **Aggregator substitution** — with an `aggregator` present the global
    threshold follows it; without one, the built-in mean and today's numbers.

**Leakage**
18. **`percept-candidate` carries no content** — a listener attached anywhere in
    the mind sees no text, no materializer, no un-hashed change key, and cannot
    obtain the rendition by any enumerable path.

## 6. Forward compatibility — things to get right the first time

- **`percept-candidate` is the new leak surface.** It bubbles through the entire
  mind, so any component can hear it. The materializer must stay in the private
  field, the contract must stay frozen, and the detail must never gain a text
  field "for debugging". Test 18 is the guard; keep it in the same file as the
  event.
- **The bid never becomes the evidence.** `AttentionBid.evidenceOf` is the only
  way back to the record, and it is the only thing frame assembly may call. Any
  new consumer that starts reading `bid.reason` for archival purposes is a
  regression waiting to be journaled.
- **Everything that will be plural is already a list** — `verdicts`, `versions`,
  `gainTrail`, `decisions`, `evidenceIds`, `renditions`, and the signal set.
- **Providers form a tree, not a graph.** Registration is nearest-only in both
  directions. If a later design wants a provider registered with two parents, that
  is a new protocol, not a relaxed rule; the fold's termination depends on it.
- **`decideGate` and `decideBid` stay pure.** No DOM, no component state. Phase 3
  will call `decideBid` with a mismatch signal from somewhere else entirely.
- **One lookup site per file, still.** After M1 the aperture and faculty lookups go
  through `enclosing()`. Do not add new `closest()` calls; do not pre-migrate the
  rows enclosure by role phase 1 owns.
- **Signals do not merge upstream.** `changeMagnitude`, `requested`, `novelty`, and
  later mismatch and target relevance arrive at `decideBid` separately or not at
  all. A helper that pre-combines two of them for convenience is the exact failure
  the sketch's known-issue row 2 records.

## 7. Honesty and documentation

When the code is in, update — briefly and without overclaiming:

- `doc/architecture/perceptual-membrane.md`: the *Implementation sketch* section
  (gates compose; the awareness stage is a second composed pass; evidence is
  immutable and bids are separate; the regulator and aggregator are replaceable
  through wiring; control reaches through nesting) and the **known-issues table**:
  rows 1, 3 and 4 close; row 2 becomes "the bid is separate and derives salience
  from independent signals through a replaceable policy; no independent relevance
  producer exists and the default weights are unchanged"; row 5 keeps its
  controller gap and loses its nesting gap; row 6 is untouched. Open question 6
  loses its double-counting half and keeps its simultaneous-orientation half.
  Add a link to this plan from the development order and mark step 2 implemented.
- `doc/improvements/enclosure-by-role.md`: mark phase 0 landed and the aperture
  protocol implemented; record that *Still open* 1 was decided in favor of a
  second `percept-candidate` pass; note that S1/C1 landed here.
- `doc/architecture/components.md`: `m-region`'s `@interface` — the `regulator`
  and `aggregator` roles, `requestedFloor`, the `percept-candidate` event, the
  fold, and the registration protocol; `m-interrupts` — bids, the gain trail, and
  `part`-based aggregation.
- `doc/extending.md`: a short section on replacing a contact regulator or an
  aperture provider, pointing at the conformance suite as the contract. This is the
  first operator-visible surface the membrane has produced, so unlike phase 1 it
  needs a home in all three places: the design note, the component interface, and
  one user-facing page.
- Class-level comments in `mRegion.js`, `mInterrupts.js`, `aperture.js` in the
  existing voice, including that `Aperture` is the reference policy, not the
  provider.
- Say plainly what still does not exist: prediction, search, the `orient` hand,
  tiers 1–2, native media, an independent relevance producer, and any chosen value
  for `requestedFloor`.

## 8. Definition of done

- `bun run test` green (unit + wiring), including all of §5.
- `bun scripts/dev/demo-membrane.mjs` runs offline, no model call, and shows a
  two-deep composed refusal, the same candidate admitted when the outer boundary
  opens, a bid with its gain trail, and one receipt crediting exactly one provider.
- No behavior change for any architecture in `architecture/`: a `dry-fast` spot
  check produces the same frames, and a recorded before/after of effective salience
  for the nested-attention example is identical.
- The docs of §7 updated in the same series as the code they describe.
- Commits in the repo's voice, one per milestone or coherent pair, e.g.
  `feat: compose every aperture on a candidate's path`, `refactor: split the
  attention bid off the evidence it bids on`, ending with the docs commit.

## 9. Judgment calls left to the implementer

State the choice in the commit message; do not ask for a decision the code can
settle.

1. **Where the bid is first built.** The plan has `m-region` build it, because the
   aperture's gain belongs to the composed pass. Building it in the arbiter and
   passing the gain trail on the event detail is acceptable if it turns out
   simpler — provided the evidence is still never mutated and the trail is not lost
   for legacy producers.
2. **Whether `versions` keeps a non-enumerable provider back-reference** or the
   issuer resolves gates by id through `enclosingAll('aperture')` at re-check time.
   Prefer whichever survives a provider being removed mid-materialization without a
   special case.
3. **Fold shape.** `max` is the reference choice and the reason is in §3.6. If a
   fixture shows `max` making an outer reflex fire for a channel the mind is
   deliberately narrow on, record it and propose the alternative — do not quietly
   switch to a mean.
4. **How much of the read surface `AttentionBid` delegates.** Enough for `mWs`,
   `mSpeech`, the `decision` topic and `_selectClear`; not so much that it becomes
   a second `Percept`. If the list grows past about eight members, that is evidence
   for changing the consumers instead.
5. **Thresholds and time constants stay as they are.** Unchanged from phase 1
   §9.4, and it now also covers `requestedFloor`, whose default is 0 for exactly
   this reason.
