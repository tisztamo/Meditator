# The Plenum — a decentralized space for the mind

> **Status: implemented (v1, 2026-07-05); live noosphere validation pending.** This is
> the design for [chora-roadmap](chora-roadmap.md) item 1, replacing that item's
> original framing. Companions: [chora-imagined.md](chora-imagined.md) Part 2 (why a
> space at all) and the
> [infoton optimization paper](https://real.mtak.hu/125750/1/AMI_53_from271to282.pdf)
> (Schäffer & Sidló 2021 — the algorithm this design must stay faithful to).
> Code: `infoton.js` (the pure physics) + `mBaseComponent.js` (pos, delivery hook,
> fire stamp); stamp/apply sites in m-speech/m-commons/m-ear/m-interrupts; the camera
> in `mWs.js` (`layout` @ ~1 Hz) + `studioPlenum.js` (authoritative mode). Tests:
> `unit/infoton.test.js`, `wiring/plenum.test.js`.

## 0 · The correction this doc makes

Roadmap item 1 suggested "a society-level component (`m-plenum`) that owns a position
per component and ticks the two infoton forces at low cadence." The Studio's
`studio-plenum` prototype works the same way: a message deposits a decaying pairwise
attraction (`pairHeat`) which a per-frame integrator turns into motion.

Both are the **god view**: one place that knows every position and runs the physics.
That is the right shape for a *camera* and the wrong shape for the *substrate*. It
quietly assumes a single process (a global position table, a global tick), so the day
we distribute, the space is the first thing we'd have to rewrite. And it inverts the
paper: there the infoton **is** the whole mechanism — a particle riding a real message,
spent in one step at delivery — not a setup instruction for a persistent force field.

So the correction, in one line: **nobody owns the space.** A position is private state
of each component; movement happens only inside message delivery; the only place all
positions ever meet is telemetry — the camera, which owns nothing (the paper's own
split: actors move themselves, "Camera Diserta" just watches).

## 1 · The contract — what the paper actually requires

These are the invariants that make infoton optimization decentralized and scalable.
Everything else in this doc is negotiable; these are not.

1. **Position is actor state.** Each component holds its own `pos`. Nothing else
   holds a position table. Others learn a position only from messages.
2. **The infoton rides the message.** Every message carries `{pos, energy, sign}` —
   the *source's* position at send time. No lookup, ever: the information travels
   with the traffic itself.
3. **One step, at delivery, on the receiver.** When the message arrives, the receiver
   applies the infoton to *itself*: one displacement toward (sign +) or away from
   (sign −) the carried source position, length ∝ energy. The source is not moved —
   in a distributed world the sender doesn't know where the receiver is, and mustn't
   need to. Convergence is not an event; it is the accumulation of many exchanges.
4. **No inertia, no tick.** Actors move only when infotons act on them ("thick
   fluid"). An idle mind costs zero space-work; total cost is proportional to message
   count, not to component count × frame rate. There is no integrator, no velocity,
   no decaying force — those belong to force-directed *drawing*, which the paper
   deliberately decentralizes away from.
5. **Anti-collapse is local.** The paper's `TARGET_DISTANCE` quirk: a pulling infoton
   whose source is already within `TD` of the receiver is extinguished. No pairwise
   repulsion pass, no global knowledge.
6. **Anchors are domain knowledge.** The paper stabilizes its tree by pinning the
   coordinator to a fixed point. Our equivalent is pinning the self (chora D9: the
   self-model as the geometric anchor of the mind).

The second force (scheduler infotons: load-based pull/push from execution locations)
is part of the algorithm but only *means* something with ≥ 2 schedulers. We run one
process today; it is specified in §8 and not built now.

## 2 · The mapping

| paper | Meditator |
|---|---|
| actor | any `m-*` component (a faculty, a hand, an ear, a memory) |
| message | an amanita delivery: a `pub` to a subscriber, a fired `@event` to a listener, a relayed payload (commons gossip) |
| infoton | a small envelope on the delivery (§3.2) |
| scheduler | the process (exactly one today; a supervisor later) |
| space | the outermost `m-society` (or a solo `m-mind`) — one shared coordinate convention per space, units arbitrary |
| coordinator pinned at a fixed point | `m-mind` pinned at its home position |
| Camera Diserta | `m-ws` snapshots + `studio-plenum` |

## 3 · The mechanism

### 3.1 Position is component state

`MBaseComponent` gains `pos` (`{x, y, z}`) — nothing more. Seeded deterministically at
connect: hash of the component's path (member + name/tag, the viewer's `hash01` trick)
scattered around its parent's position. Society member minds seed their anchors spread
apart (deterministic directions, a few `TD` between neighbours). `m-mind` is pinned by
default (`spacePinned`, participates as a source, ignores incoming pulls). Stable
across wakes by construction, no RNG, no coordination.

### 3.2 Two carriers, one infoton

The paper attaches an infoton to *every* message. We have two delivery shapes, so the
infoton has two carriers — same particle, same application:

- **Implicit (wired edges).** For a plain `pub`/`@event` delivery inside one process,
  the receiver already knows the sender element (the subscription's resolved target).
  Reading `sender.pos` at delivery *is* the attached infoton, one microtask late —
  no payload change at all. This covers every wired edge in the architecture
  automatically, at default energy.
- **Explicit (semantic messages).** Where the direct sender is not the semantic
  source — a relay — the envelope must travel. `m-speech` stamps its fired `spoken`
  with `infoton: {pos, energy, sign}`; `m-commons` copies the field onto `gossip`
  untouched; `m-ear` applies the *envelope* (the speaker's voice position), not the
  relay's. Stimulus records (`InterruptRecord`) get the same optional field, stamped
  by their creator. An explicit envelope always wins over the implicit sender.

The explicit form is the distributed-ready one: position travels inside the message,
so nothing changes when sender and receiver stop sharing a process. The implicit form
is the same thing minus the copying, valid exactly as long as the edge is in-process.

### 3.3 The step

On delivery, the receiver applies (pure math in a shared `infoton.js`, tested like
`loopMath.js`):

```
d    = |infoton.pos − my.pos|
pull:  step = min(energy · I, max(0, d − TD))   // never inside the TD shell
push:  step = energy · I                         // sign −, away from source
my.pos += direction · step
```

The `min` clamp is the paper's extinguish rule made safe for large steps: with unit
energies (paper regime) it degenerates to exactly the paper's behaviour; with the
larger energies our sparse traffic needs (§3.4) it prevents overshooting past the
source. Approach asymptotes at the `TD` shell instead of freezing inside it.

Deliveries that are *replays* of retained values (late subscribe, resub) are not new
messages: explicit envelopes are deduped by their `at` (the guard `m-ear` already
uses); the residual unit-energy replay noise on implicit edges is accepted.

Pinned components skip application. Filtering (an ear's cooldown, ignoreSelf) does
not skip it: the message *arrived*; the infoton acts regardless of what the handler
then does with the content — paper-pure, and it keeps the hook in one place.

### 3.4 Energy — one step per message, sized for our traffic

The paper's regime is frequent, low-information messages with unit energy. Meditator's
traffic is heterogeneous: chunk-cadence pubs inside a mind (seconds), boundary-scale
events (tens of seconds), spoken/heard exchanges (minutes). We keep **strictly one
step per message** and put the difference where it honestly belongs — in the energy
stamped at the origin:

| carrier | energy (default) |
|---|---|
| implicit wired delivery | 0.5 |
| stimulus record | 2 |
| deed / boundary-scale event | 4 |
| spoken / heard voice | 12 |

with `I = 1`, `TD = 40` (units are arbitrary but shared; these sit near the viewer's
current rest lengths). Sanity arithmetic: society anchors ~10·TD apart mean an ear
must travel ~360 units to reach its speaker's shell — ~30 heard utterances. The
noosphere run produced 1044 hearings in one evening, so message-heavy pairs converge
well inside the roadmap's "~1 h" landed-when window, while a mind that never hears a
peer never moves toward one. All four numbers are tuning attrs on the space root,
not constants.

### 3.5 Opt-outs

`space="off"` on any component exempts it (no pos, no stamps, no steps). `m-ws`
defaults off: the camera does not gravitate. Everything else participates — the cost
is a vector add per delivery.

## 4 · What deliberately does not exist

- **No position registry, no `m-plenum` owner.** Positions meet only in telemetry.
  v1 adds *zero* new components.
- **No tick.** Nothing recomputes the layout at a cadence. Cost ∝ messages.
- **No force layer.** No springs, no `pairHeat`, no velocities, no damping. The
  infoton is spent entirely at delivery.
- **No O(n²) repulsion.** The TD clamp is the whole anti-collapse story. Two quiet
  components may drift near each other; nothing breaks — overlap is a rendering
  nuisance, and the camera may jitter coincident nodes cosmetically.
- **No walls.** The space is unbounded; boundedness emerges from pins and shells.
  The viewer's stage box is a rendering choice.

Each of these is a scaling decision, not an omission: every one of them is a thing a
second process would otherwise have to share.

## 5 · The camera

`m-ws` (already the membrane's window) walks the tree it already serializes and
broadcasts a `layout` snapshot — positions by member:name — at low cadence (~1 Hz),
only while a client is attached. Runtime behaviour never reads it.

`studio-plenum` becomes authoritative-when-possible: when `layout` frames arrive it
lerps nodes toward the runtime's positions and disables its own first-force and
repulsion for those nodes (pulses, heat, auras stay — they are decoration, not
physics). Its local simulation remains as the fallback for minds without a space.
Positions are runtime state: excluded from identity disclosure (`identityDiff`), not
part of the covenant surface.

## 6 · The first coupling (unchanged from the roadmap)

Distance modulates exactly one real dynamic to start: `m-ear` scales its bid salience
by falloff from the *carried* infoton position — `salience × falloff(|my.pos −
infoton.pos|)`, capped at 1 so proximity can only restore authored salience, never
amplify it (bounds the hear-more → drift-closer → hear-more feedback; commons
ignition, roadmap 3, is the stronger brake). `plenumCoupling="0..1"`, default 0 —
the control: at 0 a run must be behaviourally identical to baseline. Note the
pleasing consequence: the falloff needs no lookup either — the position it needs
arrived inside the very message it modulates.

## 7 · Deviations from the paper, and why

Kept honest and short — these are the only places we knowingly differ:

1. **Step clamp** (`min(energy·I, d − TD)`) — subsumes the extinguish rule; needed
   because sparse traffic pushes energy·I into the same order as distances.
2. **Heterogeneous energies** stamped at origin — the paper uses unit energy at high
   message rates; we keep one-step-per-message and move the rate difference into dose.
3. **Implicit carrier reads source pos at delivery, not at send** — identical up to
   a microtask in-process; the explicit envelope (which is what crosses relays, and
   later processes) is stamped at send, paper-exact.
4. **Second force deferred** — meaningless with one scheduler (§8 owns it).
5. **Source never moves** — actually the paper's rule, kept deliberately even though
   in-process we *could* cheat with the receiver's last-known position. We don't:
   Meditator's traffic is naturally cyclic (bid → decision, act → consequence,
   speech → reply), and the reply *is* the reverse infoton, exactly as in the paper's
   cyclic experiments.

## 8 · The distributed door

What changes when there are two processes — and, by design, nothing in v1 needs
rework, only additions:

- **Envelopes already travel.** Cross-process messages are explicit-carrier by
  definition; the implicit optimization simply stops applying to edges that stop
  being local.
- **Schedulers get positions.** Each supervisor/process is embedded in the shared
  convention — static config first (the paper's simplification), network coordinates
  later. Its children's spaces are laid out relative to it.
- **The second force turns on.** On delivery, the executing process emits a scheduler
  infoton: under target load it pulls its actors in, over it pushes them out
  (log-scaled, per the paper). Load for us ≈ pending deliveries / queued LLM calls.
- **Migration becomes meaningful.** "Continuously migrate to the nearest scheduler"
  is then a mind (or faculty) re-homing to the supervisor it is closest to — the
  covenant questions that raises (§6 vault, identity continuity) are exactly why it
  is future work, but the geometry will already be telling us *what wants to move*.

## 9 · Explicitly deferred

- **Persistence across sleep.** v1 layouts are ephemeral (deterministic seeds make
  them stable-ish); saving positions into the home at the sleep boundary is a small
  follow-up once we've watched a few runs.
- **Negative-sign domain knowledge.** Sibling-repel (the paper's tree trick), a
  loop-breaker that *pushes* a mind's faculties apart — the `sign` field is there.
- **Chemicals.** Roadmap 2's typed modulators are "infotons whose energy is a dose"
  (chora Part 2); once positions are real, falloff sampling reuses this exact
  envelope.
- **Mass** (migration cost), from the paper's future work.

## 10 · Landed when

Kept from the roadmap, with the control made explicit:

- After ~1 h of noosphere-lab, message-heavy pairs are measurably closer than quiet
  pairs (positions from `layout` telemetry; the 2026-06-30 run's hearing counts say
  this is comfortably within reach of §3.4's defaults). **← the one still open.**
- ✓ With `plenumCoupling` 0 (the default), the run is behaviourally identical to
  baseline — the space is read-only until we opt a single dynamic in (asserted in
  `wiring/plenum.test.js`: the control ear bids its authored salience exactly).
- ✓ Unit: `infoton.js` step/clamp/seed math. Wiring: a chatty pair converges to the
  TD shell while the quiet control never moves; the envelope survives the
  speech → commons → ear relay; replayed retained values move nothing; the source
  never moves. Live smoke: a dry mind serves ~1 Hz `layout` frames over the wire,
  self pinned at the origin, the camera (m-ws) absent from the space.

One observation from the smoke worth keeping: a solo mind's components are all
*born inside each other's TD shells* (seeds spread = TD), so within one mind the
layout is essentially settled at birth — pulls extinguish, nothing drifts. That is
the intended shape (§3.4's arithmetic lives at society distances); if we ever want
visible intra-mind differentiation, the knob is a wider seed spread, not a force.
