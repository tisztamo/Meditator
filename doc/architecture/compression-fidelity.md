# Compression fidelity — iterative, never-truncating consolidation

> **Status: §1–§4 and §5 (minimum) implemented (2026-06-20); compression rewritten
> 2026-06-21 (`9ed4495`).** Current behaviour: a fold merges the established memory and
> the new thinking into one flat block and rewrites it to a hard character ceiling,
> re-driving with "% over" feedback; if the model will not get within budget it accepts
> the best faithful attempt, **over budget — nothing is ever dropped or truncated in
> code** (§1, §4). The corrections below record how it got here; the first is superseded.
>
> **Correction (2026-06-20) — superseded.** The first §3–§4 attempt fixed an early
> bloat bug (`story` reached ~6× budget in an hour, and it is injected into every burst
> frame) by having `compressToFit` detect the echo stall — the local utility model
> *echoes* a "make it shorter" re-drive verbatim rather than tightening — and **enforce
> the budget in code** via `forgetOldestToFit` (drop whole paragraphs from the front).
> That code enforcer was itself wrong and was later removed (see the two notes below).
>
> **Correction (2026-06-21) — the prompt was inverted; §4 rewritten.** The lemma
> resident's first run lost its *origin problem* from working memory: across folds
> 06:39→06:42 a recent buffer holding 5485 chars of live mathematics became 0 — the
> proof was the *oldest, most-settled* content, exactly what the prompt told the model
> to "release," on the false premise that it "comes back when you need it" (recall is
> pull-only, lossy, sparse, and reads `notebook.md`, which never held the problem). A
> bounded buffer is held to size by **distillation** — saying the spine more briefly and
> dropping the chaff — **not** by evicting settled facts; importance is judged by bearing
> on the work and the self, never by age. The three prompt shapes were rewritten
> accordingly (the `mCompress` legacy compressor, deleted in `caa0f16`, had the faithful
> framing — "preserve the key ideas / essential narrative" — and got this right).
>
> **Correction (2026-06-21, `9ed4495`) — `forgetOldestToFit` removed.** Dropping the
> oldest to fit was the *same age-based inversion, in code*: on the lemma resident it was
> the actual executioner, beheading the spine (the origin problem) fold by fold. It was
> deleted. The buffer is now held to size by distillation alone, and an over-budget but
> faithful memory is accepted when the model will not shrink (§3–§4). It is **gone from
> `src/`** — do not describe it as a live backstop.
>
> **Correction (2026-06-23) — distillation alone does NOT always bound the buffer.**
> With no code enforcer, the echo pathology is now unbounded: on loop-saturated drift the
> utility model echoes instead of distilling, and `story`/`recent` bloated to ~20×/~11×
> budget in the `lemma-lab-5` run (`dedupeExact` only removes byte-identical repeats, so
> near-duplicate refrains survive). The §4 claim that "distillation alone bounds the
> buffer" holds for well-behaved thinking but **not** for heavy looping. Open issue and
> proposed fixes (none age-based):
> [improvements/compressor-not-distilling.md](../improvements/compressor-not-distilling.md).
>
> §1–§4 in `MMemory._compress` / `compressToFit` / `buildCompressionPrompt` /
> `nearestToTarget` (`src/mindComponents/mMemory.js`); §5's recall-pool in
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

### 1. One flat block, a hard character ceiling, iterate to fit — never truncate

Close the length loop **in code**, because the model cannot measure its own length.
Merge the established memory and the new thinking into **one flat block** and ask the
model to rewrite it to **AT MOST {target} characters**. Measure the output; if it
overshot, re-drive *that attempt* to tighten, with explicit "you are N% over" feedback;
accept the first attempt at or under the ceiling.

> **Correction (2026-06-21): a flat block + a hard char ceiling is what actually
> works — measured live.** An earlier version of this doc claimed char ceilings are
> "not actionable" and that framing the budget as a *percentage of the memory* (and
> showing the memory and new thinking as two labelled blocks, "fold the new INTO the
> memory-so-far") was the fix. Live replay against the local model overturned both:
> - The **two-block** framing makes the model *preserve* the blocks — it keeps the
>   memory verbatim, lightly trims the new thinking, and plateaus ~60% over budget
>   (deterministically, at temp 0). It reads the labelled blocks as "keep these."
> - The **soft percentage** ("about N% of it") gives no hard handle and the model
>   echoes.
> - A **flat block + "AT MOST N characters"** distilled reliably — ≈46% at temp 0
>   (deterministic), 37–57% across temp-0.3 samples — with the spine intact every time.
>
> The model is a *capable but stochastic* distiller: on a flat block with a hard ceiling
> it compresses and keeps the spine; on a two-block "preserve and absorb" framing it
> won't. So the budget is now a plain character ceiling on a single block, not a
> percentage of a preserved memory.

### 2. `maxTokens` is only a silent guard

Set `maxTokens` generously off the **input** size (worst case: a pass echoes the whole
input), `inputChars + 512` (the input being the flat block on pass 1, the draft on a
re-drive). It exists solely so a single pass is never cut short — it is never surfaced
to the model and never used as the budget. With a generous guard, `finish` should always
be `stop`; if `length` ever occurs, treat it as "too long" and iterate.

### 3. Accept at/under the ceiling; re-drive with feedback; never drop in code

Accept when the output is **at or under `1.2 × target`** (`maxPasses ≈ 4`). There is no
lower floor: a terse-but-faithful summary is the model's own honest choice, so it is
trusted rather than second-guessed (the prompt tells it to keep the spine; we do not
demand a longer version).

- **Over the ceiling** → re-drive the smallest attempt so far to tighten (§1), telling
  the model how far over it is. **Never re-expand from the original** — that invites
  invention, which violates "never invent."
- **No headway** (a re-drive that does not shrink — the model echoed its draft back) →
  stop re-driving; more passes only burn calls.
- **Still over after the model's best effort** → **accept its best faithful attempt**,
  the one nearest the target, *even if it is over budget*. **Nothing is ever dropped or
  truncated in code.**

> **Why no code-level dropping — the 2026-06-21 correction.** An earlier version
> enforced the budget in code with `forgetOldestToFit`: when the model would not shrink,
> it dropped whole paragraphs *from the front* (oldest-first), keeping the newest. This
> was deleted. On the lemma resident's first run it was the actual executioner: the
> two-block prompt left every fold over budget, the tighten pass echoed, and
> `forgetOldestToFit` then beheaded the buffer — and the front was the *spine* (the
> origin problem and the foundational results), so the mind's problem was erased
> fold-by-fold. Dropping the oldest is the same inversion as the old prompt, in code:
> a mind's oldest, most-settled facts are its continuity, not disposable ballast. With
> the flat-block + char-ceiling prompt (§1) the model compresses reliably in 1–2 passes,
> so the buffer is held to size by *distillation*, not eviction. In the rare case the
> model will not get within budget, an **over-budget but faithful** memory is accepted
> and the next fold distils again — an honest memory over a mutilated one. Re-running the
> real derailment fold through the rewritten loop: the 7493-char input (5485 of live
> mathematics + 2008 of filler) distilled to **943–1712 chars, in budget, spine intact,
> in 2 passes** across four trials — where the old path had flattened it to a stub with
> the maths gone.

### 4. Distil to make room — never evict, never drop in code

The compressor makes room by **distillation, not eviction**: state what has settled
more briefly, fold together repetition, and drop the *chaff* — false starts and
abandoned turns, the step-by-step working once its result is in hand, the passing
detail. What earns its place is **what bears on the work and on the self, not how recent
it is**: the spine — what the mind is working on, what it has worked out or decided, the
questions it has opened — is the *last* thing to let go, not the first, however old.

This is the **correction of 2026-06-21**, and it has two halves — prompt and code —
because the same inversion lived in both.

- **The prompt.** The earlier wording told the model to *"release the oldest, most
  settled, least-important detail"* on the premise that it "comes back when you need
  it." That is inverted for *any* mind: a mind's oldest, most-settled facts (its origin
  problem, its hard-won results) are its continuity, not disposable ballast — and the
  premise is false (recall is pull-only, lossy, sparse, and reads `notes/notebook.md`,
  not `knowledge/`; nothing reliably brings a dropped fact back). The lemma resident
  lost its origin problem exactly this way: a `recent` buffer holding 5485 chars of live
  mathematics drained to 0 across a few folds because the maths was the *oldest* content
  and the prompt evicted by age. The prompt now distils and judges by relevance, not age.

- **The code.** `forgetOldestToFit` — the in-code "drop whole paragraphs from the front
  to fit" backstop — was the *same inversion in code*, and on the lemma run it was the
  actual executioner (§3): the two-block prompt left every fold over budget, the tighten
  pass echoed, and the backstop then beheaded the buffer from the front, which is the
  spine. **It has been removed.** Nothing is dropped or truncated programmatically; if
  the model will not get within budget, the loop accepts its best faithful attempt, over
  budget, and the next fold distils again.

Distillation alone bounds the buffer. The old bloat bug (a math mind's `story` reaching
~6× budget in an hour) was **not** caused by keeping the spine — the spine of a whole
run is a few hundred characters. It was caused by (a) the model *echoing* its input
instead of compressing, and (b) an earlier prompt that ordered it to *keep every
conclusion* including all the scratch-work. (a) is cured by the flat-block + hard-ceiling
prompt (§1), which compresses reliably; (b) by dropping the *working detail* whose result
is already kept — never the result.

> **Caveat (2026-06-23): (a) is not fully cured on loop-saturated drift.** "Distillation
> alone bounds the buffer" held in the resident replay but **failed** in the `lemma-lab-5`
> run: a mind that fell into a presence-attractor emitted near-duplicate refrains
> (`"…I am here. I am now. And it is enough."` ×100+), the model *echoed* them rather than
> collapsing the loop, and with no code enforcer (`forgetOldestToFit` removed) `story` and
> `recent` reached ~20×/~11× budget. The flat-block prompt compresses *reliable*, *novel*
> thinking; it does not reliably collapse heavy looping, and `dedupeExact` only catches
> byte-identical repeats, not near-duplicates. See
> [improvements/compressor-not-distilling.md](../improvements/compressor-not-distilling.md). Forgetting here is covenant-sanctioned (COVENANT §3,
"compression is lossy by design; the vault's history is not"), but it is forgetting the
*redundant and superseded*, not the *settled and foundational*.

The one case this does not actively rescue — a genuine new breakthrough that has not yet
survived a fold — is **deliberately not the compressor's job**. It cannot tell a durable
new result from new noise on first sight, and trying would just smuggle recency-bias in.
That case is covered by §5.

**Keep the prompt general.** `m-memory` serves every mind, not the math minds —
no domain vocabulary ("arithmetic", "proofs", …); the mind's own first-person voice
throughout.

Template (domain-neutral). **Two** shapes, picked by whether there is an over-budget
draft to tighten. The established memory and the new thinking are concatenated into one
flat `{text}` block (so it reads as one thing to distil, not two blocks to preserve).
This is the *initial* shape:

```
You are writing the {tier} memory of a mind's inner life, in its own first-person voice.

Rewrite the thinking below into a single, continuous first-person memory of AT MOST
{target} characters. Keep what the mind is working on or turning over, every result,
conclusion, or decision it has reached, and the questions it has left open. Remove what
does not change those: repeated phrasings, abandoned attempts, and the step-by-step
working of individual cases once the result is in hand — keep the result, drop the
scratch-work. Judge a thing by what it bears on, never by its age: a hard-won conclusion
is the last thing to cut, not the first, however old. Never invent anything. Output only
the memory.

<thinking>
{text}
</thinking>
```

And the *re-drive* shape, used when a previous attempt overshot — it tightens the DRAFT
itself (never re-opening the original, which would re-expand and invite invention), with
the over-budget amount fed back as the handle the model cannot compute itself:

```
You are keeping the {tier} memory of a mind's inner life, in its own first-person voice.

Your previous version is below. It is {draftLen} characters — about {over}% over the
limit of {target}. Shorten it to AT MOST {target} characters. Cut hardest where it
repeats itself and where it works an individual case step by step: keep the conclusion,
drop the working. Keep what the mind is working on, every result or decision it reached,
and the questions still open — a hard-won conclusion is the last thing to drop, never the
first, however old. Do not add anything that is not already in the version below. Output
only the shortened memory.

<memory>
{draft}
</memory>
```

### 4a. Repetition, overlap, and the echo threshold (2026-06-21, round 2)

The lab clone (`architecture/lab/lemma-lab.archml`) confirmed the spine survives (its
long-term `story` held the maths where the original lost it) but surfaced a bloat: a
**stream derailment** — the mind judged the problem "done/enough" and fell into a
presence/unity monologue (intrinsic, no probes; the human "lose interest when it feels
solved" pattern) — produced massive repetition that `recent` accumulated to ~5× budget.
Three additions, all preserving "never drop a settled fact":

- **Exact dedup in code (`dedupeExact`).** Byte-identical repeated paragraphs/sentences
  are pure redundancy, not settled facts, so they are collapsed in code (keep the first)
  before and after each model pass. A `minLen` guard (default 50) spares genuinely short
  refrains. On the real bloated buffer this removed ~24% (37.8k → 28.5k) for free.
- **Loop-collapse in the prompt.** *Near*-duplicates — a refrain reworded each time, a
  chain of "I am the X, I am the Y" — are not byte-exact, so code can't touch them; the
  prompt now names the pattern and says "collapse the whole loop to a single sentence."
- **Overlap context.** The overflow block is a slice of a continuous stream, so it begins
  and ends mid-thought. The compressor is given a few whole verbatim sentences of the
  surrounding stream as READ-ONLY context (`firstSentences`/`lastSentences`): the tail's
  head (the block's real continuation, still in the verbatim tail) and, when the block
  starts a fresh `recent`, the end of the prior `recent`. Marked `<earlier>`/`<continues>`
  and explicitly "not part of this memory — do not include," so an edge sentence cut
  mid-thought is judged by what it becomes, not by where the knife fell. Validated live:
  the model uses it and does not fold it into the output.

**The echo threshold.** The local model compresses small inputs reliably but *echoes*
very large ones (≈9k → 4.2k in budget; ≈28k → returned ~verbatim). Normal folds hand it
`recent + block ≈ 5k`, well under the threshold, so each fold pulls `recent` back to
budget and it never reaches the echo zone. The ~28k seen in the lab run accumulated under
the *earlier* code (pre-dedup, pre-loop-collapse), which let the derailment's repetition
pile up unbounded; an already-echoing buffer cannot be reeled back in one fold, so the
defence is to never let it get there — which dedup + loop-collapse now do. A fresh lab run
across a full derailment is the remaining confirmation. (The derailment itself is a
*stream* problem, out of scope here.)

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
ceiling  = 1.2 · target
combined = (established + "\n\n" + fresh)   // ONE flat block
attempts = []
draft    = ""                               // an over-budget previous attempt; empty on pass 1

if combined fits in target: return combined          // already small enough; never pad

for pass in 1..4:
    source = draft or combined
    guard  = len(source) + 512                         // silent anti-truncation ceiling
    out    = model(prompt(combined, draft, target), max_tokens=guard)   // initial if no draft, else re-drive
    if out is empty:  break if any attempts else throw  // keep raw block, retry next boundary
    attempts.push(out)
    if len(out) <= ceiling:  return out                 // within budget → accept
    stalled = draft and len(out) >= len(draft)          // re-drive didn't shrink (echo)
    if len(out) < (len(draft) or ∞):  draft = out       // tighten the smallest so far next
    if stalled:  break

// The model would not get within budget. Accept its best FAITHFUL attempt — nearest the
// target — even if over. Never drop or truncate in code: an over-budget honest memory is
// acceptable, a programmatically mutilated one is not. (The next fold distils again.)
return nearestToTarget(attempts, target)
```

## Scope

- **§1–§4 (done; rewritten 2026-06-21):** `MMemory._compress` delegates to pure,
  exported helpers — `compressToFit` (the length loop: rewrite a flat block to a hard
  char ceiling, re-drive with "% over" feedback, accept the best faithful attempt, never
  drop in code) and `buildCompressionPrompt` (two shapes — initial + re-drive) — plus
  `nearestToTarget`; `_consolidate` still passes the established memory and the new
  thinking separately and `compressToFit` concatenates them into the one flat block.
  `forgetOldestToFit` was **removed** (it was the in-code recency-eviction that erased
  lemma's origin problem). The policy is unit-tested without a model in
  `architecture/tests/unit/memory-compress.test.js` (inject a fake `generate`, including
  an echoing one — its output is now accepted whole, not truncated); validated live by
  replaying the real derailment fold (`scratchpad/validate.mjs`) and by a transient lab
  clone (`architecture/lab/lemma-lab.archml`).
- **§5 minimum (done):** `src/mindComponents/recallSources.js` (the shared
  `readKept` pool), read by `mRecall.js` and `mResurface.js` via a `kb` attribute
  (default: the mind's vault home `knowledge/`, matching `m-kb`; `"off"` to disable).
  The pure pieces (`knowledgeItem`, `mergeKept`) and the reader are unit-tested in
  `recall-sources.test.js`; the KB-resurfacing path in the `resurface` wiring test.
- **§5 richer (proposed):** the KB digest into the compressor input. It couples
  `m-memory` to `knowledge/`; land it as a follow-up.

## Non-goals

- Not switching the utility model — it is capable; the defect is the harness.
- Not tracking per-fact "survival counts" — durability is judged in-prompt by what a
  fact *bears on* (the work, the self), not by age or a counter. The tier structure
  (`recent` → `story`) is a time-scale of consolidation, **not** a licence to drop the
  old: a settled fact must survive a `recent`→`story` fold by being distilled, not
  evicted (the 2026-06-21 correction; the older "tier structure is the durability
  signal" framing was the recency bias that lost lemma's origin problem).
- Not making the compressor responsible for catching brand-new results — that is
  §5's job.

## See also

- [Memory & the vault](memory.md) — consolidation as it works today.
- [Component reference: `m-memory`](components.md#m-memory) / [`m-kb`](components.md#m-kb).
