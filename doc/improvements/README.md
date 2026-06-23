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
