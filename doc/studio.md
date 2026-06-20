# The Studio

The Studio is an integrated environment for tending minds. Run it once and, from
the browser, you can **wake** any architecture, watch a **roster** of live minds,
**focus** one to see its stream and structure, **speak** to it, and put it to
**sleep** with the proper ritual — without ever opening a terminal for a mind.

```bash
bun run studio.js          # then open http://localhost:7600
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

The stream header has a **fold / flow / raw** toggle (a click cycles through them,
remembered in `localStorage`):

- **fold** (default) — a mind thinks faster than you can read, so an unbroken run of
  thinking gathers into one **fixed-height block that holds its place** instead of
  scrolling the column past you. While the run is live the fold shows its **opening**
  (anchored, so the top never moves) and the **latest words ghosting** along the
  bottom, with a breathing marker and a running `bursts · words · time` count. When a
  landmark closes it, it settles to its **beginning** — and, for a longer run, its
  **end** — drawn verbatim from the run's own words (no model call, nothing
  paraphrased); click it to read the whole run. **Speech, stimuli and images never
  fold** — they stay full size, so one glance down the column tells you where the mind
  spoke and what reached it. This is the calm way to watch a fast mind.
- **flow** — the mind thinks in discrete bursts on a fixed tick, but the Studio
  buffers each burst and reveals it at a metered rate that drains over about one tick
  (learned from the `mind/pace` telemetry). The text trickles out continuously instead
  of dumping, and the burst boundary becomes a barely-visible inline seam — so what you
  watch reads as one unbroken monologue.
- **raw** — fragments append the instant they arrive and each boundary is a
  full-width divider. The unsmoothed truth, useful for debugging cadence.

## Coming back: persistence and instant replay

The Studio records each mind's stream so that **reloading the page, switching away
and back, or restarting the supervisor never re-streams the backlog at you**. The
supervisor keeps, per wake (a *session*), an ordered, sequence-numbered log of the
stream — thought and speech runs interleaved with stimuli, burst seams, speaking
transitions and image placements — in a small SQLite database under `.run/studio/`
(it is supervisor-owned observability, **not** mind memory; the vault is never
touched).

When you focus a mind, the browser tells the supervisor how far it has already
rendered, and the supervisor replies with the **current projection** (structure +
latest telemetry, to rehydrate the header and tree) and **one backfill batch** of
the stream — the recent window on a fresh load, or just the delta you missed on a
live reconnect. The stream pane paints that batch in a single synchronous pass, so
it appears at once instead of being animated token by token. The flow/raw reveal
only ever animates genuinely *live* text; a backgrounded tab appends instantly so
nothing piles up behind a throttled animation frame. The live view is bounded
(older blocks are dropped from the top once it grows past ~120k characters), but
nothing is lost — a reload repaints the recent window from the log.

**Generated images are retained.** Their bytes are written to disk
(`.run/studio/images/<home>/`) and served by a stable URL (`/studio/image/<id>`),
so the stream carries a light reference rather than a megabyte of inline data, and
the images are still there after a restart and the next day. The log keeps
everything by default — `.run/` is gitignored; prune it by hand if it ever grows
too large.

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
- The Studio opens a WebSocket to the child's port, persists its stream to an
  ordered per-session log (SQLite under `.run/studio/`), keeps the latest of every
  signal as a projection, and relays everything to focused browsers — so focusing
  or reloading reconstitutes a mind instantly from a single backfill batch rather
  than a re-animated replay.
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

The internal wiring — the full topic vocabulary, and the in-progress migration of
the command path from reach-in method calls to bubbling events (the same
[decoupling](architecture/decoupling.md) the mind completed) — is detailed in
[Studio wiring](studio-wiring.md).

Implementation: [`src/studio/server.js`](../src/studio/server.js) (supervisor),
[`src/studio/studio.html`](../src/studio/studio.html) (the page — an importmap and a
declarative component tree), and [`src/studio/ui/`](../src/studio/ui/) (the components).
