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
- [interlocutor-per-message.md](interlocutor-per-message.md) — the wake-time
  `interlocutor` (shipped) frames a voice as `Kris says:` instead of an unsettling
  "voice from outside"; the deferred enhancement is per-message attribution, so the
  framing follows whoever is actually speaking (e.g. Voice Mode for a second person).
