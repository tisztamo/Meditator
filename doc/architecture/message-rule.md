# The message rule — interaction that survives a process boundary

> **Status: adopted as the target, measured, migration not started (2026-09-26).**
> The analysis behind it is
> [message-rule-async-review.md](../improvements/message-rule-async-review.md).
> This page states the rule, the one exception, and how the tree is held to it.
> It sits beside [decoupling.md](decoupling.md), which says *who* may reach
> *whom*. This page says what may cross between them.

## Why

The decoupling migration moved the wires into the `.archml`, but what crosses
them still assumes one JavaScript heap and one call stack. About 60 sites call
methods on elements looked up by role. About 25 events carry functions,
elements or class instances. Six protocols are request/response over jsdom's
*synchronous* `dispatchEvent`: the sender reads verdicts, holds or
`defaultPrevented` after `fire()` returns. None of that survives a worker, a
second host, or a sandbox. Two delivery semantics in one tree have already
produced an ordering bug: Amanita's `pub()` is delivered on a microtask while
`fire()` runs listeners inside the call.

A synchronous `dispatchEvent` is an accident of jsdom, not a design choice. So
there is **one rule, not a local/remote split**. An async request that resolves
on the next microtask costs nothing to a mind whose timescale is seconds, and
the synchronous protocols (gates, governance, hands) are exactly the ones a
distributed mind would want to move first.

## The rule

> **M1 — Messages only.** A component interacts with another only through
> (a) a retained topic it publishes about itself, (b) a bubbling event it fires
> about its own intent, or (c) a request/reply pair. Never a method call on an
> element it looked up.
>
> **M2 — Plain data.** Payloads are JSON-serializable: no functions, elements,
> promises, signals or class instances. Identity is an `id`. Behaviour is a pure
> module function over the data (`renderBid(bid)`, not `bid.renderForFrame()`).
> A payload is never mutated after sending; a change is a new message.
>
> **M3 — Nothing is read back from a message.** No return values, no
> `defaultPrevented`, no filling an array in `detail`. A veto, a verdict or a
> registration acknowledgement is a reply message.
>
> **M4 — Lookups build addresses, not handles.** `part()`, `enclosing()` and
> `membrane()` run at connect (or on a structural event) and yield a `name`, a
> `provides` list, a count, or a ref to subscribe to. Their result is never
> called.
>
> **M5 — Order is carried, not assumed.** Two messages on different channels
> have no guaranteed order. Anything that must correlate carries an id
> (`frameId`, `burstIndex`, `callId`, `requestId`) or a sequence number.
>
> **M6 — Every wait has a deadline.** A request declares a timeout, and a
> missing reply is a defined outcome (abstain, skip, degrade), never a hang.

**The one exception.** A component may run synchronous code over *its own
subtree* when that subtree is not itself a component: plain child elements it
owns, such as `m-fact` rows and `m-phrase` strings. "Owns" means the children
would never be distributed separately. The exception is checkable (the tag is
not a registered component), and it is not a mode.

**The one seam to add.** `request()` / `respond()` on `MBaseComponent`, built
over `fire` + `sub` with a correlation id and a deadline, returning a Promise.
The review's §5 table maps every current protocol onto it, or onto the plain
`pub`, `fire` and `backstage` that already exist.

Design decisions for the seam (settled, not yet built):

- **Reply routing.** Events only bubble up, and a topic reply would need the
  requester to know the responder's address. So `request(name, data,
  {deadline})` fires a bubbling event carrying a `requestId`, and
  `respond(name, handler)` replies with a **non-bubbling event dispatched on the
  requesting element** (`event.target`). That reach to the target breaks M4, so
  it lives only inside the helper, which is infrastructure, not component code.
  It is also the shape Amanita's worker proxies forward: the element stays on the
  host. If the transport changes, only the helper changes.
- **Quorum.** `requestAll(name, data, {expect, deadline})` collects replies
  until `expect` have answered or the deadline passes. Gates and governance use
  it, and a missing gate counts as deny (monotone authority).
- **Deadline (M6).** A timeout resolves to `{status: "timeout"}`. It never
  rejects silently and never hangs. Callers map it to abstain, skip or degrade.
  For sleep it is reported as "not confirmed" (Covenant).
- **Payloads** obey M2. `requestId`s are plain strings, and cancellation is a
  `cancel {requestId}` message.
- **Pilot order.** Add the `ready`, `identity` and `sleeping` retained topics
  alongside the seam, then pilot it on **sleep** (the mind asks, memory replies
  `slept {id, committed}`, with region/act/search aborts fanning out) before
  hands. Sleep has one requester and one responder, so it proves the deadline
  path cheaply. Hands mean 14 capability specs plus m-agent's duplicate
  assembler. Fixing the missing `_finalized` guard in `mMemory.note()` (review
  §9, bug 2) belongs in the same pass.
- **Done means:** the protocol's contract test turns green under
  `bun run test:async` **without editing the test**, the old-API tests for
  that protocol are rewritten against messages, and `--update` shrinks the
  baseline.

## How the tree is held to it

The rule is enforced by measurement rather than by audit list.

**Delivery chaos** (`src/infrastructure/deliveryChaos.js`, installed by
`src/startup/jsdom.js`). It is inert unless asked for:

| Env var | Effect |
|---|---|
| `MEDITATOR_DELIVERY=microtask\|macrotask\|jitter` | Every `CustomEvent` is delivered after `dispatchEvent` returns, on a **copy** of `detail`. The sender gets `true` back and its own event is never dispatched, so every read-back (M3) comes back empty, exactly as it would across a boundary. `jitter` delays by a seeded 0–20 ms and so reorders channels (M5). |
| `MEDITATOR_DELIVERY_SEED` | PRNG seed for `jitter`. |
| `MEDITATOR_DELIVERY_WIRE=ref\|json` | What a deferred listener receives. `ref` (default) copies only arrays and records, and passes functions, elements and class instances by reference. `json` is a JSON round trip, as a process boundary would do: functions and elements vanish, and instances arrive as plain records without methods. Only `json` exposes protocols that live in a shared mutable instance (an arbiter mutating the `AttentionBid` the sender still holds) or in a callback (`execute`, `sample`, `deny`/`hold`). |
| `MEDITATOR_DELIVERY_CHECK=report\|throw` | The M2 walk over every fired `detail` and every `pub()` value from an `MBaseComponent`: functions, elements, promises, signals, class instances, cycles, and a sender mutating its payload after send. On by default in any deferred mode. |
| `MEDITATOR_DELIVERY_REPORT=path` | Write the violation registry as JSON. |

It hooks `EventTarget.prototype.dispatchEvent`, so it covers `fire()`, raw
`dispatchEvent` calls, test stubs and Studio panes alike. It works for a dry
smoke run as well as for tests.

**The ratchet** (`bun run test:async`, i.e. `tools/delivery-chaos.mjs`). It
runs the unit and wiring suites under the strongest simulation (`macrotask`
delivery over the `json` wire) and compares the result with
`architecture/tests/async-baseline.json`:

- the tests that fail under async delivery;
- the M2 violation kinds, keyed `channel|name|kind`;
- the number of direct role-port method calls in tests (`.takePending(`,
  `.requestControl(`, …). Those tests stay green under chaos only because they
  drive the old API. The count may only shrink.

Anything **new** fails the check. So does anything **fixed** but still listed.
Each migration step ends with `--update`, which shrinks the file. The baseline
is never edited by hand. `--mode jitter --seed N` and `--wire ref` (timing
alone) explore without comparing.

**Contract tests** (`architecture/tests/wiring/contracts/`). There is one file
per synchronous protocol. Each pins the *observable* outcome that must survive
the migration, such as "a gate's veto keeps the percept out" or "a halt stops
the loop at that turn", using real components on both sides and no method calls
to drive or observe. Each passes today. The ones that depend on synchronous
dispatch fail under chaos and are listed in the baseline. A migration step is
done when its contract turns green under chaos without changing the test.

**Where it stands (2026-09-26, first baseline).** Under `macrotask` + `json`,
235 of 1127 unit and wiring tests fail, 13 plain-data violation kinds are
reported (all on `fire`, none on `pub`), and tests make 133 direct role-port
calls. 21 of the 38 contract tests are red: agent governance, the agent step
round trip, capability offers, act bids, the perception gate, frame ordering,
sleep ordering and the provenance stop. What the contract tests found beyond
the audit is in the review's
[§9](../improvements/message-rule-async-review.md#9-what-the-harness-found-2026-09-26).

## What it does not change

The `.archml` stays the single wiring surface. The interrupt spine, `!scope`
addressing, the loader's reflection window, templating and `backstage` all
stay. The three laws of enclosure hold *better* under M1–M6, because a
container can only delay or drop a message, never widen what it carries. No
mind needs a new `.archml`.
