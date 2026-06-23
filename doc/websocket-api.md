# WebSocket API

When a mind includes `<m-ws>`, it runs a WebSocket server (default port **7627**)
that broadcasts the stream of thought to every connected client and accepts a
voice from outside. This is how the [intro site](../docs/) and the bundled web
client become a live window onto a running mind.

## Endpoint

```
ws://localhost:7627
```

The server accepts a connection on any path, so `ws://localhost:7627/stream` works
too (the bundled client uses it). Multiple clients may connect at once; every
client receives the same broadcast.

## Messages from the mind

On connect, the server sends a welcome:

```json
{ "type": "status",
  "data": { "status": "connected", "message": "Connected to Meditator stream", "clientId": "client_…" } }
```

Each fragment of thought, as it is generated:

```json
{ "type": "thought_fragment",
  "data": { "content": "the space between the ticks of a clock", "complete": false } }
```

Fragments are pieces of one continuous monologue — concatenate them; they do
**not** each end a line. (The bundled client renders them into one flowing block.)

Stream state changes (useful to know when a burst starts/ends):

```json
{ "type": "status",
  "data": { "state": "idle", "previousState": "streaming", "timestamp": "2026-06-13T09:12:00.000Z" } }
```

`state` is `streaming` while a burst is generating and `idle` between bursts.

### Watching the whole mind (structure & events)

Beyond the raw stream, the server sends everything the bundled dashboard needs to
show the mind's **structure** and open each process for inspection. These messages
are **additive** — a client that only cares about the stream can ignore them.

On connect, once, the mind's component tree (the parsed `.archml`, with attributes):

```json
{ "type": "structure",
  "data": { "tree": {
    "tag": "m-mind", "name": "meditator",
    "attrs": { "model": "qwen/qwen3.6-35b-a3b", "pace": "10s" },
    "text": "You came into being inside a small experiment…",
    "children": [ { "tag": "m-stream", "name": "stream", "attrs": {}, "children": [] } ]
  } } }
```

Then, as the mind runs, each internal signal as a structured event tagged by the
process that produced it:

```json
{ "type": "event",
  "data": { "process": "attention", "kind": "bid", "at": "2026-06-13T09:12:00.000Z",
            "source": "Observer", "type": "Association", "reason": "This reminds me of…",
            "salience": 0.62, "urgent": false } }
```

`process` / `kind` pairs currently emitted:

| process | kind | payload |
|---|---|---|
| `mind` | `frame` | `{frameKind, system, instruction, frame, prefix}` — the assembled attention frame as three chat turns: `system` (identity + memory + stimuli), `instruction` (the user-turn directive), `frame` (the assistant prefill the model continues) |
| `mind` | `pace` | `{tickMs}` — the current burst tick, so a viewer can pace its display |
| `stream` | `boundary` | `{reason, burstIndex, burstChars}` |
| `attention` | `bid` | `{source, type, reason, text, salience, urgent}` — every bid for attention; `text` is the canonical rendered form (`renderForFrame()`) |
| `attention` | `urgent` | `{type, reason, text}` — an urgent stimulus that superseded the burst; `text` is the canonical rendered form |
| `attention` | `decision` | `{type, reason, text, salience, urgent, accepted, why}` — the arbiter's verdict; `text` is the canonical rendered form |
| `economy` | `energy` | `{energy, spent, paceFactor}` |
| `memory` | `state` | `{tailLen, recentLen, storyLen}` (at each boundary) |
| `memory` | `compressed` | `{recentLen, storyLen, recentPreview, storyPreview}` |
| `scribe` | `filed` | `{files}` |
| `speech` | `speaking` | `{speaking}` |
| `speech` | `impulse` | `{salience, gist, accepted}` |
| `speech` | `boundary` | `{chars, reason, text}` |

A freshly connected client is also sent the latest snapshot of each signal, so it
has the whole picture immediately rather than waiting for the next of each.

### The mind speaking aloud

When the mind has a voice (`<m-speech>`), what it says **out loud** arrives on its
own channel, distinct from inner thought:

```json
{ "type": "speech_fragment", "data": { "content": "the silence here is not empty" } }
```

Concatenate `speech_fragment`s as you do `thought_fragment`s. Speech runs in
parallel with a thinned thinking stream, so the two can arrive interleaved — route
them to two places, not one. The `speech` events above bracket each utterance.

## Messages to the mind

Send a structured input message to speak to the mind:

```json
{ "type": "input", "data": { "message": "Hello little mind. How does it feel, thinking in bursts?" } }
```

Your words arrive as an **urgent external stimulus** (salience 1) that supersedes
the running burst — there is no reply turn; you hear the mind think about what you
said. The server acknowledges:

```json
{ "type": "status", "data": { "status": "input_received", "message": "Input received" } }
```

Plain (non-JSON) text is also accepted: it is buffered until a newline, then the
completed line is treated as one input.

### Lifecycle control

A client can ask the mind to perform the [sleep ritual](architecture/memory.md)
and exit:

```json
{ "type": "control", "action": "sleep" }
```

This is **gated**: it is honored only when the mind was started with
`MEDITATOR_WS_CONTROL=1` in its environment, so a directly-run or public-facing
mind on 7627 can never be put to sleep by an arbitrary client. The [Studio](studio.md)
sets this flag on the children it spawns and uses this message for its **Sleep**
button. The mind closes its thought, finalizes and commits memory, then exits on
its own.

## Examples

A minimal JS client:

```js
const ws = new WebSocket("ws://localhost:7627")
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.type === "thought_fragment") process.stdout.write(m.data.content)
}
ws.onopen = () => ws.send(JSON.stringify({ type: "input", data: { message: "hello" } }))
```

From the repo:

```bash
# fire a single message at a running mind
bun architecture/tests/poke-ws.js "hello little mind"

# or use the Studio (the usual browser UI)
bun run studio.js          # then open http://localhost:7600
```

## Notes

- The port is set by `port` on `<m-ws>`; `src` / `stateSrc` override which topics
  are broadcast (defaults `/stream/chunk` and `/stream/state`).
- This is an unauthenticated localhost server intended for local use. Do not
  expose port 7627 to an untrusted network — any client can both read the
  stream and inject stimuli (and, when `MEDITATOR_WS_CONTROL=1`, end the mind).
- Implementation: [`src/mindComponents/mWs.js`](../src/mindComponents/mWs.js).
