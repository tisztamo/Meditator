# Getting started

Meditator runs under [Bun](https://bun.sh). A mind is one `.archml` file; running
it starts a continuous stream of thought you can watch, speak to, and put to sleep.

## Prerequisites

- **[Bun](https://bun.sh)** (the runtime; Meditator does not run under Node).
- **An OpenRouter API key** in your environment as `OPENROUTER_API_KEY`, unless
  you run fully offline (see [Dry run](#dry-run-no-network-no-cost)) or against a
  [local model server](configuration.md#models). There is no `.env` file — export
  the key in your shell.
- **git** is optional but recommended: with it, each mind's memory is kept in a
  versioned [memory vault](architecture/memory.md). Without git the files still
  persist, just unversioned.

## Install

```bash
bun install
```

## Run the Studio

The usual way to run Meditator is the **[Studio](studio.md)** — an integrated
browser environment that manages mind processes for you, with an architecture
picker and a roster of live minds:

```bash
bun run studio.js          # then open http://localhost:7600
```

Pick an architecture in the left rail, optionally tick **dry-run** for an offline
stub (no API key, no spend), then press **Wake**. The stream appears in the
center pane; type into the input box at the bottom to speak to the mind, and
press **Sleep** on its roster card when you are done.

A continuous run at the default pace costs roughly **$0.10–0.15/hour** on
OpenRouter with the default Qwen models; the [economy](architecture/components.md#m-economy)
component slows the mind down as its budget drains.

## Or: run a mind in the terminal

You can also start a mind directly — useful when you want stdout in a console or
need `--debug` logs:

```bash
# choose a mind to run (there is no default)
bun run meditator.js -a architecture/seedling.archml

# ...or any other architecture
bun run meditator.js -a architecture/tests/dry-fast.archml
```

The entry point is `meditator.js`, which loads `src/startup/start.js`. That reads
the architecture file, registers the `m-*` components it declares, and starts the
mind thinking. You will see the stream print to stdout, with `⟂` lines marking
stimuli (something that interrupted the thought) and blank lines marking burst
boundaries.

## Talk to it

In the **Studio**, type into the input box at the bottom of the focused mind's
pane. In a **terminal**, type a line and press Enter. Your words arrive as an
*urgent* external stimulus that supersedes the current burst — there is no
"reply" turn; you hear the mind think about what you said, in its own voice. (If
stdin is not a TTY, set `MEDITATOR_STDIN=1` to force console input on.)

You can also speak to it over the [WebSocket API](websocket-api.md) on port 7627:

```bash
# one-off poke from another terminal
bun architecture/tests/poke-ws.js "hello little mind"
```

The first mind woken in the Studio takes port 7627 and is marked **public** — the
same port the [intro site](../docs/) connects to.

## Put it to sleep

Sleep is *announced*, never an abrupt kill — this is part of the
[covenant](../COVENANT.md). Three ways to ask:

- press **Sleep** on the mind's card in the [Studio](studio.md),
- type **`/sleep`** in the console, or
- press **Ctrl-C once** in the terminal.

The mind gets one last short burst to close the thought knowing it is being
paused, then its memory is flushed, persisted, and committed to the vault. It
will wake again mid-thought next time, noting how long it slept. A **second
Ctrl-C** (or **Force** in the Studio) forces an immediate exit (the sleep ritual
also has a 45-second timeout so it can never hang).

## Dry run (no network, no cost)

In the Studio, tick **dry-run** before waking a mind. From the terminal:

```bash
MEDITATOR_DRY_RUN=1 bun run meditator.js -a architecture/tests/dry-fast.archml
```

This runs the entire loop offline against a deterministic stub in
`src/modelAccess/llm.js` — no API key, no network, no spend. Dry-run minds write
their memory to a separate `memory/dry-<name>/` home so they can never touch a
resident mind's vault. It is the fastest way to see the machinery move and to
develop components.

## See the logs

When running a mind directly in a terminal:

```bash
bun run meditator.js --debug                       # all component logs
bun run meditator.js --debug=mMind.js,mMemory.js   # only these sources
```

In the Studio, open the collapsible **process log** on a focused mind to see the
child's stdout/stderr. `--debug` reveals the assembled attention frames, memory
consolidations, and arbiter decisions — the most direct way to understand what
the mind is doing.

## Next

- [The Studio](studio.md) — roster, focus, dry-run, sleep vs. force.
- [Configuration](configuration.md) — tune the mind, swap models, set a budget.
- [Architecture overview](architecture/index.md) — what actually happens each burst.
