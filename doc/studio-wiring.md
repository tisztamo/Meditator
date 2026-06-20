# Studio wiring — finishing the decoupling in the browser

> **Status: a pure mesh; only the optional transport split (S4) is left.** The
> Studio UI is an [Amanita](https://www.npmjs.com/package/amanita) component mesh —
> its `<body>` is a declarative tree, exactly like a `.archml` mind. It now applies
> the mind's [decoupling principle](architecture/decoupling.md) in *both*
> directions: state flows down as topics, and commands flow up as bubbling
> `studio-command` events the hub routes ([S1](#slices)). No pane reads the hub's
> fields ([S2](#slices)), so it is swappable and mockable, and the three stray
> controls are folded in as their own mesh components ([S3](#slices)) — no
> `closest` / `getElementById` / `document.querySelector` reach-around survives.
> What is left is the *optional* split of `studio-conn` into transport + store
> ([S4](#slices), a stretch). This page documents the mesh as it stands.

See [The Studio](studio.md) for the user-facing tour and
[decoupling.md](architecture/decoupling.md) for the same principle on the mind side.

## The principle, restated for the Studio

A mind moves data in two directions and the Studio is no different:

- **State flows *down* as behaviour-value topics.** A producer publishes a topic
  about itself; consumers subscribe through a ref and get the current value
  replayed on connect. On the mind side this is `m-memory` → `tail`/`compressed`;
  in the Studio it is `studio-conn` → `roster`/`structure`/`streamFragment`/`event`.
- **Intent flows *up* as bubbling DOM events.** On the mind side a faculty never
  calls the arbiter — it dispatches a bubbling `interrupt-request` and
  [`m-interrupts`](architecture/interrupts.md) listens on its parent. The Studio's
  hub, `studio-conn`, wraps every pane in exactly the same way, so it is the
  natural listener for an analogous command event.

The reach-in this replaces —
`closest('studio-conn').querySelector(...).speak(…)`, or its shorthand
`this.el("/conn/").speak(…)` — has the three properties
[decoupling.md](architecture/decoupling.md#the-principle) names as fatal: it is
**not declared** (invisible in the markup), **not overridable**, and the lookup
returns **exactly one** match. Pub/sub down and a bubbling event up are both
fan-out/fan-in, so a second listener (a logger, a confirm gate) or a swapped hub
fall out for free.

## The mesh today

`src/studio/studio.html`'s `<body>` is a `<studio-conn name="conn">` wrapping the
header, the roster rail, the stream column, and the structure/log column. The
panes live in `src/studio/ui/` and are defined at module load by `ui/index.js`.

`studio-conn` (`ui/studioConn.js`) is the hub. It owns the single WebSocket to the
supervisor and the focus state, and it talks to the panes two ways:

- **DOWN — state, as topics.** Every supervisor message is fanned into a
  fine-grained topic so each pane subscribes to only what it draws. Amanita stores
  the value on the element and replays it to a late subscriber, so a pane gets the
  current roster/structure/projection on connect with no snapshot plumbing.

  | Topic (`/conn/…`) | Carries | Drawn by |
  |-------------------|---------|----------|
  | `connState` / `connMeta` | socket up/down + label | header, wake |
  | `roster` | the live minds | roster, header, speak |
  | `architectures` / `profiles` / `defaultProfile` / `publicPort` | wake catalog + hello | wake, header |
  | `focused` / `focusReset` / `replayResume` | focus changes + replay mode | roster, header, stream, tree, log, speak, toast |
  | `structure` | the focused mind's component tree | tree |
  | `backfill` | the ordered stream timeline (tail / delta) | stream |
  | `streamFragment` / `streamState` | live thought/speech + state | stream, header |
  | `event` | every tagged internal signal | stream, tree, header |
  | `lifecycle` | a mind's state transition | header, stream, toast, speak |
  | `log` | the child's stdout/stderr line | log, toast |
  | `youSaid` / `error` / `hidden` | local echo, errors, tab visibility | stream, toast |

- **UP — commands, as bubbling events ([S1](#slices), done).** A pane dispatches a
  bubbling `studio-command` (via the [`command(el, cmd, …)`](#the-pattern) helper in
  `ui/helpers.js`); `studio-conn` adds one listener in `onConnect` that routes
  `detail.cmd` through `run()` to the same `send()` wrappers it always had —
  `wake` / `refresh` / `focus` / `sleep` / `force` / `dismiss` / `speak`. The
  wrappers are now reached only by that listener, never across components, and the
  wire protocol is unchanged from the pre-mesh monolith.

`studio-covenant` is fully self-contained (no `/conn/` state); the DOWN-path panes
above (`studio-header`, `studio-tree`, `studio-log`, `studio-toast`,
`studio-stream`) are clean subscribers. The controls that once sat as loose markup
in the colheads are now their own mesh components: `studio-streammode` (the
fold/flow/raw toggle, publishing the mode string on `/streammode/mode`;
`studio-stream` renders folds via the leaf widget `ui/studioFold.js`),
`studio-refresh` (the rail's ⟳,
dispatching `refresh`), and `studio-panes` (the mobile column switcher, on
`/conn/focused`). With the command path inverted, the field-reads gone, and the
controls folded in, no pane reaches across the DOM.

## The gap

Three kinds of coupling were identified, all the mirror image of what the mind
migration removed. [S1](#slices), [S2](#slices) and [S3](#slices) have closed all
three.

**1. Commands were reach-in method calls — now bubbling `studio-command` events
([S1](#slices), done).** Each pane that used to call `this.el("/conn/").<method>()`
— `studio-speak`'s `speak`, `studio-roster`'s `sleep`/`force`/`dismiss`/`focus`,
`studio-wake`'s `wake`/`refresh` — now dispatches `command(this, cmd, …)`, and the
hub's `run()` listener routes it to the same wrapper.

**2. Some panes read the hub's *private fields* — now cached from their own topics
([S2](#slices), done).** `studio-speak` (`roster` / `focusedId`), `studio-stream`
(`focusedId`), and `studio-toast` (`focusedId`) each cache the value delivered by a
subscription they already held, so **nothing reads `studio-conn`'s fields** any more
— its contract is "topics out, command events in."

**3. Three controls were loose markup wired by reaching *out* of the mesh — now
each is its own component ([S3](#slices), done):**

- the flow/raw toggle was found with `closest(".col").querySelector("[data-streammode]")`;
  it is now `studio-streammode`, which owns the preference and publishes
  `/streammode/mode` for `studio-stream` to subscribe to;
- the rail's ⟳ refresh was found with `getElementById("archRefresh")`; it is now
  `studio-refresh`, which dispatches the `refresh` command directly;
- the mobile pane switcher was an inline `<script>` reaching
  `document.querySelector("main")`, `.panebar` and `studio-conn.on("focused", …)`;
  it is now `studio-panes`, which subscribes to `/conn/focused` and reaches the
  view through a declared `/view/` ref (`<main name="view">`).

## The pattern

Mirror the mind side exactly.

- **A command becomes a bubbling event.** A pane dispatches
  `new CustomEvent("studio-command", { bubbles: true, detail: { cmd, …args } })`;
  `studio-conn` adds one listener in `onConnect` that maps `detail.cmd` to its
  existing `send()` wrappers. The methods stay (they are the transport boundary);
  they are simply no longer called across components. This is the literal analogue
  of a faculty dispatching `interrupt-request` and the arbiter handling it.

  ```js
  // pane — command(el, cmd, detail) in ui/helpers.js wraps the dispatch
  command(this, "speak", { text })

  // studio-conn.onConnect()
  this.addEventListener("studio-command", e => this.run(e.detail))
  ```

- **State a pane needs comes from the topic, never the field.** A pane already
  subscribing to `/conn/focused` / `/conn/roster` caches the delivered value
  locally; the `this.el("/conn/")` reads disappear. Once they do, **nothing reads
  `studio-conn`'s fields** — its contract is "topics out, command events in," and
  it becomes swappable and mockable (a unit test drives a pane against a fake hub
  with no WebSocket), the same swappability the mind migration won for `m-memory`.

- **A stray control becomes part of the mesh** — promoted to a tiny component that
  publishes/dispatches like any other pane. `studio-streammode` owns the
  fold/flow/raw preference and publishes `/streammode/mode`; `studio-refresh` dispatches the
  `refresh` command; `studio-panes` subscribes to `/conn/focused`. (The doc once
  weighed "rendered by the owning pane" for the toggle and ⟳, but a uniform
  tiny-component split keeps the colhead layout pixel-identical and the wiring
  consistent.)

## Slices

Independently shippable and behaviour-preserving, like the mind migration's slices.
The supervisor wire protocol does **not** change in any of them.

| Slice | Status | Change | Restores |
|-------|--------|--------|----------|
| **S1 — command path** | ✅ done | Panes dispatch `studio-command` (via `command()` in `ui/helpers.js`); `studio-conn` listens once in `onConnect` and routes through `run()` to `send()`. Every `this.el("/conn/").<method>()` is gone. | *declared* commands (greppable, no hidden lookup); *fan-in* (a logger / confirm interposer can also listen) |
| **S2 — stop reading the hub's fields** | ✅ done | `studio-speak` / `studio-stream` / `studio-toast` cache `focused`/`roster` from their subscriptions. | a *swappable / mockable* hub; the last single-match reach gone |
| **S3 — fold the stray controls in** | ✅ done | flow/raw → `studio-streammode` (publishes `/streammode/mode`); ⟳ → `studio-refresh` (dispatches `refresh`); pane switcher → `studio-panes` (on `/conn/focused`, reaches `<main name="view">` via `/view/`). | a pure mesh — no `closest` / `getElementById` / `document.querySelector` reach-around |
| **S4 — (optional) split `studio-conn`** | remaining | Separate the WebSocket transport from the focus/state store, mirroring how a mind separates `m-ws` (transport) from its faculties. | clarity; an alternate transport (e.g. replay-only from the store) becomes possible |
| **S5 — docs + tests** | ✅ done | This page kept current; pane unit tests drive a fake hub (`studioHarness.js`): dispatch commands → assert sent (`studio-command.test.js`), pub topics → assert render (`studio-state.test.js`), and the folded-in controls (`studio-controls.test.js`). | the auditability the `.archml` gives a mind |

S1 and S2 were the core and shipped together; S3 folded the stray controls in and
S5 added the fake-hub tests. Only S4 — an optional stretch — is left; the doc's
"Deliberately *not* inverted" note already blesses `studio-conn` as the transport,
so the mesh is complete without it.

## Deliberately *not* inverted

As on the mind side, some direct calls are **transport/orchestrator contracts**,
not coupling smells (see [decoupling.md](architecture/decoupling.md#deliberately-not-inverted)):

- **`studio-conn`'s own `send()` and its WebSocket** — `studio-conn` *is* the
  transport, the browser counterpart of [`m-ws`](websocket-api.md): "the external
  window, not part of any one pane." After S1 the command methods are reached only
  by its own event listener, not across components.
- **Reload-focus persistence** (`getPref`/`setPref` in `studioPrefs.js`) and the
  stream's replay/reveal engine — these are wholly internal to one component, not
  cross-pane wiring.

Note that S1 is therefore a *choice*: one could argue calling the transport hub's
`speak()` is sanctioned, exactly as the arbiter's `takePending()` is. We invert it
anyway, because the mind side shows that even the orchestrator takes *commands* as
bubbling events — that is what keeps the command surface declared and the hub
swappable. Reading `conn.roster` / `conn.focusedId` (S2) has no such defence: those
are already topics.

A declarative `<m-wire from to>` connector (the Amanita-level idea
[deferred on the mind side](architecture/decoupling.md#remaining--deferred)) would
also work here, but the subscriber-ref + command-event pattern covers every case
and fits the grain — so it stays deferred for the Studio too.
