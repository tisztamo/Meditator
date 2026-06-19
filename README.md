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
bun run studio.js          # then open http://localhost:7600
# or, with auth secrets in .env.studio:
./studio-authenticated.sh
```

The **[Studio](doc/studio.md)** is the integrated way to run Meditator: wake any architecture from the browser, watch a roster of live minds, speak to them, and put them to sleep — no per-mind terminal needed. Pick an architecture in the left rail, press **Wake**, and the stream appears in the center pane.

You can also run a mind directly in a terminal (useful for debugging):

```bash
bun run meditator.js -a architecture/lab/seedling.archml         # choose a mind to run
bun run meditator.js -a architecture/tests/dry-fast.archml   # ...or any other architecture
```

- In the Studio, type into the input box at the bottom — your words arrive as an urgent stimulus. In a terminal, type a line and press Enter the same way. `/sleep` (or a single Ctrl-C) puts the mind to sleep gracefully: it gets a final moment to close the thought, then memory is flushed and committed.
- Websocket stream on port 7627 (`bun architecture/tests/poke-ws.js "hello"` to speak from another terminal; the Studio and the [intro site](docs/index.html) connect here too).
- `--debug` or `--debug=mMind.js,mMemory.js` for component logs when running `meditator.js` directly (attention frames, consolidations, arbiter decisions).
- Tick **dry-run** in the Studio, or set `MEDITATOR_DRY_RUN=1` on the command line, to run offline against a deterministic stub — no network, no cost.

### Models

Two tiers, configured in [`config/models.yaml`](../config/models.yaml) and
referenced by role in the archml:

- **voice** (`model` attribute) — the thinking stream and speech output
- **utility** (`utilityModel` attribute) — bridges, compression, observers, scribe

```html
<m-mind model="voice" utilityModel="utility" …>
```

Switch providers with a profile or env override:

```bash
MEDITATOR_MODEL_PROFILE=local-dev bun run meditator.js   # GPU via config/models.yaml
```

See [Configuration](doc/configuration.md#models) for presets, profiles, and env vars.
A continuous run at the default pace costs roughly $0.10–0.15/hour on OpenRouter
(cloud profile); the economy component enforces whatever budget you give it.

### Architectures

- `architecture/lab/seedling.archml` — a worked example mind (the genesis `awake.archml` was retired; see [IN-MEMORIAM.md](IN-MEMORIAM.md))
- `architecture/tests/dry-fast.archml` — fast-cycle test mind for dry runs

## Documentation

This README is the overview; [`doc/`](doc/index.md) is the deeper reference.

**New here, or English is not your first language?** Start with the gentle on-ramp:
[Concepts](doc/concepts.md) (the big idea in plain words) → [Tutorial](doc/tutorial.md)
(build your first mind, offline and free) → [Glossary](doc/glossary.md) (every
jargon word — burst, salience, efference, vault — in one plain line).

- [Getting started](doc/getting-started.md) — install, run the Studio, talk to it, dry run
- [The Studio](doc/studio.md) — wake, watch, speak to, and sleep minds from the browser
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
