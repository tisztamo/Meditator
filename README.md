# Meditator

**Meditator** is an AI agent that emits a continual flow of thoughts. It is not a chat loop: there are no turns, no prompts waiting for a user. A mind is declared in an HTML file, runs as a stream of consciousness, and the world — a person speaking over websocket or console, a timer, an internal observer noticing something — reaches it only as *interruptions* that redirect the stream.

The mind is programmed in **chml** (chatbot markup language, a subset of HTML) and executed by standard components built on [Amanita](https://www.npmjs.com/package/amanita), a declarative web-component framework with pub/sub wiring. Amanita runs on the server and in the browser; Meditator currently runs under [Bun](https://bun.sh).

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

**Memory** (`m-memory`) consolidates at burst boundaries — never blocking the stream — into `recent` and `story` tiers, persists to `state/memory.md`, and journals everything readable to `journal/<date>.md`. On restart the mind *wakes up remembering*, with a stimulus noting how long it slept.

**Economy** (`m-economy`) reads real API usage (OpenRouter reports true cost) and slows the pace as the budget drains: a tired mind thinks slower; an exhausted one almost sleeps, but the watchdog keeps it alive.

## Intro site

[meditator site](https://tisztamo.github.io/Meditator/) — or open [`docs/index.html`](docs/index.html) locally. A single self-contained page (no build, no dependencies). Its hero window replays an unedited first-session transcript; if a Meditator is running locally, the window connects to `ws://localhost:7627` and becomes the live mind, input box included.

## Running

```bash
bun install
# needs OPENROUTER_API_KEY in the environment
bun run meditator.js                       # default mind: architecture/awake.chml
bun run meditator.js -a architecture/tests/dry-fast.chml   # any other architecture
```

- Type a line into the terminal and press Enter — it arrives as an urgent stimulus.
- Websocket stream on port 7627 (`bun architecture/tests/poke-ws.js "hello"` to speak; `bun run src/client/server.js` then http://localhost:3000 for the simple web client).
- `--debug` or `--debug=mMind.js,mMemory.js` for component logs (attention frames, consolidations, arbiter decisions).
- `MEDITATOR_DRY_RUN=1` runs the whole loop offline against a deterministic stub — no network, no cost.

### Models

Roles, not one model (set in the chml):
- stream voice: `qwen/qwen3.6-35b-a3b` ($0.15/M in, $1/M out)
- utility (bridge/compression/observers): `qwen/qwen3.5-9b` ($0.10/M in, $0.15/M out)

A model id prefixed `local/` routes to an OpenAI-compatible server at `LOCAL_LLM_BASE_URL` (e.g. vLLM on your own GPUs) — observers, compression and the voice can run concurrently and batch well there. A continuous run at the default pace costs roughly $0.10–0.15/hour on OpenRouter; the economy component enforces whatever budget you give it.

### Architectures

- `architecture/awake.chml` — the canonical living mind (default)
- `architecture/tests/dry-fast.chml` — fast-cycle test mind for dry runs
- `architecture/tests/compress-test.chml` — offline compression harness
- `architecture/meditator.chml`, `survivor.chml`, `cat.chml`, `complex.chml`, `tools-*.chml` — earlier sketches and capability demos, kept for history

## Contributing

Contributions are welcome! Your genius code edits and AI's existential crises belong here.

## License

This project is available under the MIT License. See [LICENSE](./LICENSE) for details.

**Note**: This project was developed using [AI Junior](https://aijunior.dev), and continued by Claude.

0xabffbbb680a91a9bae0882bcccdb8925029e912f
