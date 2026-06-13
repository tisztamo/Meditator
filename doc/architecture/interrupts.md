# Interrupts & observers

The world reaches a Meditator mind only as **interruptions**. So do its own
internal nudges — a timer, a noticed repetition, an association. This page
describes how a stimulus is raised, how the **arbiter** decides whether it wins
attention, and the observers that generate stimuli.

> There is **no multi-stage LLM pipeline** here, and no "state chain." The
> arbiter is mechanical. The only intelligence spent on a context switch is the
> mind's single [bridge](index.md#the-bridge) call.

## The shape of attention

```
generators ──interrupt-request──▶ m-interrupts (arbiter) ──▶ queue
(timeout, loop-guard,                    │                     │
 associate, console, ws)                 │ urgent?             │ at next boundary
                                         ▼                     ▼
                                  ──interrupt──▶ m-mind ◀── takePending()
                                  (think now,            (assemble frame
                                   supersede burst)       with the stimuli)
```

Any component, anywhere in the mind, can raise a stimulus by dispatching a
**bubbling** `interrupt-request` DOM event carrying an
[`InterruptRecord`](#the-interruptrecord). The event bubbles up to the arbiter.
Because it is a DOM event, generators need no reference to the arbiter — they just
fire, and the generator that fired *knows why*, so it supplies its own salience.

## The `InterruptRecord`

`src/infrastructure/interruptRecord.js`. A stimulus is a small structured record:

| Field | Meaning |
|-------|---------|
| `source` | where it came from — `Internal`, `External`, `Observer`, … |
| `type` | the specific kind — `Time-watchdog`, `LoopGuard`, `Association`, `ConsoleInput`, `Sleep`, `Waking`, … |
| `reason` | the first-person experience line the mind will read |
| `salience` | `0..1`, clamped (default `0.5`) — how strongly it calls for attention |
| `urgent` | `true` ⇒ supersede the running burst now; otherwise wait for the boundary |
| `suggestion` | optional extra line (e.g. loop-guard's "pick something unrelated") |

`renderForFrame()` produces what actually appears under **"## This just
happened"** in the frame: the `reason`, plus the `suggestion` if present.
`InterruptRecord.coerce()` accepts a record, a plain object, or a raw string, so
generators can be loose about what they dispatch.

## The arbiter (`m-interrupts`)

The arbiter listens for `interrupt-request` on its parent and decides, purely by
rule:

- **Non-urgent** stimuli must clear two gates or they are dropped:
  - `salience ≥ threshold` (default `0.35`), and
  - at least `rateLimit` (default `15s`) since the last accepted stimulus.
- **Urgent** stimuli bypass both gates.

Accepted stimuli are **enqueued**. The queue holds at most `keep` (default `2`)
records; when it overflows, the highest-salience ones win (urgent first) and the
rest are crowded out and logged.

What happens next depends on urgency:

- **Non-urgent:** the stimulus simply waits. At the next burst boundary, `m-mind`
  calls `takePending()`, which returns the queued stimuli oldest-first and clears
  the queue. They become the "## This just happened" section of the next frame.
  *An interruption is just an attended boundary.*
- **Urgent:** the arbiter *also* dispatches a bubbling `interrupt` event. `m-mind`
  hears it and thinks immediately, superseding the running burst. A human voice
  is always urgent — you don't wait your turn, and there is no reply turn; you
  hear the mind think about what you said.

## The observers

Observers are independent processes that watch the stream and bid for attention.
Three are wired into the default mind. Two more sources (console, WebSocket)
raise stimuli directly.

### `m-timeout`: wander and watchdog

One component, two roles, chosen by whether `reset` is set:

- **wander** (no `reset`): fires every `timeout ± sigma` (normal-distributed
  jitter), simulating spontaneous drift of attention toward "something else I
  have been carrying." Typically low salience, non-urgent.
- **watchdog** (`reset="/stream/chunk"`): the timer only fires after the stream
  has been **silent** for `timeout` — any chunk pushes the deadline forward. It
  is usually `urgent` with high salience, and it is what keeps a stalled or
  budget-exhausted mind from dying.

The `prompt` text (or element content) is the first-person reason injected into
the frame when it fires.

### `m-loop-guard`

Pure code, **no model cost**. Long unattended LLM runs tend to collapse into
attractor loops — re-circling one idea in lightly paraphrased words. At each
boundary, loop-guard scores the recent window for repetition:

- **bigram Jaccard** between the window's two halves catches verbatim and
  near-verbatim loops;
- **containment of stemmed content words** catches *paraphrased* loops, which
  keep reusing the same vocabulary while genuinely flowing prose keeps
  introducing new words.

The score is the max of the two signals. Above `overlap` (default `0.3`) it raises
a decisive, high-salience change-of-direction stimulus ("I notice I am going in
circles…") with a suggestion to pick something unrelated, then clears its window
so it does not immediately re-trigger. For calibration: flowing prose scores
around 0.16, a paraphrase loop around 0.45.

### `m-associate`

The internal source of genuine direction changes. Every `every` boundaries
(default 4) it reads the recent window with a tiny model and asks: *does this
remind you of something genuinely different — a memory, an image, a question from
another domain?* The model answers `NONE`, or a `SALIENCE` and a one-line
first-person `THOUGHT`. If it associates, the thought is raised with the salience
the model itself chose, and the arbiter decides whether it wins.

### Console and WebSocket — the human voice

- [`m-console`](components.md#m-console): a line typed into the terminal becomes
  an `External / ConsoleInput` stimulus, **urgent, salience 1**.
- [`m-ws`](../websocket-api.md): a message over the WebSocket becomes the same kind
  of urgent stimulus.

Both supersede the running burst, so the mind turns to address you within a
sentence or two — via a [bridge](index.md#the-bridge), so the turn is on camera.

## Writing your own generator

Any component can be a generator. Dispatch a bubbling `interrupt-request` with an
`InterruptRecord`:

```js
import { InterruptRecord } from "../infrastructure/interruptRecord.js"

this.dispatchEvent(new CustomEvent("interrupt-request", {
  bubbles: true,
  detail: new InterruptRecord({
    source: "Observer",
    type: "MyObserver",
    reason: "Something I noticed, said in the mind's own first person.",
    salience: 0.6,        // how hard you're bidding for attention
    urgent: false,        // true only for things that must not wait
  }),
}))
```

If your generator watches the stream, extend [`m-observer`](components.md#m-observer):
it gives you a rolling `window`, an `onBoundary()` hook, a per-observer
`cooldown`, and a `raise(reason, opts)` helper that builds and dispatches the
record for you.

## See also

- [Component reference](components.md) — exact attributes and defaults for every
  generator and the arbiter.
- [Configuration: attention and interrupts](../configuration.md#attention-and-interrupts).
