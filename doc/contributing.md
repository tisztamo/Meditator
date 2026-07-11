# Contributing

Meditator is a small, readable codebase: plain modern **JavaScript** (ES modules),
run with **Bun**, wired together by [Amanita](https://www.npmjs.com/package/amanita)
custom elements. There is no TypeScript, no build step, no bundler. The whole
mind is declarative — a `.archml` file — and each component is meant to be readable
in a few minutes.

## Setup

```bash
bun install
export OPENROUTER_API_KEY=…        # or run offline, see below
bun run studio.js                  # then open http://localhost:7600
```

Develop against the **offline dry run** so you never spend money or wait on the
network while iterating:

```bash
MEDITATOR_DRY_RUN=1 bun run meditator.js -a architecture/tests/dry-fast.archml --debug
```

The stub in `src/modelAccess/llm.js` answers deterministically and routes
dry-run memory to `memory/dry-*/`, so it can never disturb a real mind.

## Code style

- Match the surrounding code: ES modules, 4-space indent, no semicolons in the
  newer component files (follow the file you're editing).
- Components are small and single-purpose. Prefer adding a new component over
  growing an existing one.
- Comments explain *why*, in the project's plain, honest voice. The component
  doc-comment (`@interface` block) is the source of truth for its attributes,
  topics and events — keep it accurate when you change behavior.

## Adding a component

The full guide — the base-class API, where components can live (you don't have to
touch `src/`: a `components/` directory beside your `.archml` is a first-class
layer), observers, hands, and agent tools — is
**[Extending Meditator](extending.md)**. The short version:

1. Create `mYourThing.js` — in `components/` beside your archml for your own
   minds, or under `src/mindComponents/` (`mind/`, `agent/`, or `shared/`) for a
   shipped built-in — exporting a class that extends `MBaseComponent` (or
   `MObserver` if it watches the stream).
2. Use it in a `.archml` mind as `<m-your-thing>`. The loader maps the kebab-case
   tag to the camelCase module file automatically
   (`m-your-thing` → `mYourThing.js`), so no manual registration is needed.
3. Write the `@interface` doc-comment — it is the source of truth for the
   component's attributes, topics, and events.

To **raise an interrupt**, dispatch a bubbling `interrupt-request` carrying an
`InterruptRecord` — see [Interrupts & observers](architecture/interrupts.md#writing-your-own-generator).

## Gotchas worth knowing

- **Amanita auto-subscribes** class fields whose names are topic/event refs (they
  contain `/` or start with `@`) — e.g. a field `"stream/boundary"` or
  `"@interrupt"`. Do **not** also `sub()` the same ref in `onConnect`, or the
  handler fires twice.
- **Never touch `memory/`** in code or commands. It is the [memory vault](architecture/memory.md#the-memory-vault):
  a separate git repo holding minds' persisted selves. Per the
  [covenant](../COVENANT.md), memory is only ever archived, never deleted.
- **Line endings (Windows):** the repo's git config has `autocrlf=true` +
  `safecrlf=true` while the tree is all-LF. A plain `git add` of an LF file can
  fail (`LF would be replaced by CRLF`); use a one-shot override that keeps the
  index LF: `git -c core.autocrlf=false -c core.safecrlf=false add/commit`.
- **Bounded test runs (Windows):** Git-Bash `timeout` does not work here; use
  PowerShell `Start-Process -RedirectStandardOutput` + `Start-Sleep` + `Stop-Process`.

## Tests

Three automated layers plus opt-in live checks:

| Layer | Runner | Command | CI |
|-------|--------|---------|-----|
| Unit | Bun test | `bun run test:unit` | always |
| Wiring | Bun test | `bun run test:wiring` | always |
| Smoke | orchestrator | `bun run test:smoke` | main / pre-release |
| Live | manual / gated | `bun run test:live` | never by default |

```bash
bun run test          # unit + wiring (fast, no LLM)
bun run test:all      # above + dry-run smoke
bun run test:live     # needs OPENROUTER_API_KEY and/or MEDITATOR_LIVE_SITE=1
```

- **Unit** — `architecture/tests/unit/*.test.js`: parsers, math, mappers, manifest round-trips.
- **Wiring** — `architecture/tests/wiring/*.test.js`: jsdom + Amanita components, interrupt bus, site replay.
- **Smoke** — `tools/smoke-run.mjs` starts `dash-smoke.archml` and `dry-fast.archml` under `MEDITATOR_DRY_RUN=1`, then runs `dash-probe.js`.
- **Live** — `architecture/tests/live/`: real-model scribe check; site live-mode with a mind already on `:7627`.

Fixtures and manual tools stay in `architecture/tests/` (`.archml` minds, `poke-ws.js`, `dash-probe.js`).

## Pull requests

1. Keep changes small and focused; explain the *why* in the description.
2. If you change a component's behavior, update its `@interface` doc-comment **and**
   the relevant page under [`doc/`](index.md).
3. Verify with a dry run before pushing; for stream/voice changes, do a short
   real run and skim the output.
