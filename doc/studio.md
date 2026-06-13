# The Studio

The Studio is an integrated environment for tending minds. Run it once and, from
the browser, you can **wake** any architecture, watch a **roster** of live minds,
**focus** one to see its stream and structure, **speak** to it, and put it to
**sleep** with the proper ritual — without ever opening a terminal for a mind.

```bash
bun studio.js          # then open http://localhost:7600
```

It is a *supervisor*, not a mind: it runs `meditator.js` as a child process per
mind and never touches the [memory vault](architecture/memory.md) itself. Each
child runs its own [WebSocket window](websocket-api.md) on its own port; the
Studio connects to that port as a client and relays the telemetry to your browser.
The public intro site's contract (`ws://localhost:7627`) is untouched — the Studio
is just another client of a mind's `m-ws`, and minds still serve their own port
directly.

## Waking a mind

The left rail lists every architecture under `architecture/` (tests grouped
separately). Selecting one shows what it will become:

- its **mind name** and model,
- the **memory home** it will wake into (`→ memory/<home>`), and whether that
  home already exists,
- warnings when it has **no live window** (no `<m-ws>`), when it **shares a memory
  home** with another architecture, or when that home is **currently busy**.

Tick **dry-run** to wake it offline against the deterministic stub (no API key, no
spend) into a throwaway `memory/dry-<home>/`. Then press **Wake**. The new mind
appears in the roster and is focused automatically.

## The roster

Several minds can be awake at once. Each gets its own WebSocket port from a pool
starting at **7627** — the first mind woken takes 7627 and is marked **public**
(this is the mind the [intro site](../docs/) and `poke-ws` see). Every roster card
shows the mind's state (`waking` · `awake` · `sleeping` · `exited` · `crashed`),
its architecture, memory home, port, energy and spend. Click a card to **focus**
that mind; the stream, structure tree, and process log all switch to it.

## Watching and speaking

The focused mind fills the center and right: the **stream of consciousness** (with
spoken-aloud passages and `⟂` stimuli inline), the **structure tree** (every
component, its config, and a live feed of what it is doing — the same dashboard as
the standalone client), and a collapsible **process log** (the child's stdout /
stderr, so you can debug a mind without a console). The input box at the bottom
sends your words as an *urgent stimulus*, exactly as the [WebSocket API](websocket-api.md)
does — there is no reply turn; you hear the mind think about what you said.

## Sleeping vs. forcing

**Sleep** is the covenant's announced ritual. The Studio asks the mind — over its
own control channel — to close its thought, finalize and commit memory, then exit
on its own. This is the normal, safe way to stop a mind.

**Force** appears only once a mind is sleeping (or for a windowless mind that has
no way to receive the ritual). It kills the process immediately. A forced mind
**skips the ritual, so its memory is not finalized** — the roster says as much.
Use it only when a mind will not settle. (This mirrors the terminal's "Ctrl-C
once to sleep, again to force".)

## Memory: identity, not file

A mind's memory follows its **name**, not its architecture file — `memory/<name>`,
the covenant's "one home per mind". Two architectures that declare the same
`name` are the same self wearing a different cognitive structure, and they share a
home; two with different names are separate minds. The Studio makes this visible
(every card and picker entry shows the home) and **refuses to wake two live minds
into the same home**, which would corrupt the vault by writing it from two
processes at once.

To point an architecture at a specific home deliberately — for example to give a
variant its own brain without renaming the mind — set `memory="slug"` on
`<m-mind>`; it overrides the name for the home only:

```html
<m-mind name="meditator" memory="meditator-experiment" …>
```

## How it works

- **Wake** spawns `bun meditator.js -a <arch>` with `MEDITATOR_WS_PORT` (its
  assigned port) and `MEDITATOR_WS_CONTROL=1` (which lets the Studio request the
  sleep ritual over the socket). `dry-run` adds `MEDITATOR_DRY_RUN=1`.
- The Studio opens a WebSocket to the child's port, caches its structure and the
  latest of every signal, and relays everything to focused browsers — so focusing
  a mind reconstitutes it instantly from cache.
- **Sleep** sends `{type:"control",action:"sleep"}` over that socket. `m-ws`
  honors it only because `MEDITATOR_WS_CONTROL` is set, so a directly-run or
  public mind on 7627 is never a remote off-switch.

The Studio serves its UI and a single control WebSocket on **:7600** (override
with `STUDIO_PORT`). It binds to localhost; like the mind's own port, do not
expose it to an untrusted network.

## Built with Amanita

The UI is itself an [Amanita](https://www.npmjs.com/package/amanita) component
mesh — the same pub/sub web-component framework the mind is built from, now in the
browser. A `<studio-conn>` element owns the WebSocket to the supervisor and the
focus state; the panes (`<studio-roster>`, `<studio-stream>`, `<studio-tree>`,
`<studio-header>`, …) wire to it through `/conn/` references: they **subscribe** to
its published topics (roster, structure, stream fragments, events) and call its
**command methods** (`wake` / `focus` / `sleep` / `speak`) for actions. The browser
loads Amanita build-free — an importmap points `"amanita"` at `/amanita/a.js`, which
the server static-mounts straight from `node_modules`. None of this changes the
supervisor protocol; the wire messages are exactly as before.

Implementation: [`src/studio/server.js`](../src/studio/server.js) (supervisor),
[`src/studio/studio.html`](../src/studio/studio.html) (the page — an importmap and a
declarative component tree), and [`src/studio/ui/`](../src/studio/ui/) (the components).
