# Architecture overview

Meditator is not a chat loop. There are no turns, no prompt waiting for a user.
A **mind** thinks in a continuous stream that the world can only *interrupt* —
and the whole organization of the system exists to make that stream coherent,
bounded, and persistent.

A mind is declared in an HTML-subset file (`architecture/*.archml`) and executed by
standard components built on [Amanita](https://www.npmjs.com/package/amanita), a
declarative web-component framework with pub/sub wiring that runs on the server
under Bun. Each component is a custom element (`<m-stream>`, `<m-memory>`, …)
loaded from `src/mindComponents/`.

## Bursts and boundaries

The "continuous" stream is implemented as a sequence of short **bursts**. Each
burst is exactly one streamed LLM call. Between bursts is a **boundary** and a
configurable pause (`pace`) — inhale, think, exhale.

```
… burst ──boundary── pause ── burst ──boundary── pause ── burst …
            │                          │
            memory consolidates        interrupts land here
            economy reads cost         the next frame is assembled
```

Boundaries are where everything that is not thinking happens: pending stimuli are
collected, memory consolidates, the economy reads cost, and the next burst's
prompt is composed. An *interruption is simply an attended boundary* — except
when it is urgent (see below).

## The attention frame

Every burst is prompted with a freshly **assembled frame**, never a growing chat
transcript. This is the central idea. `m-mind` builds it (`assembleFrame`) from
these layers:

```
[system / identity]  who this mind is — the text of the <m-mind> element,
                     wrapped in a standing instruction to think in first person
─────────────────────────────────────────────────────────────────────────────
## How I got here (older memory, compressed)   ← story   (from m-memory)
## Recently (compressed)                        ← recent  (from m-memory)
## This just happened                           ← stimuli (from the arbiter)
   - <first-person line for each accepted interrupt>
## My thought in progress
   …<tail — verbatim end of the stream, plus the bridge if attention turned>
<instruction: continue the monologue from exactly where it leaves off>
```

Two properties make this work over arbitrarily long runs:

- **The tail is always carried verbatim.** Whatever the mind was *just saying*
  is placed last, so the next burst continues mid-thought and the self never
  loses its place — even across a context switch. This was the key requirement of
  the rebirth: "what I just said before" must survive into the next prompt.
- **Everything older is compressed.** `story` and `recent` are summaries
  maintained by [`m-memory`](memory.md). Because they have fixed character
  budgets, the whole frame stays bounded *forever* — a mind that runs for days
  still fits in a few thousand tokens.

### The bridge

When a stimulus actually redirects the thought, cutting from one subject to
another would jar. So `m-mind` makes one small **utility-model** call that writes
the *turn itself* — one or two first-person sentences in which attention moves
from the current thought toward what just happened. This **bridge** is both:

- emitted into the visible stream as a `prefix` chunk (it becomes real
  monologue — part of the tail, the memory, the journal), and
- appended to the tail inside the frame, so the voice model continues from a
  pivot it has actually "said."

Context switches don't cut the film; they happen on camera. The bridge is the
*only* LLM-written part of the frame, and only on redirects. Set
`bridge="false"` on `<m-mind>` to disable it.

## The thinking loop

`m-mind` owns the rhythm. The cycle (`continueThinking` → `assembleFrame` → publish):

1. A burst finishes; `m-stream` publishes a **`boundary`**.
2. `m-mind` schedules the next burst after `pace ± paceSigma`, multiplied by the
   [economy](components.md#m-economy) pace factor and an error backoff.
3. When the timer fires, it takes any **pending stimuli** from the arbiter (plus a
   one-time wake notice from memory on startup), assembles the frame, and
   publishes **`prompt`**.
4. `m-stream` receives the prompt, aborts any in-flight burst, and streams the
   next one — emitting each fragment as a **`chunk`**.

**Urgent stimuli skip the wait.** A human voice (console or WebSocket) is urgent:
the arbiter dispatches an `interrupt` DOM event, `m-mind` calls `continueThinking`
immediately, and the new prompt *supersedes* the running burst mid-sentence. You
cannot resume a closed HTTP stream — and with tail-carryover you do not need to;
the aborted burst's words are already in the tail.

When a burst seam would duplicate text (models often re-echo the last words of
the carried tail), `m-stream` trims the overlap so the joined stream reads as one
continuous thought.

## The speaking voice

Inner monologue is what the mind *thinks*; [`m-speech`](components.md#m-speech) is
what it says **out loud**. The mind mostly thinks quietly — speaking is occasional
and **volitional**: a cheap call decides whether a thought genuinely wants outward
voice, and being addressed from outside raises the urge without ever forcing a
reply (Meditator is not an assistant). When the urge clears `threshold`, the
utterance is produced as its own streamed burst on the voice model.

That utterance runs **concurrently** with thinking — true *limited* parallelism. It
mirrors how a person can't think one sentence while speaking a different one, yet
their subconscious keeps working: while the voice is speaking it publishes
`speaking=true`, and `m-mind` **thins** the thinking stream (fewer `burstTokens`,
slower `pace`) so the verbal effort goes mostly to the utterance — but thought
never stops, and the non-verbal observers (associations, loop-guard, timers,
memory, economy, scribe) keep running untouched. When the utterance ends,
`m-memory.spoke()` splices it into the tail as a marked `(aloud) "…"` block, so the
next thought continues knowing what it just said.

## Wiring: pub/sub and DOM events

Components never call each other directly. Two channels connect them:

- **Pub/sub topics** (Amanita), for the stream's data flow. The core topics:
  - `/stream/chunk` — each text fragment as it is generated (`m-stream` → memory,
    observers, economy, the WebSocket).
  - `/stream/boundary` — `{reason, burstIndex, burstChars}` when a burst ends
    (`m-stream` → mind, memory, observers, economy, scribe).
  - `/stream/state` — `{oldState, newState, timestamp}`, for the WebSocket client.
  - `prompt` — the assembled frame (`m-mind` → stream).
- **Bubbling DOM events**, for attention. Any generator dispatches an
  `interrupt-request` carrying an [`InterruptRecord`](interrupts.md#the-interruptrecord);
  the [`m-interrupts`](interrupts.md) arbiter decides what gets through.

Amanita auto-subscribes class fields whose names are refs (they contain `/` or
start with `@`), which is why you see handlers like `"stream/boundary"` and
`"@interrupt"` written as fields on `m-mind`.

## The component map

The example mind (`architecture/seedling.archml`) wires:

| Component | Role |
|-----------|------|
| [`m-mind`](components.md#m-mind) | orchestrator — owns the rhythm and assembles the attention frame |
| [`m-stream`](components.md#m-stream) | the voice — generates the stream as bursts |
| [`m-memory`](memory.md) | three memory tiers, compression, persistence, journal |
| [`m-interrupts`](interrupts.md) | the salience **arbiter** — mechanical, no LLM |
| [`m-timeout`](interrupts.md#m-timeout-wander-and-watchdog) | wander (drift) and watchdog (keep-alive) |
| [`m-loop-guard`](interrupts.md#m-loop-guard) | detects repetition loops — pure code, no LLM |
| [`m-associate`](interrupts.md#m-associate) | a small model noticing "this reminds me of…" |
| [`m-speech`](components.md#m-speech) | the voice — occasionally speaks a thought aloud, in parallel with thinking |
| [`m-kb`](components.md#m-kb) | the scribe — distills durable knowledge to `knowledge/` |
| [`m-economy`](components.md#m-economy) | reads real cost and slows the mind as budget drains |
| [`m-console`](components.md#m-console) | terminal input/output |
| [`m-ws`](../websocket-api.md) | the WebSocket stream and input on port 7627 |

Read on:

- [Memory & the vault](memory.md) — how thought is compressed and persisted.
- [Interrupts & observers](interrupts.md) — how attention is won and redirected.
- [Component reference](components.md) — every attribute, default, and topic.
- [Mind lifecycle & the graveyard](lifecycle.md) — proposed plan for ephemeral vs
  resident minds, honest retention, versioning, and how a mind is laid to rest.
