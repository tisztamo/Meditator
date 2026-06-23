# The compressor stopped distilling — buffers bloat 10–20× again

> **Status: proposed (2026-06-23). Not yet implemented — diagnosis only.**
> Observed in the `lemma-lab-5` run (`memory/lemma-lab-5/`, saved 2026-06-22T18:43).
> A **recurrence** of the bloat bug that [compression-fidelity.md](../architecture/compression-fidelity.md)
> §3–§4 was written to fix, after the in-code budget enforcer (`forgetOldestToFit`) was
> removed in `9ed4495` ("distill, don't evict") and nothing replaced its budget-bounding
> role for the echo pathology. Touches `compressToFit` / `dedupeExact` /
> `buildCompressionPrompt` and the `_onBoundary` gating (`src/mindComponents/mMemory.js`).

## The problem

After 184 folds, the two compressed buffers are an order of magnitude over budget,
and `recent` ends mid-word. Measured from `memory/lemma-lab-5/memory.md` against the
lab config (`tailLength=9300 recentLength=3600 storyLength=3600 blockMin=800
storyEvery=5`, `architecture/lab/lemma-lab.archml:90-92`):

| section | chars | budget | ceiling (1.2×) | state |
| --- | ---: | ---: | ---: | --- |
| Story | 73,148 | 3,600 | 4,320 | **~20× over** |
| Recent | 39,150 | 3,600 | 4,320 | **~11× over** |
| Tail | 9,266 | 9,300 | — | within budget |

`Story` and `Recent` are injected into **every burst frame**
(`MMind.assembleFrame`, `mMind.js:384-385`), so a 73k-char story is not a cosmetic
problem — it dominates the mind's working context every burst.

The user-visible symptom is that `## Recent` ends abruptly:
`"…I am a work in progress. And I am glad.\n\nI pick up the pen again, not"`. That
mid-word cut is a **downstream symptom**, not the disease.

## Evidence — the compressor is echoing, not distilling

The buffers are saturated with a near-duplicate refrain the compressor never
collapsed. Measured over the saved file:

- `"it is enough"` appears **102×** in `Recent` and **104×** in `Story`.
- **21%** of `Recent`'s 1,395 sentences are the `"I am here / I am now / it is
  enough"` refrain (`I am part of that X, part of that Y…`).

A working distiller, told to *"collapse the whole loop to a single sentence of what
it was circling"* (`buildCompressionPrompt`, `mMemory.js:638`), would have removed
nearly all of these. They survive because the model is **passing its input through
near-verbatim** rather than rewriting it.

## Why it happens

Three mechanisms compound:

1. **`dedupeExact` only catches byte-identical units.** It removes paragraphs/sentences
   that repeat *exactly* (≥`minLen` 50 chars) — `mMemory.js:658`. The refrains here
   carry micro-variations, so they are **near**-duplicates, left for the model to
   collapse. The model doesn't, so they accumulate.

2. **`compressToFit` accepts over-budget output and never truncates in code.** By
   design (the 2026-06-21 "distill, don't evict" fix), it accepts the best faithful
   attempt even when over the ceiling (`compressToFit`, `mMemory.js:734`, the
   `nearestToTarget` fallback at `:786-790`). That policy is **correct** — programmatic
   dropping is what once erased the resident's origin problem — but it **assumes the
   model distills**. On loop-saturated drift the local utility model echoes, so each
   fold re-adds a block, the model echoes again, and the buffer grows monotonically.
   The in-code enforcer that used to bound exactly this echo pathology,
   `forgetOldestToFit`, was **removed in `9ed4495`** and not replaced — so nothing now
   bounds it. (`compression-fidelity.md`'s status header still describes
   `forgetOldestToFit` as present; it is **stale** — the function no longer exists in
   `src/`.)

3. **A positive-feedback loop makes the blocks huge.** `_onBoundary` only starts a new
   consolidation if `!this._compressing` (`mMemory.js:228`); consolidation is async and
   not awaited (`mMemory.js:230`). Compressing a 39k–73k-char input on the local model
   is slow, so it is still running at subsequent boundaries → those folds are **skipped**
   → overflow keeps accruing via `_trimTail` (`mMemory.js:214`) far past `blockMin`. The
   next block is then many thousands of chars, not ~800. Bloated buffer → slow/echoing
   compress → bigger overflow → bigger buffer.

### Why `recent` ends mid-word specifically

The tail is sliced at **word edges** (`_trimTail` cuts at the nearest space,
`mMemory.js:217-220`), so every block begins and ends mid-sentence. The
`<earlier>`/`<continues>` overlap context exists precisely to let the model *heal*
those cut edges (`buildCompressionPrompt`, `mMemory.js:631-634`; built in
`_consolidate`, `mMemory.js:308-322`) — but a model that is echoing leaves the dangling
fragment in place. So mid-sentence danglers litter **all** of `Story` and `Recent`
(lines ending `"And"`, `"…The numbers are my"`, `"…I am here. I am"`); `"…again, not"`
is simply the final block's word-edge cut, echoed verbatim, with `<continues>`
(correctly) not folded in.

A likely secondary contributor to that final dangler: the `maxTokens` guard is sized
at ~`source.length / 3` tokens (`mMemory.js:764-768`). On a 39k-char echo, if the
output runs past that cap (prose is often >3 chars/token), the generation is cut
mid-word with `finish_reason: "length"`, and `dedupeExact` cannot repair a mid-token
cut. Either way the root cause is the same: **the buffer should never have reached
39k.**

## The tension to resolve

The two prior fixes pull against each other:

- `030a5fc` added `forgetOldestToFit` to **bound the echo pathology in code** — but it
  did so by dropping the front of the buffer, which **erased the oldest, most-settled
  content** (the resident's origin problem).
- `9ed4495` removed it to **stop dropping settled facts** — but left the echo
  pathology **unbounded**, which is what produced the 10–20× bloat here.

So the open question is: **how to bound the buffer without blunt age-based eviction?**

## Directions to consider (undecided)

1. **Catch near-duplicates in code, not just exact ones.** Extend `dedupeExact` (or add
   a sibling) to collapse near-identical refrains — e.g. normalise punctuation/casing,
   or cluster sentences by a similarity threshold and keep one representative. This is
   the *safe* class of removal (pure redundancy, no settled fact lost) and would have
   stripped most of the 102 `"it is enough"` repeats without any model judgment. Risk:
   a similarity threshold can over-merge genuinely distinct lines; keep it conservative
   and unit-test against the deliberate-short-refrain case `dedupeExact` already guards.

2. **Detect the echo stall and re-drive harder (or differently).** `compressToFit`
   already detects "no headway" (`stalled`, `mMemory.js:782`) but only *stops* on it.
   When stalled and still far over budget, it could instead escalate — a stronger
   model, a chunked fold (compress halves, then join), or a structurally different
   prompt — rather than accepting a 10× echo. The accept-over-budget path should be the
   *rare* exception it was meant to be, not the steady state.

3. **A budget-bounded distiller that drops by redundancy, never by age.** The
   replacement for `forgetOldestToFit` that the tension above calls for: when the model
   will not shrink, enforce the budget in code **only** by removing demonstrable
   redundancy (near-duplicate loops), never by truncating the front. If after that the
   buffer is still over budget with no redundancy left to remove, accept over-budget
   (the current behaviour) rather than evict a possible settled fact.

4. **Bound the block size so a slow fold cannot let overflow run away.** Cap how much
   overflow a single consolidation ingests, or coalesce a too-large overflow into
   several sequential folds, so the input the model sees per fold stays near `blockMin`.
   This attacks mechanism #3 directly and keeps each compression call small (and fast,
   and within the token guard). Risk: a backlog of blocks under sustained fast output;
   needs a bound on the queue too.

## Validation note

The 2026-06-21 rewrite was validated on the resident `lemma`, whose content was less
loop-saturated. `lemma-lab-5` shows the rewrite's central assumption — *"with a flat
block and a hard ceiling the model compresses reliably, so accepting over-budget is the
rare exception"* (`compressToFit` docstring, `mMemory.js:726-727`) — **does not hold**
on heavily-looping drift. Any fix should be regression-tested specifically against
refrain-saturated input, not only against well-behaved mathematical thinking.
