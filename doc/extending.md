# Extending Meditator — your own components

Everything a mind or an agent can do is a component: a small custom element whose
tag starts with `m-`, wired by pub/sub and bubbling events. Extending Meditator
means writing one. There is no build step, no plugin API, no registration — a
component is a plain JS file the loader finds by name.

This page covers where your components can live, and the four kinds you are most
likely to write: a faculty, an observer, a mind's hand, and an agent tool. The
repo-workflow side (style, tests, PRs) is in [Contributing](contributing.md).

## Where components live — the layers

You do **not** have to touch `src/` to add a component. The loader resolves each
requested tag (e.g. `m-my-thing` → `mMyThing.js`) against ordered layers, highest
precedence first:

| Layer | Where | When to use |
|-------|-------|-------------|
| 1. cli | `-p` / `--mind-components-path <dir>` | a deliberate one-off override (testing, a bug workaround) |
| 2. bundle | a `components/` directory **beside the running `.archml`** | **the normal place for your own components** |
| 3. env | `MIND_COMPONENTS_PATH` | a project-wide component library (the Studio sets this per external project) |
| 4. project | `./mindComponents` under the cwd | external-project convention |
| 5. built-in | `src/mindComponents/` (`mind/`, `agent/`, `shared/`) | the shipped faculties |

Two rules keep this predictable:

- **Within one layer**, two files that could answer the same tag are a **fatal
  ambiguity error** — never a silent pick.
- **Across layers**, the higher layer wins, with a WARN log — so you can shadow a
  built-in deliberately, and you will see that you did.

So the usual workflow is: put `mMyThing.js` in `components/` next to your
`.archml`, write `<m-my-thing>` in the mind, run it. The kebab-case tag maps to
the camelCase filename automatically.

**Homes stay re-executable.** When a mind persists, its home snapshots the
architecture *and* the custom components it ran with — so a vault home can be
re-run standalone, months later, without the original project directory.

## Writing a faculty component

Create `components/mYourThing.js` (or, for a shipped built-in,
`src/mindComponents/mind/mYourThing.js`) exporting a class that extends
`MBaseComponent`:

```js
// import the base class by relative path from wherever your file lives, e.g.
// from architecture/lab/components/ it is ../../../src/mindComponents/shared/…
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js"

export class MYourThing extends MBaseComponent {
  onConnect() {
    this.sub(this.attr("src") || "/stream/chunk", chunk => { /* … */ })
  }
}
```

What the base class gives you:

- `this.attr(name)` — read an attribute.
- `this.env(name)` — read an attribute inherited from an ancestor (this is how
  `model` / `utilityModel` propagate down from `<m-mind>`).
- `this.sub(topicRef, handler)` / `this.pub(topic, value)` — pub/sub.
- `this.getPrompt()` — the element's prompt text (attribute, `<m-prompt>` child,
  or content).
- DOM helpers (`querySelector`, `closest`) — components find each other by tag.

Keep components small and single-purpose; prefer a new component over growing an
existing one. The `@interface` doc-comment at the top of every shipped component
is the source of truth for its attributes, topics, and events — write one for
yours, and read a few (e.g. `mTimeout.js`, `mNote.js`, `mReadFile.js`) before
starting; they are the real tutorial.

## Writing an observer

An observer watches the stream without being part of it. Extend `MObserver`
(`src/mindComponents/mind/mObserver.js`), which handles the watching plumbing;
your job is to decide when what you saw deserves the mind's attention — and then
**raise an interrupt**: dispatch a bubbling `interrupt-request` event carrying an
`InterruptRecord` with your prompt and a salience. The generator knows why it
fired, so it brings its own salience; the arbiter applies thresholds mechanically.
See [Interrupts & observers](architecture/interrupts.md#writing-your-own-generator)
for the record's fields and a worked example.

This is the deepest extension seam in the project: *anything* can be a stimulus
source — a sensor, a feed, another program — as long as it can score its own
salience honestly.

## Writing a hand (for a mind)

A **hand** gives a mind a way to affect the world without ever showing it a tool.
A hand is a leaf component nested inside [`<m-act>`](architecture/components.md#m-act);
it registers itself with its parent on connect and offers one **capability** —
name, description, parameters, and a `readonly` flag:

```html
<m-act name="act">
  <m-note name="note"></m-note>       <!-- shipped example: leave a note -->
  <m-your-hand name="reach"></m-your-hand>
</m-act>
```

The mind never calls your hand. It *wonders*; `m-act` notices the wondering,
realizes it backstage through your capability, and the result returns later as a
first-person sensation. Two design rules keep hands honest and safe (see
[efference](architecture/efference.md)):

- **The consequence, not the deed.** Return what the mind should *feel* — "I set
  it down; it is kept" — not machinery detail. Fire it as a consequence with a
  salience so it re-enters the mind's attention.
- **Structural guardrails.** A hand that changes the world carries its own
  containment — `m-note`, for instance, never lets the model choose a path; it
  appends to one file in one allow-listed directory. Make the blast radius
  auditable by reading the archml.

Read `src/mindComponents/shared/mNote.js` and `mLook.js` — each is a complete
worked example in under two screens.

## Writing an agent tool

An **agent tool** is the same capability object with the opposite harness: the
model sees it, calls it, and reads the raw result. A tool is a leaf component that
bubbles a `capability` event on connect; the enclosing
[`<m-agent>`](agents.md#tools) catches it and offers the schema to the model —
zero kernel changes.

`src/mindComponents/agent/mReadFile.js` is the extensibility proof — the whole
story in ~40 lines:

- declare the function schema (name, description, parameters) — schema validation
  is enforced by the kernel (`toolSchema.js`), not by you;
- implement the call, returning an observation string (or a clean error string —
  never throw at the model);
- contain it: the file tools resolve every path against a `root` and refuse
  escapes (`fileTool.js` has the helpers).

Drop it in an agent with one line of archml. The same component works in any
agent, and — because a capability is one shared shape — a well-factored ability
can serve as an agent tool and a mind's hand with only its harness differing.

## Testing your component

- **Dry-run first**: `MEDITATOR_DRY_RUN=1 bun meditator.js -a your.archml --debug`
  exercises the whole loop offline; `--debug=mYourThing.js` narrows the logs.
- **Wiring tests** (`architecture/tests/wiring/`) run components under jsdom with
  the real pub/sub — the right place to test topic contracts.
- **Unit tests** (`architecture/tests/unit/`) for any pure logic you extracted.

See [Contributing → Tests](contributing.md#tests) for the layers and commands.

## Gotchas

- **Amanita auto-subscribes** class fields whose names are topic/event refs
  (containing `/` or starting with `@`). Do not also `sub()` the same ref in
  `onConnect`, or the handler fires twice.
- **Auto-subscribed field rejections are uncaught** — if a `"ref"=fn` field's
  target may not resolve, subscribe explicitly with `.sub(...).catch(...)`.
- **Fire events for signals, publish topics for state.** Event-shaped signals
  (`@event`) are not deduped; retained topics replay their last value to late
  subscribers. Choosing wrong is the most common wiring bug.
- **Never touch `memory/`** in code — it is the
  [memory vault](architecture/memory.md#the-memory-vault), covered by the
  [covenant](../COVENANT.md).
