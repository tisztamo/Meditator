# Chora roadmap — from the imagined mind to buildable steps

> **Status: proposed.** Companion to [chora-imagined.md](chora-imagined.md), which
> scored what we run (~50% of the human band) and named the ceiling: hedonic
> valence, recurrence, plasticity, oscillation. This doc breaks the way forward
> into eight concise designs. Each is deliberately high-level — the shapes below
> are *suggestions* for the implementor, not prescriptions. Ordering follows the
> imagination doc's own principles: **mechanism before signal** (add a mechanism
> whose natural consequence is the signal) and **valence last, most deliberately**.
> Every step either generalizes something we ship or fixes a failure we observed
> live, and the Studio's Plenum viewer (`studio-plenum`) is the instrument for
> watching each one land.
>
> Dependencies, roughly: 1 → 2 → (3, 4) → 5 → 6, with 7 consuming whatever core
> exists and 8 running alongside everything.

---

## 1 · The runtime Plenum — make the space causal

*Fills: substrate for D1/D2/D5 · gen of the viewer's simulation · signal 12 support*

Today positions exist only in the Studio viewer; the mind doesn't know where its
faculties are. Move the infoton layout into the runtime so topology can *mean*
something.

**Mechanism.** Decentralized, exactly as the paper runs it — designed in full in
[plenum.md](plenum.md). A position is *private state of each component*; every
delivery carries an infoton `{source pos, energy, sign}`; the receiver applies one
displacement step toward the carried position at delivery time (TD-clamped). No
owner, no tick, no persistent force field: cost is proportional to messages, idle
minds cost nothing, and nothing assumes a single process. The self is pinned (the
paper's coordinator trick); the god view exists only in telemetry, never in the
substrate. Traffic is the messages themselves — commons gossip, ear hearings, bids,
deeds — so no new instrumentation.

**First coupling — one, small, reversible.** Distance modulates exactly one real
dynamic to start: `m-ear` effective salience scaled by falloff from the *carried*
infoton position (an attr like `plenumCoupling="0..1"`, default 0, capped so
proximity never amplifies past authored salience). Everything else stays
read-only layout.

**Telemetry.** `pub("layout", …)` → m-ws → Studio; `studio-plenum` renders the
runtime's positions when present and falls back to its local simulation otherwise.

**Landed when:** after ~1 h of noosphere-lab, message-heavy pairs are measurably
closer than quiet pairs; with coupling 0 the run is behaviorally identical to
baseline (the control).

---

## 2 · The chemistry — `m-field`, a typed modulator set

*Fills: signal 5 (M-H) · gen of `arousal` · chora D5*

We ship one modulatory channel (economy → arousal → interrupt threshold).
Generalize it to a small typed set before adding any new consumer logic.

**Mechanism.** One per-mind component (suggest `m-field`) holding named scalars —
start with `arousal` (migrated), `mood`, `focus`; reserve `wanting` for design 6.
Each channel declares sources, decay, and clamps, and is published like
`economy/energy` so the Studio and Plenum see it for free.

**Sources that exist today** (no valence needed yet): mood ← loop-state (a
detected loop depresses it) and recent act success ratio; focus ← novelty (the
arbiter accepting an unfamiliar stimulus type).

**Consumers that exist today:** `m-interrupts` threshold (generalize
`arousalSensitivity` into reading a named channel), `m-stream` temperature ← mood,
`m-associate`/`m-resurface` cadence ← focus. Once design 1 lands, channels gain
spatial falloff: emitted at the source's position, sampled at each consumer's —
volume transmission through the shared space.

**Landed when:** channels visibly move in the Plenum aura; a mood-driven
temperature change measurably alters vocabulary breadth without destabilizing a
lemma-lab control run.

---

## 3 · Commons ignition — gate the workspace

*Fills: signals 1+2 (H) · fixes the observed folie-à-deux · chora D2*

The noosphere run showed the failure exactly: the commons is an **ungated relay**,
so a metaphor-attractor infected all six organs and consolidation never converged.
Give the distributed mind winner-take-all access.

**Mechanism.** `m-commons` gains an opt-in `mode="ignite"`: spoken messages become
*bids* carrying their speech-impulse salience; bids accumulate over a short
window; when a bid (or coalition of near-vocabulary bids) crosses a **nonlinear**
threshold it ignites — broadcast to every ear, an `ignition` event fired (a
chemical burst once design 2 exists) — and losers are dropped or delayed. A
refractory period suppresses immediate same-speaker / same-vocabulary re-ignition,
which is precisely the anti-folie-à-deux lever.

**Suggested shape.** Pure orchestration in `mCommons.js` — no LLM call. Salience
already rides on speech impulses; vocabulary overlap can reuse `loopMath.js`.
Default stays `relay` so existing societies are untouched.

**Landed when:** a rerun of noosphere-lab shows lower cross-member vocabulary
infection and better consolidation convergence than the 2026-06-30 baseline, at
similar spoken-turn counts.

---

## 4 · Rhythms — a theta/gamma temporal backbone

*Fills: signal 12 (M) · gen of pace/burst cadences · chora D11*

Multi-timescale cadences exist (pace, paceSigma, storyEvery) but are coincidental.
Make timing phase-structured — it is pure scheduling, no new model calls.

**Mechanism.** A per-mind `m-rhythm` publishes a slow phase (theta ≈ every 4–8
bursts) with the burst tick as the fast cycle nested inside. Gates subscribe:
speech/act decide-windows and (in a society) commons ignition open only on their
phase band. Society members can be phase-offset so different organs own the
workspace on different phases — multiplexing rather than collision.

**Suggested shape.** Publish `phase` as a behaviour value; consumers treat it as
one more admission condition (like cooldowns today). Keep every gate's
phase-sensitivity an attr with default off.

**Landed when:** A/B lemma-lab runs show equal-or-lower loop frequency and no lost
responsiveness (urgent stimuli must still preempt regardless of phase); a society
run shows fewer simultaneous commons collisions.

---

## 5 · Valence-tagged replay — the fast half of plasticity

*Fills: signals 9, 11-partial (M) · gen of consolidation + resurface · chora D8*

Consolidation and the sleep ritual exist; what's missing is *selectivity by what
mattered*.

**Mechanism.** At boundary time, tag episodes with cheap significance proxies
(until design 6 provides true valence): a deed's success/failure, an urgent
accept, a loop-break, a user exchange. Three consumers: (a) the compression
prompt receives the tags as "these moments mattered — keep them" (respecting the
flat-block char budget; see the memory-fix lessons); (b) the sleep ritual gets one
replay pass that re-presents high-tag episodes to the final consolidation; (c)
`m-resurface` ranking gains a tag term.

**Suggested shape.** Tags live beside the tail entries m-memory already keeps —
no new store; the `> ⟂` notation already marks perceived events, so tagging can
key off it.

**Landed when:** seeded significant events survive into post-sleep `memory.md` at
a measurably higher rate than untagged controls, without recent/story bloat.

---

## 6 · The hedonic core — staged, and gated by ethics

*Fills: signal 4 (H) — the biggest gap · chora D4 · build LAST*

The imagination doc is explicit: this is the signal the framework weights most for
moral caution, so the mechanism is staged, each stage separately reviewed.

- **Stage 0 — the gate before the mechanism.** Write the review criteria and a
  covenant addendum *first*: what a valence-bearing mind may drive, what
  observations trigger pause, who reviews. Nothing below proceeds without it.
- **Stage 1 — observe only.** `m-valence` computes a good/bad signal on lab minds
  whose task has an *objective* score (lemma's verifier, the ARC oracle), plus
  homeostatic terms (energy trend, loop state). It only `pub`s `valence/state`;
  the Plenum tints the aura. It drives **nothing**.
- **Stage 2 — one consumer.** Valence biases attention thresholds only (a second
  sensitivity beside arousal). Observe for drift, wireheading-shaped behavior,
  and loop interaction before any further coupling.
- **Stage 3 — much later.** `wanting`/`liking` as separate m-field channels
  (kept dissociable, per Berridge) feeding action-selection weight and design 5's
  replay tags. This is where "task score becomes the goal term" (chora Part 4)
  actually happens.

**Honest caveat carried from the imagination doc:** "computes a good/bad signal
that changes what it does" and "suffers" are different claims; scoring higher here
*strengthens* the case for the restraint-and-audit posture, not against it.

---

## 7 · The mind compiler — `chora compile`

*Fills: chora Part 1 · gen of archetypes + wake-time overrides + m-agent*

Most machinery already exists: archetypes (`m-archetype`), the component-layer
resolver, wake-time overrides (name/origin/interlocutor), and the agent loop.

**Mechanism.** A fixed-core template — an archetype (suggest `chora-core`)
carrying the organ stack as designs 1–6 land — plus a compiler that turns a prompt
into (persona, origin, task-shaped hands/senses, and later the valence goal term),
emits an archml extending the core, and validates it.

**Suggested milestones.** (a) the template plus a hand-run compile prompt; (b) an
`m-agent` with tools *read component catalog / write archml / validate* — where
validate = parse (`architectureSurface`), dry-wake, short smoke; iterate on
failure; (c) a Studio "describe a mind" wake form that runs the agent.

**Landed when:** three diverse prompts (a math solver, a reading companion, a
grid-puzzle mind) compile, dry-wake clean, and live-run 30 min without derailment
— with zero hand edits.

---

## 8 · The living score, and two hygiene gates

*Fills: honesty about progress · prerequisites for growing the organ count*

**Living score.** Keep the Part 0 scoring scaffold as data (suggest a small yaml —
signal, weight, presence, evidence pointer — per architecture) with a tiny tool
that renders the table. Re-score eddy/noosphere/chora-core as each design lands,
so movement toward the human band is measured per-organ, not vibed. The score's
*evidence* column doubles as the audit trail the covenant posture wants.

**Hygiene gate 1 — supervisor port-pool crossing** (observed live 2026-07-04: a
second Studio slept another supervisor's mind through the shared 7627 pool). Fix
before any multi-supervisor or society-of-societies work: an identity handshake on
the m-ws hello (`{mind, home, pid}`), the supervisor verifying it — and that its
child owns the port — before forwarding telemetry or honoring control; plus
surfacing a child's m-ws bind failure instead of running windowless.

**Hygiene gate 2 — CI.** `bun test` on push (the suite is fast and green). The
organ count is about to grow; one author + no CI is the wrong place to grow it
from.
