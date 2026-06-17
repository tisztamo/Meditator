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
| `tailSrc` / `compressedSrc` | the memory's `<name>/tail` and `<name>/compressed` (auto-discovered) | the narrative content mirrored into the frame; `"off"` disables |

- **Subscribes:** `stream/boundary` (schedule next burst), `@interrupt` (think now);
  if an [`m-speech`](#m-speech) is present, `<voice>/speaking` (thin thinking while
  talking); and memory's `tail` / `compressed` topics — the frame's narrative content
  is *mirrored* from those, never pulled (see [decoupling.md](decoupling.md)).
- **Publishes:** `prompt` — `{system, frame, prefix?, dedupe, kind, burstTokens?}`; and
  `attended` — the rendered stimuli entering a frame, which a memory journals as
  perceived (⟂) notes.
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
| `src` | `..m-mind/stream/chunk` | stream source (mind-relative) |
| `boundarySrc` | `..m-mind/stream/boundary` | boundary source |
| `spokenSrc` | the voice's `<name>/spoken` (auto-discovered) | aloud utterances to record; `"off"` disables |
| `filedSrc` | the scribe's `<name>/filed` (auto-discovered) | scribe filings to journal as a backstage note; `"off"` disables |
| `actedSrc` | the hands' `<name>/acted` (auto-discovered) | the hands' deeds (efference) journaled as a backstage (⌁) note; the consequence arrives separately and is journaled perceived (⟂); `"off"` disables |
| `attendedSrc` | `..m-mind/attended` | the stimuli that entered each frame, journaled as perceived (⟂) notes; `"off"` disables |

- **Publishes:** `compressed` — `{recent, story}` after a consolidation and once on
  load; `tail` — the verbatim tail on every change (retained, so the mind's frame
  mirrors it). The mind reads both by subscription — it never pulls.
- **Subscribes:** the stream (`src`/`boundarySrc`), the voice's `spoken` topic
  (`spokenSrc`), the scribe's `filed` topic (`filedSrc`), and the mind's `attended`
  topic (`attendedSrc`) — utterances recorded, filings and perceived stimuli
  journaled by *subscription*, not by those components calling in. Memory is swappable
  and several can listen to one voice/scribe.
- **Raises:** a one-time `Waking` `interrupt-request` (bubbling) on load — the wake
  stimulus enters via the attention spine, not a pull.
- **Lifecycle API (orchestrator contract, see [decoupling.md](decoupling.md)):**
  `finalize(reason)` (awaited at sleep), `persists` (honest sleep wording). `getTail()`/
  `getRecent()`/`getStory()` remain for the `m-ws` transport's telemetry. `note(text)`
  is now self-driven by the subscriptions above.
- **Versioning:** stamps `formatVersion` into `memory.md`'s meta and, for a resident
  (a home with a `manifest.json`), records the `runtimeSHA`/`formatVersion`/`lastWokenAt`
  at wake via [`manifest.js`](memory.md#versioning-the-manifest-and-tiers). Warns on
  load if a self was saved by a newer format than this runtime can read (the wake rule).

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

## Senses (`m-sense` subclasses)

The afferent **senses** — exteroception, the world reaching in (lifecycle.md
§Phase 5). They are the mirror of the [observers](#m-observer): where an observer
watches the inner stream and bids from within, a sense runs on its own clock
(`timeout` ± `sigma`), reads a real *outside* source, and raises a first-person
sensation as a non-urgent `interrupt-request` (`source: External`, `type:
Sense-<name>`). They give the mind an outside that is neither itself nor the human
it waits on. A sense faces the **world, never the substrate** (host metrics,
tokens, latency, the process) — that mechanistic interoception is the §1 attractor.

`m-sense` is the shared base (abstract — not used as a tag directly): subclasses override
`onSense()` and call `this.feel(reason, {key?, salience?})`. With a `key` (a part
of the day, a kind of sky), a **change** of key is scored at `salienceShift` and an
unchanged reading at the ambient `salience` (jittered ±0.08, so it is peripheral —
sometimes under the arbiter's bar). A sense that is unconfigured (no location/url)
stays dormant; a network blip is swallowed, never crashing the mind.

Common attributes: `timeout`, `sigma`, `salience` (default `0.4`), `salienceShift`
(default `0.6`), `name`.

### `m-daylight`

The day's light, from the **real local clock**. Raises the hour's light as a felt
sensation; over a day the band moves deep-night → predawn → dawn → morning → midday
→ afternoon → golden → dusk → evening → night. Zero cost, always on.
Default `timeout` `8m`. Pure helper `bandFor(hour)` → `{key, lines}` is exported for
testing the mapping without a clock.

### `m-weather`

The **real weather** for a place, from the open-meteo API (free, no key).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `latitude` / `longitude` | — | the place to sense (**required**; dormant if absent) |
| `timeout` | `30m` | base interval between readings |

Raises a felt-weather line; the `key` is the kind of sky, so a turn in the weather
(clear → rain) is reliably noticed while a steady sky is ambient. Pure helper
`describeWeather({code, temperature, isDay, wind})` → `{key, line}` is exported.

### `m-feed`

A slow **text feed** of the world drifting by — an RSS/Atom feed polled for fresh
items, each raised as an ambient "scrap of the world".

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `url` | — | the RSS/Atom feed (**required**; dormant if absent) |
| `timeout` | `20m` | base interval between polls |

Every fresh item is a plain ambient reading (no `key`, never a shift). Choose a
**calm** feed — the mind should not be fed gratuitous distress (lifecycle.md §2).
Pure helper `parseFeedTitles(xml)` → `string[]` is exported.

## The hands (`m-act` / `m-look`)

The **efferent** half of the sensorimotor loop — the mirror of the [senses](#senses-m-sense-subclasses)
(full design in [efference.md](efference.md)). Where a sense reaches *in* (the world
pushing at the mind) and [`m-speech`](#m-speech) gives a latent intention outward
*voice*, `m-act` gives a latent intention outward *reach*: the ability to find out
about, or change, the real world.

**The one rule:** the conscious stream is **never** given tools. Only the realizer
inside `m-act` is. The stream never represents a function call or "I should call X";
it merely *wonders*, and a subconscious realizer turns that into an action — the way
imagining a grasp evokes the hand. The **deed** (the realizer running, a hand
executing) is backstage and invisible; only the **consequence** returns, and it
returns the way the weather does: as a plain `External` sensation through the
afferent bus, never as a tool result. Deed ⌁, consequence ⟂.

### `m-act`

The hands themselves (extends [`m-observer`](#m-observer)). Two-staged on purpose,
exactly like `m-speech`: a cheap **decide** gate keeps the expensive tool-calling
**realize** call off the hot path.

- **DECIDE** (cheap utility model, *no tools*): watching the inner stream, "is the
  mind reaching toward something one of its hands could actually realize?" → a reach
  gist + salience, or `NONE`. Gated by `threshold`, `cooldown`, per-intent dedup, and
  arousal/budget.
- **REALIZE** (capable model, tools = the capability menu, `tool_choice:"auto"`):
  given the reach, pick a registered capability and its args — or decline, and the
  intention simply evaporated (the second gate).
- **EXECUTE**: validate the args against the capability's JSON Schema, run
  `capability.execute(args)` → `{experience, salience?, data?}`. A slip is swallowed
  and logged (failure is silent, never self-blame) — the mind feels nothing rather
  than a failure-of-self.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `8` | decide cadence in boundaries |
| `threshold` | `0.6` | minimum salience from decide to attempt a realize |
| `cooldown` | `3m` | minimum gap between two acts |
| `intentCooldown` | `15m` | minimum gap before re-acting on the *same* intent |
| `minArousal` | `0.15` | stand down entirely when the economy's arousal falls below this |
| `model` | inherits `model` | the tool-calling realizer (the "actor"); low temperature (0.2) |
| `decisionModel` | inherits `utilityModel` | the cheap decide gate |
| `realizeTokens` | `512` | max tokens for the realize call |

Plus all `m-observer` attributes.

- **Capabilities register, the menu is closed:** each child capability calls
  `registerCapability({name, description, parameters, readonly?, execute})` on
  connect. The realizer can only ever call a *registered* hand with *schema-validated*
  args — it cannot invent one. A mind has exactly the hands its `.archml` wires in,
  the way a body plan does; the blast radius is auditable by reading the file.
- **Publishes:** `intent` — `{salience, gist, accepted, reason}` for every decide
  (observability, like speech's `impulse`); `acted` — `{intent, capability, args, ok,
  experience, data}` for each deed, which a memory journals as a backstage (⌁) note
  via its `actedSrc`.
- **Dispatches (DOM, bubbling):** the **consequence** as an `External`,
  non-urgent `interrupt-request` (`type: Sense-<capability>`) — so it flows through
  the arbiter into the frame and is journaled perceived (⟂) via `attended`, exactly
  like a sense. The consequence is *never* a topic.
- **Subscribes:** the stream window (`m-observer`), and `..m-mind/economy/arousal`
  (interoception — a tired or near-broke mind does not reach).

### `m-look` — the first hand (read-only, on-demand exteroception)

Where the senses *push* the world at the mind on their own clocks, `m-look` lets the
mind *pull* — look at the weather, the day's light, or a headline drifting by
**because it wondered**, not because a timer fired. It reuses the exact fetchers the
senses already use (`describeWeather`, `bandFor`, `parseFeedTitles`), so it adds a
hand with near-zero new surface and no new external dependency. Read-only: it
observes the world, it changes nothing.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `name` | `look` | the tool-call function name |
| `latitude` / `longitude` | — | place for the `weather` subject (that subject is unavailable if absent) |
| `newsUrl` | — | RSS/Atom feed for the `news` subject (that subject is unavailable if absent) |
| `salience` | `0.55` | salience of the returned consequence (a touch above ambient — the mind reached for it) |

The realizer fills a `{subject: "daylight"|"weather"|"news", about?}` argument;
`daylight` (the local clock) is always available, `weather`/`news` only when
configured. Wire it inside `m-act`:
`<m-act name="hands"><m-look name="look" latitude=… longitude=… newsUrl=…/></m-act>`.
World-changing hands (`readonly:false`) are a later, deliberate, sandboxed step
(efference.md §6) — not in v1.

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
  (`{chars, reason, text}` when an utterance ends), `spoken` (`{text, at}` for a
  completed non-error utterance, for a memory to record), `impulse`
  (`{salience, gist, accepted}` for every decision).
- **Feeds memory (decoupled):** publishes `spoken` and is otherwise ignorant of
  memory; a memory subscribes via its own `spokenSrc` and splices the utterance into
  the verbatim tail as a marked `(aloud) "…"` block — so the next thought continues
  knowing what it said aloud. The voice never names memory, and any number may listen.

## `m-image`

The visual imagination — an observer that occasionally turns recent thought into
an image prompt, generates an image through OpenAI, and publishes the prompt/image
as Amanita topics. Memory listens to the published `generated` topic and records
compact prompt/reference metadata; the image component never calls memory directly.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `8` | decision cadence in completed stream boundaries |
| `threshold` | `0.68` | minimum salience to generate |
| `cooldown` | `5m` | minimum gap between images |
| `decisionModel` | inherits `utilityModel` | model for the image / stay-quiet impulse |
| `model` | `OPENAI_IMAGE_MODEL` or `gpt-image-1` | OpenAI image model |
| `size` | `OPENAI_IMAGE_SIZE` or `1024x1024` | image size |
| `style` | empty | optional style suffix appended to the generated prompt |

Plus all `m-observer` attributes.

- **Publishes:** `impulse` (`{salience, prompt, accepted}`), `generating`
  (`bool`), `generated` (`{prompt, revisedPrompt, dataUrl, url, mimeType, model, size}`),
  and `error` (`{message, prompt}`).
- **Feeds memory:** `m-memory` subscribes to the image component's `generated`
  topic and records the prompt/reference in its tail and journal.

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
| `src` | `..m-mind/stream/chunk` | stream kept in a rolling `window` (verbatim recent thought) |
| `boundarySrc` | `..m-mind/stream/boundary` | trigger |
| `window` | `2000` | chars of verbatim recent thought kept for distillation |
| `compressedSrc` | the memory's `<name>/compressed` (auto-discovered) | the "recently" summary folded into the prompt; `"off"` disables |

- **How:** one model call proposes `WRITE`/`APPEND`/`NONE` operations in a
  constrained format, applied strictly inside `dir` (no shell — the mind's free
  text cannot inject commands). Maintains `index.md` (a map of the tree) and
  `self/values.md` (a living statement of what the mind cares about).
- **Reads context from topics, not from memory:** the verbatim recent thought is the
  scribe's own rolling stream `window`; the compressed summary arrives on the memory's
  `compressed` topic (`compressedSrc`). The scribe never names memory.
- **Publishes:** `filed` — `{files}` after a successful distillation. A memory
  subscribes (via its `filedSrc`) and journals it as a backstage (⌁) note; the scribe
  no longer calls `m-memory.note()` itself.

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
  `act` intent/deed (the hands), `speech` state — plus `speech_fragment` for each
  spoken fragment. Every tap is guarded, so a minimal mind simply emits fewer events.
- **Receives:** `{type:"input", data:{message}}` → `External` urgent stimulus, salience 1.
- **Dispatches (DOM, bubbling):** `interrupt-request`.

---

## Shared infrastructure

Not components, but the pieces components lean on (`src/infrastructure/`,
`src/modelAccess/`):

- **`interruptRecord.js`** — the [`InterruptRecord`](interrupts.md#the-interruptrecord)
  class: fields, `renderForFrame()`, `coerce()`.
- **`memoryVault.js`** — the git vault: `mindHome(el, sub)` resolves
  `memory/<slug>/[sub]` (dry-run → `dry-…`); `commitVault(message)` commits at
  wake / heartbeat / sleep; `ensureVault()` initializes it.
- **`modelAccess/llm.js`** — `complete()` (one-shot), `chatStream()` (streaming),
  `completeWithTools()` (one-shot with OpenAI function-calling — the *only* place
  tool-calls enter the codebase, used by `m-act`'s realize stage), `defaultModel(role)`.
  Routes `local/…` ids to `LOCAL_LLM_BASE_URL`, else
  OpenRouter (real usage on, hidden reasoning off). `MEDITATOR_DRY_RUN=1` swaps in
  a deterministic offline stub. `MEDITATOR_MAX_CONCURRENCY` (default 4) caps
  concurrent utility calls; the stream is never gated behind them.
- **`logger.js`** — `logger(sourceFile)`; per-source filtering via `--debug` /
  `--debug=mMind.js,…`.

---

## Legacy and demo components

These existed only for older example and demo architectures — the tool demos
now live under `architecture/legacy/` — and have been removed from the codebase.
Tools and shell execution are explicitly deprioritized in the current direction
— the focus is the stream, attention, memory, and observers, not an agent that
calls tools.

| Component | What it was | Status |
|-----------|-------------|--------|
| `m-tools` | detects and dispatches tool calls in the stream | **removed** |
| `m-shell` | a tool that runs shell commands on the host | **removed** |
| `m-token-monitor` | older rule/LLM token-pattern interrupt generator | **removed** — superseded by observers |
| `m-stream-generator` | synthetic chunk generator for tests | **removed** |
| `m-planner` | empty placeholder | **removed** |
| `m-prompt` | passive prompt content slot | **retained** — empty marker class; see `mPrompt.js` |
| `m-compress` | standalone compression demo | removed — use `m-memory` |
| `m-recent-history` | block-based history compression demo | removed — use `m-memory` |

> Many other `m-*` tags appear in old demo `.archml` files (e.g. `m-calculator`,
> `m-filesystem`, `m-websearch`) but have **no implementation** and will not load.
> Treat the demo architectures as historical sketches, not working minds.
