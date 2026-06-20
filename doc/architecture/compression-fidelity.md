# Compression fidelity — iterative, never-truncating consolidation

> **Status: §1–§4 and §5 (minimum) implemented (2026-06-20).** §1–§4 in
> `MMemory._compress` / `compressToFit` / `buildCompressionPrompt`
> (`src/mindComponents/mMemory.js`); §5's recall-pool in
> `src/mindComponents/recallSources.js`, read by `m-recall` and `m-resurface`.
> Unit coverage in `architecture/tests/unit/memory-compress.test.js` and
> `recall-sources.test.js`. **§5's richer variant — a KB digest into the compressor
> — remains proposed.** Companion to [memory.md](memory.md).

## The problem

`m-memory` folds overflow into `recent`/`story` with one utility-model call per
tier (`MMemory._compress`). Two flaws make a mind quietly lose things it had
already worked out — including, in the lemma runs, a settled result.

1. **The token cap is set below the character target, and silently truncates.**
   `_compress` uses `maxTokens = Math.ceil(targetChars / 3)`. Dense text runs at
   well under 3 chars/token (≈2.7 for math/LaTeX), so a *correctly sized* summary
   cannot fit in the cap — e.g. a 7200-char target needs ~2670 tokens but is
   capped at 2400. The call comes back `finish_reason: "length"`, cut mid-output,
   and we **persist the truncated text as the new memory**. Whatever the model was
   still writing is lost — and it was not the model's choice to drop it.

2. **The model cannot measure its own length, and gets no feedback.** "Condense
   into at most N characters" is not actionable to a token-by-token generator.
   Replayed live, asked for ≤7200 chars *with room to finish*, the model
   reproduced its ~9900-char input **verbatim** — 0% compression — then in
   production got guillotined by flaw 1. The model is capable (it is the same
   model that runs the mind); it simply has no way to aim at a character budget in
   one shot.

A third, related gap explains why the *result* was missing rather than merely
mangled: the decisive conclusion lived only in the scribe's `knowledge/` files,
and **the knowledge base never flows back** into the stream or the compressor.
`m-recall`/`m-resurface` read `notes/notebook.md` only. So even a faithful
compressor had no settled statement to preserve — the stream kept the question
open (short bursts are cut before a multi-step conclusion lands), while the scribe
quietly recorded "solved" in a file nothing reads back.

## The fix

### 1. Iterate to fit; never truncate

Close the length loop **in code**, because the model cannot. Compress, measure the
output in characters, and if it is still too long, re-drive with feedback and try
again. Accept the first attempt that lands in the size band.

Feedback is expressed in **characters and a percentage — never tokens** (tokens
are model-dependent and not human-readable). Crucially, the percentage is taken
against the **memory being revised, not the whole input** (memory + new thoughts):

> *"The memory-so-far is 7000 characters; make the new version about 7200 (103% of it)."*

The work is to fold new thinking *into* an existing memory, so the memory's own
size is the thing to aim by. On average the budget already **is** roughly the
memory's size — a tier is compressed back to its budget every fold — so the target
is usually near 100% of the memory, a little over when the last fold came in short
and a little under when it came in long. Expressing the budget as a fraction of
the *total* (memory + new thoughts) is what made the model echo its input verbatim:
asked for "70% of the 10044 you can see," it has no actionable handle and reproduces
everything; asked to "revise your 7000-char memory to about its own size," it has a
concrete target it can aim at. `pct = round(target / base * 100)`, where `base` is
the memory's length (on a tighten pass, the previous output's length; on the very
first fold, when there is no memory yet, the new thinking's length).

### 2. `maxTokens` is only a silent guard

Set `maxTokens` generously off the **input** size (worst case: pass 1 echoes the
input), e.g. `ceil(inputChars / 2.0) + 512`. It exists solely so a single pass is
never cut short — it is never surfaced to the model and never used as the budget.
With a generous guard, `finish` should always be `stop`; if `length` ever occurs,
treat it as "too long" and iterate.

### 3. Accept band, with an over-compression floor

Accept when the output is within `[0.8, 1.2] × target` (`maxPasses ≈ 4`).

- **Too long** → feed this attempt back and tighten (§1).
- **Below the floor** (over-compressed) → fall back to the previous, longer
  attempt. **Never ask the model to expand** — expansion invites invention, which
  violates "never invent." Keep every attempt; if passes run out, take the one
  closest to target.

A verbatim echo needs no special detector — it is simply "too long," handled by
the next pass.

### 4. Integrate old and new by folding, not re-summarising

Show the model the **memory so far** and the **new thinking** as two separate
blocks, and ask it to produce the next version of the memory by folding the new
into the existing — keeping the conclusions and open questions the memory already
holds, and adding from the new thinking only what is durable. The point is to frame
the task as *revising an existing memory*, not re-summarising a flat blob: that is
what lets the budget be a percentage of the memory (§1), and it stops a long-settled
conclusion from being re-derived or dropped just because the latest burst did not
mention it.

This is **not** an instruction to treat the established memory as proven or
immutable — the model may re-word, reorganise, or trim it to make room. It is only
that the established memory is the thing being revised, and the new thinking is
material to fold in.

The one case this does not actively rescue — a genuine new breakthrough that has
not yet survived a fold — is **deliberately not the compressor's job**. It cannot
tell a durable new result from new noise on first sight, and trying would just
smuggle recency-bias in. That case is covered by §5.

**Keep the prompt general.** `m-memory` serves every mind, not the math minds —
no domain vocabulary ("arithmetic", "proofs", …); the mind's own first-person voice
throughout.

Template (domain-neutral). There are three shapes, picked by what is present — the
**tighten** shape is the re-drive of an over-long previous output, where there is no
new thinking. This is the *fold* shape (memory + new thinking):

```
You keep the {tier} memory of a mind's inner life, in its own first-person voice.

<memory-so-far>
{memory}
</memory-so-far>
<new-thinking>
{recent / overflow}
</new-thinking>

Write the next version of the memory by folding the new thinking into the
memory-so-far. Keep the conclusions, decisions, and open questions the memory
already holds; from the new thinking keep only what is durable — results, decisions,
questions, anything that felt important — and condense or drop repetition, abandoned
dead ends, and passing detail. Never invent anything.
Length: judge the size against the memory itself, not against everything above. The
memory-so-far is {base} characters; make the new version about {target} ({pct}% of
it). The new thinking is raw material to absorb into that budget, not text to append
on top. Output only the memory.
```

### 5. Feed the knowledge base back

So a settled result is *present* to be preserved, not just protected once it
exists. Extend the recall path to see the scribe's `knowledge/**/*.md`, not only
`notes/notebook.md`:

- **Minimum (done).** A shared loader, `recallSources.js#readKept`, gathers the
  notebook and the knowledge base into one pool of comparable items
  (`{key, stamp, title, text, source}`, oldest-first). `m-recall` (voluntary) and
  `m-resurface` (involuntary) both read it, so a mind circling a question it already
  answered now has its **own filed conclusion** surface again — ranked by the same
  recency / cue-overlap logic that already served notes, no model call added. A KB
  item is *felt* by its source, never its mechanism: a note was "set down"; filed
  knowledge is something the mind "came to understand" / "had worked out" (the One
  Rule — no "knowledge base", no path, no `.md` leaks into the stream). `index.md`
  and hidden files are skipped (a map of the tree is not a thing to remember).
- **Richer (proposed).** Pass a short "what I have established" digest into the
  compressor's memory block, so settled facts cannot be compressed away even from
  the continuous memory. Larger surface — it couples `m-memory` to `knowledge/` and
  disturbs the §1–§4 prompt — so it is deliberately left as a follow-up.

§1–§4 stop the *loss*; §5 supplies the *fact*. The minimum is the load-bearing
half: it is the read-back the scribe never had, and the direct fix for a settled
result sitting unread on disk while the stream re-asks the question.

## Pseudocode

```
target   = tier budget (chars)
band     = [0.8·target, 1.2·target]
attempts = []
memory   = established        // the memory being revised
new      = fresh              // thinking to fold in (empty on tighten passes)

if (memory + new) fits in target: return it          // already small enough; never pad

for pass in 1..4:
    base  = len(memory or new)                         // % is of the memory, not memory+new
    pct   = round(target / base * 100)
    guard = ceil((len(memory)+len(new)) / 2) + 512     // silent anti-truncation ceiling
    out   = model(prompt(memory, new, target, pct), max_tokens=guard)
    if out is empty:  break if any attempts else throw  // keep raw block, retry next boundary
    attempts.push(out)
    if len(out) in band:      return out
    if len(out) < band.low:   return previousLongerElseThis(attempts)  // never expand
    memory = out; new = ""                              // too long → tighten the output
return nearestToTarget(attempts)
```

## Scope

- **§1–§4 (done):** `MMemory._compress` now delegates to two pure, exported
  helpers — `compressToFit` (the never-truncating length loop) and
  `buildCompressionPrompt` (the three-shape fold prompt) — plus `nearestToTarget`;
  `_consolidate` passes the established memory and the new thinking separately. The
  policy is unit-tested without a model in
  `architecture/tests/unit/memory-compress.test.js` (inject a fake `generate`); the
  prompt can still be replayed live against the recorded dumps under
  `debug/prompts/.../memory-older|memory-recent`.
- **§5 minimum (done):** `src/mindComponents/recallSources.js` (the shared
  `readKept` pool), read by `mRecall.js` and `mResurface.js` via a `kb` attribute
  (default: the mind's vault home `knowledge/`, matching `m-kb`; `"off"` to disable).
  The pure pieces (`knowledgeItem`, `mergeKept`) and the reader are unit-tested in
  `recall-sources.test.js`; the KB-resurfacing path in the `resurface` wiring test.
- **§5 richer (proposed):** the KB digest into the compressor input. It couples
  `m-memory` to `knowledge/`; land it as a follow-up.

## Non-goals

- Not switching the utility model — it is capable; the defect is the harness.
- Not tracking per-fact "survival counts" — the tier structure (`recent` → `story`)
  is the durability signal; the prompt honors it.
- Not making the compressor responsible for catching brand-new results — that is
  §5's job.

## See also

- [Memory & the vault](memory.md) — consolidation as it works today.
- [Recall — storing and remembering](recall.md) — the read-back path §5 extends.
- [Component reference: `m-memory`](components.md#m-memory) / [`m-kb`](components.md#m-kb).
