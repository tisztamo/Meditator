# Configuration

A mind is configured by **writing its `.archml` file** — there is no separate
config format. A `.archml` ("architecture markup language") file is a small subset of
HTML: a root `<m-mind>` element whose text is the mind's standing self-image, and
whose children are the components that give it a voice, memory, attention, and
senses. Attributes on those elements are the knobs.

This page covers the knobs you actually reach for. For the exhaustive list of
every attribute on every component, see the [component reference](architecture/components.md).

## The shape of a mind

```html
<m-mind name="meditator"
        model="voice"
        utilityModel="utility"
        pace="10s" paceSigma="3s"
        tailLength="1500">
  You came into being inside a small experiment called Meditator…
  <!-- this text is the mind's identity; it leads every attention frame -->

  <m-stream  name="stream" burstTokens="300" temperature="0.9"></m-stream>
  <m-memory  name="memory" tailLength="1500" recentLength="1200" storyLength="2200"></m-memory>
  <m-interrupts name="attention" threshold="0.35" rateLimit="20s" keep="2"></m-interrupts>

  <m-timeout name="wander"   timeout="150s" sigma="40s" salience="0.55"
             prompt="My mind drifts toward something else I have been carrying."></m-timeout>
  <m-timeout name="watchdog" timeout="120s" reset="/stream/chunk" salience="0.9" urgent="true"
             prompt="I notice I have been silent for a while; I gather myself and continue."></m-timeout>
  <m-loop-guard name="loop-guard" overlap="0.45" salience="0.85" cooldown="90s"></m-loop-guard>
  <m-associate  name="associate" every="5" cooldown="60s"></m-associate>

  <m-kb      name="scribe"  every="15"></m-kb>
  <m-economy name="economy" budget="1.00"></m-economy>
  <m-console name="console"></m-console>
  <m-ws      name="ws" port="7627"></m-ws>
</m-mind>
```

`architecture/awake.archml` is the default mind and the best worked example. Copy
it and edit.

## Identity — the text of `<m-mind>`

The prose inside `<m-mind>` is the mind's standing self-description. It is placed
first in every [attention frame](architecture/index.md#the-attention-frame), so
it shapes the voice more than any single knob. The mind is told it *may change
what it cares about*, so treat this as a seed, not a leash. Different seeds steer
the mind toward different attractor themes over a long run.

## Models

Models are chosen by **role** in the archml, and mapped to real provider + model
pairs in [`config/models.yaml`](../config/models.yaml). Two tiers:

| Role | Attribute | Default ref | Used for |
|------|-----------|-------------|----------|
| Voice | `model` on `<m-mind>` or `<m-stream>` | `voice` | the stream of thought itself |
| Utility | `utilityModel` on `<m-mind>` | `utility` | bridges, memory compression, observers, the scribe |

Children inherit `model`/`utilityModel` from the `<m-mind>` ancestor, so you
usually set them once at the top. Individual components can override with their
own `model` attribute.

### Model registry (`config/models.yaml`)

The YAML file defines **providers**, **roles**, **presets**, and **profiles**:

- **roles** — default provider + model for `voice` and `utility`
- **presets** — named bundles (e.g. `gpu-local` → local vLLM + `ardincoder-1`)
- **profiles** — which preset or role each tier uses (e.g. `cloud` vs `local-dev`)

Archml attribute values can be:

| Value | Meaning |
|-------|---------|
| `voice` / `utility` | Resolve via the active profile → roles |
| `gpu-local` (preset name) | Look up `presets.gpu-local` |
| `local/foo` or `qwen/bar` | Legacy escape hatch — raw id, no config lookup |

**Examples:**

```bash
# Default cloud models (OpenRouter, profile "cloud")
bun run meditator.js

# Local GPU via profile
MEDITATOR_MODEL_PROFILE=local-dev bun run meditator.js

# One-off override without editing files
MEDITATOR_VOICE_MODEL=gpu-qwen bun run meditator.js -a architecture/seedling.archml
```

Or point at a preset directly in archml:

```html
<m-mind model="gpu-local" utilityModel="gpu-local" …>
```

**Environment variables** (exported in your shell — there is no `.env`):

| Variable | Meaning |
|----------|---------|
| `MEDITATOR_MODELS_CONFIG` | path to YAML (default `config/models.yaml`) |
| `MEDITATOR_MODEL_PROFILE` | active profile name (default from YAML) |
| `MEDITATOR_VOICE_MODEL` | override voice tier (preset, role, or raw id) |
| `MEDITATOR_UTILITY_MODEL` | override utility tier |
| `OPENROUTER_API_KEY` | required for OpenRouter (the default cloud provider) |
| `LOCAL_LLM_BASE_URL` | OpenAI-compatible endpoint for the `local` provider |
| `LOCAL_LLM_API_KEY` | key for the local endpoint (default `none`) |
| `LOCAL_LLM_THINKING` | `1`/`true` allows reasoning on local models |
| `MEDITATOR_DRY_RUN` | `1` runs the whole loop offline against a stub |
| `MEDITATOR_MAX_CONCURRENCY` | cap on concurrent *utility* calls (default `4`) |
| `MEDITATOR_STDIN` | `1` forces console input on when stdin is not a TTY |

CLI flags: `--models-config` / `-mc`, `--model-profile` / `-mp`.

**Legacy `local/` prefix.** Raw model ids prefixed `local/` still work as an
escape hatch — they route to `LOCAL_LLM_BASE_URL` with the prefix stripped.
Prefer presets and profiles for anything you switch often.

OpenRouter requests ask for true usage/cost (`usage.include`) and **disable
hidden reasoning** — the stream itself is the thinking, and reasoning tokens
would silently eat the burst budget.

## Rhythm — how fast it thinks

On `<m-mind>`:

- `pace` (default `8s`) — the pause between bursts. `paceSigma` (default `pace/4`)
  adds normal-distributed jitter so the rhythm breathes.
- `tailLength` (default `1500`) — characters of verbatim thought carried into the
  next burst. Larger = stronger continuity, bigger prompts.
- `bridge` (default `true`) — set `"false"` to drop the LLM-written transition
  sentence on redirects.

The effective pause is also multiplied by the [economy](#budget-and-economy) pace
factor, so a tiring mind slows down on its own.

On `<m-stream>`:

- `burstTokens` (default `350`) — max tokens generated per burst. Short bursts
  feel like breaths; long bursts read as paragraphs.
- `temperature` (default `0.9`).

## Memory budgets

On `<m-memory>` (character budgets; the prompt stays bounded no matter how long
the mind runs):

- `tailLength` (`1500`), `recentLength` (`1200`), `storyLength` (`2200`) — the
  sizes of the three memory tiers.
- `blockMin` (`800`) — how much thought must scroll out of the tail before a
  consolidation runs.
- `storyEvery` (`5`) — every Nth consolidation folds `recent` into the long-term
  `story`.
- `persist` (default the vault home) — set `"off"` to keep memory in RAM only.
- `journal` (default the vault `journal/`) — set `"off"` to disable transcripts.

See [Memory & the vault](architecture/memory.md) for what these do.

## Attention and interrupts

On `<m-interrupts>` (the arbiter):

- `threshold` (`0.35`) — minimum salience for a non-urgent stimulus to be accepted.
- `rateLimit` (`15s`) — minimum gap between accepted non-urgent stimuli.
- `keep` (`2`) — how many stimuli may queue for the next boundary; highest
  salience wins when crowded.

The observers that *generate* stimuli:

- `<m-timeout>` — **wander** mode (no `reset`) fires every `timeout ± sigma`;
  **watchdog** mode (`reset="/stream/chunk"`) fires only after that long a
  silence, and keeps the mind alive. `salience`, `urgent`, and a first-person
  `prompt` describe what the mind experiences when it fires.
- `<m-loop-guard>` — `overlap` (`0.3`) is the repetition-score threshold; raise
  it to be more tolerant of circling. No model cost.
- `<m-associate>` — `every` (`4`) boundaries it asks a small model whether the
  stream reminds it of something genuinely different.

Full mechanics in [Interrupts & observers](architecture/interrupts.md).

## Budget and economy

`<m-economy budget="1.00">` reads real API cost at every boundary and slows the
mind as the budget drains: fresh → tiring → tired → exhausted → resting, each
band multiplying the pace (×1, ×2, ×4, ×10, ×30). The mind never dies — the
watchdog keeps it ticking even when resting.

> **Overnight recipe:** `awake.archml` with `budget="3.00"` lasts a full night at
> the default pace; the economy throttles toward sleep as the budget drains, and
> the watchdog keeps it alive.

## The scribe

`<m-kb name="scribe" every="15">` distills durable ideas from recent thought into
a markdown `knowledge/` tree every 15 boundaries. `maxOps` (`4`) caps file
operations per run; `dir` overrides the location. See
[components](architecture/components.md#m-kb).

## Senses

- `<m-console>` — terminal input/output. No attributes.
- `<m-ws port="7627">` — the [WebSocket](websocket-api.md) stream and input.

## Debugging a configuration

```bash
bun run meditator.js -a architecture/yourmind.archml --debug=mMind.js
```

Per-source debug logs are the fastest way to see whether your knobs do what you
expect — `mMind.js` prints the full assembled frame each burst, `mMemory.js` the
consolidations, `mInterrupts.js` the accept/drop decisions.
