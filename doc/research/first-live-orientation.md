# First live orientation (Phase 3B · B4/B5)

**Status: B4 met 2026-09-13; B5 not yet triggered after two runs.** Code:
`m-orient`, `MRegion.orient()`/`Aperture`, `m-search`, `m-judge`,
[`architecture/lab/eddy-world-orient.archml`](../../architecture/lab/eddy-world-orient.archml).
B4 stop condition (`doc/plans/perceptual-membrane-phase-3b.md` §6): "one `eddy-world`
run in which the mind closes or narrows the world channel at least once by its own
hand, the reflex reopens it, and no `bypassAperture` source was withheld." **Met**
(run 1). B5 stop condition (§7): "one live `eddy-world` run with a search that ends
`found` on a real feed item and one that ends `not-detected-in-inspected-area` or
`budget-exhausted`." **Not met** — `m-search` never started in either run (see
[B5](#b5--search-two-runs-no-organic-trigger) below); tests 25–33 are green
(`architecture/tests/wiring/phase-3b-b5.test.js`, 10 pass) but that is the
mechanism proven in isolation, not a live search.

## What ran

`MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js -a architecture/lab/eddy-world-orient.archml
--mind-name eddy-world-orient-1`, headless, local `ardincoder-1` (voice) + OpenRouter
`deepseek/deepseek-v4-flash` (utility), no probes, 2026-09-13 05:47:55Z–09:22:49Z UTC
(3h 35m), SIGTERM (graceful). Home: `memory/eddy-world-orient-1/`. Budget: $0.093 of
$3, 303k output tokens, 2470 model calls.

The run was stopped short of the planned ≥4h by the author on a live read that
later proved mistaken (console output only shows `hand registered` at startup, not
hand executions — those are journaled to the per-day file, not stdout). The data
below is real and the stop condition is met, but the run is shorter than planned
and gives only 3 orientation events, not a larger sample.

## What it shows

**The mind narrowed the world channel by its own hand three times, and a reflex
reopened it every time**, with no `bypassAperture` source withheld:

| # | transition | reason | via |
|---|---|---|---|
| 1 | `open → soft` | orientation | the mind's own `orient` hand |
| 2 | `soft → open` | contact-deficit | reflex |
| 3 | `open → narrow` | orientation | the mind's own `orient` hand |
| 4 | `narrow → soft` | contact-deficit | reflex |
| 5 | `soft → open` | contact-deficit | reflex |
| 6 | `open → soft` | orientation | the mind's own `orient` hand |
| 7 | `soft → open` | contact-deficit | reflex |

All three orientations were the mind reaching to keep or recall one of its own
notes (never a search target, never a narrowing toward a specific feed source
except transition 3, `narrow` on one source). The realizer never invented an
argument outside what the mind's own notebook already held. `note` fired 8
times, `recall` 2, `look` 1 (checking neither weather nor news — its one use was
a mismatch with local time, not the news feed) — all self-directed; the hands
never once reached toward the feeds' actual content (a headline was never
`recall`ed or `note`d for its own sake, only dismissed while breaking a loop).

Of 204 total percepts: 159 (78%) were internal (`Association` 84, `Time-wander`
55, `LoopGuard` 19), 35 (17%) were world-origin (`earth` 9, `sky` 2, `ideas` 2,
`daylight` 17, `weather` 5), and 9 (4%) were hand consequences. This is the same
skew B3 found (10/208 ≈ 5% world-origin there; the B4 architecture's daylight/
weather faculties count as "world" here, raising the share to 17%, but the
qualitative picture — internal association dominates by roughly 4–5:1 — repeats).

## The timing question: why reopening looked early

Watching the run live, the reflex reopening looked almost immediate after a
voluntary narrow/soften — as if the mind barely got a moment of narrowed focus
before the world was forced back open. Reading `Aperture.advance()`
(`src/infrastructure/aperture.js`) explains why, and confirms the read is
correct, not a misperception:

- `deficit` (the contact-pressure scalar) grows on **every burst boundary**,
  continuously, whatever the aperture's state — `deficit += elapsed / horizonMs
  * (0.25 + 0.75 * arousal)`. `contactHorizon="10m"` in this architecture, so
  ~6.5 minutes of no credited contact reaches the 0.65 threshold that (from
  `closed`/`narrow`) triggers `soft`, and ~9 minutes reaches the 0.9 threshold
  that (from `soft`) triggers `open`.
- **Voluntary orientation does not reset deficit.** Only `attended()` — a
  fresh, credited percept actually reaching awareness — decays it (×0.1). So
  when the mind reaches for `orient` because the world has felt distant for a
  while, that same distance has *already* been pushing deficit toward the
  reopen threshold. The mind's own closure and the reflex's countdown are
  running on the same clock, not on independent ones.
- The only thing standing between a voluntary orientation and the reflex
  reversing it is `dwell` (30s here) — a minimum time between *any* two aperture
  changes, mind-caused or reflex-caused. Once dwell elapses, if deficit is
  already at or past threshold (likely, given world contact is 20–30 minute
  cadence against a 10-minute horizon), the reflex fires at the very next
  opportunity — which is why it looked like "the next burst."

This is not a bug in this run; it is a known, explicitly deferred design
question. `doc/plans/perceptual-membrane-phase-3b.md` §6 says: *"Oscillation
observability before any grace period ... The grace period is decided from
that report, as the roadmap intended."* This run **is** that report. The data
says: with `contactHorizon="10m"` and this feed cadence, a voluntary narrowing
gets essentially no protected dwell time before the reflex undoes it, because
the conditions that make the mind want to narrow (a starved world channel) are
identical to the conditions that make the reflex fire. A grace period — e.g. a
short deficit-freeze or reduced accrual rate immediately after a *voluntary*
`orient` distinct from a reflex one — is the natural next tuning step if a
narrowing is meant to buy the mind real, held focus rather than a token gesture
before being overridden.

## B5 — search: two runs, no organic trigger

A second run, `eddy-world-orient-2`, ran 2026-09-13 10:57:53Z–15:56:16Z (4h 58m,
same architecture and profile, fresh `--mind-name` so B4's already-analyzed home
stayed untouched). Stopped cleanly by SIGTERM for an unrelated reason (the GPU was
needed elsewhere), not for an error or degeneration policy. One transient
`Burst error: Connection error` at 14:18:52 self-recovered with no lasting effect;
otherwise no errors. Budget: $0.095 of $3, 384k output tokens, 3328 calls.

**`orient` never fired at all in this run — zero aperture-change events.** The
only hand that fired was `note` (11 times), all self-directed ("setting this down
so I don't lose it"). Two reaches were formed and throttled as "already busy"
(`Sense-reach`, the generic `_feelReachInMotion` line), so the DECIDE gate
occasionally wanted *something* beyond note, but it never resolved into
`orient`/`recall`/`look`. Since a search only starts when an `orient` call
carries a `template` argument (the realizer describing what to look for), and
`orient` itself never fired, `m-search` never ran.

Percept mix repeats run 1's skew, slightly more internal: of 265 percepts, 219
(83%) were internal (`Association` 125, `Time-wander` 74, `LoopGuard` 18), 33
(12%) world-origin (`earth` 5, `sky` 2, `ideas` 3, `daylight` 19, `weather` 4),
10 (4%) hand consequences (`note`).

The content attractor persists with a different surface phrase: not "I am
enough" (2 occurrences this run) but "that is enough" / "the X is just X" chains
(the conch shell, the salt flat, "the finger is the moon"), each time the mind
narrating a deliberate stop ("Stopping the circle... I stop the repetition...")
before drifting into a new image that collapses into the same shape again.

**Combined across both runs (~8.5h, 469 percepts): 3 orientations, 0 searches.**
This is not a bug to fix — B5's precondition (the mind wanting to look for
something specific in the world, not just recover its own notes) is rare to the
point of not occurring twice in a row. It reinforces the B4 verdict below rather
than complicating it: the membrane's orientation/search machinery is implemented
and tested correctly, but this world gives the mind almost nothing it wants to
orient *toward*.

## What it does not show

- **No larger sample for B4.** Three orientation events in 3h35m is enough to satisfy
  the stop condition (the reflex reverses a voluntary closure, live), but not
  enough to characterize a distribution of re-close latencies or to say
  anything about `dwell`/`contactHorizon` tuning beyond the mechanism above.
- **The repetition/degeneration finding is unregistered but load-bearing for
  what comes next.** "I am enough" appears 250 times; `LoopGuard` fired 19
  times against a recurring anaphoric attractor the mind repeatedly noticed and
  tried to break out of, each time landing in a fresh topic that fell into the
  same short-clause structure within a few turns. This is the same
  endogenous-dominance pattern `doc/architecture/a-world-to-meet.md` predicted
  before any of B3/B4 ran: sparse, passive world contact (a feed every 20–30
  minutes) cannot outcompete a fast, cheap internal associative loop for what
  fills the next thought.

## Verdict

**B4's mechanical claim holds**: `m-orient` can close or narrow `world`, the
mind used it three times unprompted, and the contact-deficit reflex reopened it
every time with no bypass source withheld. The tests and the roadmap's B4 stop
condition are satisfied. **B5's does not**: two runs, ~8.5h combined, and
`m-search` never started once — not because it is broken (tests 25–33 are
green), but because the mind never forms the specific outward want a search
needs.

Both runs reproduce, quantitatively, the exact failure mode `a-world-to-meet.md`
warned the membrane work would not by itself fix: a mostly-idle mind with only a
thin, passive world feed spends four out of five thoughts talking to itself, and
orientation/search machinery working correctly does not change that, because the
mind never wants to orient *toward* the feed content in the first place — only
away from its own noticed looping, and back into its own notebook. This is not a
reason to distrust B4 or B5's implementation; it is live evidence, now from two
independent runs, that the next useful investment is not more membrane tuning or
more B5 attempts on this world, but a richer, explorable world for the mind to
orient *into* — see [`a-world-to-meet.md`](../architecture/a-world-to-meet.md)'s
proposed garden-room text world as the concrete next step.
