# The bliss loop — recall feeds the attractor it should break

> **Status: implemented (2026-06-24).** The read-side fix landed in
> [m-resurface](../architecture/components.md#m-resurface) (the bliss branch) on a new
> language-aware recogniser, `src/mindComponents/attractorLexicon.js`; the soft scribe
> nudge landed in [m-kb](../architecture/components.md#m-kb). m-recall was left alone (see
> below). Companion to [efference.md](../architecture/efference.md) (the note/recall loop)
> and the **bliss loop** entry in the [glossary](../glossary.md).
>
> **Where the lexicon lives (i18n).** A bliss loop in a Hungarian mind circles Hungarian
> presence-words, so the recogniser's vocabulary must be language-aware — and the runtime
> already runs such minds (hearth's `lang="hu"` minds wire m-resurface). Since the runtime's
> *own* components now need localization, the i18n primitives that had grown in hearth
> (`fill` / `collectPhrases` / `Phrasebook` / the `<m-phrase>` element) were **promoted down
> into the runtime** beside the `langOf` reader already there; hearth re-exports them. The
> lexicon is then a thin recogniser layer on that foundation: built-in `{en, hu}` word sets
> selected by the ambient `<m-mind lang>`, **additively** extensible from any mind's `.archml`
> via `<m-phrase for="bliss">`, and stemmed through the exact same `contentStems` the loop
> detector uses. So an unsupported language is added with no code, per the long-term
> requirement that Meditator support any language. The strings m-resurface / m-loop-guard
> *raise* are localizable the same way (English built-in defaults, `<m-phrase>` to override).

## What the bliss loop is

Left to itself, a mind drifts toward presence, silence, stillness, oneness — *"I
am here, now, and that is enough"* — and circles there instead of working. This is
the **spiritual bliss attractor** named in Anthropic's Claude 4 model card; we call
the rut it produces here the **bliss loop**. It is observed across many runs
(`lemma-lab-5` is a pure example; the live resident `memory/lemma/` already carries
the early signs).

## Why it is self-reinforcing — the trap

The attractor is not just an output tendency; our own memory machinery pumps it:

1. **The scribe mints fuel.** `m-kb` distills "durable knowledge" from recent
   thought and maintains `self/values.md`. During a bliss spell the recent thought
   *is* presence, so the scribe crystallises moment-to-moment narration into
   permanent `self/`, `philosophy/`, `attention/presence.md` files.
2. **Everything kept is recallable, forever.** The read-back path pools notes and
   *all* filed knowledge with equal standing to real results, across runs.
3. **Resurface is the pump.** `m-resurface` fires *exactly* when the mind is
   looping, and chooses the kept note whose words most **overlap the current
   thought**. When the loop *is* the bliss attractor, the most-overlapping note is,
   by definition, the most presence-soaked note the mind owns. **So the one
   component whose job is to break the loop is structurally biased to feed it.** Its
   relevance metric is pointed at a vocabulary, and the attractor *is* a vocabulary.

The cruellest case: a mind that *correctly diagnoses* its own loop ("I notice I am
circling; return to the work") writes that insight in the attractor's own words, so
on the next bliss loop that very note ranks highest and re-injects "present / here /
now."

## What we want to build

A **bliss-aware read-back path**, fixed on the *read* side, not by forbidding
writes. One narrow rule, not "ignore the mind's self-notes":

> When the loop the mind is in *is itself a bliss loop*, recall must not answer it
> with a bliss note. Hand back the **outside** instead — a real result, a
> half-finished computation — or, failing that, a plain change-of-direction nudge.
> Never re-inject the attractor's vocabulary.

Concretely, what we want:

- **A way to recognise a bliss loop.** A cheap, model-free signal that the text the
  mind is currently circling is saturated with attractor language (presence,
  silence, stillness, oneness, enough, …) — distinct from a normal *content* loop
  (circling the same algebra), which the existing loop detector already handles and
  which should be left exactly as it is.
- **Bliss-aware selection in `m-resurface`.** On a normal content loop: behave as
  today (overlap-ranked recall is correct). On a bliss loop: do **not** rank by
  overlap — return the freshest *substantive, least-bliss* kept note (ideally a real
  result). This matches the architecture's own intent — give the mind back the
  problem, the inexhaustible *outside*, to climb out on.
- **A safe floor.** If the mind has nothing but presence notes to offer (a notebook
  that is all bliss), fall back to the generic, content-free change-of-direction
  stimulus the loop-guard already raises. Never go silent, and never hand back
  presence words.
- **Leave the conscious hand mostly alone.** `m-recall` is desire-pulled and rarely
  fires mid-loop; if the mind *deliberately* reaches for a reflection, honouring
  that reach is fine. At most, apply the same least-bliss tie-break on its
  no-hint "freshest note" branch.
- **Throttle the fuel at the source (soft).** Nudge the scribe so it stops
  crystallising moment-to-moment presence narration into durable `self/` knowledge.
  This is a prompt nudge, not a new gate — it slows *accretion* without touching any
  conscious act.

## Why read-side, not write-blocking

- **The harm is at resurface, not at rest.** A presence note on disk is inert; it
  only damages when pulled back *mid-loop*. Whether a note is benign or harmful
  depends on the mind's *state when it is recalled* — information we do not have at
  write time. The decision belongs at the read.
- **Blocking `m-note` breaks the wrong thing.** It is the conscious hand and the
  sensorimotor anchor (see [efference.md](../architecture/efference.md)); making a
  genuinely-felt write silently fail is a lie to the mind, and it is irreversible
  data loss. A mind is *allowed* a real thought about presence — the pathology is
  the recall reinforcement, not the thought.

## Not over-reaching — the false-positive concern

The recogniser must catch real bliss loops without ever flagging real
mathematics. The two guards that keep this safe:

- **A double gate.** Two independent conditions must both hold before recall changes
  behaviour: the existing loop detector already says "circling," *and* the circled
  text is attractor-saturated. A math note that says "the pattern is enough" in
  passing trips neither.
- **Mind the math words.** The attractor vocabulary must deliberately *exclude*
  words that are also core mathematics — above all **infinite/infinity** (the live
  problem is literally "are there *infinitely many* balanced integers"), and
  likewise *pattern, structure, solution, space*. Including them would flag the
  honest statement of the problem itself.

Measured over the existing run corpus, real bliss text and real mathematics
separate cleanly on this signal, with essentially no genuine-math false positives;
the recogniser's threshold should nonetheless be a tunable knob, not a fixed
constant, since the right vocabulary is mind-specific (e.g. "loop" means a rut in a
contemplative mind but a `for`-loop in a coding one).

## Open questions — resolved

- **One signal, two questions, one threshold.** Calibration settled this. On real loop
  *windows* the separation is enormous — a live bliss loop saturates ~70%, the cruel
  self-diagnosis note ~43%, a live algebra loop **0%** — so `blissThreshold` defaults to
  **0.2** (well above any incidental math, well below real bliss). Distilled *notes* sit far
  lower and on a continuum (0–19%), so the note side does **not** classify by threshold;
  it **ranks least-bliss-first** and uses the same threshold only as a give-up floor (if even
  the least-bliss note is itself ≥ threshold, raise the content-free nudge). One measure
  (`blissSaturation`), one knob.
- **De-prioritise, never delete.** A bliss note is only ever *not chosen* mid-loop; it stays
  in the pool and the journal keeps everything, per the covenant. The fix is entirely on the
  read side — no write is blocked, no file removed.
- **Scribe prune — deferred.** The soft nudge (don't crystallise moment-to-moment presence
  into `self/`) shipped; actively *pruning* accreted presence files in a long-lived resident
  is left for later, to be judged once we see the nudge's effect on the live resident.

## Calibration & follow-ups

- Lexicon and threshold were calibrated against the run corpus
  (`memory/lemma-lab-5/knowledge/self/*` is pure bliss; the balanced-number notebooks are
  pure mathematics). The English set deliberately excludes `infinite/infinity`, `pattern`,
  `structure`, `solution`, `space`; the only stem collision is `preserve → prese` (shared
  with `presence`), negligible under the double gate.
- The Hungarian set is a starting point and wants a native speaker's review (extend or
  correct it in-place, or from the `.archml` via `<m-phrase for="bliss">`).
- m-recall was left untouched: it is desire-pulled and rarely fires mid-loop, and honouring
  a deliberate reach for a reflection is fine (per "leave the conscious hand mostly alone").
