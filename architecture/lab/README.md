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
- **`busy.archml`** — a scratch tuning variant; ignore unless you are tuning.

If you are looking for a mind to talk to, prefer a curated architecture from the
catalog root once one exists, or copy `seedling.archml` and give it your own seed.
