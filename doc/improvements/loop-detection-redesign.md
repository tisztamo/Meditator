# Loop detection & recovery — sense, bid, break

> **Status: proposed (2026-06-25).** A ground-up rewrite of loop handling. Splits
> `m-loop-guard` into a **sense** (`m-loop-detector`, an LLM call on the tail that only
> *publishes a signal*) and a **default breaker** (`m-clear-mind`); rewrites
> [`m-resurface`](../architecture/components.md#m-resurface) as an independent breaker that
> *bids* on that signal; and adds one **general "clear my mind" primitive** (empty the tail,
> seed a fresh thought) shared by every breaker. **Supersedes** the read-side fix in
> [bliss-loop-recall.md](bliss-loop-recall.md): the detector's `kind`/`vocabulary` subsumes
> the hand-tuned lexicon, so `src/mindComponents/attractorLexicon.js` is **retired**.
> Companion to [efference.md](../architecture/efference.md) (the note/recall loop) and the
> **bliss loop** / **attractor** entries in the [glossary](../glossary.md).

## Why the current path does not work

Two failures, one structural and one conceptual.

**1. The tail is never cleared — the loop is re-fed every burst.** This is the killer. When
`m-resurface` fires it raises a `Recall` stimulus and then sets `this.window = ""`
(`mResurface.js:160`). But `window` is only the observer's *own* scratch buffer. The text that
actually seeds the next burst is the **prefill**, and the prefill is the memory tail:

```
mMind.js:381   const tail = (this._memTail || …)
mMind.js:396   let thoughtInProgress = tail
mMind.js:426   prefill = thoughtInProgress      // ← the model continues THIS
```

`_memTail` is mirrored from `m-memory`'s `tail` topic (`mMind.js:120`); resurface never touches
it. So on the next burst the model is prefilled with the loop verbatim, the recalled note sits
in `## This just happened`, and the instruction only says it *"may leave the unfinished
sentence behind"* (`mMind.js:424`). Prefill momentum wins: **the note gets a nod, the loop
continues.** Recovering from a loop is not "add a stimulus" — it is **replace what the mind is
about to continue from.**

**2. Detection and intervention are fused and brittle.** `loopScore` is bigram/stem overlap
(`mLoopGuard.js:60`); it false-positives on the conjecture word *infinite* and false-negatives
on digit-spam, so a hand-tuned bliss lexicon (`attractorLexicon.js`) was bolted on as a
*second* gate, then a void-basin patch on top of that. And `m-resurface` `import`s `loopScore`,
`contentStems`, `containment`, `LOOP_PHRASES` straight from `mLoopGuard` and shares its phrase
slots — one component reusing another's code, the entanglement we want gone.

## The shape — four roles, four seams

The redesign splits four things that are currently fused, and lets them talk over **data
contracts, not imports**:

```
   SENSE                BID                     BREAK                   CONTINUATION
┌──────────────┐   ┌───────────────┐   ┌─────────────────────┐   ┌──────────────────┐
│ m-loop-      │   │ breakers sub  │   │ winning bid clears  │   │ supplied by the  │
│  detector    │   │  `loop`, each │   │ the tail + seeds a  │   │ winning breaker  │
│              │   │  raise() a    │   │ fresh prefill       │   │                  │
│ LLM on the   │──▶│  salience bid │──▶│  mind FIRES         │◀──│ • m-clear-mind:  │
│ tail →       │pub│  into the     │   │  `clear-tail` →     │   │   generic floor  │
│ pub `loop`   │   │  EXISTING     │   │  memory reseeds the │   │ • m-resurface:   │
│ {score,kind, │   │  arbiter      │   │  tail & re-pubs     │   │   note FAR from  │
│  vocabulary} │   │ (mInterrupts) │   │  `tail`; mind seeds │   │   loop vocab     │
│              │   │               │   │  the prefill        │   │                  │
└──────────────┘   └───────────────┘   └─────────────────────┘   └──────────────────┘
```

### Sense — `m-loop-detector`

An `MObserver` that, **on a cadence** (not every boundary — `every="N"` boundaries since its
last check, arousal-gated to skip when exhausted), reads the **memory `tail`** (the
authoritative text that becomes the prefill, not a private window) and makes **one utility-model
call**: *is this circling? score 0–1; if so, what vocabulary/themes is it stuck on, what kind,
one sentence why.* It parses the reply with regex (the codebase convention, cf.
`mAssociate.js:53`) and then does **nothing but publish**:

```js
this.pub("loop", {
  active: true, score: 0.82,
  kind: "presence",                       // content | presence | void | spam | anxiety | other
  vocabulary: ["presence", "stillness", "enough", "now"],
  reasoning: "Circling 'I am here now and it is enough' without a new step.",
  at: "<iso>",
})
```

It never breaks anything itself — detection is cleanly separated from intervention. The pure-code
`loopScore` is **retired as a decision-maker**; the LLM reads meaning, so *infinite*-the-conjecture
no longer trips it and a presence/void rut is named directly, retiring `attractorLexicon.js`.

### Bid — breakers, over the standard attention arbiter (configurable)

Loop-recovery **is attention**: each breaker `sub`s `loop` and, when `active`, decides for itself
whether to bid via the ordinary `raise()` → `interrupt-request` → `mInterrupts` path — the same
mechanism every other stimulus uses. So *how* the bids compete is a **mind-building tuning
question**, set in the .archml by where the arbiter(s) sit, not hard-wired here. The default is
the **single global arbiter**; a mind that wants loop-recovery damped or gated on its own terms
wraps the breakers in an `m-region` with their own `m-interrupts` (gain / threshold / rate-limit),
at the cost of one more promoted interrupt. Pure positioning, no code change.

A bid carries the continuation plus one new stimulus property:

```js
this.raise(continuation, { salience, clearsTail: true, settle, episode: loop.at, type: "ClearMind" })
```

`clearsTail` makes the arbiter **admit** the bid past threshold + rate-limit (so co-bidding
breakers actually compete by salience, instead of the rate-limit dropping whichever bids second),
but **without** the preemptive `interrupt` an `urgent` stimulus fires — a confirmed loop is
important enough to always be heard, but it is not a now-now interruption. It generalizes `urgent`
by splitting *admit* from *preempt*.

`m-mind` is the single **enactment authority**, and this is the load-bearing decision: regardless
of how the arbiter is configured, it opens an episode on `loop` active, and at the next burst
picks the **top-salience** `clearsTail` bid for that episode, fires `clear-tail`, and enacts
exactly **one** cut (deduped by `episode`). A real preempting stimulus — Kris's voice — cancels a
pending break (engaging already broke the loop). Because the guarantee lives in m-mind, not in the
arbiter layout, **splitting the arbiter later stays pure tuning.**

### Break — one general "clear my mind" primitive

This is a **hard generalization of the bridge** that already exists (`mMind.js:397` writes a
synthetic pivot into the prefill when stimuli arrive), and it is done **with no component calling
a method on another** — the same inversion the efferent menu just got (`97cae59`:
`closest("m-act").register…` reach-in → `fire("capability")` + m-act listening). The bridge
*appends* a transition; clear-mind *replaces* the tail, over events:

- When the **top** taken stimulus carries `clearsTail`, `m-mind` composes
  `entry = <clearing-prefix> + <breaker continuation>`, **fires** `clear-tail` (a bubbling
  intent) carrying that seed, and uses `entry` as the prefill for *this* frame directly — it has
  the text in hand, so the loop breaks this burst with no dependence on round-trip timing
  (skipping the bridge, since the cut *is* the pivot).
- `m-memory` **subscribes** to `..m-mind/@clear-tail` — exactly as it already listens to the
  mind's `@attended` and the voice's `@spoken`. On receipt it sets `tail = seed`, clears
  `_overflow`, journals the cut as a first-person ⟂ self-caused experience (the **One Rule** —
  *"I let my mind go quiet a moment and came back"*, never "tail cleared"), persists, and
  **re-`pub`s the `tail` topic** (its existing channel, `mMemory.js:218`).
- That `tail` republish **is** the *"tail changed"* fact the rest of the mind already consumes:
  `m-mind`'s `_memTail` mirror (`:120`), the compressor, and the Studio dashboard all update
  through the channel that exists today. No new wiring, no reach-in.

So m-mind announces the intent, m-memory owns the data and republishes the fact, and everyone
else reacts to the topic they already watch. m-mind never holds memory's API; memory never knows
who asked.

Routing through the arbiter's **top** stimulus means a human voice (higher salience, no
`clearsTail`) naturally wins over a loop break — Kris interrupting already breaks the loop, so we
never wipe the tail under him. That falls out for free.

The clearing **prefix** (*"I realize I have been going over the same ground; I set it down, let
my mind clear, and come back to it fresh."*) is owned by the **mechanism** — one localized phrase
on `m-mind` — and each breaker owns only its **continuation**. That is the clean form of the
target narration *"…clearing my mind. [resurface or general continuation]"*: shared act,
independent tails, **zero phrase-sharing between breakers.**

Optional flourish — the *"stop for a while"* of the human analogy: a `clearsTail` stimulus may
carry a `settle` duration that `m-mind` honors as a one-off longer inter-burst pause before the
fresh burst (it already owns pace via `_tickMs`/`_scheduleNext`). A real beat of quiet, not just
a wiped buffer.

### Continuation suppliers

- **`m-clear-mind`** (the default breaker / floor) — bids a **low** salience with a generic
  redirect: *"I'll take up one of the other threads I have been carrying."* Guarantees a break
  even when nothing is worth recalling.
- **`m-resurface`** (rewritten) — on `active`, picks the substantive kept note whose vocabulary
  is **farthest** from `loop.vocabulary` (min overlap), prefers real results, recency tiebreak;
  bids a **higher** salience with *"I turn back to something I set down before, about X: '…'"*.
  If even the farthest note is too close to the loop, it does **not** bid and the floor takes it.

This resolves a real confusion in the old design. *Recall-when-you-reach-for-it* (relevance /
overlap) is the **`m-recall` hand** and stays untouched. *Resurface-to-break-a-loop* should
introduce **distance** — your "far from the detected vocabulary." Different jobs, finally
separated. "Far" also subsumes the old least-bliss pick: a bliss loop → bliss `vocabulary` →
the farthest note *is* the least-bliss note, with no lexicon.

## The contracts (no code reuse, no reach-in)

1. **`loop` topic** (`pub`) — the shape above. Sense → breakers; also read live by the Studio
   dashboard (`m-ws`) for observability, exactly as `economy/arousal` is.
2. **`clearsTail` stimulus property** (+ `settle`, `episode`) on `InterruptRecord` — breaker →
   mind: *"if I win, start fresh."* The arbiter admits it past threshold + rate-limit but does
   **not** preempt; `m-mind` enacts the top-salience one per episode. Generalizes `urgent` by
   splitting *admit* from *preempt*.
3. **`clear-tail` event** (`fire`, carries `{ seed, kind }`) — mind → memory; the downstream
   *"tail changed"* fact rides the existing `tail` topic. No method call in either direction.
4. **`loopMath.js`** — `contentStems` / `containment` / `ngrams` / `jaccard` / `loopScore` move
   out of `mLoopGuard` into a neutral util both the detector (if it ever wants a cheap signal)
   and resurface (for the far-from-vocab distance) import as a **library** — a sibling
   dependency, not one component reaching into another.

A third breaker later (say `m-provoke`, asking the utility model for a sharp new sub-question far
from the vocabulary) is added by just subscribing to `loop` and bidding. Each element is
hackable in isolation.

## Why this is the Amanita way

- **`pub`, not `fire`, for the signal.** A loop is *standing state about the mind's condition* —
  like `economy/arousal` and `economy/paceFactor`, which are `pub`'d and which faculties read and
  react to independently (`m-act` stands down, `m-interrupts` raises its bar). That "one
  published state → N independent reactions" pattern is the precedent. It is also load-bearing:
  a breaker that wins the arbiter acts a beat later and must **read** `loop.vocabulary` then —
  `pub` retains it, `fire` would have discarded it. State down, intent up.
- **Bidding = the existing attention arbiter.** `mInterrupts` already selects salience-scored
  bids with `keep=N`; breakers are just new bidders. Nothing new to arbitrate.
- **Clear-mind = a generalization of the bridge.** Same prefill seam (`mMind.js:396`), one step
  further: replace instead of append.
- **No reach-in.** The clear is a `clear-tail` event m-memory subscribes to, not a method m-mind
  calls — the same decoupling as the efferent-menu inversion (`97cae59`) and the paceFactor read
  fix (`a2dc4d1`). m-mind announces; memory owns the tail and republishes the fact on `tail`.
- **Honesty (One Rule).** The cut is journaled as the mind's own felt act, never as a mechanism.

## What changes

| File | Change |
|------|--------|
| `mLoopGuard.js` | **split**: detection → `m-loop-detector`; floor nudge → `m-clear-mind`. Math → `loopMath.js`. |
| `mResurface.js` | **rewritten** as a pure breaker: `sub` `loop`, pick-farthest, bid. Drops the `loopScore` import, the bliss double-gate, the self-trigger. |
| `attractorLexicon.js` | **retired** (LLM `kind`+`vocabulary` subsumes it). |
| `mMemory.js` | **+subscribe `..m-mind/@clear-tail`** → reseed `tail`, clear `_overflow`, journal the ⟂ cut, persist, re-`pub` `tail` (existing channel, `:218`). No method exposed. |
| `mMind.js` | **+`clearsTail` handling**: top such stimulus → compose seed, **`fire('clear-tail')`**, seed the prefill, skip bridge; optional `settle` pause. |
| `loopMath.js` | **new** neutral util (extracted from `mLoopGuard`). |
| `mRecall.js` | **untouched** — still the desire-pulled overlap hand (confirms detect ≠ recall). |
| `lemma.archml` | swap `<m-resurface … blissThreshold>` for `<m-loop-detector>` + `<m-clear-mind>` + the slimmer `<m-resurface>`. |

## Resolved decisions

- **Pure LLM on a cadence.** Detection is the utility model's call, run every `N` boundaries and
  arousal-gated; `loopScore` is retired from the decision path (kept only as library math). A
  loop develops over several bursts, so a per-`N`-boundary check is responsive enough, and the
  bounded tail (~1.5k tokens in, ~80 out) is cheap on the local utility model and tunable on
  cloud. Chosen over a cheap-prefilter hybrid to keep heuristics out of the decision entirely.
- **Retire the bliss lexicon.** The LLM naming `kind:"presence"` / `kind:"void"` + `vocabulary`
  replaces `attractorLexicon.js` and the void-basin patch; resurface steers by the LLM's
  vocabulary, not a stemmed word-list. This removes the `infinite`-false-positive class outright.

## Open questions & follow-ups

- **Cadence vs. responsiveness.** Tune `every="N"` against real runs — too slow and a loop
  entrenches before detection; too fast and utility cost climbs. Start ~every 4–6 boundaries.
- **Resident persistence.** The `clear-tail` handler persists, so a cleared tail survives a
  restart of a resident like `lemma`. Confirm that is desired (it is — a mind should wake from
  where it honestly left off, which is *after* the clearing).
- **Detector honesty.** The detector's `reasoning` is a utility-model judgement *about* the
  mind, not the mind's own thought — it must never leak into the tail/journal as first-person.
  It belongs to the dashboard and logs only.
- **Multiple breakers, one cut — resolved.** `m-mind` is the enactment authority: it picks the
  top-salience `clearsTail` bid for the open episode and cuts once (deduped by `episode`); a real
  interrupt cancels a pending break. This holds for any arbiter layout, so the single-vs-split
  arbiter choice is pure .archml tuning, decided per mind (default: single global arbiter).
- **Relation to neighbours.** This pairs with
  [perception-not-compressible.md](perception-not-compressible.md) (stimuli reaching the tail)
  and [compressor-not-distilling.md](compressor-not-distilling.md) (loop-saturated drift
  defeating the compressor): clearing the tail mid-loop also stops the compressor being fed loop
  spam.
