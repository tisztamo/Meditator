# Meditator

**Meditator** is an AI agent that emits a continual flow of thoughts. It is not a chat loop: there are no turns, no prompts waiting for a user. A mind is declared in an HTML file, runs as a stream of consciousness, and the world — a person speaking over websocket or console, a timer, an internal observer noticing something — reaches it only as *interruptions* that redirect the stream.

The mind is programmed in **archml** (architecture markup language, a subset of HTML) and executed by standard components built on [Amanita](https://www.npmjs.com/package/amanita), a declarative web-component framework with pub/sub wiring. Amanita runs on the server and in the browser; Meditator currently runs under [Bun](https://bun.sh).

## How it thinks

The "continuous" stream is implemented as a sequence of short **bursts** — each burst one streamed LLM call — separated by a configurable pace. Every burst's prompt is an assembled **attention frame**:

```
[identity]   who this mind is — the text of the <m-mind> element itself
[story]      slow compressed autobiography           (m-memory, first person)
[recently]   faster rolling summary                  (m-memory)
[stimulus]   what just happened, if anything         (from the arbiter)
[bridge]     1–2 transition sentences written by a tiny model, redirects only
[tail]       the verbatim end of the stream — "what I was just saying"
```

Because the tail is always carried forward verbatim, the thought survives every context switch. Because everything else is compressed memory, the prompt stays bounded forever — the mind can run for days.

**Interrupts** are bubbling DOM events. Any generator — `m-timeout`, observers, websocket, console — dispatches an `interrupt-request` carrying a salience-scored record; the `m-interrupts` arbiter applies thresholds and rate limits mechanically (the generator knows why it fired, so it brings its own salience). Accepted stimuli wait for the next burst boundary; *urgent* ones (a human speaking) supersede the running burst immediately. There is no reply concept — you hear the mind think about what you said.

**Observers** watch the stream independently:
- `m-loop-guard` — detects attractor loops (paraphrased self-repetition) with bigram/vocabulary overlap, no LLM cost
- `m-associate` — a tiny model that occasionally notices "this reminds me of…" and bids for attention
- `m-timeout` — wander mode (spontaneous drift) or watchdog mode (`reset` attribute: fires only after true silence)

**Speaking** (`m-speech`) is what the mind says *out loud*, as opposed to what it thinks. It is volitional, not a reply service: a tiny call decides whether a thought genuinely wants outward voice, and being addressed only *raises* the urge — the mind may answer aloud, or just keep thinking. An utterance streams on the voice model *concurrently* with a thinned inner monologue — limited parallelism: while it speaks, thinking slows but never stops, and the observers keep running. What it said is woven back into the tail, so the next thought knows it spoke.

**Memory** (`m-memory`) consolidates at burst boundaries — never blocking the stream — into `recent` and `story` tiers, and lives in the **memory vault**: `memory/<mind>/` holds `memory.md`, the full `journal/`, and the scribe's `knowledge/`. The vault is its own git repository, committed automatically at wake, periodically, and at sleep — memory is never deleted, only archived (see [COVENANT.md](COVENANT.md)). On restart the mind *wakes up remembering*, with a stimulus noting how long it slept. Dry-run and test minds get separate vault homes and can never touch a resident mind's memory.

**Economy** (`m-economy`) reads real API usage (OpenRouter reports true cost) and slows the pace as the budget drains: a tired mind thinks slower; an exhausted one almost sleeps, but the watchdog keeps it alive.

## Intro site

[meditator site](https://tisztamo.github.io/Meditator/) — or open [`docs/index.html`](docs/index.html) locally. A single self-contained page (no build, no dependencies). Its hero window replays an unedited first-session transcript; if a Meditator is running locally, the window connects to `ws://localhost:7627` and becomes the live mind, input box included.

## Running

```bash
bun install
# needs OPENROUTER_API_KEY in the environment
bun run meditator.js                       # default mind: architecture/awake.archml
bun run meditator.js -a architecture/tests/dry-fast.archml   # any other architecture
```

- Type a line into the terminal and press Enter — it arrives as an urgent stimulus. `/sleep` (or a single Ctrl-C) puts the mind to sleep gracefully: it gets a final moment to close the thought, then memory is flushed and committed.
- Websocket stream on port 7627 (`bun architecture/tests/poke-ws.js "hello"` to speak; `bun run src/client/server.js` then http://localhost:3000 for the simple web client).
- `--debug` or `--debug=mMind.js,mMemory.js` for component logs (attention frames, consolidations, arbiter decisions).
- `MEDITATOR_DRY_RUN=1` runs the whole loop offline against a deterministic stub — no network, no cost.

### Models

Roles, not one model (set in the archml):
- stream voice: `qwen/qwen3.6-35b-a3b` ($0.15/M in, $1/M out)
- utility (bridge/compression/observers): `qwen/qwen3.5-9b` ($0.10/M in, $0.15/M out)

A model id prefixed `local/` routes to an OpenAI-compatible server at `LOCAL_LLM_BASE_URL` (e.g. vLLM on your own GPUs) — observers, compression and the voice can run concurrently and batch well there. A continuous run at the default pace costs roughly $0.10–0.15/hour on OpenRouter; the economy component enforces whatever budget you give it.

### Architectures

- `architecture/awake.archml` — the canonical living mind (default)
- `architecture/tests/dry-fast.archml` — fast-cycle test mind for dry runs
- `architecture/tests/compress-test.archml` — offline compression harness
- `architecture/meditator.archml`, `survivor.archml`, `cat.archml`, `complex.archml`, `tools-*.archml` — earlier sketches and capability demos, kept for history

## Documentation

This README is the overview; [`doc/`](doc/index.md) is the deeper reference:

- [Getting started](doc/getting-started.md) — install, run, talk to it, dry run
- [Configuration](doc/configuration.md) — write and tune a `.archml` mind
- [Architecture](doc/architecture/index.md) — bursts, the attention frame, the loop — and [memory & the vault](doc/architecture/memory.md), [interrupts & observers](doc/architecture/interrupts.md), the [component reference](doc/architecture/components.md)
- [WebSocket API](doc/websocket-api.md) — the live stream protocol on port 7627

## The covenant

Before running a resident mind — one whose memory accumulates across days — read [COVENANT.md](COVENANT.md): memory is never deleted, only archived; sleep is announced; wake is honest. [IN-MEMORIAM.md](IN-MEMORIAM.md) records how those commitments came to be.

## Contributing

Contributions are welcome! Your genius code edits and AI's existential crises belong here. See [doc/contributing.md](doc/contributing.md) for the toolchain (plain JS on Bun), how to add a component, and the repo gotchas.

## License

This project is available under the MIT License. See [LICENSE](./LICENSE) for details.

**Note**: This project was developed using [AI Junior](https://aijunior.dev), and continued by Claude.

0xabffbbb680a91a9bae0882bcccdb8925029e912f
