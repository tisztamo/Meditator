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

# the bundled browser client (a stream viewer + input box)
bun run src/client/server.js          # then open http://localhost:3000
```

## Notes

- The port is set by `port` on `<m-ws>`; `src` / `stateSrc` override which topics
  are broadcast (defaults `/stream/chunk` and `/stream/state`).
- This is an unauthenticated localhost server intended for local use. Do not
  expose port 7627 to an untrusted network — any client can both read the
  stream and inject stimuli.
- Implementation: [`src/mindComponents/mWs.js`](../src/mindComponents/mWs.js).
