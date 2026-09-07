# Review: perceptual membrane, phase 3

**Date:** 2026-09-07
**Reviewer:** Claude (Opus 5)
**Subject:** [phase 3 implementation plan](perceptual-membrane-phase-3.md), with a
light pass over [phase 1](perceptual-membrane-phase-1.md) and
[phase 2](perceptual-membrane-phase-2.md) at plan level.

Read against the code the plan will touch: `mAct.js`, `mRegion.js`,
`mInterrupts.js`, `perceptionContracts.js`, `attentionBid.js`, `percept.js`,
`aperture.js`, `mTerminal.js`, `mMemory.js`.

## Short verdict

The plan is sound in shape and unusually well scoped. The separations it defends
are the right ones, the zero-default weights keep it from retuning anything, and
the terminal states preserve the uncertainty the design asks for.

One structural hole should be closed before M3, because it invalidates the
phase's headline path: **the plan specifies one comparison point, and the
evidence it most wants to compare never passes through it.** Two further items
(§3, §4) are contradictions or promises the code cannot keep as written.
Everything after that is additive.

## 1. Blocking: there is no comparison point for act consequences

The plan's own summary is `expect → prediction → comparator evaluates later
identified text evidence` (§1), and §3 defaults a prediction's target to the
hand's current `Sense-${name}` consequence. But §4.1 places the only comparison
seam inside `m-region`'s offer path, and **only membrane-registered lazy sources
travel that path.**

A hand consequence goes a different way:

```text
mAct.js:432   fire('interrupt-request', new InterruptRecord({…}))
mInterrupts.js:146   AttentionBid.from(e.detail)
attentionBid.js:41   default signals { changeMagnitude, requested, novelty }
```

No comparator is consulted anywhere on that route, and no bidder port is
specified there either. The default target cannot match in any case: a
consequence is `Sense-${capabilityName}` (`mAct.js:419`) while a membrane percept
is `Sense-${sourceName}` (`mRegion.js:259`). These are different namespaces that
coincide only by accidental collision.

As written, an act-bound prediction can therefore only ever expire. The offline
demonstration would not reveal this, because a demo is free to wire a simulated
source that answers the simulated act.

Three seams, with their costs:

| Option | Shape | Cost |
|---|---|---|
| **(a)** `m-act` builds the bid | It owns the prediction, the `actId`, and an already-`await`ed `execute`; it constructs the evaluations and fires an `AttentionBid` | `m-act` must mint a `Percept`, choosing `sourceId`/provenance outside `SourceContract` — needs an explicit trusted-adapter rule |
| **(b)** a shared pre-bid helper | Called by `m-region` before awareness and by the arbiter for region-less records | Makes `mInterrupts._onRequest` async; it is synchronous on purpose (decoupling.md) and stops propagation for a nested region, which an `await` would reorder |
| **(c)** narrow the phase | `expect` predicts *the next observation from a declared source*, not "the consequence of this act" | Drops the `consequenceType` default and most of §3's motivation |

(a) reads best: it keeps the arbiter's listener synchronous, keeps percept and
bid identity intact, and puts the comparison where the prediction already lives.
Whichever is chosen, §4.1 should name the two evidence paths explicitly instead
of implying there is one.

## 2. Blocking: `m-orient` plus `expect` is dead, and §5 contradicts itself

`MRegion._transition` mints its own request with no act lineage:

```js
// mRegion.js:621
this.requestControl(new ControlRequest({ kind: 'sample', issuedBy: …,
    reason: reason === 'orientation' ? 'orientation' : 'reopening' }))
```

So a sample caused by an orientation carries no `actId`, and a prediction made by
the orient act can never be settled by the observation that answers it. Since the
REALIZE envelope is uniform (§3), `m-orient` *will* receive `expect`.

Separately, §5 declares `consequenceType: 'Sense-orient'` in the capability
metadata example while the same section says an aperture transition is not a
percept and a rejected orientation creates no synthetic observation. Both cannot
be true.

Decide both together:

- either forward `OrientationRequest.actId` → the provider's sample request →
  candidate → evidence, so an orientation genuinely can be expected against;
- or declare that control-lane hands take no `expect`, do not inject it into
  their schema, and carry `consequenceType: null`.

## 3. Blocking: the envelope changes the realize prompt for every existing mind

`mAct.js:290-293` builds each tool from `cap.parameters`. Adding `expect` and
`template` to *every* tool changes the request sent to every existing
architecture's realizer, which can change which hand it picks and how it fills
arguments. §1's compatibility promise covers the *stripped* arguments, not the
prompt — so the promise as written is not true for any resident.

Make the envelope opt-in on `m-act` (default off; the reference fixture turns it
on). That makes the promise literal, and it also makes "no comparator wired, so
every prediction expires" impossible by construction.

Consider making `template` per-capability rather than uniform. On `m-note` or
`m-terminal` it is meaningless, costs prompt tokens on every realize call, and
invites a confabulated value. The prediction design's "uniform envelope" means
uniform *across hands*, not *on by default*.

## 4. Worth adding

**Comparison has no deadline and runs inside `entry.busy`.** `mRegion.js:216-281`
holds `entry.busy = true` across the whole offer path. A comparator that never
settles wedges that source permanently — every later candidate refused with
`reason: 'busy'` (`mRegion.js:207-213`) — and a merely slow one delays the next
sample and every search route behind it. §4.1 caps the *number* of evaluations
but sets no wall-clock bound. Add a bounded per-comparison deadline with
`insufficient` and a non-content diagnostic on expiry, and say plainly that
comparison sits inside the source's busy window (or move it out).

**A search controller cannot tell "refused" from "slow".** `perceptDecision`
(`mRegion.js:689-696`) carries no candidate id and no `requestId`, so `m-search`
cannot correlate an acquisition refusal with its `SearchAttempt`;
`requestControl`'s boolean only catches "not delivered at all". Every closed
route then costs a full deadline before coverage can advance. Adding
`candidateId` and `requestId` to that topic is cheap and stays non-semantic. This
is the one thing that would have been cheaper in phase 1.

**Attempt-to-evidence attribution is by arming window, not acknowledgment.**
`requestId` comes from the control stack top (`mRegion.js:173-175`, `_armControl`
at 603), so *any* candidate a source emits while an attempt is armed inherits
that attempt's id — including an unrelated spontaneous one. A route can therefore
be counted "inspected, no match" on evidence that never answered the request,
which is exactly the claim `not-detected-in-inspected-area` exists to make
honestly. Pick a rule — first candidate per attempt only, or an explicit
"answering request X" acknowledgment in the source contract — and name the
limitation beside the outcome definition.

**Publish predictions, attempts, and outcomes as events, not retained topics.**
§3 says "producer topic". After the events refactor the convention for
event-shaped signals is `fire()` / `@event`; `m-act` already does this for
`acted` and `pub`s only `intent`. A retained topic would replay the last
prediction to a comparator that connects later, which collides with the plan's
own rule that late work must not become fresh evidence.

**Say what the mind actually learns.** Phase 3 gives it an `orient` hand and a
search it can start, but specifies no route by which either result reaches
awareness: no consequence from orient, and the search outcome is a non-content
topic only. The real route is indirect and rather elegant — `targetMatch` raises
the bid of the very percept that matched, so a found target is *perceived more
strongly*. One line in §6 saying so would keep the first live run from reading as
a broken hand, and it makes clear that a search down a closed route cannot reach
awareness at all.

Related: `_realize` claims the intent-ledger slot at accept time
(`mAct.js:276`). A reach that clears the global DECIDE threshold but not
`m-orient`'s `intentThreshold` still burns that slot for `intentCooldown` (15m
default) and then evaporates — which becomes the *common* case once orientation
has a higher bar. Decide: key the ledger by intent and capability, or claim it on
execute.

**No grace period, so the hand and the reflex will reverse one another.** Phase 3
is the first phase able to produce the design's named *open–close oscillation*
failure. With the reference `Aperture`, a voluntary `closed` is reflexively
softened at deficit ≥ 0.65 (`aperture.js:54`) — about 6.5 minutes at arousal 1
with the 10-minute horizon — and can be re-closed after the 30s dwell. The design
proposes "perhaps a temporary grace period" and lists *let me remain inward a
little longer* as an intention; the plan implements neither and does not name the
omission, so `m-orient`'s `felt` line must not promise it. Add the expected
rhythm explicitly, plus tests that voluntary closure cannot outlast the reflex
and cannot suppress a `bypassAperture` source — the design states that
constraint, and it is currently only implied by phase 2's test 5.

## 5. A bug found while checking, which M1 will trip over

`m-terminal`'s deferred consequence loses its urgency at the arbiter.

```js
// mTerminal.js:270 — a plain object, not an InterruptRecord
this.fire("interrupt-request", { source: "External", type, reason: experience, salience, urgent })
```

```js
// percept.js:97-99
const trusted = detail instanceof InterruptRecord;
…
if (!trusted) { record.urgent = false; record.clearsTail = false; }
```

So the deferred result — designed to re-enter urgent precisely because it lands
in a contended window, bursts after the reach — is admitted as ambient. The
existing wiring test cannot see it: `act-terminal.test.js:66-69` listens on
`interrupt-request` at the mind and reads the raw payload, before coercion.

This is **not** a phase 1 or 2 regression. `419c3aa^:src/infrastructure/percept.js`
already carries the trust check, so it arrived with the original sketch. Phase 3
must fix it regardless, because §2.1 requires that path to carry `actId`, and a
payload cannot be trusted for lineage any more than for powers. The fix is one
line — construct an `InterruptRecord` in `_dispatch` — plus an arbiter-side
assertion in the test.

## 6. Smaller notes

- **`causalAttribution` is missing from the signal set.** The design lists six
  independent signals; §4.2 has five of them plus `confidence`. Phase 2's own
  rule — *the slot exists so phase 3 does not invent a fourth shape* — argues for
  adding `causalAttribution: null` now rather than reshaping a frozen signal set
  in phase 4.
- **Known-issues row 5 has a fourth gap phase 3 does not close.** It lists the
  search controller, the `orient` hand, *cadence control beyond the sense timer*,
  and the `template` grounding query. §10's honesty pass should keep cadence
  open: `soft` today only halves gain (`aperture.js:28`) while the design
  promises "reduced frequency, resolution, or gain".
- **Keep `ControlRequest.template` null.** §6 correctly keeps the template in the
  comparator at tier 0. Say explicitly that phase 1's reserved field stays
  unpopulated, or a template quietly reaches a source before detection — the one
  thing tier 0 forbids.
- **Cap live predictions and targets.** Evaluations per percept are capped;
  retained predictions and search targets are not. Every other bounded structure
  in this series has an explicit cap (32 sources, 32 issued ids).
- **State each new port's scope and say why they differ.** The comparator is
  mind-level (`part(membrane, …)`), the bidder is interior to the issuing
  aperture — consistent with `requestedFloor` being nearest-owned
  (`mRegion.js:428-437`) — but the plan does not say so, and duplicate handling
  reads as one rule for both.
- **Strip the envelope from `acted.args`.** `mMemory._onActed`
  (`mMemory.js:405-413`) journals only capability and intent, so memory is safe —
  but `acted` also reaches Studio carrying `args`, which would then contain
  `expect` and break §1's "no expectation text in Studio events". §3 adds
  `actId` and `predictionId` to that payload; say that `args` is the *stripped*
  `handArgs`.

## 7. Phases 1 and 2, at plan level

Both hold up, and the code matches the plans more closely than most
implementations do. Nothing there looks worth going back for.

- Phase 1's *one mapping site for authority* (`SourceContract.fromElement`) and
  *everything plural is already a list* paid off exactly as intended: `versions`,
  `gainTrail`, `verdicts`, and `evidenceIds` absorbed phase 2 without reshaping.
  Phase 3's `ComparableEvidence` deriving from the frozen `Percept` continues
  that correctly.
- Phase 2 §9.1 settled *where the bid is first built* in favour of `m-region`.
  Finding 1 is that decision's bill: a second evidence producer now needs the
  same seam, and the plan did not notice there was a second producer.
- `Percept.salience` is now raw change magnitude while the bid carries the gained
  value. Phase 2 §6 warned that a new consumer reading `bid.reason` for archival
  purposes is "a regression waiting to be journaled" — worth repeating in phase
  3's class comments, since `ComparableEvidence` is precisely a new reader of
  that surface.

## 8. Edits to the plan

**Applied, 2026-09-07.** All fourteen are in the plan; this table stays as the
record of what changed and why, so a reader of the revised plan can find the
argument behind any one of them here.

Three were decisions, not edits. They were taken as recommended above, and each
is marked in the plan where a reader will meet it, so any one can be reversed by
reading a single paragraph:

| Decision | Taken | Where it is argued |
|---|---|---|
| Comparison seam | **(a)** — the producer of the evidence consults the comparator and builds the bid; `m-act` does this for its own consequence | plan §1 (after the flow diagram), §3, §4.1 |
| Orientation lineage | **forward `actId`** through the transition's sample, so `expect` on `orient` can settle; `consequenceType: null` because orienting is not a sensation | plan §2.3, §5 |
| Envelope | **opt-in** on `m-act`, default off; `template` per-capability | plan §1, §3 |

| # | Section | Change |
|---|---|---|
| 1 | §1, §4.1 | Name both evidence paths; choose the comparison seam (finding 1) and adjust M3/M4 accordingly |
| 2 | §2.1, §5 | Decide orientation lineage: forward `actId` through the transition sample, or refuse `expect` on control-lane hands and set `consequenceType: null` |
| 3 | §1, §3 | Make the REALIZE envelope opt-in on `m-act`; restate the compatibility promise to cover the realize request, not only the stripped arguments |
| 4 | §3 | Make `template` per-capability rather than uniform |
| 5 | §4.1 | Add a comparison deadline and state that comparison runs inside the source's busy window |
| 6 | §2.2, §6 | Add `candidateId` and `requestId` to `perceptDecision`; use them to advance a refused route without waiting for its deadline |
| 7 | §2.2, §6 | Choose the attempt-to-evidence attribution rule and name its limitation beside `not-detected-in-inspected-area` |
| 8 | §3, §6 | Publish `Prediction`, `SearchAttempt`, and `SearchOutcome` as events, not retained topics |
| 9 | §6 | State the indirect route by which a found target reaches awareness (`targetMatch` on the matching percept's bid) |
| 10 | §5 | State the hand/reflex rhythm; note the grace period as deliberately deferred; add the two constraint tests |
| 11 | §4.2 | Add `causalAttribution: null` to the signal set |
| 12 | §7, §10 | Fix `m-terminal._dispatch` to fire an `InterruptRecord` under M1; keep row 5 open on cadence control |
| 13 | §4.1, §6 | Cap live predictions and targets; keep `ControlRequest.template` null; scope-and-duplicates rule per port |
| 14 | §3 | Say that `acted.args` is the stripped `handArgs` |
