# Deeper structure — design notes

> **Status: exploratory.** This is a forward-looking design document, not a
> description of the whole running system. Part 1 is **shipped**; Part 2 is a
> map of structures we want to explore later. Kept here so the ideas don't
> evaporate. See [architecture overview](index.md) and [interrupts](interrupts.md)
> for what exists today.

## The premise: the mind is not flat

A mind is declared as a flat list of components inside `<m-mind>`. But the *DOM*
being flat doesn't make the *live system* flat — two differently-shaped
structures already run on top of [Amanita](https://www.npmjs.com/package/amanita):

1. **A broadcast bus.** `m-stream` publishes `chunk` / `boundary` / `state`, and
   everything that cares (memory, observers, economy, scribe, the WebSocket)
   subscribes. A star, with the stream at the center.
2. **A bubbling attention spine.** Observers raise `interrupt-request` DOM events
   that *bubble up the DOM* to `m-interrupts`, which arbitrates by salience and
   re-emits an `interrupt` that bubbles on to `m-mind`. This is the one genuinely
   tree-shaped thing in the system.

So the real question was never "flat vs. structured." It is that **both of those
mechanisms — broadcast and bubbling arbitration — want to be recursive**, and
until now each was capped at one level. That cap is where depth wants to live.

---

## Part 1 — Shipped: making the substrate composable

Three changes, none of which alter the behaviour of the flat default mind, but
which turn "one level" into "any number of levels."

### Mind-relative refs

Observers and memory used to bind to the **global** `"/stream/chunk"` — which, per
Amanita's ref rules, is the *first* `[name="stream"]` in the whole document. With
more than one stream that silently binds everyone to the first one.

They now default to the **mind-relative** `"..m-mind/stream/chunk"` (and
`…/stream/boundary`): `closest('m-mind')` then the stream inside it. In a flat
mind this resolves to exactly the same element; but it means an observer keeps
working when it lives inside a region, or inside a nested submind, instead of
reaching across into another mind's stream. Applies to `m-observer` (so
`m-associate`, `m-loop-guard`, `m-speech`), `m-memory`, `m-economy`, `m-kb`.
Top-level *transports* (`m-ws`, `m-console`) intentionally stay document-anchored
— they are the mind's external window, not part of any one faculty.

> **Principle:** prefer structural-relative refs (`..`, `closest`, `name/topic`)
> over absolute (`/name/topic`). Absolute refs hardcode a single global instance;
> relative refs are nestable for free.

### A state bus (`arousal`)

`on()` replays the current value on subscribe — Amanita topics are *behavior
values*, not just events. We now use that for a standing interoceptive signal:
`m-economy` publishes **`arousal`** (0..1), a retained value any faculty can read.
It currently tracks metabolic `energy`, and it is the seam where future
interoception (novelty, recent cognitive load, mood) will combine.

First consumer: `m-interrupts` has an opt-in `arousalSensitivity` — when set, the
effective interrupt threshold *rises as arousal falls*, so a tired mind is harder
to interrupt and sinks further into itself. Off by default (no economy dependency,
no behaviour change).

### Nested attention (`m-region` + faculty-local `m-interrupts`)

The bubbling spine is now recursive. An **`m-region`** is a faculty boundary; an
`m-interrupts` placed inside one becomes a **local arbiter** that:

- consumes every `interrupt-request` bubbling to its region (it is the gate —
  locally-rejected bids never leak up),
- re-weights survivors by its **`gain`**, and
- promotes each survivor one level up — to an enclosing region's arbiter, or
  finally to the mind's global arbiter (a direct child of `m-mind`, which queues
  as before).

The *same component* is global or local purely by position (`closest('m-region')`).
Binding is done with a structural `addEventListener`, not the `"../@…"` auto-sub,
to dodge the component-upgrade race (`m-region` may not be upgraded when its
arbiter connects). This is **Global Workspace Theory in miniature**: parallel
local competition, a single global broadcast.

See [`architecture/examples/nested-attention.archml`](../../architecture/examples/nested-attention.archml)
and the wiring tests `architecture/tests/test-nested-attention.js` /
`test-relative-refs.js`.

---

## Part 2 — The deeper futures

Ordered by how directly each **generalizes a mechanism that already exists** —
that's what makes them buildable rather than romantic. Each turns a depth-1
structure into a depth-N one.

### 1. Competing sub-streams — consciousness as serialization

*Generalizes `m-speech`,* which is already a second concurrent stream on its own
model, with the thinking thinned while it runs. Generalize to N cheap parallel
streams, each a small persona/preoccupation (a skeptic, a rememberer, a
namer-of-feelings) — **but only one may hold the *tail* (the single narrative
thread) at a time.** The others bid via salience to seize the through-line; the
losers' output becomes associative *pressure* (like `m-associate`), not the main
thread. The single stream of consciousness as the *serialization of parallel
subprocesses competing for one narrative thread* — exactly what the arbiter
already does for interrupts, applied to internal generators.

### 2. Recursive / fractal memory

*Generalizes `m-memory`'s three fixed tiers* (tail → recent → story) into a *tree*
of compressors: each node compresses its children on overflow, unbounded depth,
older = higher = more compressed (a pyramid / LSM-tree of summaries). Then the
interesting part: **recall becomes tree traversal** — a stimulus matching a
high-level summary triggers *decompression* of that subtree back into the frame.
Being reminded, in detail, of something you had folded down to a sentence.

### 3. Spawned, transient subminds — the original vision

*The synthesis of 1–3.* When an association crosses a high bar, instead of merely
redirecting the main stream, the mind **forks a child `m-mind`** seeded with that
topic plus a memory slice, lets it run a few bursts in parallel on a cheap model,
and then the child **compresses itself into a single stimulus/memory and
dissolves**, folding back up into the parent. Spawn → dwell → fold → vanish: depth
that is *dynamic and data-dependent*, not declared.

This is where Amanita's unused **`hub`** primitive earns its place: `setHub`
forwards a component's every publication to another element — the natural "fold
my result upward into my parent mind" channel. And it is why Part 1's relative
refs are load-bearing: a child mind's observers must bind to *their* stream.

### 4. Meta-observers — reflective depth

*Generalizes `m-observer`,* cheaply. Observers watch the *content* stream. Point
one at the *attention* stream instead — `m-interrupts` already publishes a
`decision` for every bid. An observer of decisions notices "I keep getting pulled
toward X," "I haven't been interrupted in ages," "loop-guard fires a lot today."
Higher-order self-awareness ("I notice that I notice"), and it stacks.

### 5. A society of minds — horizontal depth

Amanita topics are global by default, so the absolute-ref globalness that *breaks*
nesting is exactly what lets two top-level minds share a bus: mind A subscribes to
`/voiceB/speech` as a stimulus. Two contemplatives overhearing each other's spoken
thoughts — not a hierarchy, a graph.

---

## Underused Amanita affordances

- **`hub` / `setHub`** — forward-all-publications channel; the upward aggregation
  conduit for subminds (#3). Currently unused in the mind.
- **Worker / server offloading** (`server="true"`, `a-scheduler`) — true
  parallelism / isolation for a submind. Premature until a submind is CPU-bound.
- **Retained topic values** — used now for `arousal`; the place for any standing
  state (mood, current preoccupation, attention budget) that today gets threaded
  through the prompt frame instead.

## Guiding principle

Don't impose structural depth; add a **mechanism whose natural consequence is
depth**. Nested arbitration, competing streams, and recursive compression are
each just one of the existing mechanisms (the arbiter, the second stream, the
compressor) allowed to recurse. That every interesting deep structure here is a
*generalization of something already shipped* is the sign the architecture is
sound and merely under-iterated — not flat.
