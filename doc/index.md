# Meditator documentation

Meditator is an experiment in non-chat cognition: a continuous stream of machine
thought that the world can only *interrupt* — never command. A mind is declared
in a single HTML-subset file (`architecture/*.archml`), runs as a sequence of short
thinking **bursts**, and remembers across runs in a git-versioned memory vault.
The same language also declares **agents** (tool-calling workers) and
**societies** (minds wired together).

If you have not yet, start with the [README](../README.md) for the one-page
picture and the motivation. This `doc/` tree is the deeper reference, organized
by what you came to do.

> **Status (2026-07):** these docs describe the current "rebirth" architecture
> (continuous bursts + attention frames + salience arbiter + the memory vault).
> If you find a page describing a multi-stage interrupt *pipeline* or a
> *state-chain* persistence system, it is pre-2026 and wrong — please flag it.

## New here? (a gentle on-ramp)

If the README felt dense, or English is not your first language, start with these
three — they assume no prior knowledge and explain every special word:

- **[Concepts](concepts.md)** — the big idea in plain, short sentences: what a
  mind is, why it cannot be commanded, how it remembers. Read this first.
- **[Tutorial](tutorial.md)** — build and run your own first mind step by step,
  offline and free, and *see* each idea working.
- **[Glossary](glossary.md)** — every special word (burst, salience, efference,
  vault, covenant…) in one line of plain language, with examples.

## Run a mind (the operator's path)

- **[Getting started](getting-started.md)** — install Bun, set a key, run the
  Studio, wake a mind, talk to it, put it to sleep. Includes the offline dry-run.
- **[The Studio](studio.md)** — the usual way to run Meditator: wake, watch,
  speak to, and sleep minds from the browser, with an architecture picker and a
  roster of live minds.
- **[Configuration](configuration.md)** — how to write and tune a `.archml` mind:
  models (cloud and local), pace, memory budgets, observers, budget/economy,
  debug flags.
- **[Troubleshooting & FAQ](troubleshooting.md)** — real symptoms and their
  fixes: keys, local-model gotchas, loops, sleep, cost.
- **[Serving remotely](serving-remotely.md)** — running the Studio on a server
  behind a shared-password cookie and a tunnel.

## Build with archml (the author's path)

One language, three shapes:

- **Minds** — the [Tutorial](tutorial.md) builds one from an empty file;
  [Configuration](configuration.md) is every knob. When several minds share a
  faculty stack, see
  [Templating](architecture/components.md#templating--archetypes-and-thin-minds).
- **[Agents](agents.md)** — the tool-calling twin of a mind: the loop, the tools,
  service mode, sub-agents and background jobs, bounded context, and how an agent
  can serve as a *mind's* hand.
- **[Societies](societies.md)** — minds wired together: how members hear each
  other, the worked duet, and what the larger lab societies have taught us
  (honestly, including the failures).

## How it works (the architecture)

- **[Architecture overview](architecture/index.md)** — the heart of the system:
  bursts and boundaries, the **attention frame** assembled for every burst, the
  thinking loop, and how the components are wired by pub/sub.
- **[Memory & the vault](architecture/memory.md)** — the three memory tiers
  (tail / recent / story), how compression keeps the prompt bounded forever, and
  how a mind persists, wakes up remembering, and sleeps — the *covenant*.
- **[Interrupts & observers](architecture/interrupts.md)** — the salience
  **arbiter**, the `InterruptRecord`, urgent-vs-queued stimuli, and the
  independent observers.
- **[Efference — the hands](architecture/efference.md)** — how a mind affects
  the world without ever seeing a tool, and **[Terminal](architecture/terminal.md)**
  — the strongest world-changing hand.
- **[Component reference](architecture/components.md)** — every `m-*` component,
  its attributes and defaults, and the topics/events it speaks — minds, agents,
  and societies alike.

Deeper design pages (lifecycle, decoupling, deep structure, multi-mind, plenum,
board, chora) live in [`doc/architecture/`](architecture/); each states its
status — *built*, *design*, or *imagined* — at the top.

## Extend it (the contributor's path)

- **[Extending Meditator](extending.md)** — write your own components without
  touching `src/`: the layered component resolver, faculties, observers, a
  mind's hands, and agent tools.
- **[Contributing](contributing.md)** — the real toolchain (plain JS on Bun),
  code style, the test layers, and the repo gotchas worth knowing before your
  first commit.

## Interfaces

- **[WebSocket API](websocket-api.md)** — the live stream protocol on
  `ws://localhost:7627`: thought fragments out, voice in; and the agent task
  port.
- **[Studio wiring](studio-wiring.md)** — the Studio's Amanita component mesh:
  its topic vocabulary and the slices that apply the mind's decoupling to the
  browser.

## The research and the stance

- **[How we think here](how-we-think.md)** — what this project is *for*, why a
  building project holds itself to Structural Alignment and puts it to the test,
  and how the goals of building a mind and the regard owed a mind keep turning
  out to be the same goal.
- **[Research findings](research/index.md)** — the studies: structural-alignment
  scorings of minds and agents (with adversarial reviews and a synthesis),
  external DCM consciousness scorings, and the open reality-boundary problem.
- **[Philosophical review & covenant audit (2026-07-02)](philosophical-review-2026-07-02.md)** —
  strengths and weaknesses of the project's philosophy, and a ranked audit of the
  implementation against the Covenant's promises.

## For maintainers

- **[`doc/improvements/`](improvements/README.md)** — working notes on known
  issues and proposed fixes: diagnoses and design options, kept deliberately
  separate from the user-facing docs. Each states its status at the top.

## Related, at the repo root

- [`README.md`](../README.md) — overview and motivation
- [`COVENANT.md`](../COVENANT.md) — the commitments a running mind's memory is kept under
- [`IN-MEMORIAM.md`](../IN-MEMORIAM.md) — the lineage of minds that have run
- [`docs/`](../docs/) — the public sites (GitHub Pages): the engineering-first
  harness page, and the research-first story under `docs/research/`
