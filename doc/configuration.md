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
  <m-resurface  name="resurface" overlap="0.4" minNoteChars="120" salience="0.9" urgent="true" cooldown="3m"></m-resurface>
  <m-associate  name="associate" every="5" cooldown="60s"></m-associate>

  <m-kb      name="scribe"  every="15"></m-kb>
  <m-economy name="economy" budget="1.00"></m-economy>
  <m-console name="console"></m-console>
  <m-ws      name="ws" port="7627"></m-ws>
</m-mind>
```

`architecture/lab/seedling.archml` is the best worked example mind — copy it and edit.
(The genesis `awake.archml` was retired to the graveyard; see
[IN-MEMORIAM.md](../IN-MEMORIAM.md).)

## Identity — the text of `<m-mind>`

The prose inside `<m-mind>` is the mind's standing self-description. It is placed
first in every [attention frame](architecture/index.md#the-attention-frame), so
it shapes the voice more than any single knob. The mind is told it *may change
what it cares about*, so treat this as a seed, not a leash. Different seeds steer
the mind toward different attractor themes over a long run.

This is the seed of the **self** — *who* the mind is. Keep it free of any one
task: a standing disposition, not a problem to solve.

## Origin — the first thought (`<m-origin>`)

If a mind is meant to start from one specific matter — an open problem, a
question, a situation — put it in a child `<m-origin>` rather than in the identity
prose. It is the seed of the **thought**, not the self: *what* the mind was given,
as opposed to *who* it is.

```html
<m-mind name="lemma">
  You think the way a mathematician thinks…          <!-- identity: who -->
  <m-origin name="origin">
    For a positive integer n, … are there infinitely many balanced integers?
  </m-origin>
  <m-stream …></m-stream>
</m-mind>
```

Unlike the identity, the origin does **not** stand in every frame. It works like
an opening query: a freshly-born mind is seeded with it once — it enters the first
[attention frame](architecture/index.md#the-attention-frame) as *what just
happened* — and thereafter it lives, or fades, in memory as the mind's **origin
story** (whatever [consolidation](architecture/memory.md) chose to keep). A mind
that [wakes up remembering](architecture/memory.md#persistence--waking-up-remembering)
is never re-seeded: its origin is now simply part of its past.

So reach for `<m-origin>` when a mind has a definite starting point you do not want
re-stated forever; leave it out for an open-ended mind whose identity prose already
points it at a world. The component needs a `name` so the mind can subscribe to it
(`<m-origin name="origin">`); override the wire with `originSrc` on `<m-mind>`, or
`originSrc="off"` to ignore it.

**Setting the origin per instance, at wake.** The `<m-origin>` in the file is a
*default*. To give one instance its own starting point without editing the file —
the natural case for a template woken once per person — supply `MEDITATOR_ORIGIN`:

```bash
MEDITATOR_MIND_NAME=hearth-1 \
MEDITATOR_ORIGIN="You are about to meet Imre, a retired clockmaker…" \
  bun run meditator.js -a architecture/lab/hearth.archml
```

The [Studio's](studio.md#waking-a-mind) wake panel exposes this as an editable
**origin story** field, pre-filled from the file. Either way the text replaces the
first `<m-origin>`'s content in the architecture *source* that the home snapshots
(via `applyOriginOverride` in [`src/startup/architecture.js`](../src/startup/architecture.js)),
so the vault honestly records the origin the mind woke with. A blank value is a
no-op (the file's default stands); a mind with no `<m-origin>` is untouched.

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
MEDITATOR_VOICE_MODEL=gpu-qwen bun run meditator.js -a architecture/lab/seedling.archml
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
| `OPENAI_API_KEY` | required for real image generation via `<m-image>`, and for the Studio's [Voice Mode](studio.md#voice-mode) (TTS/STT) |
| `OPENAI_IMAGE_MODEL` | default image model for `<m-image>` (default `gpt-image-1`) |
| `OPENAI_IMAGE_SIZE` | default image size for `<m-image>` (default `1024x1024`) |
| `OPENAI_IMAGE_FORMAT` | default output format for `gpt-image-1` images (default `png`) |
| `STUDIO_VOICE` | set to `0` to switch Voice Mode off even with a key present |
| `STUDIO_VOICE_NAME` | default Voice Mode voice (default `marin`; the user can also pick one in the UI) |
| `STUDIO_TTS_MODEL` | text-to-speech model (default `gpt-4o-mini-tts`) |
| `STUDIO_STT_MODEL` | speech-to-text model (default `gpt-4o-transcribe`) |
| `STUDIO_TTS_INSTRUCTIONS` | how the mind's voice should sound (default: an unhurried, warm, clearly-articulated voice) |
| `LOCAL_LLM_BASE_URL` | OpenAI-compatible endpoint for the `local` provider |
| `LOCAL_LLM_API_KEY` | key for the local endpoint (default `none`) |
| `LOCAL_LLM_THINKING` | `1`/`true` surfaces a local reasoning model's chain-of-thought **as** the conscious stream (see [Thinking mode](#thinking-mode-local-reasoning-models)) |
| `MEDITATOR_DRY_RUN` | `1` runs the whole loop offline against a stub |
| `MEDITATOR_MIND_NAME` | wake under this instance name (drives the home; the Studio's transient naming uses it) |
| `MEDITATOR_ORIGIN` | this instance's [origin story](#origin--the-first-thought-m-origin) — overrides the file's `<m-origin>` at wake |
| `MEDITATOR_STUDIO_PROJECTS` | Studio only: external [project](studio.md#tending-other-projects-spinoffs) roots to tend (`:`/`,`-separated); also `config/studio-projects.json` |
| `MEDITATOR_MAX_CONCURRENCY` | cap on concurrent *utility* calls (default `4`) |
| `MEDITATOR_STDIN` | `1` forces console input on when stdin is not a TTY |
| `MEDITATOR_DEBUG_PROMPTS` | dump every prompt sent to a model to disk (see [Dumping prompts](#dumping-every-prompt)) |

CLI flags: `--models-config` / `-mc`, `--model-profile` / `-mp`.

**Legacy `local/` prefix.** Raw model ids prefixed `local/` still work as an
escape hatch — they route to `LOCAL_LLM_BASE_URL` with the prefix stripped.
Prefer presets and profiles for anything you switch often.

By default, **hidden reasoning is disabled on every tier**: the stream itself is
the thinking, so a reasoning model's chain-of-thought would either silently eat the
burst budget or (on a local vLLM model) land in `reasoning_content` and leave the
visible burst empty. OpenRouter requests also ask for true usage/cost
(`usage.include`). The one deliberate exception is **thinking mode** on a local
model — below.

### Thinking mode (local reasoning models)

Set `LOCAL_LLM_THINKING=1` (the `thinking` field on the `local` provider in
`config/models.yaml`) to do the opposite of the default: let a local reasoning model
(e.g. Qwen via vLLM) **think, and surface that thinking _as_ the conscious stream**.
The mind's stream of consciousness becomes the model's raw `reasoning_content` trace —
you are reading the model's deliberation directly. This is an experimental mode for
studying what a reasoning model "looks like from the inside"; it is off by default.

It does **only** that — the rest of the mind keeps working normally — by way of three
mechanics in `src/modelAccess/llm.js` and `mStream.js`:

1. **Only the conscious stream thinks.** `LOCAL_LLM_THINKING` flips the whole `local`
   provider, but utility calls (`complete` / `completeWithTools`: memory compression,
   loop sensing, the scribe, tool-choice, bridges) read `message.content` and would
   break if the model spent its budget in `reasoning_content` — so they **always** send
   `enable_thinking:false`. Only `chatStream` honours the flag, and the spoken voice
   (`m-speech`) opts out too, so speech stays clean. Just the inner monologue thinks.

2. **Each burst is a fresh turn, not a prefill continuation.** The reasoning channel only
   fires on a fresh assistant turn; vLLM's `continue_final_message` (the assistant-prefill
   continuation the stream normally uses to extend the last thought token-for-token)
   **suppresses thinking entirely**. So in thinking mode the carried tail is folded into
   the *user* turn and the model thinks the monologue *onward* — a fresh deliberation that
   picks up the thread, rather than a literal continuation of the last sentence.

3. **The burst ends when the thinking ends.** The instant the model finishes its reasoning
   and switches to its answer channel (the first `content` token after any
   `reasoning_content`), the burst stops and that answer text is dropped. In thinking mode
   the reasoning *is* the thought; the post-thinking restatement only breaks the monologue's
   flow (and, given a large budget, drifts into meta-narration about the prompt).

Give the stream a much larger `burstTokens` than a prose burst — a full chain-of-thought
pass runs well over a thousand tokens, and a budget too small simply truncates the thinking
(`finish=length`) and restarts the reasoning preamble every burst. Worked seeds:
`architecture/lab/lemma-think{,-long,-short}.archml` (burstTokens 1600 / 4000 / 800). Run
with `LOCAL_LLM_THINKING=1 MEDITATOR_MODEL_PROFILE=local-dev`.

**What to expect.** The stream is *not* a first-person monologue: each burst opens with the
model's reasoning scaffolding ("Here's a thinking process: 1. Analyze the input…"), refers to
itself in the third person, and names "the user" and "the prompt". It is characterful and
often rigorous, but it is the model deliberating, not a mind musing. An observed trade-off:
**larger bursts buy more completed thoughts but also more confident confabulation** — the
shortest bursts stayed the most honest. Thinking mode is local-only; the OpenRouter path keeps
reasoning disabled regardless.

## Rhythm — how fast it thinks

On `<m-mind>`:

- `pace` (default `8s`) — the burst **tick**: bursts are scheduled this far apart
  measured from one burst's *start* to the next, not this long *after* the previous
  one finishes. So a fast burst is followed by quiet slack until the next tick, and
  a burst that overruns the tick is followed immediately by the next (nothing
  queues up). `paceSigma` (default `pace/4`) adds normal-distributed jitter so the
  rhythm breathes.
- `tailLength` (default `1500`) — characters of verbatim thought carried into the
  next burst. Larger = stronger continuity, bigger prompts.
- `bridge` (default `true`) — set `"false"` to drop the LLM-written transition
  sentence on redirects.

The effective tick is also multiplied by the [economy](#budget-and-economy) pace
factor, so a tiring mind slows down on its own. The current tick is broadcast as a
`mind/pace` telemetry event so a viewer can pace its display to it.

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
- `<m-resurface>` — `overlap` (`0.4`) is the loop-score threshold; when triggered it
  surfaces the most relevant kept note, or falls back to a generic change-of-direction
  stimulus when the notebook is empty. Subsumes `<m-loop-guard>`: running both together
  is redundant (see [components](architecture/components.md#m-resurface)). No model cost.
- `<m-associate>` — `every` (`4`) boundaries it asks a small model whether the
  stream reminds it of something genuinely different.

Full mechanics in [Interrupts & observers](architecture/interrupts.md).

## Budget and economy

`<m-economy budget="1.00">` reads real API cost at every boundary and slows the
mind as the budget drains: fresh → tiring → tired → exhausted → resting, each
band multiplying the pace (×1, ×2, ×4, ×10, ×30). The mind never dies — the
watchdog keeps it ticking even when resting.

> **Overnight recipe:** `seedling.archml` with `budget="3.00"` lasts a full night at
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

### Dumping every prompt

When the logs are not enough and you want the *exact* text sent to a model —
every stream-of-thought burst and every auxiliary call (speech, association,
memory compression, the act decide/realize stages, the visual impulse, the
bridge, the scribe) — set `MEDITATOR_DEBUG_PROMPTS`:

```bash
MEDITATOR_DEBUG_PROMPTS=1            bun run meditator.js -a architecture/lab/seedling.archml
MEDITATOR_DEBUG_PROMPTS=/var/tmp/p   bun run meditator.js   # custom root
```

`1`/`true`/`yes`/`on` dump under `./debug/prompts` (gitignored); any other
non-empty value is taken as the root directory. Unset (or `0`/`false`/`off`/
empty) disables it — **off by default**. Every model call funnels through one
place (`src/modelAccess/llm.js`), so the switch captures all of them, dry-run
included.

One file per call, laid out so the (many) files are easy to find and to prune:

```
debug/prompts/<runId>/<mind>/<tag>/<seq>-<tag>.txt
   runId  one directory per process run (YYYYMMDD-HHMMSS-pid) — prune a whole
          run by deleting its directory; the newest sorts last
   mind   the mind's slug (matches its vault home), so concurrent Studio minds
          never interleave
   tag    the mechanism: stream, speech-impulse, speech-voice, associate,
          memory-recent/memory-story, act-decide, act-realize, image-impulse,
          image-generate, bridge, kb
   seq    global, zero-padded, monotonic counter — files sort chronologically
          within a tag and when grepped flat across the run
```

Each file carries a header (time, kind, tag, mind, model, provider, maxTokens,
temperature, tools…) followed by the full messages with their roles, marking the
assistant prefill that a continued burst carries. Pruning is just `rm -rf debug/`
or deleting old `<runId>` directories.

> **Sensitive.** A dump contains the mind's full inner monologue, its memory, and
> anything a human said over the websocket — treat `debug/` like the memory vault.
