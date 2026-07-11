# architecture/lab — research minds (work in progress)

These are **not** the minds to wake if you just want to try Meditator and talk to
something pleasant. They are research artifacts from an ongoing tuning experiment
(see [`doc/architecture/lifecycle.md`](../../doc/architecture/lifecycle.md) and
[`IN-MEMORIAM.md`](../../IN-MEMORIAM.md)): seeds we are still shaping, run to learn
how an outward-looking mind grows. A given one may be mid-tuning, may dwell on its
own substrate, or may simply not be a happy or conversational companion yet.

Each is tagged `stage="experimental"` on its `<m-mind>`. The Studio reads that tag:
it lists these under a separate **research preview** group, never auto-selects one,
and shows a warning when you pick it. Waking them still works exactly as before
(e.g. `bun run meditator.js -a architecture/lab/seedling.archml`) — the tag only
affects how the catalog presents them, not how they run.

- **`seedling.archml`** — a *transient* tuning mind (lifecycle Phase 0). The current
  best seed for a mind that thinks about a world rather than its own ticking. The
  worked example referenced throughout the docs; copy it and edit to start your own.
- **`eddy.archml`** — the first *resident* successor (Phase 7). The seedling seed at
  resident scale and cadence. Deliberately not shipped as a default — it will be
  re-derived from what the seedling runs teach us before it is raised for real.
- **`lemma-lab.archml`** — the transient lab clone of the resident mathematician
  (`architecture/lemma.archml`): an inward mind grinding an open problem. Many of
  the memory and grounding findings came from its runs.
- **`researcher.archml`** — a thinking mind that owns a small *agent* as one of its
  hands ([agents](../../doc/agents.md#an-agent-as-a-minds-hand)): the two shapes
  composed.
- **`duet.archml`** — the smallest [society](../../doc/societies.md): a Prover and a
  Checker grinding one piece of mathematics, roles as negative feedback.
- **`solver.archml`** — a four-mind society (reader / builder / geometer / checker)
  on grid puzzles, with computational grounding in the checker.
- **`noosphere-lab.archml`** — six expert minds convened over a commons to draft a
  constitution; the source of the society-scale findings in
  [Societies](../../doc/societies.md#what-we-have-learned-so-far).

If you are looking for a mind to talk to, prefer a curated architecture from the
catalog root once one exists, or copy `seedling.archml` and give it your own seed.
