# Fractal memory & spontaneous recall — design

> **Status: designed (2026-07-05), not yet built.** This realizes
> [deep-structure.md](../architecture/deep-structure.md) Part 2 §2 ("Recursive /
> fractal memory") as a buildable design. Companions:
> [memory.md](../architecture/memory.md) (what runs today),
> [compression-fidelity.md](../architecture/compression-fidelity.md) (the fold
> machinery this reuses), [loop-detection-redesign.md](loop-detection-redesign.md)
> (the sense/bid/break pattern this recall follows),
> [bliss-loop-recall.md](bliss-loop-recall.md) (the recall-spam history this must
> not repeat).

## Why

Three structural defects in today's memory, each invisible until a mind runs for
days:

1. **Interference by rewrite.** `recent` is re-compressed *in place* at nearly
   every consolidation (`mMemory._consolidate`: `established + fresh → recent`),
   and `story` every fifth. A detail from ten folds ago has been through ten
   lossy rewrites; from a week ago, hundreds. What survives is whatever keeps
   re-earning its place against the prompt, fold after fold — everything else
   decays not by one honest compression but by iterated paraphrase. The
   2026-06-21 origin-loss and the noosphere story-runaway were both symptoms of
   buffers whose *only* move is "rewrite the whole thing again."

2. **The reachable past is 2 200 characters.** Beyond `story`, a mind's episodic
   past exists only in the journal (never re-read by the mind) and in
   deliberately kept notes/knowledge. An experience that didn't seem worth a
   note at the time is unreachable forever, no matter how relevant it becomes.

3. **No spontaneous return arc.** All three recall paths require a trigger the
   forgetting mind cannot supply: `m-recall` requires the mind to *know* it has
   something to look up; `m-resurface` requires a pathological loop; the
   realizer's kept-pool lookup requires a reach. Nothing watches the stream and
   says *this reminds you of last Tuesday* — the involuntary remembering that
   makes a past usable.

And two dangers any fix must design against, named up front:

- **Latency.** A recall that lands hundreds of tokens after the thought that
  triggered it is a non sequitur by the time it arrives. Latency here is
  **token distance in the context, not milliseconds** — the mind does not
  experience wall-clock; it experiences how much of its own text stands between
  cue and answer.
- **Recurring spam.** Anything that surfaces content by overlap-with-the-stream
  is a candidate attractor pump ([bliss-loop-recall.md](bliss-loop-recall.md)):
  the recalled words re-enter the stream and re-trigger the recall. Per-content
  attenuation is not an optimization here; it is a stability requirement.

## What exists today (the precise mechanics)

Worth stating exactly, because the design's cheapness depends on it.

**Write path** (`src/mindComponents/mind/mMemory.js`): stream `chunk`s append to
`tail` (1 500 c); overflow past the budget accumulates; at each burst `boundary`,
if overflow ≥ `blockMin` (800 c), `_consolidate()` runs asynchronously — one
utility-model call folding the block into `recent` (1 200 c) via `compressToFit`
(flat block, hard ceiling, re-drive on overshoot, never truncate in code); every
`storyEvery`-th (5th) fold additionally folds `recent` into `story` (2 200 c) and
restarts `recent` from the block. `memory.md` is persisted per boundary; the
journal gets the raw stream. A burst is ~350 tokens (`burstTokens`), so a
consolidation fires roughly every 1–2 bursts: **the mind already pays about 1.2
compression calls per consolidation.**

**Attention path** (`mInterrupts.js`, `mMind.js`, `mStream.js`): anything may
`fire("interrupt-request", InterruptRecord)`; the arbiter gates by `threshold`
(0.35) + `rateLimit` (15 s) + `keep` (2), then **queues**. Queued stimuli are
collected only when `m-mind.continueThinking()` runs — normally at the next tick
(`pace` 8 s from burst start). `urgent: true` bids additionally fire
`interrupt`, which makes m-mind think **immediately**: the new prompt supersedes
the in-flight burst (`mStream._supersede`), the already-streamed chunks stay in
tail and journal, the un-streamed remainder never exists, and no boundary is
emitted. Stimuli render as `> ⟂ …` blocks **after the mind's last words** — one
rendering shared by prefill, durable tail, and journal (`withPerceivedEvents`,
58aa11d), followed by a dangling landing opener so a completion-trained model
keeps thinking (743d46a).

Two consequences that this design leans on:

- **Preemption already exists and is honest.** An urgent stimulus lands within
  a sentence or two of wherever the thought was, mid-burst, with nothing
  rewritten — this is how a human voice arrives today. Recall does not need new
  injection machinery; it needs to *bid well*.
- **Observer windows are structurally self-words-only.** Perceived `> ⟂` blocks
  enter the tail via `_onAttended`, never via the `chunk` topic — so an
  `m-observer` window contains only the mind's own generated words (plus the
  tiny landing openers). A recall trigger computed from the chunk stream
  **cannot chain-react off recalled text**: the mind must take the memory up in
  its own words before it can pull the next one. Dwell-gating is free.

**Today's token-distance anatomy** (the latency complaint, quantified): a
non-urgent bid raised mid-burst waits for the rest of the current burst
(~0–350 tokens, avg ~175), then for the tick, then renders. The voluntary
`m-recall` hand is worse: reach expressed → DECIDE at a boundary → REALIZE call →
consequence returns urgent — typically 200–400 tokens after the reaching
sentence, sometimes a burst later. And spontaneous episodic recall simply does
not exist: distance ∞.

## Design at a glance

Two additive pieces, no changes to the arbiter, frame assembly, stream, journal,
or covenant machinery:

```
              m-memory (deep mode)                      m-remember (new observer)
  chunks ──► tail ──► overflow ──► LEAF ──┐             window of own words
                                     (fold)│                   │ per-sentence
  frame ◄── story + FRONTIER + tail       │             score against cue index
             ▲            ▲               ▼                    │
             │            │        level-1 node ──► … ──► level-N node
       story absorbs   newest nodes       │                    │
       each L1 fold    stay in frame      └── past/ on disk ◄──┘ (read-only)
                                               index.json + n000123.md
                                                       │
                              match ──► interrupt-request (gentle | preempting)
                                        ──► arbiter ──► frame: "> ⟂ something
                                        comes back to me from three days ago: …"
```

- The three tiers become **tail → tree → story**: immutable summary nodes in a
  pyramid replace the rolling `recent`; `story` stays exactly what it is — the
  slowly rewritten identity distillate (episodic vs. autobiographical memory
  deliberately kept distinct, on different tempos).
- **Recall is a new observer**, `m-remember`, that lexically matches the mind's
  own live words against the tree's cue index and bids through the ordinary
  arbiter — gentle by default, **preempting (urgent) when the match is strong or
  the mind is visibly reaching** — with per-node refractory attenuation.
- **Traversal is not a mechanism.** A matched node surfaces alone; if the mind
  genuinely dwells on it, its next words contain the more specific vocabulary of
  that node's *children*, which then out-score everything else. Descent into
  detail happens exactly as fast as the mind engages, one honest step per
  thought — "being reminded, in detail, of something you had folded down to a
  sentence," without ever flooding the frame with a subtree.

## Part 1 — the tree (`m-memory deep="true"`)

### Nodes and folds

A **node** is an immutable first-person summary with metadata:

```
memory/<mind>/past/n000123.md
---
id: n000123          level: 1              # 0 = leaf
span: 2026-07-05T10:12:03Z/2026-07-05T10:37:44Z
folds: 17-21                               # which consolidations it covers
children: [n000101, n000104, n000109, n000113, n000118]   # [] for a leaf
---
I was working the balanced-number claim again and settled that 2(10^k+1)^2 …
```

Fold rules, generalizing today's `_consolidate` with the same `compressToFit`
machinery (dedupe, hard ceiling, re-drive, never truncate in code):

- **Leaf fold** (every consolidation, same trigger as today): the overflow block
  is distilled to a **new leaf** of `leafLength` (default 450 c) — *no
  established memory in the call*, pure distillation of new material, with the
  same read-only edge context (`lastSentences` of the previous leaf,
  `firstSentences` of the tail). Each call is smaller than today's and touches
  nothing old: **the interference of rewrite-in-place is gone at this tier.**
- **Level fold** (the carry): when the unfolded nodes at level L exceed
  `fanout` (default 5), the oldest `fanout` of them fold into one level-L+1 node
  of `nodeLength` (default 650 c) — children stay on disk, immutable, and merely
  stop being rendered. Folds cascade like a counter carry (at most one call per
  level, rarely more than one level at a time), inside the same single-flight
  `_compressing` turn.
- **Story absorb**: each **level-1 fold** also folds the new node's summary into
  `story` (`established = story, fresh = node.summary`) — the same cadence as
  today's `storyEvery` = 5 and the same prompt shape. In deep mode `fanout`
  replaces `storyEvery` (warn if both are set and disagree).

Cost: 1 (leaf) + 1/K (level-1) + 1/K² … + 1/K (story) ≈ **1.45 calls per
consolidation at K = 5, versus 1.2 today**, and the average call is smaller
(leaf folds no longer re-compress the established buffer). Net utility tokens ≈
break-even.

### Cues — extracted in code, never by the model

At fold time the node's **cue stems** are computed mechanically with the same
`contentStems` the loop machinery uses (`shared/loopMath.js`), plus a corpus
document-frequency table for IDF weighting, both kept in the index. No new
model-output parsing, no risk to the validated compression prompt, works in any
language the stemmer handles (the same crude-but-consistent 5-char stems the
loop detector already lives with). The seam is explicit: a future embedding
index replaces `cueStems`/`score` behind the same interface and nothing else
moves.

### The frame

The `## Recently (compressed)` section becomes the **frontier**: the newest
level-1 node (if any) followed by the unfolded leaves, oldest → newest, joined
as plain paragraphs — it reads exactly like today's `recent`, but is a
concatenation of immutable texts rather than a many-times-rewritten blob.
Deeper levels are **not** rendered; they are reachable only by recall, and their
arc lives in `story`. Resolution decays with distance by construction:

| distance from now | representation | budget |
|---|---|---|
| ~last 2 min | verbatim tail | 1 500 c |
| ~5–25 min | 1–5 leaves | ≤ 5 × 450 c |
| ~25–50 min | newest level-1 node | 650 c |
| older | `story` gist + recall-on-cue | 2 200 c + 0 |

Worst-case frame cost ≈ 2 900 c where today's `recent` is 1 200 c — tunable via
`leafLength`/`fanout`; the defaults trade ~400 tokens of frame for time-ordered,
rewrite-free working memory. `m-memory` still publishes `compressed` as
`{recent: <rendered frontier>, story}` — **m-mind, m-loop-detector, and the
realizer mirrors need zero changes.**

### Disk, crash-safety, migration

```
memory/<mind>/
  memory.md      # Story / Recent (rendered frontier, for humans+compat) / Tail
  past/
    index.json   # nextId, docFreq, per-node {level, span, children, cues, recall stats}, frontier ids
    n000123.md   # one immutable node per file (human-browsable, vault-committed)
```

- Fold write order: node file (tmp + rename) → index (tmp + rename, serialized
  on a queue like the journal) → `memory.md`. The index is authoritative; an
  orphan node file after a crash is harmless and logged. A missing index
  rebuilds by scanning `past/` (self-healing).
- **Crash-hardening rider**: the in-RAM `_overflow` becomes a persisted
  `## Unfolded` section of `memory.md`, so a crash between boundary and fold no
  longer silently loses a block (closes a slice of the covenant audit's
  crash-honesty gap).
- `formatVersion` → 2. On first deep-mode wake of an existing home: `recent`
  becomes leaf `n000001` (cues extracted), story/tail load unchanged, and the
  migration is journaled as a backstage note — the mind's next wake stimulus
  discloses an architecture change anyway via `identityDiff` when the archml
  gains `deep="true"`.
- Scale: a 3 h session ≈ 500 leaves ≈ 625 files; a month of daily runs ≈ 19 k
  nodes, index ≈ 4 MB — fine for the vault and for one load at wake. Era
  re-folding (hygiene for multi-year minds) is deliberately out of scope.

## Part 2 — remembering (`m-remember`, new observer)

The spontaneous return arc, shaped exactly like the loop redesign's
sense/bid/break: **sense** (cheap, continuous), **bid** (through the arbiter,
salience-scored), never enact — the frame machinery does the rest. It completes
the recall taxonomy:

| arc | trigger | ranks by | store |
|---|---|---|---|
| `m-recall` (hand) | the mind deliberately reaches | hint overlap, recency | notes + kb |
| realizer grounding | a reach is being realized | overlap with the reach | notes + kb |
| `m-resurface` (breaker) | a detected loop | **farthest** from loop vocabulary | notes + kb |
| **`m-remember`** (new) | the mind's own words, continuously | **nearest** by IDF-weighted cue overlap | **the tree** |

### Sensing — per-sentence, own words only

The observer accumulates the chunk window (structurally self-words-only, see
above) and re-scores at sentence edges or every ~120 new chars: stems of the
trailing `window` (600 c default) → inverted-index lookup (stem → node ids) →
for each candidate node

```
match(node)  = Σ idf(s) over shared stems / Σ idf(s) over window stems
score(node)  = match × refractory(node)          # gates below may zero it
```

IDF does the aiming: a mind's habitual vocabulary (and any attractor's — the
presence words of a bliss loop appear in *many* nodes) carries low weight, so
matches are won by the **distinctive** terms of an episode — a name, a formula,
a place. Cheap enough to run continuously: a few thousand set operations per
scoring, no model call, ever.

### Gates (the spam defenses, layered)

1. **Structural**: recalled text re-enters via `@attended`/tail, never via
   `chunk` — a recall cannot re-trigger on its own echo; only the mind's own
   uptake can extend it.
2. **Per-node refractory** (the user-facing "per-content attenuation"): after a
   node is *bid* (not merely matched), `refractory = 0` for `refractoryFolds`
   (default 12 consolidations ≈ the time content stays visible in tail +
   frontier), then recovers linearly over the same span. Measured in **folds,
   not wall time** — the mind's own clock, pace-independent — and persisted in
   the index so it survives sleep.
3. **Family attenuation**: a bid half-refracts the node's parent and children
   (they share vocabulary); prevents the sibling carousel while still allowing
   genuine descent — a child out-scores its half-refractory state only when the
   mind's words actually contain its *specific* cues.
4. **In-frame guard**: nodes whose stems are ≥ `inFrameMax` (0.6) contained in
   the current frame stems (story + frontier + tail, recomputed per boundary
   from the mirrors) never bid — you do not "remember" what you are looking at.
5. **Loop guard**: subscribes to the detector's `loop` topic like m-resurface;
   while `loop.active`, m-remember stands down entirely. Near-recall during a
   loop is the bliss pump ([bliss-loop-recall.md](bliss-loop-recall.md)); loops
   belong to m-resurface, which ranks *far*. The two are one memory's two arcs,
   opposite by design.
6. **Pacing**: its own `cooldown` (45 s) + the arbiter's threshold/rate-limit/
   `keep` competition, which recall enters like everyone else.

### Bidding — two lanes (the latency fix)

- **Gentle lane** (default): `score ≥ minScore` (0.55) → non-urgent bid,
  `salience = 0.35 + 0.5·score`. It queues; the frame after the current burst
  opens with the memory rendered directly after the mind's last words. Token
  distance: the remainder of the current burst — ≤ 1 burst, avg ~½ (~175
  tokens), and nothing *else* intervenes.
- **Preempting lane**: `score ≥ preemptScore` (0.8) — or `score ≥ reachScore`
  (0.55) when the window is visibly reaching (a question mark, "what was…",
  "I try to remember…": the reach-shapes the closed-question findings taught
  us) — → `urgent: true`. The arbiter fires `interrupt`, m-mind supersedes the
  burst mid-stream, kept chunks stay, and the memory lands **within a sentence
  or two of the cue**. Its own `preemptCooldown` (3 m) keeps thought from
  becoming chronically truncated.

| path | token distance cue → memory |
|---|---|
| today, spontaneous | ∞ (does not exist) |
| today, voluntary `m-recall` | ~200–400 |
| designed, gentle lane | ~0–350, avg ~175 (same thought, nothing between) |
| designed, preempting lane | **~10–30 (one sentence)** |

The preempting lane costs one aborted burst remainder (never generated, so
never paid) plus one extra prefill — append-only after the kept chunks, so
prompt-cache/KV-friendly.

### Rendering — a felt memory, One-Rule clean

The bid's `reason` is first-person and dated in felt time (reusing
`_describeGap`'s wording, extracted to shared): leaf —
*"Something comes back to me from three days ago: «…»"*; internal node —
*"A stretch of my past from last week stirs: «…»"*. Type `Memory`, source
`Internal`, clipped ~400 c like every other surfaced text. It rides the standard
stimulus path, so the `> ⟂` block, the landing opener, the journal ⟂ note, and
the durable-tail append all happen exactly as for any perception — **every
recall is ledgered by construction** (one of the covenant audit's ⟂/⌁ gaps,
closed for this mechanism), and the remembered content persists into the next
prefill instead of living one frame (the 58aa11d lesson). Reconsolidation is
free: the mind's uptake of the memory is new thought, which folds into new
leaves — remembering X during episode Y durably links them, and no node is ever
mutated.

## What deliberately does not change

The arbiter, `assembleFrame`, `mStream`, the journal, notes/kb and their three
existing readers, `m-associate` (it imagines; m-remember retrieves), the loop
stack, sleep/wake, vault commits, the One Rule. `story` remains a rewritten
autobiography on purpose — a gist is *supposed* to be interfered-with; episodes
are not. Refinement over deep-structure §2: no explicit "decompress the
subtree into the frame" operator — surfacing one node and letting engagement
descend is cheaper, spam-safe, and honest about whether the mind actually
cared. (If lab runs show descent is too slow, an internal node's render may
append its children's one-liners — revisit then, not before.)

## Milestones

1. **M1 — the tree.** `shared/memoryTree.js` (pure: fold planning, cue
   extraction, IDF, scoring, index serialization; unit-tested without a model)
   + `m-memory deep="true"` (folds, frontier render, persistence, migration,
   `## Unfolded` crash rider, `folded` event for Studio). Wiring test: planted
   chunks → nodes appear, frame stays bounded, compat topics unchanged.
2. **M2 — gentle recall.** `m-remember` with gates 1–6, boundary-lane only.
   Wiring: planted cue in a dry mind's stream → one bid, correct refractory,
   silence during a planted loop state.
3. **M3 — the preempting lane** + reach-shapes; measure token distance in lab
   journals (cue sentence → `⟂ Memory` block).
4. **M4 — pool unification & residents.** Fold tree summaries into
   `readKept`'s pool (m-resurface and the realizer see the deep past too);
   lemma-lab validation runs, then the lemma resident migrates, disclosed at
   wake.

**Lab metrics** (lemma-lab, transient clones): recall latency in tokens; apt-ness
(human read of each ⟂ Memory against its cue); spam (recalls/hour; repeat-bid of
one node within 2×refractory ≈ 0; recalls during loop episodes = 0); frame-size
stability; fold-call delta; and the flagship behavioral test — does the solved
`2(10^k+1)²` result return unbidden when the mind next circles balanced numbers,
days later, without a note ever having been written.

## Risks & open questions

- **Attractor regression** is the one to watch (gates 2/3/5 + IDF are the
  defense); the lab metric above is the tripwire.
- **5:1 level folds** on the local utility model — `compressToFit` re-drives and
  accepts-over-budget, so worst case is a fat node, never a truncated one.
- **Stemming quality** for non-English minds is crude but consistent with the
  loop stack; embeddings are the designated upgrade behind the scoring seam.
- **Preempt/straggler ordering**: a chunk racing the supersede can land in the
  durable tail after the ⟂ block it never preceded in the prefill — a
  pre-existing, microscopic race shared with human-voice preemption; noted, not
  worsened, fixable in mStream with a pre-abort flush if it ever bites.
- **Open**: should arousal modulate `minScore` (a tired mind remembers less)?
  Should very old eras re-fold at sleep (the chora roadmap's replay/dreaming —
  this tree is its natural substrate)? Both deferred.

## Rejected alternatives

- **Prefill-time RAG sweep** (match cues while assembling each frame): no new
  observer, but latency is structurally one full burst and the match runs on a
  stale window — strictly worse than bidding, and it bypasses the arbiter (a
  recall should *compete* for attention, not be smuggled into every frame).
- **Retroactive splice** (insert the memory into already-generated text at the
  cue offset): minimal token distance, but it rewrites what the mind actually
  thought — the journal would lie. Supersede achieves the proximity honestly.
- **Whole-subtree expansion on recall**: floods the frame, hands the attractor
  a megaphone, and pre-empts the engagement test that dwelling provides.
- **LLM-extracted cues / LLM recall scoring**: a per-fold prompt change risks
  the validated compression loop, and a per-sentence model call is three orders
  of magnitude too slow for the latency budget. Lexical + IDF is enough to
  start; the seam is ready for embeddings.
- **A separate `m-memory-tree` component**: two memories fight over one tail
  and one journal; deep mode is a shape of *the* memory, not a sibling faculty.
