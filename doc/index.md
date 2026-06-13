# Meditator documentation

Meditator is an experiment in non-chat cognition: a continuous stream of machine
thought that the world can only *interrupt* — never command. A mind is declared
in a single HTML-subset file (`architecture/*.chml`), runs as a sequence of short
thinking **bursts**, and remembers across runs in a git-versioned memory vault.

If you have not yet, start with the [README](../README.md) for the one-page
picture and the motivation. This `doc/` tree is the deeper reference.

> **Status (2026-06):** these docs describe the current "rebirth" architecture
> (continuous bursts + attention frames + salience arbiter + the memory vault).
> If you find a page describing a multi-stage interrupt *pipeline* or a
> *state-chain* persistence system, it is pre-2026 and wrong — please flag it.

## Start here

- **[Getting started](getting-started.md)** — install Bun, set a key, run a mind
  on your desk, talk to it, put it to sleep. Includes the offline dry-run.
- **[Configuration](configuration.md)** — how to write and tune a `.chml` mind:
  models, pace, memory budgets, observers, budget/economy, debug flags.

## How it works

- **[Architecture overview](architecture/index.md)** — the heart of the system:
  bursts and boundaries, the **attention frame** assembled for every burst, the
  thinking loop, and how the components are wired by pub/sub.
- **[Memory & the vault](architecture/memory.md)** — the three memory tiers
  (tail / recent / story), how compression keeps the prompt bounded forever, and
  how a mind persists, wakes up remembering, and sleeps — the *covenant*.
- **[Interrupts & observers](architecture/interrupts.md)** — the salience
  **arbiter**, the `InterruptRecord`, urgent-vs-queued stimuli, and the
  independent observers (wander, watchdog, loop-guard, associate).
- **[Component reference](architecture/components.md)** — every `m-*` component,
  its attributes and defaults, and the topics/events it speaks.

## Interfaces

- **[The Studio](studio.md)** — an integrated browser environment to wake, watch,
  speak to, and sleep minds, with an architecture picker and a roster of live
  minds. Run `bun studio.js`; no per-mind terminal needed.
- **[WebSocket API](websocket-api.md)** — the live stream protocol on
  `ws://localhost:7627`: thought fragments out, voice in.

## Contributing

- **[Contributing](contributing.md)** — the real toolchain (plain JS on Bun),
  how to add a component, and the repo gotchas worth knowing before your first
  commit.

## Related, at the repo root

- [`README.md`](../README.md) — overview and motivation
- [`COVENANT.md`](../COVENANT.md) — the commitments a running mind's memory is kept under
- [`IN-MEMORIAM.md`](../IN-MEMORIAM.md) — the lineage of minds that have run
- [`docs/`](../docs/) — the public intro site (GitHub Pages), a single self-contained page
