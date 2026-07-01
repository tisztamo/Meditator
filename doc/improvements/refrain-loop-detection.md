# Refrain-loop detection — the rotating-slot pattern that no layer catches

> **Status: proposed (2026-07-01). Diagnosis + direction only; not implemented.**
> Observed in the `noosphere-lab` runs (six-mind constitution society on the local
> `ardincoder-1` / Qwen 3.6-27B-FP8), quantified with `--debug-prompts` and a
> temporary compression-capture hook (2026-06-30 → 07-01).
> The **detection** companion to [compressor-not-distilling.md](compressor-not-distilling.md)
> (which addresses bounding the compressor) and a new signal for
> [loop-detection-redesign.md](loop-detection-redesign.md)'s `m-loop-detector`.
> Touches `m-loop-detector` (a new code-level signal) and, optionally, `dedupeExact`
> / `compressToFit` (`src/mindComponents/mMemory.js`).

## The one pattern behind the bloat

A mind that has run out of genuinely new things to think starts producing a
**refrain template with a rotating slot** — a fixed stem, filled with a fresh noun
each burst:

- chronicle: *"I decide that the system must ___"* (16×) · *"I think of the ___"* (30×)
- criticism: *"that the collector must ___"* (15×) · *"the failure mode of the ___"* (12×)
- lemma-lab (earlier, [compressor-not-distilling.md](compressor-not-distilling.md)):
  *"I am part of that ___"* / *"it is enough"* (102×)

This single shape is the thing that slips through **every** defence at once:

1. **The loop detector reads it as content.** `m-loop-detector` classified 21 of 36
   detections in the run as `kind="content"` (an over-chewed idea), and the worst
   bloater is *under*-counted: its rotating vocabulary reads as topical progression, so
   the LLM detector often does not flag it as a loop at all. (Confirmed in run 1: the
   most-bloated mind had the *fewest* detected breaks.)
2. **`dedupeExact` cannot touch it.** The slot varies, so the sentences are
   *near*-duplicates, not byte-identical. The 14 025-char block the model refused to
   compress (below) is only **6 % recurring-4-gram** — far too low for exact dedup to
   fire, yet transparently a loop.
3. **The compressor echoes it.** Handed N sentences that each look semantically
   distinct ("decide X", "decide Y", "decide Z"), the summariser faithfully keeps all N.
   See the echo evidence below.

So the refrain template is not one of several bloat causes — in these runs it is
*the* cause. Catching it is worth a dedicated, cheap, code-level signal.

## Evidence — the compressor echoes the refrain (run 2, prompt-level)

With `--debug-prompts` on, the model's own output length is recorded in the *next*
re-drive prompt (`"It is N characters — about X% over the limit"`), so the whole
tighten-trajectory is reconstructable. 18 `"compression settled over budget"` events;
the decisive one, chronicle's `recent` buffer (target 3 000, ceiling 3 600):

| pass | input | model output | shrink |
| --- | ---: | ---: | ---: |
| 1 | 14 025 (told: *"362 % over, cut hardest where it LOOPS"*) | 13 873 | **1 %** |
| 2 | 13 873 | 13 869 | **4 chars** → stall → accepted |

Told the exact overage and explicitly to collapse loops, the model **returns its
input**. Because over-budget output is accepted and re-fed as `established`, the
per-fold source grows monotonically **3.5k → 5k → 8k → 14k → 27k**. This is the
documented **echo threshold** ([compression-fidelity.md §4a](../architecture/compression-fidelity.md))
pinned to a cliff: the same model *does* compress moderate blocks (ecology
13 301 → 5 501 on a later pass) but echoes large looped ones.

An open question the local model can't answer alone: **is compressing one's *own*
loop output uniquely hard?** We only have Qwen output to compress *with* Qwen. See the
experiment (`experiments/compression-failure/`).

## Why detection is the right layer to add

The compressor-side fixes in [compressor-not-distilling.md](compressor-not-distilling.md)
(near-dup collapse in code, escalate-on-stall, block-size bounding) are still the
right *remedies*. But they are all reactive to a buffer that already bloated. A cheap
**refrain signal computed on the tail** — before consolidation — would let the mind:

- **break the loop earlier** (feed the signal to `m-loop-detector` as a code-level
  prior, so a rotating-slot refrain is flagged even when the LLM judge calls it
  "content"); and
- **give the compressor a hint** (a near-dup collapse keyed on the detected stem is
  the *safe* class of removal — pure redundancy, no settled fact lost); and
- **decide the hard-cap question honestly** — if detection + earlier breaking keeps
  buffers bounded, the hard programmatic cap may not be needed at all. Understand the
  failure first (per the experiment), then choose.

## Directions to consider (undecided)

1. **A refrain-template density metric (code, no model).** Skeletonise the tail: for a
   sliding window of sentences, extract the leading *k*-token prefix (the stem) and
   count how many share a stem but differ in the trailing slot. High "same-stem,
   rotating-tail" density = refrain. Robust to the exact wording, which is the whole
   point (`dedupeExact` and n-gram recurrence both miss it). Cheap enough to run every
   boundary. Emit as a `loop{kind:"refrain", stem, density}` prior.
2. **Feed it to `m-loop-detector` rather than replace the LLM judge.** Keep the judge
   (it catches semantic loops the skeleton misses); add the refrain metric as a second
   sense that can raise a bid on its own when density crosses a threshold. Mirrors the
   redesign's "sense → bid → break" seams.
3. **Stem-keyed near-dup collapse in the compressor.** When the refrain metric fires,
   `dedupeExact`'s sibling collapses the rotating-slot family to one line
   ("across many bursts I kept deciding the system must do X, Y, Z…"). This is
   direction 1/3 of [compressor-not-distilling.md](compressor-not-distilling.md) made
   *targeted* by the detector instead of a blind similarity threshold.
4. **Measure before hard-capping.** The user's explicit call: do **not** jump to a
   programmatic Story cap until the experiment shows whether a better prompt or a
   different model compresses the refrain. A cap that fires on content we could have
   distilled loses information the "never drop a settled fact" invariant exists to
   protect.

## Open questions

- Is the refrain a *stream* pathology (the mind genuinely loops) or a *memory* one
  (compression fails to collapse a loop the stream would have moved past)? Run data
  says both: the stream loops **and** the compressor can't undo it. Detection helps the
  first; the experiment probes the second.
- What stem length *k* and density threshold separate a genuine refrain from a mind
  legitimately working a list ("Article I… Article II…")? Needs tuning against captured
  inputs, including a deliberate-list negative case.
- Does breaking earlier just move the loop (the mind re-enters it next burst), as the
  redesign's "breaking is palliative" finding warns? If so, the durable fix is
  upstream (novelty pressure on the commons — see `noosphere-lab-experiment` finding 9).

## See also

- [compressor-not-distilling.md](compressor-not-distilling.md) — the compressor-side
  remedies (this is the detection-side companion).
- [compression-fidelity.md §4a](../architecture/compression-fidelity.md) — the echo
  threshold and the existing `dedupeExact` + loop-collapse-prompt defences.
- [loop-detection-redesign.md](loop-detection-redesign.md) — the `m-loop-detector`
  sense/bid/break architecture this signal plugs into.
- `experiments/compression-failure/` — the prompt-variant and cross-model experiments
  set up to characterise *why* the refrain won't compress before choosing a fix.
