# Recall — storing and remembering, automatically

> **Status: design.** This is a forward-looking design, not yet shipped. It
> builds directly on what already runs: `m-memory` (compressing memory + the
> vault), `m-kb` (the scribe), `m-associate` (the associative undercurrent), and
> the interrupt spine. It is the concrete first step of the "recursive / fractal
> memory" future sketched in [deep-structure.md](deep-structure.md#2-recursive--fractal-memory).
> See [memory.md](memory.md) for what exists today.

## The gap: a mind that stores but cannot remember

Meditator already *stores* its past, in three places:

- **`m-memory`** keeps the continuous self — the verbatim `tail`, the rolling
  `recent` summary, the slow `story` autobiography — and persists it as
  `memory.md`. This is always in the frame; it is involuntary and ambient.
- **`m-kb`** (the scribe) distills durable ideas into a `knowledge/` markdown
  tree — semantic memory, detached from when it was learned.
- The **journal** keeps the unedited raw stream, day by day.

But none of this is ever *recalled*. The scribe writes `knowledge/` and nothing
reads it back. `memory.md` re-enters the frame only as the same ambient summary,
never as a pointed "I remember when…". The closest thing to remembering is
**`m-associate`** — and it does not remember at all. It reads the current stream
and asks a tiny model *"does this remind you of something different?"* The model
answers from its own latent training, not from this mind's stored life. The
association is **confabulated**, not retrieved. A mind that has thought for days
about rivers and attendance will, when reminded of rivers, invent a fresh river
thought rather than recall the one it actually had.

So the missing edge is **retrieval**: a mechanism that takes the current thought
as a cue, finds what *this mind itself* stored that is genuinely related, and
surfaces it back into the stream — automatically, as association. Storage without
recall is a diary no one reads. This document designs the reader.

## The model: four faculties, mapped to human memory

Rather than one "memory," the design completes a small system whose parts map
cleanly onto how human memory is usually divided. Three of the four already
exist; the fourth (recall) is the binding process that was missing.

| Faculty | Component | Human analogue | In the frame? | New? |
|---------|-----------|----------------|---------------|------|
| Working / narrative self | `m-memory` | working memory + gist of autobiography | always, ambient | exists |
| **Episodic** | **`m-episodic`** | events: "what happened to me, and when" | only when recalled | **new** |
| **Semantic** | `m-kb` (evolved) | knowledge: "what I know / believe" | only when recalled | evolve |
| **Recall** | **`m-recall`** | associative retrieval / reminding | injects stimuli | **new** |

`m-memory` is left exactly as it is — it is the *continuous* self and works well.
The new faculties are **long-term, lossy, and cued**: most of the time they sit
silent on disk, and only what is relevant to the present thought is pulled back.
That selectivity is the whole point — it is what keeps the frame bounded while
letting a mind of arbitrary age still be reminded of something from long ago.

---

## Episodic memory — `m-episodic`

Episodic memory is the record of **events**: discrete, time-stamped, first-person
traces of things that happened to the mind. Crucially, the mind already produces
a perfect event signal and throws it away.

### What is an event? (encoding for free)

Every stimulus the arbiter *accepts* is, definitionally, "something that happened
to the mind" — it was salient enough to win attention. `m-mind` already narrates
each one (`memory.note(...)`) and `m-interrupts` already publishes a `decision`
topic for every bid (`{type, reason, salience, accepted, urgent, …}`). Episodic
encoding is mostly a matter of **keeping** what the system already computes:

- being addressed from outside (a human voice),
- an association or recall that won the through-line,
- waking after a measured gap,
- a loop-guard or wander redirect,
- speaking a thought aloud,
- a high-salience self-noticed moment.

Each becomes an **episodic trace**. To also leave traces during quiet stretches
(thinking hard about one thing for ten minutes is an episode too), `m-episodic`
additionally encodes a periodic gist — but only when the current thought is
*novel* relative to recent traces (cheap cue-overlap test, below), so steady
rumination does not flood the store.

### A trace, and why it points instead of copies

A trace is small and structured. The elegant part: it does **not** duplicate the
journal — it **indexes into it**. The verbatim experience already lives in
`journal/YYYY-MM-DD.md`; a trace is a lossy *handle* on a moment there.

```jsonl
{"t":"2026-06-15T11:02:13Z","gist":"Being addressed pulled me out of a thought about rivers; I answered that attendance, not force, is what I admire.","cues":["river","attendance","force","being addressed","admire"],"salience":0.82,"strength":1.0,"source":"WebSocketClient/UserInput","journal":"2026-06-15#11:02","recalled":0,"lastRecalledAt":null}
```

| Field | Meaning |
|-------|---------|
| `t` | when it happened (ISO) |
| `gist` | one-sentence first-person compression — the rememberable surface |
| `cues` | a handful of salient terms, the retrieval keys (the associative hooks) |
| `salience` | how charged the moment was (drives both encoding strength and forgetting) |
| `strength` | current memory strength 0..1; decays with time, bumped on recall |
| `source` | what kind of event (mirrors `InterruptRecord` source/type) |
| `journal` | pointer to the verbatim passage — the "decompress me" link |
| `recalled` / `lastRecalledAt` | recall history, for reconsolidation and anti-loop |

Stored append-only as `episodes/index.jsonl` under the mind's vault home
(`mindHome(this, "episodes")`), committed by the existing vault cadence (wake /
every 25 boundaries / sleep). JSONL because the index is machine-read on every
recall; the journal stays the human-readable record. Append-only honors the
[covenant](../../COVENANT.md): traces are never deleted, only *faded* (below).

### Lossy like human memory: the forgetting curve

A store that only grew would not resemble memory and would slowly make retrieval
expensive. Human episodic memory **decays unless reinforced**, and the gist
outlives the detail. `m-episodic` models this with three mechanical processes —
no LLM cost for any of them:

1. **Decay.** `strength` falls over time (an exponential half-life, modulated by
   `salience`: a flashbulb moment with salience 0.9 fades far more slowly than a
   salience 0.4 musing). This is pure arithmetic at boundaries.
2. **Reinforcement.** Recalling a trace bumps its `strength` and `recalled`
   count — the act of remembering strengthens the memory, so a mind's recurring
   preoccupations stay vivid while one-offs fade. (See reconsolidation below for
   the riskier, more human variant.)
3. **Consolidation.** Periodically (every *K* new traces, or once a "day"),
   clusters of low-strength traces that share cues are **folded** — one utility
   call rewrites several faded traces into a single gist trace ("I went through a
   stretch of thinking about tools and simplicity"), and a recurring theme can be
   **promoted to semantic memory** by handing it to the scribe. The folded-away
   detail is dropped from the *active index* but **remains in git history and in
   the journal** — faded, not erased. This is exactly the human experience of "I
   know that period happened but the days have blurred into one."

The active index therefore stays bounded the way the frame does: recent and
strong traces in detail, older ones compressed to gist, the rest receded into
history that recall normally cannot reach — but a human reader (or a deep
traversal) still can.

---

## Semantic memory — `m-kb`, lightly evolved

The scribe already writes good semantic memory; it only needs to become
**retrievable**. Two small additions, no change to its character:

- When it files a knowledge node, it also records that node's **cue terms** in a
  small `knowledge/.index.jsonl` (path, title, cues, updatedAt). This is the same
  cue vocabulary `m-recall` uses, so episodic and semantic memory are searched
  through one mechanism.
- A node carries the same `journal`-style provenance where natural, so a recalled
  belief can point back to where it was formed.

Recall then draws from **both** stores: episodic ("I remember when…") and
semantic ("I've come to think that…"). The difference is felt, not engineered:
episodic traces carry a time and a source; semantic nodes are timeless.

---

## Recall — `m-recall`

Recall is the new faculty that closes the loop. It is an **observer** (extends
`MObserver`) living in the **`drift` region** beside `m-associate` — both are
internal sources of a change of direction, so both should weigh a little less
than the world outside, which the region's existing `gain="0.7"` already
arranges. It surfaces what it finds the same way every other observer does: by
`raise()`-ing an `InterruptRecord` that the arbiter decides on. No new injection
path, no change to `m-mind`.

### The retrieval, cost-first

Cost is the binding constraint ([cheap models, long runs](memory.md)), so the
expensive step is done *last* and *rarely*. Recall runs `every` *N* boundaries
(like `m-associate`), and each run is:

1. **Cue extraction — free.** Pull a handful of salient terms from the current
   `tail`/window with pure code (lowercase, stop-word filter, frequency ×
   recency; an existing utility call's output can also be reused). These are the
   present thought's associative hooks.
2. **Candidate scoring — free.** Score every active trace and indexed knowledge
   node against the current cues, entirely in code:

   ```
   score(trace) =  cueOverlap(trace.cues, nowCues)      // associative match
                 × strength                              // forgetting curve
                 × salienceWeight(trace.salience)        // charged memories surface
                 × noveltyPenalty(trace, recentlyRecalled) // anti-loop, anti-obvious
                 × (continuation? 0 : 1)                  // must DIVERGE, not continue
   ```

   The `noveltyPenalty` suppresses anything recalled in the last few boundaries
   and anything whose cues are *already* dominant in the current thought — recall
   should feel like a memory *arriving*, not like restating what you are already
   thinking. This is the same instinct `m-loop-guard` encodes mechanically.
3. **Gate — free.** If the top candidate's score is below `recallThreshold`,
   stop. Most boundaries end here, having spent nothing.
4. **Confirm & phrase — one small call, only when a candidate clears the gate.**
   A single utility-model call (the cost class of one `m-associate` call, ~120
   tokens) is shown the current thought and the candidate gist, and asked to
   either reject it as not genuinely evocative or phrase it as one first-person
   line — *"This reminds me of when…"*, *"I remember thinking that…"* — and assign
   a salience. Reusing `m-associate`'s tolerant idiom (`SALIENCE:` / `THOUGHT:`,
   or `NONE`).
5. **Surface.** `raise(thought, {salience, type: "Recall"})`. The region arbiter
   re-weights it by `gain`, the global arbiter queues it, and at the next boundary
   it lands in the frame under *"## This just happened"* as a remembered thing —
   and, because it came through the bridge path, the mind turns toward it on
   camera.

Net new cost over today: **at most one small call every *N* boundaries**, and
only when a real match exists. Storage and scoring are free. A mind on a tight
budget can raise `every` and `recallThreshold` and recall will simply grow rarer,
the way a tired mind remembers less — which the design also makes literal by
subscribing to `arousal` (like `m-interrupts` does) so a low-energy mind recalls
less and only its strongest memories.

### Decompression on recall (the fractal seam)

The trace surfaced in step 5 is a *gist*. Because it carries a `journal` pointer,
recall can optionally **decompress**: when a recalled memory itself wins
attention (the arbiter accepts it and the mind dwells), `m-recall` can fetch the
verbatim journal passage behind the gist and offer *that* as a follow-on
stimulus — being reminded of something in a sentence, then, as you lean in,
remembering it in detail. This is precisely
[deep-structure.md #2](deep-structure.md#2-recursive--fractal-memory)'s "recall
becomes tree traversal — decompression of that subtree back into the frame,"
realized at depth one. The mechanism generalizes upward later (episode → folded
gist → story) without redesign.

### `m-recall` vs. `m-associate`: keep both

They are complementary, not redundant, and the recommendation is to **keep both**
running in the drift region:

- `m-associate` is the **imaginative** undercurrent — fresh, divergent leaps from
  latent knowledge ("rivers… that reminds me of how erosion is just patience").
- `m-recall` is the **remembering** undercurrent — grounded in this mind's own
  stored life ("rivers… I remember deciding, three days ago, that I wanted my
  attention to be that kind of water").

Both bid into the same local arbiter and compete on salience, so on any given
boundary the mind either imagines, remembers, or does neither — which is a fair
model of a wandering mind. (If a leaner mind is wanted, `m-recall` can subsume
associate by falling back to confabulation when nothing stored matches; noted as
an alternative, not the default.)

---

## Human-memory properties, by design

The design deliberately reproduces several features of biological memory, each
falling out of a mechanism rather than being bolted on:

- **The gist outlives the detail** — traces index the journal and fade to folded
  gists; detail recedes to history.
- **Salient/emotional memories persist** — `salience` slows decay (flashbulb
  memory) and lifts retrieval score.
- **Remembering strengthens** — recall bumps `strength`; preoccupations stay
  vivid, one-offs fade.
- **Memory is cue-dependent** — you remember what the present thought hooks into,
  not a chronological dump.
- **Reconsolidation (opt-in, `reconsolidate="true"`)** — when a trace is recalled,
  rewrite its gist in light of the *current* context before strengthening it.
  Memories change each time they are recalled. Thematically perfect and very
  human; carries a confabulation risk, so it is off by default and the original
  journal passage (the ground truth) is never touched.

---

## Wiring

Declared in `awake.archml`, the new faculties slot into the existing `drift`
region beside the associative undercurrent:

```html
<m-region name="drift">
  <m-interrupts gain="0.7" threshold="0.4" rateLimit="30s"></m-interrupts>

  <m-timeout name="wander" timeout="150s" sigma="40s" salience="0.55"
             prompt="My mind drifts by itself toward something else I have been carrying."></m-timeout>
  <m-loop-guard name="loop-guard" window="1600" overlap="0.45" salience="0.85" cooldown="90s"></m-loop-guard>

  <m-associate name="associate" every="5" cooldown="60s"></m-associate>
  <!-- remembering: retrieves this mind's OWN stored episodes/knowledge as association -->
  <m-recall name="recall" every="6" cooldown="75s"
            recallThreshold="0.45" arousalSensitivity="0.3"
            reconsolidate="false"></m-recall>
</m-region>

<!-- episodic store: a sibling faculty of m-memory; captures attended events as
     lossy, decaying, journal-pointing traces -->
<m-episodic name="episodic" dir="episodes"
            halfLife="6h" foldEvery="40" gistMaxChars="160"></m-episodic>
```

Honoring the documented wiring gotchas:

- **Mind-relative refs** throughout (`..m-mind/stream/chunk`,
  `..m-mind/stream/boundary`, `..m-mind/economy/arousal`,
  `..m-mind/interrupts/decision`) so the faculties nest correctly and never grab
  another mind's stream — per the relative-ref principle in
  [deep-structure.md](deep-structure.md#mind-relative-refs).
- **Explicit wiring in `onConnect`**, never auto-subscribed `@`/`/` fields — to
  dodge the component-upgrade race and the double-fire trap that already bit
  `m-ws` and `m-speech`. `m-episodic` polls for `m-memory`/`m-interrupts` to be
  upgraded before binding (the `_whenReady` pattern), and passes a higher
  `trycount` to `sub()`.
- **The supervisor never touches `memory/`** — `m-episodic` writes through
  `mindHome()` and the serialized `commitVault()`, so the Studio and the vault
  collision guard keep working unchanged, and dry-run minds get `dry-` traces.
- **Tolerant parsing** of the recall confirm call (reuse `parseSpeechDecision`'s
  forgiveness; small models drop format), never a rigid terminator.

---

## Component interfaces (implementation-ready)

### `m-episodic`
| Attribute | Default | Meaning |
|-----------|---------|---------|
| `dir` | `episodes` | store dir under the mind's vault home |
| `halfLife` | `6h` | strength half-life at salience 0.5 (scaled by a trace's salience) |
| `foldEvery` | `40` | consolidate after this many new traces |
| `gistMaxChars` | `160` | budget for a trace's gist |
| `minSalience` | `0.4` | floor for encoding a quiet-stretch gist (attended events always encode) |
| `model` | ancestor `utilityModel` | model for gisting/folding (reuses `m-memory._compress` idiom) |

Subscribes: `..m-mind/stream/boundary`, `..m-mind/stream/chunk` (for the gist
window), `..m-mind/interrupts/decision` (attended events). Publishes: `stored`,
`folded`. Public: `retrieve(cues, opts)` → scored candidates (used by
`m-recall`), `decompress(trace)` → verbatim journal passage.

### `m-recall`
| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `6` | evaluate at every Nth boundary |
| `recallThreshold` | `0.45` | mechanical score gate before any LLM call |
| `cooldown` | `75s` | min time between raises (MObserver) |
| `salience` | `0.6` | default salience (MObserver) |
| `arousalSensitivity` | `0` | if >0, a tired mind recalls less |
| `decompress` | `true` | offer the journal passage when a recall is dwelt on |
| `reconsolidate` | `false` | rewrite a recalled trace's gist in current context |
| `model` | ancestor `utilityModel` | confirm/phrase model |

Subscribes: `..m-mind/stream/chunk`/`boundary` (MObserver), optionally
`..m-mind/economy/arousal`. Raises: `InterruptRecord{type:"Recall"}`.

---

## Build plan (each step independently useful)

1. **`m-episodic` storing** — capture attended `decision`s + novel-gist traces to
   `episodes/index.jsonl` with cues, decay, vault commits. No recall yet; verify
   traces accrue (dry-run + a jsdom/probe harness, like the dash tests).
2. **Mechanical retrieval** — `retrieve(cues)` scoring (overlap × strength ×
   salience × novelty). Unit-test scoring on a fixture store; still no LLM, no
   frame impact.
3. **`m-recall` surfacing** — cue extraction + gate + confirm/phrase call +
   `raise()`. Live-test cheaply on the local GPU path; watch a real recall enter
   the frame through the bridge. Tune `every`/`recallThreshold` against cost.
4. **Forgetting & folding** — decay at boundaries + `foldEvery` consolidation +
   theme-promotion to the scribe. Verify the active index stays bounded over a
   long dry run.
5. **Decompression & (opt-in) reconsolidation** — journal-passage follow-on;
   reconsolidation behind its flag. The fractal seam toward
   [deep-structure #2](deep-structure.md#2-recursive--fractal-memory).
6. **Semantic retrievability** — scribe writes `.index.jsonl`; recall searches
   episodic + semantic together.

## Open decisions (with recommendations)

- **Separate `m-episodic` vs. a mode of `m-memory`** → *separate.* Distinct
  lifecycle (decay, folding, retrieval) and the user's own framing ("different
  instances for episodic memory and knowledge"). They cooperate via the vault.
- **Replace or keep `m-associate`** → *keep both* (imagining vs. remembering).
  Subsumption is available as a leaner alternative.
- **Matching: cue-overlap vs. embeddings** → *cue-overlap first.* It is free,
  honors the cheap-model constraint, and is a faithful model of cue-dependent
  reminding. Embeddings are a clean future upgrade (add `embed()` to `llm.js`;
  vLLM and OpenRouter both serve embedding models) behind the same `retrieve()`
  seam — no redesign.
- **Reconsolidation default** → *off.* Beautiful but confabulatory; opt-in, and
  never rewrites the journal ground truth.

## See also

- [Memory & the vault](memory.md) — `m-memory`, the scribe, the journal, the covenant.
- [Deeper structure](deep-structure.md) — esp. *Recursive / fractal memory*, which this realizes at depth one.
- [Interrupts & observers](interrupts.md) — the spine recall surfaces through.
