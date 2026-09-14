# Search study (Phase 3B · B5 retry, tuned)

The B5-retry harness. Lives next to the lab architectures it runs, like
`orient-study/`. Copy into `experiments/search-study/` if you would rather keep
it there.

## Question

With the three no-trigger causes from the first two orient runs repaired, does
the mind ever start a live search — and does one end `found` on a real feed item
while another ends honestly (`not-detected-in-inspected-area` or
`budget-exhausted`)? (B5 stop condition, `doc/plans/perceptual-membrane-phase-3b.md`
§7.)

## Baseline (runs 1–2, `eddy-world-orient`)

From `doc/research/first-live-orientation.md`: ~8.5h combined, 469 percepts,
**3 orientations, 0 searches**. Run 2 alone: 265 percepts, 83% internal, 12%
world; `orient` never fired; two formed reaches died throttled. Post-mortem found
three compounding causes, and `eddy-world-search.archml` turns exactly those
three knobs, holding everything else equal:

1. **Discoverability** — the body schema never said looking-for is possible;
   `template` existed only in the realizer's tool schema. Fixed in code
   (`mOrient.js` default `felt`/`description`): the felt line now says the mind
   can *go looking for something and keep looking until it finds it or knows it
   is not there*, and the realizer-facing description names `template`.
2. **Trigger balance** — wander (150s, salience 0.55) + associate (every 5)
   out-shouted the feeds (salience 0.4, gain 0.9, 6m trickle). Now: wander 360s /
   0.4, associate every 8 / cooldown 120s, world region gain 1.0 / rateLimit 4m,
   feed salience 0.5. Loop-guard unchanged (it caused run 1's only orientations).
3. **DECIDE myopia** — the gate ran every 8 boundaries but saw only the last 1200
   chars ≈ 1–2 bursts (median burst 574 chars, mean 846, in seedling journals), so
   a want assembling over several bursts was invisible. `m-act` gains
   `window="8000" decideWindow="7000" realizeWindow="1500"` (new attributes;
   defaults unchanged at 1200/900 everywhere else).

Also: orient `intentThreshold` 0.75 → 0.65 (run 2's reaches died below the bar).

## What to run (needs a local GPU / `local-voice`)

```bash
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js \
  -a architecture/lab/eddy-world-search.archml \
  --mind-name eddy-world-search-1 \
  --debug=mSearch,mOrient,mAct 2>&1 | tee search-run-1.log
```

`--debug` puts the decide gists, reach throttles, and `search <status>
coverage=… samples=…` settle lines into the log; the journal records aperture
transitions and ⌁ deeds as before. Use a fresh `--mind-name` per attempt so
homes stay comparable.

**Stop when** one search ends `found` on a real feed item AND another ends
`not-detected-in-inspected-area` or `budget-exhausted` — or at the time cap.
**Time cap: 6h.** (Runs 1–2 show the null result is informative by ~5h; do not
run past 6h — a third zero at that length settles the question against this
world, per the verdict below.) Abort early only for degeneration policy or
repeated unrecovered errors; a single transient connection error self-recovers
(seen in run 2) and is not a reason to stop.

## Pre-registered metrics

Compare against the baseline above; report all, not just the flattering ones:

- `search-target` events: count, templates used, route coverage per target
- search outcomes by status (`found` / `not-detected-in-inspected-area` /
  `budget-exhausted` / `abandoned`), samples spent
- `orient` calls total, and how many carried a `template` (grep the log for the
  decide/realize lines; the ⌁ deed notes omit `template` by design)
- DECIDE accepts per hour (the `intent` topic / debug `decide:` lines), and how
  many accepted reaches the realizer declined
- percept mix: internal (`Association`/`Time-wander`/`LoopGuard`) vs world-origin
  share — did the balance knob move the 83%/12% split?
- B4 regression check: aperture transitions still occur and the reflex still
  reopens (`orient-study/analysis/summarize.mjs` works on this home unchanged):

```bash
bun architecture/lab/orient-study/analysis/summarize.mjs memory/eddy-world-search-1
```

## Reading the result

- **≥1 `found` + ≥1 honest negative** → B5 met live; the three causes were the
  blocker. Report in `doc/research/` alongside `first-live-orientation.md`.
- **Searches start but never settle `found`** → mechanism fine, world too thin to
  satisfy a template; note which statuses dominated.
- **Still zero searches with reaches forming and world percepts up** → the
  membrane is no longer the bottleneck; the world is. That is the pre-registered
  trigger to invest in the garden-room text world of
  `doc/architecture/a-world-to-meet.md` rather than a fourth run of this shape.

This harness does not claim that prediction or search improves functioning.
