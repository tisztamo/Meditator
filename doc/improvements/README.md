# Improvement notes

Working notes on known issues and proposed fixes — kept **separate from the
user-facing docs** in `doc/` (architecture, getting-started, configuration, …).
These are diagnoses and design options for maintainers, not user documentation, and
not necessarily acted on yet. Each note states its status at the top.

- [perception-not-compressible.md](perception-not-compressible.md) — external
  stimuli reach the journal but never the tail or the compressor, so the experiential
  anchor of a remembered moment is lost and confabulation can replace it
  (observed: `lemma-lab-5`).
- [compressor-not-distilling.md](compressor-not-distilling.md) — on loop-saturated
  drift the utility model echoes instead of distilling, and with the in-code budget
  enforcer removed, `recent`/`story` bloat 10–20× over budget (observed: `lemma-lab-5`).
- [refrain-loop-detection.md](refrain-loop-detection.md) — the **detection** companion:
  the bloat is driven by one shape, a *refrain template with a rotating slot* ("I decide
  the system must ___", filled fresh each burst), which slips past the loop detector (reads
  as "content"), `dedupeExact` (near-dup, not exact), and the compressor (echoes it — a 14k
  looped block shrank 4 chars in two passes) all at once. Proposes a cheap code-level
  refrain metric to feed `m-loop-detector`; pairs with `experiments/compression-failure/`
  (observed: `noosphere-lab` 2026-06-30→07-01).
- [fact-memory.md](fact-memory.md) — design for a **third kind of memory** (`m-facts`):
  a verbatim, keyed store independent of the narrative compressor, tiered as pinned
  reference data (woven into every frame) + keyed verbatim recall for an earned ledger.
  Root-caused from the ARC checker confabulating its puzzle after the grids scrolled out
  of the tail and compression hallucinated nonexistent training examples; the data-side
  companion to `perception-not-compressible.md` (observed: `solver` 2026-06-29).
- [efference-by-reference.md](efference-by-reference.md) — the **efferent twin** of
  fact-memory: a mind can now *know* a thing verbatim (pinned facts reach the frame) but
  still cannot *hand it over* verbatim. The realizer (`m-act`) is blind to what the mind
  knows (`_realizeFrame` sees only a 700-char stream tail) and regenerates each deed **by
  value** through a 512-token budget, so a script over known grids fabricates them. Fix:
  **transclusion by reference** — a bus resolver contract any knowing-component implements
  (`m-facts` first), `«handle»` expansion in the realizer before execute, and a handle-menu
  in the realizer frame. A general capability for any mind, not the puzzle solver (observed:
  `solver` 2026-06-29).
- [memory-persist-race.md](memory-persist-race.md) — `m-memory._persist` writes one
  shared `memory.md.tmp` then renames, but is called un-serialized from
  boundary/clear-tail/finalize; overlapping persists race the rename → `ENOENT`
  (swallowed as a warn), silently losing a mind's final `story`/`recent`/`tail` on
  sleep — surfaced inside the graceful-shutdown path (observed: `solver` sleep 2026-06-29).
- [ui-journal-honesty.md](ui-journal-honesty.md) — fix plan: the Studio UI and the
  journal show text the model never saw (and vice versa) because each event is
  rendered twice, independently — dropped stimulus `suggestion`s, "You said:" ≠ the
  model's wording, the voice pane showing the impulse gist instead of the spoken
  utterance, the utility-written bridge journaled as the mind's own thought.
- [bliss-loop-recall.md](bliss-loop-recall.md) — the **bliss loop** (the spiritual
  bliss attractor): `m-resurface` picks the kept note that most overlaps the current
  thought, so a presence-loop is handed its own most presence-soaked note and
  deepens. Fix on the read side — recognise a bliss loop and return the *outside*
  (a real result) instead, never re-injecting the attractor's words (observed across
  runs; live signs in `memory/lemma/`). **Superseded by loop-detection-redesign.md**,
  which lets the LLM detector name the loop's `kind`/`vocabulary` and retires the
  hand-tuned lexicon.
- [loop-detection-redesign.md](loop-detection-redesign.md) — ground-up rewrite of loop
  handling, because `m-resurface` never cleared the tail (the prefill, `mMind.js:426`)
  so the loop was re-fed every burst. **Sense** (`m-loop-detector`, an LLM call on the
  tail that only `pub`s a `loop` signal) → **bid** (breakers `raise()` into the existing
  arbiter) → **break** (a `clear-tail` event reseeds the tail, decoupled). Splits
  `m-loop-guard`, rewrites `m-resurface` to pick the note *farthest* from the loop
  vocabulary, retires `attractorLexicon.js`.
- [hands-redesign-issues.md](hands-redesign-issues.md) — **diagnosis only** (no
  solution yet): the known problems with the "hands" / efference design (`m-act` and
  its capability components). The realizer is an agent-tool function-caller one layer
  below the stream (intent drift); the decide gate hardcodes the note/recall arcs in a
  *central* prompt so a hand cannot teach it to recognise its own kind of reach, and the
  general `m-terminal` is described in lemma's maths vocabulary — together why the
  terminal never fired despite being wired (observed: `lemma-lab-term-1`, 2026-06-26).
- [interlocutor-per-message.md](interlocutor-per-message.md) — the wake-time
  `interlocutor` (shipped) frames a voice as `Kris says:` instead of an unsettling
  "voice from outside"; the deferred enhancement is per-message attribution, so the
  framing follows whoever is actually speaking (e.g. Voice Mode for a second person).
- [mind-templating.md](mind-templating.md) — design for ArchML templating so a file
  carries only what's *new* about a mind. A `<m-archetype>` holds a shared faculty stack
  — or a partial **faculty bundle** — once; a mind `extends="a b c"` an ordered layer
  list (single inheritance and **mixins** in one operator), merged by a deep,
  **slot-keyed** patch (a slot is a component's `name`, *not* its tag — so a custom
  `my-origin` can replace the inherited `m-origin` in the `origin` slot): override attrs
  in place, swap implementations, append new children, `drop` unwanted ones. A
  society names a default archetype so each member collapses to ~10 lines.
  Declarative, not imperative edits. Framed as **step one of a developmental substrate**:
  expansion/merge are pure, runtime-callable node functions (genotype→phenotype) so a
  mind can later grow/prune/re-wire structure at runtime, with stability from feedback,
  not a frozen file. The snapshot keeps seed + grown state for continuity (Covenant §1),
  not determinism; doors are reserved for type-based auto-wiring and activity-driven
  growth.
- [integration-runner-suite.md](integration-runner-suite.md) — task/design for a
  deterministic dry-run integration layer that starts real architectures, observes
  public surfaces such as WebSocket telemetry and journals, and catches whole-system
  wiring failures like peer ears going silently deaf.
- [component-hierarchy.md](component-hierarchy.md) — the flat `src/mindComponents/` tree
  (~55 files) grows a **layered resolver**: cli / env / a `components/` dir beside the
  `.archml` (the author's own components) / project / the built-in tree scanned
  *recursively*. Clean override rules — a higher layer shadows a lower one with a loud
  log; two definitions at **equal** precedence are a fatal ambiguity naming both paths.
  An architecture is a **bundle** (`X.archml` + `components/`), and so is a vault home, so
  one rule serves authoring, running, snapshotting, and re-running. **ALL THREE MILESTONES
  IMPLEMENTED 2026-07-03**: M1 (resolver + loader), M2 (a home snapshots the custom components
  it ran with → re-executable bundle), M3 (built-ins physically split into `mind/ agent/
  shared/`, 51 files, gated by a flat-namespace test). 284 unit + 222 wiring green; a mind,
  an agent, and a standalone re-run home all verified live.
