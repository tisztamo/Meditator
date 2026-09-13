# First live aperture (Phase 3B · B3)

**Status: run 2026-09-12.** Code: `MSense.perceive()`, `m-feed` migrated,
[`architecture/lab/eddy-world.archml`](../../architecture/lab/eddy-world.archml).

## What ran

`MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js -a architecture/lab/eddy-world.archml
--mind-name eddy-world-1`, headless, local `ardincoder-1` (voice) + openrouter
`deepseek/deepseek-v4-flash` (utility), no probes, 10:38:55Z–14:38:59Z UTC
(4h 0m), clean SIGINT. Home: `memory/eddy-world-1/`.

## What it shows

The lazy path works: 10 percepts arrived from the three real feeds (`earth` 5,
`sky` 2, `ideas` 3) — real BBC/NASA/Quanta headlines, e.g. *"Battle to save the
tiny, gooey snail only found in one lake in the UK"*, *"AI Has Solved One of
Math's $1 Million Millennium Prize Problems"* — each rendered exactly like
`m-feed`'s eager line (*"A scrap of the outside world drifts past — "..."."*),
each with `bypassAperture: false`, `tier: 0`. None of the 208 percepts in the
run carried an `aperture-change`, and grepping the full stdout log and every
journal/memory file for `materializationFailure`, `perceptDecision`, or
`aperture-change` returns zero hits — no refusals, no lazy-materializer
failures, nothing closed the gate (none expected, since `eddy-world` wires no
`m-bid` or reflex in B3). Journal text is identical in shape to `eddy`'s feed
lines; the compatibility promise (perception unchanged with the gate open)
holds by observation, not just by the code's structure.

**Not shown — a real gap in this run, not a defect.** `apertureState` and
`contactPressure` are `m-ws` telemetry, not durable journal fields; the plan
expected them read live via an `m-ws` client during the run. I ran this
headless and unattended (per Kris's low-poll instruction) and did not attach a
client, so the `contactPressure` trajectory metric was not captured and can't
be reconstructed after the mind slept. **If this run is repeated, attach a
small `m-ws` client logging `apertureState`/`contactPressure` at ~1 Hz for the
duration** — that is the one pre-registered metric this report cannot answer.

No `eddy` (non-aperture) run exists from the same period to compare "feed
percepts/hour" against as a baseline — `memory/eddy/`'s only journal predates
this work by three months and has no percept log. The observed combined rate
(2.5/h across 3 feeds against 20–30 min timeouts) is plausibly explained by
RSS publishing cadence rather than the aperture: a feed's `changeKey` gates on
a *fresh* headline, not merely on the poll interval elapsing, so a quiet feed
naturally produces fewer percepts than the timeout alone would suggest. This is
a plausible explanation, not a controlled comparison — a same-day `eddy` run
would settle it properly.

**An unregistered but notable observation.** Of 208 total percepts, only 10
(4.8%) came from the world; 152 (73%) were internal (`Association` 90,
`Time-wander` 62), with the loop-detector (`LoopGuard`) firing 15 times against
a repeating internal "drift" motif (a mind circling the same sentence-shape
about letting a thought go, twice verbatim). The aperture being open does not
mean the mind attends to what comes through it — the world competed with a
strong internal attractor and mostly lost. This matches prior findings about a
self-referential "presence" pull ([[recall-attractor-feedback]]); it's not new
to B3, but it does bear on B4: with the gate mechanically open and correct, an
`eddy-world`-shaped mind may still rarely act on the world channel, simply
because it rarely notices it.

## Verdict

**B3's mechanical claim holds**: a shipped sense (`m-feed`) moves under
aperture control with no visible change to its perception, and contact
regulation ran against three real feeds without a single materialization
failure or spurious closure. B4 is not blocked by anything found here. This
report makes no claim that prediction, search, or the aperture itself improves
functioning — only that the plumbing works as specified, live, for the first
time.
