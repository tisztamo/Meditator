# Component reference

Every component is a custom element loaded from `src/mindComponents/`, built on
[Amanita](https://www.npmjs.com/package/amanita). This page lists each one's
attributes (with defaults), the pub/sub topics it speaks, and the DOM events it
raises. The components wired into the example mind (`architecture/lab/seedling.archml`)
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
| `embodimentSrc` | the hands' `<name>/embodiment` (auto-discovered) | the body schema woven into the identity (efference); `"off"` disables |
| `originSrc` | the [`m-origin`](#m-origin)'s `<name>/prompt` (auto-discovered) | the origin seed; raised once at birth as the first thought (see [`m-origin`](#m-origin)); `"off"` disables |

- **Subscribes:** `stream/boundary` (schedule next burst), `@interrupt` (think now);
  if an [`m-speech`](#m-speech) is present, `<voice>/speaking` (thin thinking while
  talking); memory's `tail` / `compressed` topics — the frame's narrative content
  is *mirrored* from those, never pulled (see [decoupling.md](decoupling.md)); and, if
  an [`m-act`](#the-hands-m-act--m-look) is present, its `embodiment` topic — the body
  schema woven into the identity so the mind knows what it can reach; and, if an
  [`m-origin`](#m-origin) is present, its `prompt` topic — the origin seed, raised once
  at birth (see [`m-origin`](#m-origin)).
- **Publishes:** `prompt` — `{system, frame, prefix?, dedupe, kind, burstTokens?}`; and
  `attended` — the rendered stimuli entering a frame, which a memory journals as
  perceived (⟂) notes.
- **Key behavior:** error boundaries trigger an exponential backoff (×2 up to ×8);
  the inter-burst pause is also multiplied by the economy pace factor and, while
  speaking, by `speakingPaceFactor` (with `burstTokens` thinned) — so most verbal
  effort goes to the utterance while thought keeps trickling. Exposes `sleep()`
  for the [sleep ritual](memory.md#sleep-is-announced).

## `m-origin`

The seed of the **thought**, held apart from the identity (the seed of the *self*).
A child `<m-origin>` carries the one matter a mind is first set upon — `lemma`'s open
problem, a question, a situation. *What* the mind was given, not *who* it is.

Like [`m-prompt`](#legacy-and-demo-components), it is a content slot, not an
autonomous faculty — but it is a **producer**: on connect it publishes its text on
its own `prompt` topic (from a `prompt="…"` attribute or its text content), so the
mind reads it by subscription, never a `querySelector` reach-in
([decoupling.md](decoupling.md)). It therefore needs a `name`.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `name` | — | required, so [`m-mind`](#m-mind) can build the `originSrc` ref to it |
| `prompt` | — | the origin text; falls back to the element's text content |

- **Publishes:** `prompt` — its content (the [`MBaseComponent`](#shared-infrastructure) default).
- **Lifecycle:** [`m-mind`](#m-mind) mirrors it via `originSrc` and, **only for a
  freshly-born mind** (one whose memory came up empty), raises it once as an `Origin`
  `interrupt-request` so it enters the first [attention frame](index.md#the-attention-frame)
  as *what just happened* — like an opening query. Thereafter it lives or fades in
  [memory](memory.md) as the mind's **origin story**; it never stands in later frames,
  and a mind that wakes up remembering is never re-seeded. See `src/mindComponents/mOrigin.js`.
- **Per-instance override at wake:** the element's text is a *default*. `MEDITATOR_ORIGIN`
  (or the [Studio's](../studio.md#waking-a-mind) editable "origin story" field) replaces it
  for one instance without editing the file — see [Configuration](../configuration.md#origin--the-first-thought-m-origin).

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
  gist + salience, or `NONE`. A reach can be outward (find out / change something) **or
  inward** — turning back to find again something the mind set down before, which the
  gate explicitly counts as a real reach (especially when the mind is unsure or going
  over the same ground), so a read is not dismissed as idle musing. Gated by
  `threshold`, the cooldown lane(s), per-intent dedup, and arousal/budget.
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
| `cooldown` | `3m` | minimum gap between two acts (the world-changing lane) |
| `readCooldown` | — | when set, read-only hands (look, recall) run on their own cooldown lane of this length, so a recent write never blocks a read; absent, all hands share `cooldown` |
| `intentCooldown` | `15m` | minimum gap before re-acting on the *same* intent |
| `minArousal` | `0.15` | stand down entirely when the economy's arousal falls below this |
| `model` | inherits `model` | the tool-calling realizer (the "actor"); low temperature (0.2) |
| `decisionModel` | inherits `utilityModel` | the cheap decide gate |
| `realizeTokens` | `512` | max tokens for the realize call |

Plus all `m-observer` attributes.

- **Capabilities register, the menu is closed:** each child capability calls
  `registerCapability({name, description, parameters, felt?, readonly?, execute})` on
  connect. `description`/`parameters` are *machine-facing* (the realizer's tool schema);
  `felt` is *world-facing* — a first-person, no-mechanism sense of the affordance, in
  the mind's own voice. The realizer can only ever call a *registered* hand with
  *schema-validated* args — it cannot invent one. A mind has exactly the hands its
  `.archml` wires in, the way a body plan does; the blast radius is auditable by reading the file.
- **The body schema (embodiment):** m-act joins every hand's `felt` line into an
  `embodiment` it publishes; the mind weaves it softly into its identity
  ([`m-mind`](#m-mind)'s `embodimentSrc`). So the mind *knows what it can reach the way
  it knows its own hands* — standing self-knowledge, never a tool menu. This is what
  keeps a capability reachable (and re-discoverable when it fires) even when the stream
  never wanders into its domain on its own (efference.md §Embodiment).
- **Publishes:** `intent` — `{salience, gist, accepted, reason}` for every decide
  (observability, like speech's `impulse`); `acted` — `{intent, capability, args, ok,
  experience, data}` for each deed, which a memory journals as a backstage (⌁) note
  via its `actedSrc`; `embodiment` — the assembled body schema (above).
- **Dispatches (DOM, bubbling):** the **consequence** as an `External`,
  non-urgent `interrupt-request` (`type: Sense-<capability>`) — so it flows through
  the arbiter into the frame and is journaled perceived (⟂) via `attended`, exactly
  like a sense. The consequence reads as **self-caused** ("I turn to look, and…") — a
  faint efference copy so the mind learns it acted — but still names no mechanism. It
  is *never* a topic.
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
configured. Its consequences read self-caused ("I turn to feel what the weather is
doing. …"). `felt`: *"When something about the world outside tugs at you … you can let
your attention go to it, and a little while later you simply find that you know."*

### `m-note` — the first world-changing hand (leave a mark)

The mind can **set a thought down** somewhere outside itself, to be found again later.
This is the deepest answer to the interoception worry: the mind doesn't only *look* at
a world it can't touch — it leaves a residue on one, closing a real act→world→sense
loop (with [`m-recall`](#m-recall-read-a-kept-note-back)).

Because it changes the world it is `readonly:false`, and its guardrail is **structural**
(efference.md §6c): the realizer supplies only the note's `text` (and optional `title`)
— it **never names a path**. m-note always appends to one `notebook.md` inside its own
notes dir, so there is no path-traversal vector and the blast radius is one append-only
file in one allow-listed directory.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `name` | `note` | the tool-call function name |
| `dir` | vault `notes/` | the notes directory (the only place it writes) |
| `maxChars` | `1200` | cap on a single note's length |
| `salience` | `0.6` | salience of the "I set this down" consequence — above ambient, so the felt return of a deliberate act survives a busy exchange |

`felt`: *"When a thought matters enough to keep, you can set it down somewhere outside
yourself — and trust that it will still be there … when you come back for it."* Pure
helper `parseNotebook(md)` → `{stamp, title, text}[]` is exported (used by m-recall).

### `m-recall` — read a kept note back

The read-only return arc of m-note's loop: the mind can **come upon a thought it set
down before**, in its own words. With an `about` hint it prefers a note that touches it,
else the freshest not surfaced recently. It draws from **both** the notebook and the
scribe's `knowledge/` ([compression fidelity §5](compression-fidelity.md)), so it can
find again a conclusion it once filed, not only a hand-written note — felt as *"I find
again something I had worked out"* rather than *"…set down"*. It is the gentler, more
inward-facing of the pair — recalling one's own thoughts is closer to interoception than
looking at the weather, so it should not *lead* — but they are real external residue, so
it is a genuine small encounter, not mere rumination.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `name` | `recall` | the tool-call function name |
| `dir` | vault `notes/` | the notes directory (share m-note's) |
| `kb` | vault `knowledge/` | the scribe's KB, folded into the same pool (`"off"` for notes only) |
| `salience` | `0.6` | salience of the "I find again…" consequence (matches m-note: a deliberate look-up should clear the bar as reliably as a set-down) |

`felt`: *"And the things you've set down are not lost: when one of them stirs in you
again, you can turn back and find it, just as you left it."* Pair it with m-note:
`<m-act ...><m-note name="note"/><m-recall name="recall"/></m-act>`.

As a **hand**, recall only fires when the conscious stream reaches for it — but a
forgetting mind does not know it has anything to look up (lemma-6: 43 writes, 0 reads).
For the *involuntary* return arc — a kept note pushed back unbidden when the mind loses
its thread — see [`m-resurface`](#m-resurface).

### `m-terminal` — run a small computation (the strongest world-changing hand)

The third world-changing hand and the most powerful ([terminal.md](terminal.md)): the
mind can **write a short Python or shell script and actually run it, sandboxed**, then
read what came up on the screen. It makes lemma's confabulated blinking cursor *real* and
points it at the mathematics — the difference between almost-reaching a proof by hand
forever and being able to settle it. The realizer fills only a closed two-field verb
(`language` + `script`); it never names a path, a host command, or a shell.

The One Rule still holds: the stream never sees a shell, an exit code, or "the subprocess
returned." A script's **traceback is content** the mind perceives (debugging is the point);
a **hand slip** (the sandbox won't start) is mechanism and stays silent. The result rides
back as *"I run it, and the screen answers: …"* — first-person, world-facing, no mechanism.

**The grace race (the latency model, §2).** A script may take 50ms or 50s, so the run is
raced against `grace`: finishes within it → the full result returns at once (feels
instantaneous); still running after it → an ambient *"I set it going; the cursor blinks…"*
sensation returns now (the hands free up, the mind keeps thinking) and the **result is
dispatched later** as the hand's own urgent `interrupt-request` through the afferent bus —
the deferred-consequence path [`m-recall`](#m-recall--read-a-kept-note-back)/`m-sense`
already ride. The blinking cursor lives *only* in the waiting line, because only there is
it literally true (the §1 substrate attractor, turned into a real surface aimed at work).

**The guardrail (§4).** It runs arbitrary code, so it carries the strongest guardrail,
**probe-gated at startup**: a tiny script is run through the chosen backend, and **if none
passes the hand does not register at all** (fail-safe — no phantom hand). Backends in
preference order: `bwrap` → rootless `unshare` → inert. Network off by default; **env
scrubbed to a minimal allow-list** so no host secret (`OPENROUTER_API_KEY`, …) can ride
back as a "sensation" (the single most important line — [sandbox.js](../../src/infrastructure/sandbox.js));
rlimits (CPU/address-space/file-size/process-count); GNU `timeout` wall-clock + a JS
watchdog; one writable per-run desk under `memory/<mind>/workspace/run-<stamp>/`
(gitignored — scratch, not versioned; `.runs/` keeps the verbatim script+output
transcript). Single-slot: one script at a time. Dry-run returns a deterministic stub.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `name` | `terminal` | the tool-call function name |
| `workspace` | vault `workspace/` | the desk root; a per-run subdir is created under it |
| `wall` | `20s` | wall-clock timeout |
| `grace` | `2s` | finish within this → one consequence; else started + deferred result |
| `cpu` | `10s` | CPU-seconds cap (`ulimit -t`) |
| `mem` | `1g` | address-space cap (`ulimit -v`) |
| `fileSize` | `64m` | file-size cap (`ulimit -f`) |
| `maxProcs` | `256` | process-count cap (`ulimit -u`) |
| `maxOutput` | `16k` | output captured/shown before truncation |
| `network` | `off` | `"on"` opts the run into having a network route |
| `salience` / `startedSalience` | `0.7` / `0.45` | result / "I set it going" saliences |
| `urgent` | `true` | re-enter the result urgent (as m-recall does) |

`felt`: *"When a question turns concrete — a count to run, a family to search, a guess to
check against the actual numbers — you don't only reason it by hand; you can sit down and
actually work it out, and a little while later read what comes back on the screen."* Wire
it as `<m-act ...><m-terminal name="terminal" wall="20s" grace="2s"/></m-act>`. It is
`readonly:false`, so it runs on the world-changing cooldown lane and is **off unless
explicitly wired**. Backend choice & the rootless recipe: [terminal.md](terminal.md) §4.

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
- **Helper:** `raise(reason, {salience, urgent, suggestion, type, clearsTail, settle, episode, kind})`
  → dispatches an `interrupt-request`; returns `false` if on cooldown. (`clearsTail`/`settle`/
  `episode`/`kind` are the loop-break bid properties — see [`m-loop-detector`](#m-loop-detector).)

## `m-loop-guard`

Repetition detector (extends `m-observer`). No model cost.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `overlap` | `0.3` | loop-score threshold `0..1` (raise to tolerate more circling) |
| `salience` | `0.85` | salience of the change-of-direction stimulus |

Plus all `m-observer` attributes. Acts at boundaries once the window holds ≥ 700
chars; raises `type: LoopGuard` and clears its window on a hit. Its repetition math now
lives in the neutral `loopMath.js` util (`loopScore`/`contentStems`/…), imported as a
library rather than owned here.

> **The simple, all-in-one option.** `m-loop-guard` both *detects* (pure code, no model) and
> *intervenes* (a generic change-of-direction nudge) in one component. It is the cheap choice
> for a lab or example mind that wants loop protection with no LLM cost. The richer, decoupled
> alternative — used by the lemma resident — splits those jobs across
> [`m-loop-detector`](#m-loop-detector) (an LLM *sense* that only publishes a signal) and one
> or more *breakers* ([`m-clear-mind`](#m-clear-mind), [`m-resurface`](#m-resurface)) that bid
> on it, and additionally **clears the tail** so the loop is not re-fed into the next prefill.
> Use one approach or the other, not both. See
> [improvements/loop-detection-redesign.md](../improvements/loop-detection-redesign.md).

## `m-associate`

Associative observer (extends `m-observer`) — the internal source of direction
changes.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `4` | evaluate at every Nth completed boundary |
| `model` | inherits `utilityModel` | the tiny association model |

Plus all `m-observer` attributes. Reads the last ~1200 chars; the model answers
`NONE` or `SALIENCE`/`THOUGHT`; raises `type: Association` at the model's salience.

## `m-loop-detector`

The **sense** half of decoupled loop handling (extends `m-observer`;
[loop-detection-redesign.md](../improvements/loop-detection-redesign.md)). On a cadence it
reads the memory **`tail`** (the text that seeds the next prefill, not a private window) and
makes **one** utility-model call: *is this circling? score it, name the vocabulary it is
stuck on, what kind, why.* It parses the reply and does nothing but `pub("loop", …)` — it
never intervenes. The LLM reading *meaning* retires the pure-code `loopScore` as the
*decision* (so the conjecture word *infinite* no longer false-trips) and the hand-tuned bliss
lexicon (the LLM's `kind`/`vocabulary` subsume it).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `every` | `5` | check at every Nth completed boundary |
| `minTail` | `700` | min tail chars before it judges |
| `minScore` | `0.5` | score at/above which a "yes" counts as an active loop |
| `minArousal` | `0.1` | stand down below this arousal (a near-exhausted mind is not checked) |
| `tailSrc` | mind's `m-memory/<name>/tail` | the tail topic to read (`"off"` → the stream window) |
| `model` | inherits `utilityModel` | the detection model |

Publishes the `loop` topic `{active, score, kind, vocabulary[], reasoning, at}` — standing
state, like `economy/arousal`: one published state, N independent reactions. The `reasoning`
is the model's judgement *about* the mind (for the dashboard/logs), never first-person and
never journaled. The dashboard reads `loop` for observability.

## `m-clear-mind`

The **default breaker** / floor (extends `m-observer`). It subscribes to the detector's
`loop` signal and, when active, bids a **low** salience to clear the mind and pick up another
thread — guaranteeing a break even when nothing is worth recalling. It owns only its
generic continuation (`<m-phrase for="redirect">`-localizable); the act of clearing is owned
by the mechanism (see below).

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `salience` | `0.5` | bid salience — low, so a substantive breaker outbids it |
| `loopSrc` | mind's `m-loop-detector/<name>/loop` | the signal to react to (`"off"` disables) |
| `cooldown` | `0ms` | the per-episode guard is the real throttle |

## `m-resurface`

A **breaker** (extends `m-observer`) — the **push** half of the note loop, the counterpart
to the [`m-recall`](#m-recall--read-a-kept-note-back) *pull* hand. When
[`m-loop-detector`](#m-loop-detector) publishes that the mind is circling, m-resurface bids
to break the loop by handing back a **real kept thought that pulls AWAY from the rut**: the
substantive note whose vocabulary is **farthest** from the loop's `vocabulary` (min overlap,
recency tiebreak). It draws from **both** the notebook and the scribe's `knowledge/`
([compression fidelity §5](compression-fidelity.md)) — a filed conclusion is felt as *"…something
I came to understand"* rather than *"…set down"*. A few small file reads per hit; no model
cost to decide *or* act. Born from lemma-6's write-only memory (43 note-writes, 0 reads: it
re-derived a proof it had already written, sitting unread).

**Detect ≠ recall ≠ resurface.** The detector senses; [`m-recall`](#m-recall--read-a-kept-note-back)
is the desire-pulled hand that ranks by **relevance** (overlap); m-resurface is a loop breaker
that ranks by **distance** (far-from-the-stuck-vocabulary). "Far" subsumes the old least-bliss
pick with no lexicon: a [bliss](../glossary.md) loop → bliss `vocabulary` → the farthest note
*is* the least-bliss note; an all-presence notebook → even the farthest note is still presence
→ too close → it does not bid, and the [`m-clear-mind`](#m-clear-mind) floor takes the cut
rather than re-injecting the attractor.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `salience` | `0.75` | bid salience — above the floor, below an urgent voice |
| `minNoteChars` | `120` | a note must be this long to count as substantive |
| `farThreshold` | `0.4` | if even the farthest note shares ≥ this of the loop's vocabulary, it does not bid (the floor takes it) |
| `dir` | vault `notes/` | the notes directory (share m-note's) |
| `kb` | vault `knowledge/` | the scribe's KB, folded into the same pool (`"off"` for notes only) |
| `loopSrc` | mind's `m-loop-detector/<name>/loop` | the signal to react to (`"off"` disables) |
| `cooldown` | `0ms` | the per-episode guard is the real throttle |

Plus all `m-observer` attributes. Raises `type: Recall` with **`clearsTail`** (the arbiter
admits it past threshold + rate-limit without preempting) + `episode` (so co-bidding breakers
resolve to one cut), first-person and self-caused ("I turn back to something I set down
before…"), naming no mechanism. With an empty notebook, or when every kept note is too close,
it simply does not bid — the floor breaks the loop. Wire it as a **direct child of the mind**
(not inside the `drift` region) so its salience is undamped by a region gain.

**The break.** A winning `clearsTail` bid does not just add a stimulus — [`m-mind`](#m-mind)
**replaces the tail**: it composes a fresh seed (a localized clearing prefix it owns +
the breaker's own continuation), fires a `clear-tail` event that [`m-memory`](#m-memory)
subscribes to (reseed the tail, drop the overflow, journal the ⟂ self-caused cut, re-`pub`
`tail`), and seeds *this* burst's prefill with it — so the loop is not re-fed verbatim into
the next prefill, the structural fix the old "raise a stimulus" path missed. A real
preempting stimulus (a human voice) at the top of the arbiter cancels a pending break —
engaging already broke the loop. See
[improvements/loop-detection-redesign.md](../improvements/loop-detection-redesign.md).

## `m-phrase`

One localized phrasing, the smallest unit of a mind's i18n. It simply HOLDS a piece of text
under a named slot (`for="…"`), for a neighbouring component to pick up — instead of one wide
translation table, a component's voice is composed from many small `<m-phrase>` elements
beside it in the `.archml`. The language is ambient: a single `lang="hu"` on `<m-mind>`
colours the whole tree, read via `env()` (see `src/mindComponents/i18n.js`). A component asks
a `Phrasebook` for a slot and gets the line in the active language — resolved local-first:
the `<m-phrase>` children given in the `.archml`, then the component's built-in defaults for
that language, then its built-in English. With no `<m-phrase>` present an English mind keeps
working untouched, so a language is added purely by dropping phrases into its `.archml`.

| Attribute | Default | Meaning |
|-----------|---------|---------|
| `for` | — | the slot this phrase fills (required; an entry with no `for` is ignored) |
| `lang` | — | optional, documentary — the ambient `<m-mind lang>` already selects the language |

Several `<m-phrase>` sharing a `for` form a rotation pool (so a recurring line varies its
words). A slot need not be a sentence, and it can override a fixed phrase a component
supplies — e.g. `<m-phrase for="redirect">` localizes [`m-clear-mind`](#m-clear-mind)'s
loop-break continuation, or `<m-phrase for="clearing">` on `<m-mind>` localizes the clearing
prefix. These primitives live in the runtime so its own components can localize what they
raise; a localized project (hearth) re-exports them rather than carrying its own copy.

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
