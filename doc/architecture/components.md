# Component reference

Every component is a custom element loaded from `src/mindComponents/`, built on
[Amanita](https://www.npmjs.com/package/amanita). This page lists each one's
attributes (with defaults), the pub/sub topics it speaks, and the DOM events it
raises. The components wired into the example mind (`architecture/seedling.archml`)
come first; [legacy and demo components](#legacy-and-demo-components) are at the end.

## Conventions

- **Attributes** are read with `this.attr(name)`, with the default applied inline.
- `model` / `utilityModel` are **inherited** from the nearest ancestor via
  `this.env(name)` — set them on `<m-mind>` and children pick them up unless they
  override with their own `model`.
- **Topic refs**: a leading `/` is absolute (`/stream/chunk`); `../foo` is
  relative to the parent. Amanita auto-subscribes class fields whose names are
  refs.
- A first-person **prompt** can be given as a `prompt="…"` attribute, a child
  `<m-prompt>`, or the element's text content.

---

## `m-mind`

The orchestrator. Owns the rhythm of thinking and assembles the
[attention frame](index.md#the-attention-frame) for every burst. Its text content
is the mind's identity.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `model` | `voice` | default voice model for the whole mind (inherited by children) |
| `utilityModel` | `utility` | default model for bridge / compression / observers |
| `pace` | `8s` | pause between bursts |
| `paceSigma` | `pace/4` | normal-distributed jitter on the pause |
| `tailLength` | `1500` | chars of verbatim tail carried into each frame |
| `bridge` | `true` | `"false"` disables the LLM-written transition on redirects |
| `speakingPaceFactor` | `2.5` | pace multiplier while the voice is speaking (slower thinking) |
| `speakingTokensFactor` | `0.35` | burst-token multiplier while speaking (thinner thoughts, floor 60) |

- **Subscribes:** `stream/boundary` (schedule next burst), `@interrupt` (think now),
  and — if an [`m-speech`](#m-speech) is present — `<voice>/speaking` (thin thinking while talking).
- **Publishes:** `prompt` — `{system, frame, prefix?, dedupe, kind, burstTokens?}`.
- **Key behavior:** error boundaries trigger an exponential backoff (×2 up to ×8);
  the inter-burst pause is also multiplied by the economy pace factor and, while
  speaking, by `speakingPaceFactor` (with `burstTokens` thinned) — so most verbal
  effort goes to the utterance while thought keeps trickling. Exposes `sleep()`
  for the [sleep ritual](memory.md#sleep-is-announced).

## `m-stream`

The thinking voice — produces the stream as a sequence of bursts, one streamed
LLM call each. Interruption is not a special state: a new prompt simply
supersedes the current burst (the in-flight stream is aborted).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `model` | inherits `model`, then `voice` | the voice model |
| `burstTokens` | `350` | max tokens per burst |
| `temperature` | `0.9` | sampling temperature |

- **Subscribes:** `../prompt` — `{system, frame, prefix?, dedupe?, burstTokens?}` or a plain string.
- **Publishes:**
  - `chunk` — each text fragment as it arrives (the `prefix`/bridge is emitted as a chunk too);
  - `boundary` — `{reason: completed|error, burstIndex, burstChars, error?}` when a burst ends and was not superseded;
  - `state` — `{oldState, newState, timestamp}` (for the WebSocket client).
- **Key behavior:** trims the overlap at burst seams (`trimSeamOverlap`) so the
  joined text reads continuously.

## `m-memory`

Three memory tiers, compression, persistence, and the journal. See
[Memory & the vault](memory.md) for the full picture.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `tailLength` | `1500` | verbatim tail budget (chars) |
| `recentLength` | `1200` | rolling-summary budget |
| `storyLength` | `2200` | autobiography budget |
| `blockMin` | `800` | overflow accumulated before a consolidation runs |
| `storyEvery` | `5` | every Nth consolidation folds `recent` into `story` |
| `persist` | vault home (`memory/<mind>/`) | `"off"` keeps memory in RAM only |
| `journal` | vault `journal/` | `"off"` disables transcripts |
| `model` | inherits `utilityModel` | compression model |
| `src` | `/stream/chunk` | stream source |
| `boundarySrc` | `/stream/boundary` | boundary source |

- **Publishes:** `compressed` — `{recent, story}` after a consolidation.
- **Public API used by the mind/scribe/voice:** `getTail()`, `getRecent()`, `getStory()`,
  `note(text)`, `spoke(text)` (splice an aloud utterance into the tail + journal),
  `consumeWakeNotice()`, `finalize(reason)`.

## `m-interrupts`

The attention **arbiter**. Mechanical, no LLM. See [Interrupts & observers](interrupts.md).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `threshold` | `0.35` | minimum salience for a non-urgent stimulus |
| `rateLimit` | `15s` | minimum gap between accepted non-urgent stimuli |
| `keep` | `2` | max queued stimuli; highest salience wins |

- **Listens (DOM, on parent):** `interrupt-request` (carries an `InterruptRecord`).
- **Dispatches (DOM, bubbling):** `interrupt` for urgent stimuli.
- **API used by the mind:** `takePending()` — queued stimuli, oldest first, clears the queue.

## `m-timeout`

Time-based generator, in **wander** or **watchdog** mode.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `timeout` | `60s` | base interval |
| `sigma` | `0s` | normal-distributed jitter |
| `salience` | `0.5` | salience of the raised stimulus |
| `urgent` | `false` | `"true"` supersedes the running burst |
| `reset` | — | a topic ref (e.g. `/stream/chunk`); activity on it resets the silence clock ⇒ **watchdog** mode |
| `prompt` / text | `"Time passes."` | first-person reason injected into the frame |

- **Dispatches (DOM, bubbling):** `interrupt-request`. Minimum delay 500 ms.

## `m-observer`

Base class for stream-watching observers (`m-loop-guard`, `m-associate` extend it).
Gives subclasses a rolling `window`, hooks, a cooldown, and `raise()`.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `src` | `/stream/chunk` | stream source kept in `this.window` |
| `boundarySrc` | `/stream/boundary` | calls `onBoundary()` |
| `window` | `1600` | chars of stream retained |
| `cooldown` | `60s` | minimum gap between this observer's raises |
| `salience` | `0.6` | default salience for raised stimuli |

- **Overridable:** `onObserverConnect()`, `onStreamChunk(chunk)`, `onBoundary(boundary)`.
- **Helper:** `raise(reason, {salience, urgent, suggestion, type})` → dispatches an
  `interrupt-request`; returns `false` if on cooldown.

## `m-loop-guard`

Repetition detector (extends `m-observer`). No model cost.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `overlap` | `0.3` | loop-score threshold `0..1` (raise to tolerate more circling) |
| `salience` | `0.85` | salience of the change-of-direction stimulus |

Plus all `m-observer` attributes. Acts at boundaries once the window holds ≥ 700
chars; raises `type: LoopGuard` and clears its window on a hit.

## `m-associate`

Associative observer (extends `m-observer`) — the internal source of direction
changes.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `4` | evaluate at every Nth completed boundary |
| `model` | inherits `utilityModel` | the tiny association model |

Plus all `m-observer` attributes. Reads the last ~1200 chars; the model answers
`NONE` or `SALIENCE`/`THOUGHT`; raises `type: Association` at the model's salience.

## `m-speech`

The speaking **voice** — what goes *out* (extends `m-observer`). The mind mostly
thinks quietly; occasionally a thought wants to become an utterance. Speech is
**volitional**, not a reply service: a cheap call judges whether something genuinely
wants to be said aloud and with what salience; being addressed lowers the bar but
never forces a reply. An accepted utterance is produced as its own streamed burst on
the voice model, **concurrently** with the (thinned) thinking stream — true limited
parallelism.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `6` | decision cadence in boundaries for spontaneous speech |
| `threshold` | `0.6` | minimum salience to actually speak |
| `addressedBoost` | `0.25` | threshold reduction while freshly addressed from outside |
| `cooldown` | `60s` | minimum gap between utterances |
| `model` | inherits `model` | the voice model (same as the thinking voice) |
| `decisionModel` | inherits `utilityModel` | tiny model for the speak / stay-quiet impulse |
| `speakTokens` | `200` | max tokens per utterance |
| `temperature` | `0.85` | sampling temperature for the utterance |

Plus all `m-observer` attributes.

- **Listens (DOM, on parent):** `interrupt-request` (an external voice raises the
  urge to speak), `interrupt` (an urgent stimulus aborts an in-flight utterance to attend it).
- **Publishes:** `speech` (each spoken fragment), `speaking` (`bool`, true while
  talking — `m-mind` thins thinking while it holds), `speech-boundary`
  (`{chars, reason, text}` when an utterance ends), `impulse`
  (`{salience, gist, accepted}` for every decision).
- **Feeds memory:** calls `m-memory.spoke(text)` so the utterance enters the verbatim
  tail as a marked `(aloud) "…"` block — the next thought continues knowing what it said aloud.

## `m-economy`

The mind's metabolism — reads real API cost and slows the mind as the budget drains.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `budget` | `1.00` | USD for this run |
| `estInPrice` | `0.15` | USD/million input tokens, used only if the provider doesn't report cost |
| `estOutPrice` | `1.00` | USD/million output tokens, same |
| `boundarySrc` | `/stream/boundary` | when to re-read usage |

- **Publishes:** `energy` (`0..1`), `spent` (USD).
- **API used by the mind:** `paceFactor()` → ×1 (fresh, energy > 0.5), ×2 (tiring,
  > 0.25), ×4 (tired, > 0.1), ×10 (exhausted, > 0), ×30 (resting, ≤ 0).

## `m-kb`

The scribe — a tiny librarian that distills durable knowledge into a markdown tree.
See [Memory & the vault](memory.md).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `15` | run at every Nth completed boundary |
| `dir` | vault `knowledge/` | knowledge-base root |
| `model` | inherits `utilityModel` | the librarian model |
| `maxOps` | `4` | max file operations per run |
| `boundarySrc` | `/stream/boundary` | trigger |

- **How:** one model call proposes `WRITE`/`APPEND`/`NONE` operations in a
  constrained format, applied strictly inside `dir` (no shell — the mind's free
  text cannot inject commands). Maintains `index.md` (a map of the tree) and
  `self/values.md` (a living statement of what the mind cares about).

## `m-console`

Terminal input/output. No attributes.

- Active only if stdin is a TTY or `MEDITATOR_STDIN=1`.
- A typed line → `External / ConsoleInput` stimulus, **urgent, salience 1**.
- `/sleep` → runs the mind's [sleep ritual](memory.md#sleep-is-announced) and exits.
- **Dispatches (DOM, bubbling):** `interrupt-request`.

## `m-ws`

WebSocket server — the live stream and external voice. Full protocol in the
[WebSocket API](../websocket-api.md).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `port` | `7627` | TCP port to listen on |
| `src` | `/stream/chunk` | chunks broadcast as `thought_fragment` |
| `stateSrc` | `/stream/state` | state changes broadcast as `status` |

- **Broadcasts (transport):** `thought_fragment` (each chunk) and `status` (state changes).
- **Broadcasts (instrumentation):** on connect, `structure` (the mind's component
  tree); then `event` messages tagging each internal signal by process — the
  assembled `frame`, every attention `bid` / `decision` / `urgent`, burst
  `boundary`, `memory` state/consolidation, `economy` energy, `scribe` filings,
  `speech` state — plus `speech_fragment` for each spoken fragment. Every tap is
  guarded, so a minimal mind simply emits fewer events.
- **Receives:** `{type:"input", data:{message}}` → `External` urgent stimulus, salience 1.
- **Dispatches (DOM, bubbling):** `interrupt-request`.

## `m-prompt`

A passive content slot used *inside* other components to supply prompt text. Not
an autonomous component; no behavior of its own.

---

## Shared infrastructure

Not components, but the pieces components lean on (`src/infrastructure/`,
`src/modelAccess/`):

- **`interruptRecord.js`** — the [`InterruptRecord`](interrupts.md#the-interruptrecord)
  class: fields, `renderForFrame()`, `coerce()`.
- **`memoryVault.js`** — the git vault: `mindHome(el, sub)` resolves
  `memory/<slug>/[sub]` (dry-run → `dry-…`); `commitVault(message)` commits at
  wake / heartbeat / sleep; `ensureVault()` initializes it.
- **`modelAccess/llm.js`** — `complete()` (one-shot) and `chatStream()` (streaming),
  `defaultModel(role)`. Routes `local/…` ids to `LOCAL_LLM_BASE_URL`, else
  OpenRouter (real usage on, hidden reasoning off). `MEDITATOR_DRY_RUN=1` swaps in
  a deterministic offline stub. `MEDITATOR_MAX_CONCURRENCY` (default 4) caps
  concurrent utility calls; the stream is never gated behind them.
- **`logger.js`** — `logger(sourceFile)`; per-source filtering via `--debug` /
  `--debug=mMind.js,…`.

---

## Legacy and demo components

These exist only for older example and demo architectures — the tool demos now
live under `architecture/legacy/` — and are **not** part of the default mind.
Tools and shell execution are explicitly deprioritized in the current
direction — the focus is the stream, attention, memory, and observers, not an
agent that calls tools.

| Component | What it was | Status |
|-----------|-------------|--------|
| `m-tools` | detects and dispatches tool calls in the stream | demo only |
| `m-shell` | a tool that runs shell commands on the host | demo only |
| `m-token-monitor` | older rule/LLM token-pattern interrupt generator | superseded by observers |
| `m-compress` | standalone compression demo | superseded by `m-memory` |
| `m-recent-history` | block-based history compression demo | superseded by `m-memory` |
| `m-stream-generator` | synthetic chunk generator for tests | demo only |
| `m-planner` | empty placeholder | not implemented |

> Many other `m-*` tags appear in old demo `.archml` files (e.g. `m-calculator`,
> `m-filesystem`, `m-websearch`) but have **no implementation** and will not load.
> Treat the demo architectures as historical sketches, not working minds.
