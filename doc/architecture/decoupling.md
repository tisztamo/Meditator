# Decoupling components — the wiring migration

> **Status: in progress.** An incremental migration to remove direct
> component-to-component method calls in favour of pub/sub topics wired in the
> architecture. See [deep-structure.md](deep-structure.md) for the broadcast-bus
> philosophy this builds on, and [components.md](components.md) for each
> component's current topics.

## The principle

> **A component never calls a sibling's method.** It only (a) publishes topics
> about itself, (b) raises `interrupt-request`s, and (c) subscribes to topics or
> DOM events by refs whose defaults are overridable in the `.archml`.

State another faculty needs to *read* becomes a published behaviour-value; an
action another faculty needs to *perform* becomes a topic that faculty subscribes
to. The wire then lives in the architecture, not baked into either component.

This is not aesthetic. The reach-in it replaces —
`closest('m-mind').querySelector('m-memory').spoke(…)` — has three fatal
properties: it is **not declared** (invisible in the `.archml`), **not
overridable**, and `querySelector` returns **exactly one** match. That last point
is the whole game: it is *why* you cannot replace memory with a different
implementation, and *why* you cannot run a second memory alongside the first.
Pub/sub is natively fan-out — one producer, N subscribers — so both fall out for
free.

## The pattern

Every cross-component dependency follows the same shape (mirroring the
`imageSrc`/`generated` wiring already in `m-memory`):

- **Producer** publishes a topic about itself and stays ignorant of consumers:
  `this.pub("spoken", { text, at })`.
- **Consumer** subscribes through an **auto-discovered, overridable** ref:

  ```js
  const explicit = this.attr("spokenSrc")
  const voice = this.closest("m-mind")?.querySelector("m-speech[name]")
  const spokenSrc = explicit || (voice ? `..m-mind/${voice.getAttribute("name")}/spoken` : null)
  if (spokenSrc && spokenSrc !== "off") this.sub(spokenSrc, this._onSpoken, 12)
  ```

  The `querySelector` here only *discovers a name to build a ref* — it never calls
  a method. The default is overridable per-mind (`spokenSrc="…"`) and disableable
  (`spokenSrc="off"`).

Two Amanita facts make this robust and are worth keeping in mind:

- **`sub()` retries** (the `12` above) with backoff, so wiring is
  **declaration-order-independent** — a consumer that connects before its producer
  upgrades simply binds a moment later.
- **Topics are behaviour-values:** `on()` replays the topic's *current* value to a
  late or re-subscriber (e.g. after a `reRender`). For event-shaped topics
  (`spoken`, `filed`, `attended`) this can re-deliver the last value, so handlers
  **dedupe** — on a timestamp (`spoken`) or object identity (`filed`, `attended`).

## Status

| Slice | Producer → topic | Consumer (via `*Src`) | State |
|-------|------------------|------------------------|-------|
| voice → memory (utterance) | `m-speech` → `spoken {text, at}` | `m-memory` `spokenSrc` → `spoke()` | ✅ done |
| voice context read | — (uses its own observer `window`) | `m-speech` reads `this.window` | ✅ done |
| scribe → memory (filing note) | `m-kb` → `filed {files}` | `m-memory` `filedSrc` → backstage `note()` | ✅ done |
| scribe context read | `m-memory` → `compressed`; stream → `m-kb` own `window` | `m-kb` `compressedSrc` + `src` | ✅ done |
| image → memory | `m-image` → `generated` | `m-memory` `imageSrc` → `imageGenerated()` | ✅ done |
| mind frame: recent/story | `m-memory` → `compressed {recent, story}` (also on load) | `m-mind` `compressedSrc` | ✅ done |
| mind frame: tail | `m-memory` → `tail` (retained, on every change) | `m-mind` `tailSrc` | ✅ done |
| mind: wake notice | `m-memory` raises `interrupt-request` on load | the arbiter → `takePending()` | ✅ done |
| mind: perceived-stimulus journaling | `m-mind` → `attended [lines]` | `m-memory` `attendedSrc` → `note()` | ✅ done |

After these, **nothing pulls a faculty's *content* by class/method.** Memory is
swappable: a replacement need only subscribe to the same inputs and publish
`compressed` + `tail`; a second memory is just a second subscriber.

## Deliberately *not* inverted

These are orchestrator/transport **contracts**, not coupling smells. They stay as
direct calls, on the same footing as the arbiter's documented `takePending()`:

- **`m-memory.finalize("sleep")`** — the sleep ritual must *await* the flush +
  persist + commit before the process exits. Pub/sub is fire-and-forget; it cannot
  express "commit completed." A lifecycle command, legitimately driven by the
  orchestrator.
- **`m-memory.persists`** (and `_whenAlive` reading `.on`/`.loaded`) — lifecycle
  *queries*: honest sleep wording, and a readiness gate before thinking starts.
- **arbiter `takePending()`** — draining the attention queue at frame time is
  pull-shaped *by design*; `deep-structure.md` treats the arbiter spine as a
  first-class mechanism.
- **`m-ws` telemetry** (`memory.getTail().length`, `economy.paceFactor()`, …) —
  transports are deliberately document-anchored: "the mind's external window, not
  part of any one faculty." Could publish a `stats` topic if purity ever matters.

## Remaining / deferred

- **`economy.paceFactor()`** (`m-mind._tickMs`) — the one remaining *content* pull
  outside the transport. Small, independent slice: have `m-economy` publish a
  retained `paceFactor` (it already publishes `energy`/`arousal`), and let
  `m-mind` mirror it. Not yet done.
- **A declarative `<m-wire from to>` connector** (Amanita-level) — would let
  *neither* side name the other and make routes legible in one place. Only worth it
  as an adapter/rename between mismatched vocabularies; the subscriber-ref pattern
  covers every current case and fits the "prefer structural-relative refs" grain.
  **Deferred** until a concrete adapter need appears.

## The same principle, in the browser

The [Studio](../studio.md) UI is an Amanita component mesh too, and it is on the
same migration: its panes already read supervisor state by subscribing to topics,
but still issue *commands* by reaching into the `studio-conn` hub and calling its
methods — the browser mirror of the reach-in this page removes. The plan to finish
it (commands as bubbling events, a swappable hub) is in
[Studio wiring](../studio-wiring.md).
