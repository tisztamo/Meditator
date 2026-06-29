# IMPROVEMENT NOTE: Fact Memory — a verbatim, keyed store independent of the narrative

**Date:** 2026-06-29
**Triggered by:** ARC solver — the checker confabulated the puzzle because the grids scrolled out of the tail and were paraphrased by memory compression
**Severity:** High (a mind cannot reliably hold reference data or its own confirmed results)

---

## Problem

A mind's attention frame today holds exactly **two kinds of content** (see [memory.md](../architecture/memory.md), `mMind.js:assembleFrame`):

1. The mind's **self** — identity + embodiment. Verbatim, always present, never compressed. But it is the mind's *self*, not its *data*.
2. The mind's **story** — `tail` (verbatim, but it scrolls out at `tailLength`) and `recent`/`story` (LLM-**compressed**, lossy by design).

There is no third kind for **knowing**: a verbatim, atomic, keyed, durable piece of ground truth that is independent of the narrative compressor. So reference data and confirmed results are forced to ride in the *story*, where they scroll out of the tail and then get paraphrased — or worse, hallucinated — by compression.

This was caught red-handed by capturing the ARC checker's verbatim prompt (`MEDITATOR_DEBUG_PROMPTS`). At birth its frame held the puzzle's 54 grid rows; a few minutes later it held **zero**. The `## Recently (compressed)` block had replaced them with prose that:

- **falsely asserted possession** — *"I have the training examples in front of me, etched into my memory as literals, ready to be copied"* (they were not in the frame at all);
- **invented data** — hallucinated training "Example 2 / 3 / 4" that do not exist (the puzzle has only 0, 1 + the test), with made-up output sizes.

The model then reasoned over fabricated examples and even noticed *"I don't have the test input in front of me as a literal string"* — i.e. it behaved rationally under a prompt that had removed the data **and** told it the data was present. **This is not a weak model; it is a missing memory kind.** Compression is the right operation for the *story of thought*; it is exactly the wrong operation for *reference data and verdicts*.

## What already exists, and why it isn't enough

The hands and the scribe are *shaped* like a fact memory, but none keeps a fact reliably in front of the mind here and now:

| Mechanism | Verbatim? | Keyed? | In the frame? | Why it falls short for facts |
|---|---|---|---|---|
| `m-memory` tail | yes | no | yes, but **scrolls out** at `tailLength` | reference data ages out and is gone |
| `m-memory` recent/story | no (**compressed**) | no | yes | paraphrases / hallucinates data |
| `m-note` → `notebook.md` | yes | by timestamp | only via recall | write path is fine; recall is the weak link |
| `m-recall` | — | no (**fuzzy overlap**) | on demand | surfaces **one 400-char fragment**, *only if the model chooses to reach* |
| `m-kb` (scribe) → `knowledge/` | no (**distilled**) | by file path | only via recall | distills meaning — loses the literal |

The scribe (`m-kb`) is the closest cousin — a librarian that files durable knowledge — but it *distills*. We need its **anti-particle**: a librarian that files **verbatim** and answers **by key, whole**.

## The design — `m-facts`

One new faculty, built on the existing hand/scribe bones, holding a third kind of memory: **knowing**.

**Store.** `memory/<mind>/facts/<key>.md` — one verbatim fact per key, git-versioned ([memory.md](../architecture/memory.md) vault rules), **never compressed, never truncated**, with its own lifecycle. It never enters `m-memory`'s compressor. *This independence is the core of the fix.*

**A fact** = `{ key, value (verbatim), pinned?, source, at, supersedes? }`, with two origins:

- **Seeded** — declared in the architecture and present *from birth*, e.g. the puzzle grids. This is the direct ARC fix: reference data given to a mind should never have been narrative in the first place.
- **Earned** — the mind sets one down through a hand: a confirmed verdict, a derived constant, a definition it wants to keep exact.

**Tiered reach into the frame** (the chosen model — pinned *and* keyed-recall):

- **Pinned → always in-frame, verbatim.** `m-facts` publishes a `pinned` topic; `m-mind` mirrors it (a new `factsSrc`, sibling to `tailSrc`/`compressedSrc`) into a `## What I know (verbatim)` block that is never compressed and always present. Pin only what must never be absent (the puzzle); pinned facts share a bounded budget — pinning a novel is an authoring error, not a use case.
- **Keyed recall → the growing ledger.** Everything unpinned lives in the store and is pulled by key, returned **whole and verbatim** — not the fuzzy single 400-char pick `m-recall` does today.

**Hands** (reuse `m-act` — the "hands and scribe" the design grew out of):

- `remember{key, value, pin?}` — set a fact down **verbatim** under a key; idempotent (re-remembering supersedes). Where `m-kb` distills meaning, `remember` preserves data. The anti-scribe.
- `recall-fact{key}` — look up a fact by key, returned whole and verbatim (exact/prefix match, no truncation, no model-mediated paraphrase).

```
## What I know (verbatim)            <- pinned, woven into EVERY frame, never compressed
  puzzle: [[8,8,8,...],[...]]        <- seeded at birth

store (recall-fact{key} → whole, verbatim):
  verdict:crop-rule   "fails example 1 at r3,c2: got 8, wanted 3"
  const:bg-ex0        8
  ...
```

## How it fixes the checker

- The puzzle becomes a **pinned, seeded fact** → in front of the checker every burst, exact → it copies the real grids into its script. No scroll-out, no fabricated Examples 2/3/4, no false "etched in as literals."
- Each confirmed result becomes an **earned fact** (`verdict:<rule> → "reproduces ex0, ex1 exactly"`) it can recall by key — giving the negative-feedback loop a durable, exact ledger instead of a paraphrase that drifts. A checker that can *remember what it already proved* stops re-litigating settled rules.

## Relationship to the scribe and notes

`m-facts` does not replace anything. It sits beside `m-memory` (narrative), `m-note` (the timestamped journal of conscious notes), and `m-kb` (the distilled knowledge tree). The division of labour:

- **narrative** (`m-memory`): the story of thought — compressible, may fade.
- **meaning** (`m-kb` scribe): durable understanding — distilled, topic-organized.
- **knowing** (`m-facts`): data and verdicts — verbatim, keyed, exact, and (for pinned facts) always present.

## Open questions

- **Authoring surface for seeded facts** — a dedicated `<m-fact key="puzzle" pin>…</m-fact>` element, or a `pin` attribute on `<m-origin>` (origin-as-pinned-fact)? The former is more general; the latter is the smaller change.
- **`recall-fact`: new hand or a mode of `m-recall`?** `m-recall`'s fuzzy/recency selection and 400-char truncation are wrong for facts, but the read-side plumbing (`recallSources.js`) can be shared.
- **Pinned-budget policy** — fixed char budget for the `## What I know` block; what to do if exceeded (warn at authoring time; never silently drop a pinned fact).
- **Supersede / correction semantics** — `remember` on an existing key overwrites; do we keep prior versions (git already does) or expose a visible "I corrected this" event?
- Interaction with templating (a seeded fact in an `<m-archetype>` vs per-member).

## Required direction — smallest first milestone

The piece that unsticks the checker is small and self-contained: **the store + the pinned-frame section + seeded facts.** Build that first (one component, one new `m-mind` `factsSrc`, one frame block, a `pin` authoring surface), re-run the solver, and confirm the checker copies the real grids verbatim. The `remember` / `recall-fact` hands (the earned-ledger half) follow as a second step once the pinned half is proven.

---

## Related Issues

- [multi-mind.md](../architecture/multi-mind.md), [memory.md](../architecture/memory.md): the frame-assembly and vault rules this extends
- [memory-persist-race.md](memory-persist-race.md): a separate persistence bug found the same session
- `src/mindComponents/mMemory.js` (frame tiers + compression), `mNote.js` / `mKb.js` / `mRecall.js` (the write/read bones to reuse), `mMind.js:assembleFrame` (where `factsSrc` would mirror in)

**Status:** Open (design agreed: tiered — pinned reference data + keyed verbatim recall)
**Priority:** High (root cause of the ARC confabulation; pinned-half is a small milestone)
