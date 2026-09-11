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
- **`lemma-lab-expect.archml`** — lemma-lab plus `prediction="on"`, `m-compare`,
  `m-expect-ledger` (B1 expect study; ws 7631). Harness: `expect-study/`.
- **`lemma-lab-judge.archml`** — the same with `m-judge` and small `m-bid` weights
  (B2 live judge; ws 7632).
- **`eddy-world.archml`** — eddy with the world region under `modality="text"` so
  `m-feed` is lazy (B3 first live aperture; ws 7633).
- **`eddy-world-orient.archml`** — eddy-world plus `m-orient`, `m-search`, `m-judge`,
  and a region bidder (B4/B5; ws 7634). Harness: `orient-study/`.
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

## Phase 3B GPU runs (prepared; not run in this workspace)

Needs `MEDITATOR_MODEL_PROFILE=local-voice` and a local GPU. Offline tests do not
cover these.

```bash
# B1 — three runs per arm, ≥2h each
architecture/lab/expect-study/bin/run.sh P 7200
architecture/lab/expect-study/bin/run.sh C 7200
bun architecture/lab/expect-study/analysis/summarize.mjs memory/lemma-lab-expect-p-<stamp> memory/lemma-lab-expect-c-<stamp>

# B2 offline after B1 ledgers
bun architecture/lab/expect-study/analysis/judge-offline.mjs memory/lemma-lab-expect-p-<stamp>

# B2 live
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js -a architecture/lab/lemma-lab-judge.archml --mind-name lemma-lab-judge-1

# B3
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js -a architecture/lab/eddy-world.archml --mind-name eddy-world-1

# B4 / B5
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js -a architecture/lab/eddy-world-orient.archml --mind-name eddy-world-orient-1
bun architecture/lab/orient-study/analysis/summarize.mjs memory/eddy-world-orient-1
```

Reports: `doc/research/expect-study.md`, `doc/research/first-live-aperture.md`.
Use `--mind-name` so checked-in homes stay untouched.
