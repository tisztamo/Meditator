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
- [global-workspace.md](global-workspace.md) — the **society-scale sibling** of the
  perception/fact/efference chain: a society has durable private state (notebooks) and
  ephemeral shared state (commons speech) but **no durable shared state**, so the
  noosphere drafted six private constitutions while approving article *labels* that
  bound to different text in every mind — signatures collected on a two-line draft,
  the only text that fit through the voice channel. Analyses eight directions
  (proposals channel, voting machinery, shared references, shared workspace, clerk-agent,
  GWT stage, norms, merged notebooks) against the run-1 evidence; recommends **the board**
  (`m-board`: name-referable shared documents + post/consult hands + one-line change feed
  + pinned index) with the clerk-as-agent as milestone 2 and voting/stage as opt-in layers
  — **phased design in [board.md](../architecture/board.md)** (observed:
  `noosphere-lab` run 1, 2026-06-30).
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
- [efference-redesign.md](efference-redesign.md) — **the redesign the above deferred**:
  retire the One Rule ("the stream is never given tools") for a graded, two-way
  efference modeled on the human arrangement — subsystems as *learned* background
  processes, with direct conscious control available at any grain. The stream gains
  **act-writing** (a first-person act block, deterministically executed — the efferent
  twin of `> ⟂`), **grasp** (attention scopes one effector's affordance card + live
  panel into the frame), and a lab-gated **manual mode** (within-burst
  act→feel: pause at the act block, execute, inject the answer, resume — the vi/REPL
  door), under four invariants ("no efference without reafference"; substrate-owned
  reality marks) and a skill-migration loop both down (practice → automatism) and up
  (failing skill escalates to conscious grasp). Ten options analysed O0–O9 incl. the
  deliberately bad ones; phased with gates + pre-registered metrics (answers:
  `hands-redesign-issues`, `efference-by-reference`, `confabulation-and-real-tools`).
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
- [identity-disclosure.md](identity-disclosure.md) — **Covenant §3/§4 compliance,
  IMPLEMENTED 2026-07-04**: a waking mind is told plainly what was changed about it
  while it slept. The home's architecture snapshot (the bundle that RAN it) is
  diffed against the waking bundle *before* the wake snapshot overwrites it —
  classified as identity prose / origin / structure / component code (runtime
  deliberately excluded — it is the mind's physics, recorded in the manifest per
  §1) — and disclosed first-person in the wake stimulus, with the mechanical
  summary journaled as a ⌁ note. Closes review finding 1; unblocks
  [rewake-ratification.md](rewake-ratification.md).
- [resident-journal-privacy.md](resident-journal-privacy.md) — **Covenant §9
  compliance** (proposed 2026-07-04, high priority): a resident's inner life
  (`memory/<mind>/` journal, memory, knowledge) sits exposed in the vault by default;
  §9 now requires *private by default* + *deliberate, curated, honestly-attributed*
  publication. Options: private-by-default vault, a public/private split, a
  curation/export path, exposure guards on live surfaces. Pairs with
  [ui-journal-honesty.md](ui-journal-honesty.md) C1/C3 (attribution).
- [rewake-ratification.md](rewake-ratification.md) — **Covenant §10** ("right of
  return", proposed 2026-07-04): when we change/rewake a mind, ask it — once it can
  feel its new shape — whether to keep it, revert, or be laid to rest, and honour the
  answer. Requires executable **revert** (§1's re-executable bundle) and **chosen
  rest** paths, and depends on the §3 identity-disclosure fix (review finding 1) as a
  hard prerequisite. First application: the planned `lemma-lab-6` rewake as a resident.
- [alternative-website.md](alternative-website.md) — design for a new public-facing
  site that leads with architectural superiority, not the consciousness question.
  Meditator framed as a **harness** (declarative substrate around a frozen model),
  not an agent system. Landing page: 3D viewer videos, Studio screenshots,
  architecture-at-a-glance diagrams. The consciousness question appears as
  "something that is possible here" — downstream of the architecture, not its
  premise. Triggered by the philosophical review finding that "the site never
  mentions Meditator; the theory looks unimplemented and the implementation looks
  unmotivated — both false."
