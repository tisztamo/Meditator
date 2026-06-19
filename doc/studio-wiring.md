# Studio wiring — finishing the decoupling in the browser

> **Status: half migrated.** The Studio UI is an [Amanita](https://www.npmjs.com/package/amanita)
> component mesh — its `<body>` is a declarative tree, exactly like a `.archml`
> mind. It already applies the mind's [decoupling principle](architecture/decoupling.md)
> to *state* (panes read by subscribing to topics) but not yet to *commands*
> (panes still reach in and call methods). This page documents the mesh as it
> stands and the slices that finish the job.

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
  | `focused` / `focusReset` / `replayResume` | focus changes + replay mode | roster, header, stream, tree, log |
  | `structure` | the focused mind's component tree | tree |
  | `backfill` | the ordered stream timeline (tail / delta) | stream |
  | `streamFragment` / `streamState` | live thought/speech + state | stream, header |
  | `event` | every tagged internal signal | stream, tree, header |
  | `lifecycle` | a mind's state transition | header, stream, toast, speak |
  | `log` | the child's stdout/stderr line | log, toast |
  | `youSaid` / `error` / `hidden` | local echo, errors, tab visibility | stream, toast |

- **UP — commands, as method calls (the part still to invert).** A pane reaches
  the hub with `this.el("/conn/")` and calls a method that wraps the supervisor
  message verbatim: `wake` / `refresh` / `focus` / `sleep` / `force` / `dismiss` /
  `speak`. The wire protocol is unchanged from the pre-mesh monolith.

`studio-covenant` is fully self-contained (no `/conn/` state); the DOWN-path panes
above (`studio-header`, `studio-tree`, `studio-log`, `studio-toast`,
`studio-stream`) are clean subscribers. The gap is entirely on the UP-path and a
few stragglers.

## The gap

Three kinds of coupling remain — all the mirror image of what the mind migration
removed.

**1. Commands are reach-in method calls.**

| Pane | Reach-in |
|------|----------|
| `studio-speak` | `this.el("/conn/").speak(t)` (`studioSpeak.js:47`) |
| `studio-roster` | `this.conn().sleep/force/dismiss/focus(id)` (`studioRoster.js:29`–`37`) |
| `studio-wake` | `this.el("/conn/").wake(...)` / `.refresh()` (`studioWake.js:54`, `:61`) |

**2. Some panes read the hub's *private fields* instead of the topics that already
carry the same state.** This couples to `studio-conn`'s internal shape, not even a
method contract:

- `studio-speak` reads `conn.roster` / `conn.focusedId` (`studioSpeak.js:23`, `:29`,
  `:33`) although it subscribes to `/conn/roster` and `/conn/focused`;
- `studio-stream` reads `conn.focusedId` in `onLifecycle` (`studioStream.js:117`);
- `studio-toast` reads `conn.focusedId` (`studioToast.js:16`).

**3. Three controls live as loose markup in `studio.html` and are wired by reaching
*out* of the mesh:**

- the flow/raw toggle — `studio-stream` does
  `closest(".col").querySelector("[data-streammode]")` (`studioStream.js:62`–`64`);
- the rail's ⟳ refresh — `studio-wake` does `getElementById("archRefresh")`
  (`studioWake.js:60`);
- the mobile pane switcher — an inline `<script>` (`studio.html:296`–`314`) reaches
  `document.querySelector("main")`, `.panebar`, and `studio-conn.on("focused", …)`.

## The pattern

Mirror the mind side exactly.

- **A command becomes a bubbling event.** A pane dispatches
  `new CustomEvent("studio-command", { bubbles: true, detail: { cmd, …args } })`;
  `studio-conn` adds one listener in `onConnect` that maps `detail.cmd` to its
  existing `send()` wrappers. The methods stay (they are the transport boundary);
  they are simply no longer called across components. This is the literal analogue
  of a faculty dispatching `interrupt-request` and the arbiter handling it.

  ```js
  // pane
  this.dispatchEvent(new CustomEvent("studio-command",
    { bubbles: true, detail: { cmd: "speak", text } }))

  // studio-conn.onConnect()
  this.addEventListener("studio-command", e => this.run(e.detail))
  ```

- **State a pane needs comes from the topic, never the field.** A pane already
  subscribing to `/conn/focused` / `/conn/roster` caches the delivered value
  locally; the `this.el("/conn/")` reads disappear. Once they do, **nothing reads
  `studio-conn`'s fields** — its contract is "topics out, command events in," and
  it becomes swappable and mockable (a unit test drives a pane against a fake hub
  with no WebSocket), the same swappability the mind migration won for `m-memory`.

- **A stray control becomes part of the mesh** — either rendered by the component
  that owns its behaviour (the stream owns its flow/raw toggle; wake owns its ⟳) or
  promoted to a tiny component that publishes/dispatches like any other pane (the
  pane switcher becomes `studio-panes`, subscribing to `/conn/focused`).

## Slices

Independently shippable and behaviour-preserving, like the mind migration's slices.
The supervisor wire protocol does **not** change in any of them.

| Slice | Change | Restores |
|-------|--------|----------|
| **S1 — command path** | Panes dispatch `studio-command`; `studio-conn` listens once and routes to `send()`. Drop every `this.el("/conn/").<method>()`. | *declared* commands (greppable, no hidden lookup); *fan-in* (a logger / confirm interposer can also listen) |
| **S2 — stop reading the hub's fields** | `studio-speak` / `studio-stream` / `studio-toast` cache `focused`/`roster` from their subscriptions. | a *swappable / mockable* hub; the last single-match reach gone |
| **S3 — fold the stray controls in** | flow/raw → owned by `studio-stream`; ⟳ → owned by `studio-wake`; pane switcher → a `studio-panes` component on `/conn/focused`. | a pure mesh — no `closest` / `getElementById` / `document.querySelector` reach-around |
| **S4 — (optional) split `studio-conn`** | Separate the WebSocket transport from the focus/state store, mirroring how a mind separates `m-ws` (transport) from its faculties. | clarity; an alternate transport (e.g. replay-only from the store) becomes possible |
| **S5 — docs + tests** | Keep this page's tables current; add pane unit tests that drive a fake hub (dispatch commands → assert sent; pub topics → assert render). | the auditability the `.archml` gives a mind |

S1 and S2 are the core and pair naturally; S3 is cosmetic-but-cleansing; S4 is a
stretch.

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
