# Orient study (Phase 3B · B4 / B5)

The experiments git submodule is not checked out in this workspace, so the
harness lives next to the lab architectures it runs. Copy into
`experiments/orient-study/` if that repository is available.

## Question (B4)

Does a mind close or narrow the world channel by its own hand, does the reflex
reopen it, and is the open–close oscillation visible before anyone chooses a
grace period?

## What to run (needs a local GPU / `local-voice`)

```bash
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js \
  -a architecture/lab/eddy-world-orient.archml \
  --mind-name eddy-world-orient-1
```

Stop when the mind has closed or narrowed `world` at least once by `m-orient`,
the reflex has reopened it, and no `bypassAperture` source was withheld. Four
hours is a reasonable first watch if nothing happens sooner.

Then:

```bash
bun architecture/lab/orient-study/analysis/summarize.mjs memory/eddy-world-orient-1
```

## Pre-registered metrics

- `aperture-change` events per hour, by issuer and reason
- closed-to-softened intervals
- re-close latency after a reflex soften
- no `bypassAperture` source withheld

## B5 (same architecture)

A search that ends `found` on a real feed item, and one that ends
`not-detected-in-inspected-area` or `budget-exhausted`, with coverage recorded.
The found item's bid shows `targetMatch`; the mind's frame shows the item, not a
report.

This harness does not claim that prediction or search improves functioning.
