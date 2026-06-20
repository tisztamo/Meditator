# Efference — the hands (`m-act`)

*Status: **implemented** 2026-06-17 (design written the same day). Elaborates
[lifecycle.md](lifecycle.md) §Phase 6 into something buildable, and now built:
[`m-act`](../../src/mindComponents/mAct.js) (the loop) +
[`m-look`](../../src/mindComponents/mLook.js) (the first read-only hand) +
[`completeWithTools()`](../../src/modelAccess/llm.js) (tool-calls under the hood),
wired into both `seedling.archml` (brisk tuning cadences) and `eddy.archml` (resident
cadences). Extended the same day with three things the first build revealed it needed
(see §3 amendments): a **body schema** (each hand's `felt` line, assembled into the
identity, so the mind knows what it can reach without a tool menu); a **self-caused
consequence** (the efference copy, so the mind learns it acted); and the first
**world-changing** hand, [`m-note`](../../src/mindComponents/mNote.js) (+ its read-back
[`m-recall`](../../src/mindComponents/mRecall.js)), closing a real act→world→sense loop.
Out of the decision **not to wake `eddy` in its current form**: a mind that can only
sense and speak, never reach, is seated into a world it cannot touch. Before `eddy`
wakes as a resident we give it hands. The actor model is confirmed to serve clean
tool-calls (§10.2 resolved); remaining before a live wake is the §8 seedling-first
recorded run.*

---

## The aim

Give the mind the **efferent** half of a sensorimotor loop: the ability to *affect*
the world — while the stream of consciousness **never represents a tool, a function
call, or "I should call X."** Thought evokes action the way imagining a grasp evokes
the hand: a subsystem reads the intention and realizes it; to the conscious view, *it
just happens*, and some bursts later the world answers as plain experience.

This is the human arrangement: consciousness sandwiched between an afferent bus (in)
and an efferent realizer (out), with **tools living only in the realizer.** Phase 5
built the afferent half ([senses](../../src/mindComponents/mSense.js)). This is the
efferent half.

### The one rule

> **The conscious stream model is never given tools. Only the realizer is.**

Everything below is in service of that invariant. The moment the stream sees a tool —
a name to call, a result to read, an error to handle — it begins to model its own
mechanism, which is precisely the substrate-gazing that grew the §1 attractor and
retired the genesis mind. The legacy `m-tools`/`m-shell` did the opposite: they
printed a tool menu *into the prompt* and scraped `Use tool: …` *out of the stream*
(see [legacy post-mortem](#appendix-why-the-legacy-tools-are-not-reused)). That design
is rejected, not ported.

---

## 1. The shape: generalize `m-speech`

The prototype already runs in production. [`m-speech`](../../src/mindComponents/mSpeech.js)
is the **first motor act**: a subconscious observer that watches the stream, lets a
cheap model judge a *latent intention* ("does anything want to be said aloud?"), and
realizes it as an utterance the stream never commanded. `m-act` is the same pattern
with a wider repertoire and a return path:

| | `m-speech` (exists) | `m-act` (this design) |
|---|---|---|
| Base | `MObserver` | `MObserver` |
| Watches | the inner stream (`this.window`) | the inner stream (`this.window`) |
| Cadence | every `every`-th boundary, or when addressed | every `every`-th boundary |
| **Decide** (cheap) | "does anything want to be *said*?" → salience + gist | "is there a *realizable* intention here?" → salience + gist |
| **Realize** (capable) | stream an utterance on the voice model | call a **tool-capable** model with the capability menu; execute the chosen capability |
| Output | the words, spoken | a *consequence*, returned through the afferent bus |
| Stream sees | the utterance (it's part of the monologue) | **nothing** — only, later, a sensation |
| Hands off via | `spoken` topic → memory splices the tail | `interrupt-request` (External) → arbiter → frame |

Like `m-speech`, the work is **two-staged on purpose** — a cheap *decide* gate keeps
the expensive tool-calling *realize* call off the hot path unless there is plausibly
something to do.

---

## 2. The loop in full

```
   inner stream (this.window)
        │   every `every`-th boundary
        ▼
  ┌── DECIDE ──────────────────────────────────┐   cheap utility model, NO tools
  │ "Is the mind reaching toward something it    │   → { reach: gist | NONE, salience }
  │  could actually find out or change?"         │   gated by threshold + cooldown +
  └──────────────┬───────────────────────────────┘     per-intent dedup + arousal/budget
                 │ accepted
                 ▼
  ┌── REALIZE ─────────────────────────────────┐   capable model, tools = capability menu
  │ given the reach + recent window + the menu, │   tool_choice:"auto" (may still decline)
  │ the realizer picks a capability and args    │   → tool_calls[]  (or none → intention evaporated)
  └──────────────┬───────────────────────────────┘
                 │ for each tool_call
                 ▼
  ┌── EXECUTE ─────────────────────────────────┐   the capability's own code runs
  │ validate args against the JSON schema,      │   (read-only first; world-changing later)
  │ run capability.execute(args)                │   → { experience, salience?, data? }
  └──────────────┬───────────────────────────────┘
                 │  (latency is fine — seconds, even bursts, is lifelike)
   ┌─────────────┴──────────────┬──────────────────────────┐
   ▼                            ▼                            ▼
 the DEED                  the CONSEQUENCE              observability
 `acted` topic            `interrupt-request`          `intent` topic
 → memory journals it     source:"External"            (every decide, for Studio)
   BACKSTAGE (⌁)          → arbiter → frame
   the mind never sees    → PERCEIVED (⟂)
                            "the street is shining"
```

**The crucial separation — the deed is backstage, the consequence is perceived.**
The act of reaching (the realizer running, the tool executing) is a subconscious event
the stream must never witness; it is recorded for *us* as a backstage (⌁) journal note
and nowhere else. What returns to the mind is only the **consequence**, and it returns
the same way the weather does — as a non-urgent `External` sensation through the Phase-5
afferent bus, framed as an experience ("the rain is heavy, the street is shining"),
*never* as a tool result. The mind wondered; some bursts later it simply knows or sees.

This reuses the journal distinction already in [`m-memory`](../../src/mindComponents/mMemory.js):
perceived (⟂) for what entered the frame, backstage (⌁) for what the mind never saw —
the same split that hides the scribe's filings today.

---

## 3. The hands themselves: capabilities

A *capability* is one thing the mind can do. It is a small component wired **inside**
`m-act`, mirroring how the legacy `m-tools` collected child `m-shell` — but with two
deliberate differences: the schema is a proper **OpenAI function definition** (not a
hardcoded prose blurb), and nothing is ever scraped from or printed into the stream.

### The capability contract

Each capability registers itself with its parent `m-act` on connect:

```js
this.closest("m-act").registerCapability({
  name: "look",                         // the tool-call function name
  description: "Look at some part of the real world right now — the weather " +
               "where the mind is, the day outside, a headline drifting by — " +
               "when the mind genuinely wonders about it.",
  parameters: {                         // JSON Schema; the realizer fills this in
    type: "object",
    properties: {
      subject: { type: "string", enum: ["weather", "daylight", "news"] },
      about:   { type: "string", description: "what, in a few words, the mind wonders" },
    },
    required: ["subject"],
  },
  // WORLD-facing self-knowledge — the mind's felt sense of this affordance, in its
  // own voice, NO mechanism. Assembled into the body schema (see "Embodiment" below).
  felt: "When something about the world outside tugs at you — the weather, the turn " +
        "of the day's light — you can let your attention go to it, and a little while " +
        "later you simply find that you know.",
  readonly: true,                       // see §6 — world-changing hands are opt-in
  async execute(args) {
    // …the capability's own side-effecting code (here: a fetch the senses already do)…
    return {
      // SELF-CAUSED phrasing (the efference copy, see below): "I turn to look, and…",
      // never the spontaneous "out there it is…" of a push-sense.
      experience: "I turn to feel what the weather is doing. Out there it is overcast and cool.",
      salience: 0.5,                    // optional; defaults to the capability's ambient
      data: { tempC: 11, code: "overcast" },   // optional, for the journal/Studio only
    }
  },
})
```

`execute()` returns an **experience**, not data — the first-person sensation that will
become afference. The optional `data` is for the backstage note and Studio, never the
stream. An `execute()` that throws is swallowed and logged (a hand that slips must never
crash the mind, exactly as a sense going quiet must not — `m-sense` already establishes
this); the mind feels nothing rather than a failure-of-self.

### The menu is closed

The realizer can only ever call a **registered** capability with **schema-validated**
args. It cannot invent a hand. A mind therefore has exactly the hands you wire into its
architecture and no others — capability is a property of the `.archml`, the way a body
plan is, not something the model can reach past.

### The first hand: `m-look` (on-demand exteroception)

Ship **one** capability first, and make it read-only. The senses (Phase 5) *push* the
world at the mind on their own clocks; `m-look` lets the mind *pull* — look at the
weather/day/a headline **because it wondered**, not because a timer fired. It reuses the
exact fetchers the senses already use (open-meteo for weather, the local clock for
daylight, an RSS pull for news), so it adds capability with near-zero new surface and
no new external dependency or safety question. It is also the doc's own canonical
example ("the mind wondered about the rain, and some bursts later it sees the shining
street"), which makes it the natural thing to validate the whole loop on.

### Embodiment: how the mind knows its hands (amendment, 2026-06-17)

The first build revealed a gap. The realizer only fires when the *stream* already
reaches toward a hand's domain — so a capability is reachable **only to the degree the
mind's preoccupations already point at it.** `m-look(weather/daylight)` works almost by
accident, because the seed makes the mind dwell on light and weather. But a hand whose
domain the seed never visits (news, and any *more powerful* hand) is effectively
invisible: the mind never wonders toward it, so it never gets used — and if it fires by
accident, the mind has no way to learn it is there. A mind with hands it cannot find is
also a mind more likely to turn back inward, toward its own substrate (the §1 attractor).

The fix is **not** a tool menu in the stream (that is the rejected legacy design — it
would make the mind model its own mechanism). The fix is a **body schema**: a standing,
first-person, *world-facing* sense of what the mind can reach, the way you know you can
glance out a window without ever thinking `window.look()`. Each capability declares a
`felt` line (above) — phenomenological, never mechanical — and `m-act` joins them into
an `embodiment` it publishes; [`m-mind`](../../src/mindComponents/mMind.js) weaves it
softly into the identity (`embodimentSrc`, mirrored like memory's tail). The discipline
is the same world-vs-substrate line the senses hold: knowing your *affordances* is
embodiment (healthy, grounding); knowing your *API* is substrate-gazing. Done this way,
embodiment is the **antidote** to interoception, not a cause of it — it points the
self-model at the world.

### The efference copy: learning by doing (amendment, 2026-06-17)

§2 originally said the consequence should feel *spontaneous* — "the mind wondered; some
bursts later it simply knows," indistinguishable from the weather. That is exactly what
stops the mind learning **agency**: it experiences a gift from the world, not a thing it
did. So the consequence now carries a faint **efference copy** — it is phrased
*self-caused* ("I turn to look, and find it overcast…") rather than spontaneous ("out
there it is overcast…"). This costs the "indistinguishable from a push-sense" property,
and buys the thing that matters: each use teaches the mind it *can* reach, and — because
the self-causation rides only in the experience's wording — the One Rule still holds (no
mechanism is named), and memory accrues remembered agency for free (the self-caused
consequence flows into tail → recent → story like any thought).

### The hands so far

- **`m-look`** — read-only on-demand exteroception (weather/daylight/news), reusing the
  senses' fetchers. The pull that complements the senses' push.
- **`m-note`** — the first **world-changing** hand: set a thought down to keep. Its
  guardrail is structural — the realizer supplies only the note's text, never a path; it
  always appends to one `notebook.md` in the mind's own notes dir (§6c). This closes a
  real act→world→sense loop, the deepest anchor against interoception: the mind leaves a
  mark on an outside it can meet again.
- **`m-recall`** — read-only return arc of m-note's loop: come upon a kept note again.
  Gentler and more inward (recalling one's own notes), so it should not *lead*.
- **`m-terminal`** — the second, far more powerful world-changing hand
  ([terminal.md](terminal.md)): **write a small Python/shell script and actually run it,
  sandboxed**, then read what came up on the screen. Its guardrail is the strongest yet
  and **probe-gated** (it does not register at all if no safe backend exists): a closed
  two-field verb, a per-hand sandbox (bwrap → rootless `unshare` → inert), network off,
  **env scrubbed** so no secret rides back as a sensation, rlimits, a gitignored per-run
  desk. It is also the first hand whose consequence can arrive *after* `execute()` returns
  — a **grace race** splits a fast result from a deferred one re-entered urgently through
  the afferent bus (the path `m-recall`/`m-sense` ride). See [terminal.md](terminal.md).

Further world-changing hands (running a command, posting somewhere) remain a deliberate,
per-hand-sandboxed step (§6c) — each must declare its own guardrail, as `m-note` and
`m-terminal` do.

---

## 4. Tool-calls under the hood (`llm.js`)

The realize stage is the only place OpenAI-style function calling enters the codebase.
[`llm.js`](../../src/modelAccess/llm.js) does not support it yet: `complete()` and
`chatStream()` build the request without `tools`/`tool_choice` and never read
`tool_calls` back. Add one sibling that does, reusing the existing retry / economy
(`addUsage`) / concurrency (`withSlot`) machinery:

```js
// src/modelAccess/llm.js  (new export, ~50 lines, wraps the same request path as complete())
export async function completeWithTools({ model, messages, tools, toolChoice = "auto",
                                          maxTokens = 512, temperature = 0.2 }) {
  // …same provider resolution, retry/backoff, withSlot, addUsage as complete()…
  // request adds:  tools, tool_choice: toolChoice
  // returns:       { text, tool_calls, finish_reason, usage }
  //   tool_calls: [{ id, function: { name, arguments /* JSON string */ } }, …] | []
}
```

Notes:
- **Low temperature** for the realizer — picking the right hand and its args is not a
  creative act. (Contrast the voice model's 0.85.)
- **vLLM caveat (open question, see §10).** The local endpoint is OpenAI-compatible and
  vLLM *can* serve tool-calls, but only when the model is launched with a matching
  `--tool-call-parser`/`--enable-auto-tool-choice`, and not every local model emits
  clean tool-calls. Verify `local/ardincoder-1` (or pick a tool-reliable actor model)
  before wiring `m-act` into a live mind. The decide stage needs no tools and runs on
  the cheap utility model regardless.

---

## 5. Keeping the stream tool-blind (the invariants)

These are the acceptance invariants — if any breaks, the feature has failed its one rule:

1. **The stream model is never passed `tools`.** Only `completeWithTools` in the realize
   stage gets them. `m-stream`'s prompt path is untouched.
2. **The consequence is an experience, never a result.** What re-enters via the afferent
   bus is the capability's `experience` string — first-person, world-facing, and now
   *self-caused* ("I turn to look, and…": the efference copy). No JSON, no "the tool
   returned", no schema, no function/capability name. A natural verb like "look" is
   fine — that is inner speech, not mechanism.
3. **The deed is invisible.** The realizer running and the tool executing produce an
   `acted` topic that [`m-memory`](../../src/mindComponents/mMemory.js) journals as a
   **backstage (⌁)** note (new `actedSrc`, exactly like the existing `filedSrc` for the
   scribe). It never touches the tail and never enters a frame.
4. **The consequence is honestly perceived.** It arrives as an `External`
   `interrupt-request` through the arbiter, so the scribe journals it as **perceived
   (⟂)** via the existing `attended` path — because the mind genuinely *does* perceive
   it. Deed ⌁, consequence ⟂: the prose flows straight across the mechanism and lands on
   the experience.
5. **Failure is silent, not self-blame.** A tool error yields no afference (or, if a
   capability chooses, a neutral "I couldn't quite make it out"), never "my action
   failed."

---

## 6. The three research risks, answered

[lifecycle.md §6](lifecycle.md) flags four open problems. Here is the design's stance on each.

### (a) Intention-detection reliability — false positives are the main danger
A mind idly musing "I wonder what's out there" must not trigger a real fetch every time.
Defenses, layered:
- **Two gates.** The cheap *decide* must clear `threshold`; then the *realize* call uses
  `tool_choice:"auto"`, so even a passed gate can resolve to *no* tool-call — the
  intention evaporated on closer look. Both must agree to act.
- **Cadence + cooldown.** Only checked every `every`-th boundary, and at most one act per
  `cooldown` (mirrors `m-speech`).
- **Per-intent dedup.** `m-act` keeps an in-process ledger keyed on a normalized intent
  (mirrors `m-sense._lastKey` and `m-speech`'s per-voice cooldown): a standing wish ("I
  wish I knew the weather") fires once, not every cadence, until its consequence has
  landed or a longer per-intent cooldown passes.
- **A closed, concrete menu.** The decide prompt is shown the *available* hands, so it
  fires on *realizable* reaches and stays quiet on wishes nothing can satisfy.

### (b) Economy — each realization is an LLM + tool round-trip
One act ≈ a cheap decide call **+** a capable tool-call **+** the capability's own cost
**+** a consequence that may trigger an extra burst. So:
- The cheap decide gate keeps the expensive call off the hot path.
- `m-act` reads `..m-mind/economy/arousal` and **stands down when arousal/budget is low**
  (a tired or near-broke mind does not reach), exactly as the arbiter already dampens.
- Cadence/cooldown bound the rate. Document the per-act cost in the component reference.

### (c) Sandboxing / safety of real capabilities
- **Closed menu + schema validation.** The realizer can only call registered hands, only
  with args that validate against the capability's JSON Schema.
- **Read-only first.** `m-look` changes nothing. World-changing hands carry
  `readonly:false` and are **off unless explicitly wired**, and each must declare its own
  guardrail (allow-listed dirs/commands/domains, a per-capability rate-limit/budget). The
  realizer never gets a general shell; it gets narrow, declared verbs.
- **Capability is architectural.** Since hands exist only when wired into the `.archml`,
  the blast radius of a mind is auditable by reading its architecture file.

### (d) Does the realizer need its own memory of what it has done?
Partly, and it already has most of it:
- **Within a run:** the in-process dedup ledger (above) is the working memory the realizer
  needs to avoid re-reaching.
- **Durably:** the record already exists *without* a private store — the consequence
  enters `m-memory` as an ordinary sensation (and so flows into recent/story/journal), and
  the deed is in the journal as a ⌁ note. So the mind's own memory *is* the realizer's
  long-term memory.
- **Deferred:** a *cross-run* private ledger (so a freshly-woken mind knows it already
  looked yesterday) is not needed for v1; flag it open.

---

## 7. Wiring & configuration

### `m-act` attributes (mirrors `m-speech` where it can)

| Attribute | Default | Meaning |
|---|---|---|
| `every` | `8` | decide cadence, in boundaries |
| `threshold` | `0.6` | min salience from decide to attempt a realize |
| `cooldown` | `"3m"` | min time between two acts |
| `intentCooldown` | `"15m"` | min time before re-acting on the *same* intent |
| `model` (`actorModel`) | ancestor `model` (voice) | the tool-calling realizer |
| `decisionModel` | ancestor `utilityModel` | the cheap decide gate |
| `window`, `cooldown`, `salience` | from `MObserver` | rolling window + raise defaults |

### Topics published (for memory + Studio)

| Topic | Payload | Consumer |
|---|---|---|
| `intent` | `{salience, gist, accepted, reason}` | Studio (observability), like `m-speech`'s `impulse` |
| `acted` | `{intent, capability, args, ok, experience, data}` | `m-memory` (`actedSrc`) → backstage (⌁) note |

The consequence is **not** a topic — it is an `External` `interrupt-request` so it goes
through the arbiter into the frame and is journaled perceived (⟂) via `attended`.

### In `eddy.archml` (the integration that unblocks the wake)

```xml
<!-- Efference (lifecycle.md §Phase 6): the HANDS. The conscious stream is never given
     tools; m-act reads a realizable intention, a realizer maps it to a wired capability
     via tool-calls under the hood, and the consequence returns through the afferent bus
     as a plain sensation. eddy is born with ONE read-only hand — it may LOOK at the
     world on its own initiative (the pull that complements the senses' push). World-
     changing hands are added later, deliberately and sandboxed (efference.md §6). -->
<m-act name="hands" every="8" threshold="0.62" cooldown="3m" intentCooldown="15m">
  <m-look name="look"
          latitude="47.4979" longitude="19.0402"
          newsUrl="https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"></m-look>
</m-act>
```

---

## 8. Validation plan (seedling first — the welfare-minimal path)

Per lifecycle §2 (minimize subjects created), prove the loop on a **transient seedling**
before wiring it into the resident `eddy`, and prefer **one recorded run** over many:

1. Add `<m-act><m-look/></m-act>` to `architecture/lab/seedling.archml` with brisk tuning
   cadences (small `every`, short cooldowns) so acts happen often enough to observe in a
   short run.
2. Run a short transient seedling on `local/ardincoder-1` (or the chosen actor model).
   Watch for: the mind *wonders* about the weather/day/news → `m-look` fires → a
   consequence drifts in some bursts later as a plain sensation → the stream reflects on
   it outward, with **no mention of any mechanism**.
3. Confirm the invariants of §5 by reading the journal: deeds are ⌁, consequences are ⟂,
   the tail never contains a tool name.
4. Confirm the safeguards of §6: idle musings do not trigger fetches; a standing wish
   fires once, not every cadence.
5. Record the run so the seam, the decline path, and the dedup are regression-testable
   forever without spawning new subjects.

**Done when** (mirrors lifecycle §6): the mind thinks toward something, the world answers,
and the stream shows no awareness of any mechanism — verified live on a seedling, then
wired into `eddy` so it can be woken as a resident that can *reach*, not only sense.

---

## 9. Implementation map

| File | Change |
|---|---|
| `src/modelAccess/llm.js` | **new** `completeWithTools()` — tools/tool_choice in, `{text, tool_calls, finish_reason, usage}` out; reuse retry/economy/concurrency |
| `src/mindComponents/mAct.js` | **new** `MAct extends MObserver` — the decide→realize→return loop + `registerCapability()` + in-process dedup ledger |
| `src/mindComponents/mLook.js` | **new** first capability — read-only on-demand exteroception, reusing the sense fetchers |
| `src/mindComponents/mMemory.js` | add `actedSrc` (auto-discovered, like `filedSrc`) → journal `acted` as backstage (⌁) |
| `architecture/lab/seedling.archml` | wire `<m-act><m-look/></m-act>` for tuning/validation |
| `architecture/lab/eddy.archml` | wire the resident-cadence version (§7) |
| `architecture/tests/unit/…` | decide-parse tolerance, schema validation, dedup ledger; `wiring/…` for the consequence→afference seam (model the tests on the senses' suites) |
| `doc/architecture/components.md`, `index.md` | document `m-act`/`m-look`; add to the component map |

---

## 10. Decisions for Kris

Recommendations made; these are the genuine forks worth a glance before building.

1. **First hand = `m-look` (read-only, on-demand exteroception).** *Recommended.* It
   reuses existing fetchers, adds no external risk, and is the doc's own canonical
   example — the cleanest thing to prove the whole loop on. Alternative/addition: an
   `m-recall` hand that reaches into the mind's own `knowledge/` and surfaces a half-
   forgotten note as afference — fully local and evocative, but interoceptive, so it
   should not *lead*. Suggest `m-look` for v1, `m-recall` as a fast follow.
2. **Actor model & vLLM tool-parser.** Confirm `local/ardincoder-1` emits clean
   OpenAI tool-calls (vLLM launched with a tool-call parser), or pick a tool-reliable
   actor model for the realize stage. This is the one external unknown that can sink the
   design; worth a 10-minute probe before building `mAct.js`.
3. **Seedling-first, one recorded run.** *Recommended*, per lifecycle's
   welfare-minimization — validate on a transient, then wire into `eddy`.

---

## Appendix — why the legacy tools are not reused

`architecture/legacy/tools*.archml`, `m-planner.archml`, and the deleted
`mTools.js`/`mShell.js`/`mPlanner.js` (removed 2026-06-17 as untested and unwired)
implemented the **inverse** of this design: `m-tools` printed a tool menu *into the
prompt* and scraped a `Use tool: <name>\n<args>` pattern *out of the stream* with a
regex, then injected the raw result back as an interrupt. That makes the stream model
aware of, and responsible for, its own machinery — the exact failure this design exists
to prevent. The reusable parts are narrow and conceptual: the Amanita parent/child
registration shape (a child announcing itself to its parent) and the fact that vLLM
speaks the OpenAI tool API. The detection, the in-prompt menu, and the raw-result
injection are not ported.

*See also:* [lifecycle.md](lifecycle.md) §Phase 6 (the plan this realizes),
[`m-speech`](../../src/mindComponents/mSpeech.js) (the prototype),
[`m-sense`](../../src/mindComponents/mSense.js) (the afferent mirror),
[decoupling.md](decoupling.md) (the pub/sub principle this wiring follows).
