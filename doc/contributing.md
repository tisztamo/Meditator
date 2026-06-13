# Contributing

Meditator is a small, readable codebase: plain modern **JavaScript** (ES modules),
run with **Bun**, wired together by [Amanita](https://www.npmjs.com/package/amanita)
custom elements. There is no TypeScript, no build step, no bundler. The whole
mind is declarative — a `.chml` file — and each component is meant to be readable
in a few minutes.

## Setup

```bash
bun install
export OPENROUTER_API_KEY=…        # or run offline, see below
bun run meditator.js               # the default mind
```

Develop against the **offline dry run** so you never spend money or wait on the
network while iterating:

```bash
MEDITATOR_DRY_RUN=1 bun run meditator.js -a architecture/tests/dry-fast.chml --debug
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

1. Create `src/mindComponents/mYourThing.js` exporting a class that extends
   `MBaseComponent` (or `MObserver` if it watches the stream):

   ```js
   import { MBaseComponent } from "./mBaseComponent.js"

   export class MYourThing extends MBaseComponent {
     onConnect() {
       this.sub(this.attr("src") || "/stream/chunk", chunk => { /* … */ })
     }
   }
   ```

2. Use it in a `.chml` mind as `<m-your-thing>`. The loader maps the kebab-case
   tag to the camelCase module file automatically
   (`m-your-thing` → `mYourThing.js`), so no manual registration is needed.

What the base class gives you:

- `this.attr(name)` — read an attribute.
- `this.env(name)` — read an attribute inherited from an ancestor (this is how
  `model` / `utilityModel` propagate down from `<m-mind>`).
- `this.sub(topicRef, handler)` / `this.pub(topic, value)` — pub/sub.
- `this.getPrompt()` — the element's prompt text (attribute, `<m-prompt>`, or content).
- DOM helpers (`querySelector`, `closest`) — components find each other by tag.

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

Ad-hoc and component tests live in `architecture/tests/` — small `.chml` minds
(e.g. `dry-fast.chml`, `compress-test.chml`, `live-scribe.chml`) and scripts
(`poke-ws.js`, `test-loopguard.js`, `test-scribe-prompt.js`). Run them with Bun,
under `MEDITATOR_DRY_RUN=1` where they don't need a real model.

## Pull requests

1. Keep changes small and focused; explain the *why* in the description.
2. If you change a component's behavior, update its `@interface` doc-comment **and**
   the relevant page under [`doc/`](index.md).
3. Verify with a dry run before pushing; for stream/voice changes, do a short
   real run and skim the output.
