# The `_memTail` mirror can lag the durable tail by a microtask

> **Status: proposed (2026-07-03). Small audit — not implicated in any observed failure.**
> Surfaced while investigating the lemma-lab-20 run (see the project memory,
> `local-voice-profile-experiment`) and the amanita 0.4 migration (`6f04c51`).

## The observation

Amanita 0.4 defers `pub()` subscriber dispatch to a microtask. `m-mind` mirrors
memory's tail (`pub("tail")` → the `_memTail` sub, `mMind.js`), and `assembleFrame`
reads that mirror when composing the prefill. Chunks that land in `MMemory.tail`
in the same tick as a frame assembly can therefore be present in the durable tail
but absent from the prefill — a few trailing characters of drift, at most one
microtask wide.

The same pattern was already fixed once on the agent side: `mContext._onStep`
stopped reading a deferred mirror and reads its source directly.

## Why it has not mattered

The drift is tiny, the seam-overlap trim (`trimSeamOverlap`) absorbs echoes at
burst starts, and the stimuli-into-tail change (2026-07-03,
[perception-not-compressible.md](perception-not-compressible.md)) keeps prefill and
durable tail composed through one shared helper, so they cannot diverge in
*content* — only in how many trailing stream characters each saw.

## The audit to do

- Decide whether `assembleFrame` should read the tail synchronously from its
  m-memory (as `mContext` now does from its source) instead of the mirrored topic,
  or whether the mirror is acceptable by design (decoupling.md prefers topics).
- If the mirror stays, document the one-microtask window as intended slack.
- Check the other tail consumers (`m-loop-detector`, `m-resurface`) for the same
  assumption; they are cadence-based and almost certainly indifferent.
