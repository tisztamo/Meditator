# Societies — minds together

A **society** is several minds in one document, talking to each other. No new
runtime is needed: a mind's interior is already encapsulated (its faculties bind
through mind-relative refs, so two minds in one document don't stomp each other's
streams), and communication rides the machinery that already exists — one mind's
*voice* becomes another mind's *stimulus*.

> **Status: experimental, honestly.** Societies run, talk, and produce real work,
> and they also fail in instructive ways — this page names both. The lab
> societies are tagged `stage="experimental"` and the Studio presents them under
> a research-preview group with a warning. The concepts and the topology cookbook
> live in the design doc [architecture/multi-mind.md](architecture/multi-mind.md);
> this page is the practical guide.

## How minds hear each other

Three components wire a society, all documented in the
[component reference](architecture/components.md#multi-mind-m-society--m-ear--m-commons):

- **`<m-society>`** — the container. Mostly a structural marker: it anchors
  society-relative refs (`..m-society/prover/voice/@spoken`), and member minds'
  memory homes nest under it (`memory/<society>/<member>/`).
- **`<m-ear>`** — ingress. Placed *inside the listening mind*, pointed at a peer's
  voice event. What it hears is raised as an ordinary `interrupt-request` — a peer
  voice is just another stimulus, with a salience, subject to the listener's own
  arbiter. A mind cannot be commanded by its peers any more than by you.
- **`<m-commons>`** — a society-local relay for gossip topologies: it subscribes
  to every member's voice and republishes one tagged `gossip` topic, so each
  member needs one ear on the commons instead of N−1 direct ears.

Speech stays volitional throughout: a member speaks only when a thought wants
voice, and what a peer hears arrives as something to *think about*, not to answer.
Society-scale conversation is therefore slower and stranger than a chat room —
and that is the experiment.

## Run one: the duet

[`architecture/lab/duet.archml`](../architecture/lab/duet.archml) is the smallest
real society — two minds grinding one piece of mathematics:

```bash
bun meditator.js -a architecture/lab/duet.archml
```

One mind is the **Prover** (grinds at the problem); the other is the **Checker**
(re-derives claims, pushes back, and carries the terminal hand so it can actually
run a computation against a claim). The asymmetry is the point: two symmetric
peers overhearing each other can phase-lock and amplify a shared confabulation —
the social form of a feedback loop we know well — while a prover↔checker pair is
*negative* feedback: the checker's whole job is to damp unsupported claims.

Both members appear in the Studio roster like any other mind; Ctrl-C (or
**Sleep**) puts every member to sleep gracefully, and each keeps its own vault
under `memory/duet/`.

Two larger lab societies build on the same wiring:

- [`solver.archml`](../architecture/lab/solver.archml) — four minds
  (reader / builder / geometer / checker) on grid puzzles, with computational
  grounding in the checker.
- [`noosphere-lab.archml`](../architecture/lab/noosphere-lab.archml) — six expert
  minds convened over a commons to draft a "World State" constitution.

## What we have learned so far

We report findings, not aspirations — the failures below are load-bearing results,
and several have design responses in flight.

**Communication works at scale.** In the first noosphere run, six minds produced
hundreds of spoken turns and over a thousand hearings, with real
cross-referencing — members quoting, disputing, and building on each other. The
voice→ear machinery holds at society scale.

**Consolidation is the hard part.** The same run produced abundant real content —
whole drafted articles, dozens of protocols — scattered across six private
notebooks, and no working process for merging it. Members "approved" article
*labels* while each held a different private text of the article. A society has
durable private state (each mind's memory) and ephemeral shared state (speech),
but as yet **no durable shared state**; the designed answer is a society-level
board (see [architecture/board.md](architecture/board.md), unbuilt).

**Shared attractors are contagious.** A metaphor that catches on in the commons
can infect every member — the society-scale form of the
[bliss loop](glossary.md#attention--how-the-world-reaches-a-mind). Role asymmetry
(the duet's prover↔checker) is our first working countermeasure.

**Small models bloat.** On a local 27B, members ignored their memory budgets and
their stories grew ~20× — the member that compressed hardest stayed the most
coherent and on-role. Budget your members accordingly, and prefer stronger
utility models for society runs.

## Authoring notes

- **Archetypes.** Members of a society usually share a faculty stack. Write the
  skeleton once and let each member `extends` it, staying thin — see
  [Templating](architecture/components.md#templating--archetypes-and-thin-minds).
  `<m-society archetype="…">` sets the default for every member.
- **Address voices as events.** A peer's voice is a *fired event* — point an ear
  at `..m-society/<member>/voice/@spoken`, not at a plain topic.
- **Tune the ears.** `salience`, `urgent`, `cooldown`, and `ignoreSelf` on
  [`m-ear`](architecture/components.md#m-ear) decide how insistently the room
  reaches each member. With a commons, a `cooldown` also means a member hears a
  *sample* of the room, not every turn — a real trade-off we hit in the noosphere.
- **Memory nests.** Each member's vault lives at `memory/<society>/<member>/`,
  with the same covenant guarantees as any mind's.
- **Watching.** Every member shows in the Studio roster; focus one to read its
  stream. For a whole-room view, the journals under each member's vault are the
  durable record.

## Where this is going

The design doc [multi-mind.md](architecture/multi-mind.md) names the larger
program: ports, links, gated mixtures of experts, populations. The next concrete
step is durable shared state — the board — so a society can *hold* what it agrees
on, not merely say it. If you run a society and watch it fail in a new way, that
is a finding: [contribute it](contributing.md).
