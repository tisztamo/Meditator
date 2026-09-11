# First live aperture (Phase 3B · B3)

**Status: prepared, not yet run.** Code: `MSense.perceive()`, `m-feed` migrated,
[`architecture/lab/eddy-world.archml`](../../architecture/lab/eddy-world.archml).

## What to run (needs a local GPU / `local-voice`)

Headless, at least four hours, no probes:

```bash
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js \
  -a architecture/lab/eddy-world.archml \
  --mind-name eddy-world-1
```

`m-ws` already carries `apertureState` and `contactPressure`. Read them from the
mind's log or a small `m-ws` client.

## Pre-registered metrics

- feed percepts attended per hour vs `eddy` baseline (should match within noise;
  open gate, gain 0.9 as before)
- `contactPressure` trajectory: must fall on each attended feed receipt and climb
  between them; a receipt that does not credit is a defect
- `aperture-change` events: none expected in B3; any transition is logged with
  its reason
- no `perceptDecision` refusal other than `busy`; no `materializationFailure`
- journal text of feed percepts identical in shape to `eddy`'s

This report must state what ran, on which model, for how long, and what it does
not show. It does not say prediction improves functioning. If perception differs
from `eddy`'s with the gate open, the helper is wrong and B4 waits.
