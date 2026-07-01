# Agents in Meditator: the agent loop as archml

**Date:** 2026-07-01
**Status:** Milestones 1 (kernel + loop) and 2 (extensibility proof) IMPLEMENTED
(2026-07-01); milestones 3–5 still design.
**Relation to other docs:** This is the concrete *loop* that
[`doc/design-agents-norms-codex.md`](../design-agents-norms-codex.md) left
underspecified. That doc argues (rightly) for parallel first-class roots
`<m-mind>` / `<m-agent>` / `<m-norm>` over a shared kernel, and spends most of its
length on governance (norms, policy, audit). This doc ignores governance and
answers a narrower question: **what is the smallest, most elegant set of archml
components that reproduces a modern tool-calling agent loop (Claude-Code-shaped),
and how does an author extend it?**

---

## 1. The point, and the philosophical inversion

A Meditator **mind** is deliberately *anti-agentic*. Its governing law
(`efference.md`, "THE ONE RULE") is:

> The conscious stream is **never** given tools. It wonders; a subconscious
> realizer (`m-act`) reads the wondering and realizes it; the world answers,
> some bursts later, as a plain first-person *sensation*. The deed is backstage
> and invisible; only the **consequence** is perceived.

A modern **agent** is the exact inversion:

> The model **is** given the tools. It emits tool calls deliberately, sees the
> **raw** results, and loops — assemble prompt → call model → run tools →
> append results → repeat — until the task is done.

So an agent is not "a mind with more hands." It is a different *stance toward
tools*: instrumental and deliberate, not embodied and subconscious; operational
state, not narrative selfhood; turn-based, not a continuous stream. This is why
it deserves its own root tag, exactly as the codex doc concluded — the top-level
tag should tell the reader which stance the file takes.

The happy result: Meditator already contains **most of the machinery an agent
needs**, just wired for the opposite philosophy. We reuse the plumbing and change
the harness.

And the two stances **compose** (see §9): a mind can own an agent as a single
"hand" (wonder → dispatch a task → the agent's whole loop runs backstage → the
result returns as one sensation), and an agent can consult a mind as a
deliberative faculty. The One Rule is preserved at the mind's membrane even when
an agent runs inside it.

---

## 2. The canonical loop

```
            ┌────────────────────────────────────────────────┐
            │                                                  │
   objective/task ─► assemble turn ─► reason (LLM+tools) ─► reply
            │              ▲                                   │
            │              │                          tool_calls?  ── no ──► answer / finish
            │       append observations                        │ yes
            │              │                                   ▼
            │        run tools  ◄──── (govern?) ◄──────── dispatch calls
            │              │                                   │
            └────── emit `step` boundary ◄─────────────────────┘
                           │
                    observers (loop guard, todo, context compaction)
```

One **step** = one `reason` call plus the execution of whatever tool calls it
returned. The loop ends when the model returns **no tool calls** (it answered),
or calls an explicit `finish` tool, or a budget/stall/stop condition trips.

This is the same three-turn message discipline the mind's `m-stream` already
speaks (`system` / `user` / `assistant`), extended with the standard `tool` role:

```
system     charter + environment + (compacted context)
user       the objective / task  (+ any injected human message or nudge)
assistant  { content, tool_calls:[…] }          ← the model's move
tool       { tool_call_id, content }  × N       ← what each tool returned
assistant  { content, tool_calls:[…] }          ← next move
tool       …
```

---

## 3. Component decomposition

The agent mirrors the mind's decomposition part-for-part, so anyone who knows the
mind reads the agent instantly. Each mind concern has an agent twin:

| Concern            | Mind                         | Agent                        | Reuse |
| ------------------ | ---------------------------- | ---------------------------- | ----- |
| Root / kernel      | `<m-mind>`                   | **`<m-agent>`**              | shared kernel (later) |
| Seed of the work   | `<m-origin>` (seed of thought) | **`<m-objective>`** (seed of task) | same pattern |
| The model call     | `<m-stream>` (streamed prose) | **`<m-reason>`** (tool-calling) | `llm.js` |
| Working set / recall| `<m-memory>` (autobiography) | **`<m-context>`** (transcript + compaction) | compressor reuse |
| Tools              | `<m-act>` + hands (subconscious) | tools register **directly** (model-driven) | **capability contract reused verbatim** |
| Attention / breaks | `<m-interrupts>`, `<m-loop-detector>` | nudge queue, **`<m-repeat-guard>`** | `MObserver` |
| Membrane           | `<m-ws>` / `<m-console>`     | `<m-ws>` / `<m-console>` / `<m-report>` | reused as-is |
| Metabolism         | `<m-economy>`                | `<m-economy>`                | reused as-is |

The **minimum viable agent** is just three of these: `<m-agent>` (the loop),
`<m-reason>` (the model), and at least one tool. Everything else is optional and
additive — which is the whole extensibility story.

### The wiring contract (Amanita topics)

Same idiom as the rest of the system: **state flows down as retained topics,
intent flows up as bubbling events.** Refs are entity-relative
(`..m-agent/<name>/…`), the agent analogue of `..m-mind`.

- **`m-agent` publishes** `turn` `{system, messages, tools}` — the assembled
  request for this step (the twin of `m-mind`'s `prompt`).
- **`m-reason` subscribes** `../turn`, calls `completeWithTools`, and
  **publishes** `reply` `{text, tool_calls, finish_reason}`.
- **`m-agent` subscribes** `reason/reply`; appends the assistant message; runs
  the tool calls; appends the `tool` messages; **fires** a `step` boundary event
  `{index, assistantText, calls[], observations[]}` (the twin of `m-stream`'s
  `boundary`); schedules the next step.
- **Tools** self-register by bubbling a **`capability`** event (identical to how
  a mind's hands register with `m-act`). `m-agent` catches them anywhere in its
  subtree and republishes the schema set as a retained `tools` topic.
- **Observers** (loop guard, etc.) subscribe to `step` and bubble **`nudge`** /
  **`halt`** events up to `m-agent`, which folds a nudge into the next `user`
  turn and treats a halt as a stop condition.
- **`m-agent` publishes** `status` and `transcript` for the Studio / a `report`
  port.

Because `m-reason` is a separate, swappable component, you can replace the
reasoning strategy (a thinking model, a plan-then-act two-caller, a cheaper
triage model in front of an expensive one) without touching the loop, the tools,
or the observers — exactly as `m-stream` is swappable under `m-mind`.

---

## 4. The tool contract — shared with the mind's hands

This is the biggest reuse win. A mind's hand and an agent's tool are the **same
object**: a capability offered via the bubbling `capability` event, with the
shape `m-act` already defines:

```js
{
  name,                         // the tool-call function name
  description,                  // shown to the model
  parameters,                   // JSON Schema (validated by validateAgainstSchema)
  execute(args) -> result,      // the actual work
  felt?,                        // mind-only: first-person body-schema line
  readonly?,                    // world-changing vs read-only (governance hook)
}
```

The only addition is a **unified result shape** so one component can serve both
worlds:

```js
execute(args) -> {
  observation: string,   // AGENT-facing: the raw text the model reads back
  data?: any,            // structured payload (UI, receipts, verification)
  isError?: boolean,     // the call failed but the loop should continue
  experience?: string,   // MIND-facing: first-person sensation (m-act uses this)
}
```

- An **agent** reads `observation` and appends it as the `tool` message.
- A **mind** reads `experience` (or, if absent, wraps `observation`/`data` into a
  sensation the way `m-act` does today).

A tool that provides both fields is dual-use. Existing hands (`m-terminal`,
`m-look`, `m-note`, `m-recall`) become dual-use by adding an `observation` field
to what they already return. `validateAgainstSchema` and the closed-menu
guarantee carry over unchanged.

> **Reuse, concretely:** an agent's terminal tool is a thin wrapper over the
> existing `infrastructure/sandbox.js` (`probeBackend`, `runScript`) — the real
> asset. It is *simpler* than `m-terminal`: an agent awaits the run
> synchronously and returns the raw screen as `observation`; it needs none of
> `m-terminal`'s grace-race / deferred-sensation machinery, which exists only to
> keep a *mind's* stream flowing while a script runs.

---

## 5. What we reuse vs. what is new

**Reused unchanged** (the "basics" the request asks about):

- **Amanita + archml + the loader.** `loadMindComponents` maps any `<m-foo>` tag
  to `mFoo.js` and upgrades it; components self-start in `onConnect`. **An
  `<m-agent>` root loads and runs with no loader change** — the work is writing
  the components.
- **`llm.js`**: `completeWithTools` (the tool-calling primitive — currently the
  realize stage of `m-act`, now also the agent's reasoner), `complete` (context
  compaction, loop sensing), optionally `chatStream` (to stream the assistant's
  natural-language text to the UI). Plus its dry-run stubs, concurrency
  semaphore, and economy accounting.
- **`infrastructure/sandbox.js`** — the terminal tool's real engine.
- **The capability contract** + `validateAgainstSchema` + `offerCapability` —
  the tool registration pattern, verbatim.
- **`memoryVault.js` / `mindHome`** — persistence homes (generalize the name to
  `entityHome`).
- **`MObserver`** — base for `step`-watching observers.
- **`m-ws` / `m-console` / `m-economy` / templating / `<m-import>`** — as-is.

**New machinery** (small, additive):

- Components: `<m-agent>`, `<m-reason>`, `<m-objective>`, `<m-context>`, agent
  tools (`<m-read-file>`, `<m-write-file>`, `<m-edit>`, `<m-fetch>`, …; terminal
  reused), agent observers (`<m-repeat-guard>`, `<m-todo>`).
- **Runtime touch-points** (verified against the current code — all tiny):
  - `start.js` graceful shutdown does `querySelectorAll("m-mind")`; broaden to
    `"m-mind, m-agent"` so agents sleep/persist on Ctrl-C too.
  - `architecture.js` name/origin overrides target `<m-mind>`; add parallel
    `applyAgentNameOverride` / an `MEDITATOR_OBJECTIVE` override (same regex
    pattern as `applyOriginOverride`).
  - Studio catalog/roster recognizes `m-mind` roots; teach it `m-agent` and give
    agents a **transcript + tool-call panel** instead of a thought stream (UI
    work, out of scope here; the `step`/`status`/`tools`/`transcript` topics feed
    it).
- Optionally a shared **`MEntityKernel`** base (name, home, model inheritance,
  membrane, wake/sleep) that both `MMind` and `MAgent` extend — the DRY target
  the codex doc names. v1 can skip it and duplicate ~20 lines.

---

## 6. Lifecycle (the "lifecycle which can be filled")

The agent kernel exposes named phases; each is a topic/event seam a component can
subscribe to. "Filling the lifecycle" = wiring components onto these seams.

| Phase       | What the kernel does                                   | Seam a component fills |
| ----------- | ----------------------------------------------------- | ---------------------- |
| **wake**    | restore transcript/state/todo from the home           | `m-context` loads; `m-todo` restores |
| **seed**    | take `<m-objective>` (or a `task` port) as first `user`| `m-objective`; `ws/message` |
| **assemble**| build `turn = {system, messages, tools}`              | `m-context` supplies the compacted block; tools supply schemas |
| **reason**  | publish `turn`, await `reply`                          | `m-reason` (swappable) |
| **govern**  | (optional) check proposed calls before execution      | a norm / permission policy |
| **act**     | run tool calls, collect observations                  | any tool (`capability`) |
| **observe** | fire `step`, append observations                      | `m-repeat-guard`, `m-todo`, UI |
| **stop?**   | evaluate stop conditions                              | `stopWhen`, `maxSteps`, `halt`, economy |
| **report**  | publish `status`/`answer`; write receipts             | `m-report`, `m-context` persist |
| **idle/sleep** | one-shot exits; service agent awaits next task    | `ws`/`task` port; graceful shutdown |

Stop conditions (attributes on `<m-agent>`):

- `stopWhen="no-tools"` (default) — the model answered with no tool call → done.
- `stopWhen="finish-tool"` — loop until the model calls an explicit `finish`
  tool (autonomous mode; the kernel auto-registers a `finish(summary)` tool).
- `maxSteps` — hard budget backstop.
- `m-economy` budget exhausted, or an observer `halt`.

---

## 7. Example 1 — a minimalist coding agent (only a terminal)

```xml
<!-- coder.archml — a minimal tool-calling coding agent.
     Run: bun meditator.js -a architecture/agents/coder.archml
          (objective supplied at wake via MEDITATOR_OBJECTIVE, like a mind's origin) -->
<m-agent name="coder"
         model="voice"
         utilityModel="utility"
         maxSteps="40"
         stopWhen="no-tools">
  You are a coding agent working inside a sandboxed workspace. Given a task, you
  make it happen: read the code, change it, and run commands to check your work,
  looping until the task is genuinely done. Prefer small, verified steps over big
  guesses. Never claim something works until you have run it and seen it pass.
  When the task is complete and verified, reply with a short summary and no tool
  call.

  <!-- The seed of the WORK, held apart from the charter above — the twin of a
       mind's <m-origin>. Seeds the first `user` turn; overridable at wake with
       MEDITATOR_OBJECTIVE, exactly as MEDITATOR_ORIGIN seeds a mind. -->
  <m-objective name="objective">
    Make the failing tests in this project pass without weakening them.
  </m-objective>

  <!-- The model call. Low temperature, roomy budget for tool-calling turns.
       Swappable: replace with a plan-then-act reasoner and nothing else changes. -->
  <m-reason name="reason" toolTokens="2048" temperature="0.2"></m-reason>

  <!-- The one tool. It bubbles a `capability` event that m-agent catches and
       offers to the reasoner — no registration wiring here. Reuses the existing
       sandbox; returns the raw screen as `observation`. -->
  <m-terminal name="terminal" wall="60s" network="off"></m-terminal>

  <!-- Membrane: watch it work and hand it tasks from the Studio / a socket. -->
  <m-ws name="ws" port="7640"></m-ws>
</m-agent>
```

That is a complete agent. The loop, the transcript, the tool registry, and the
stop condition all live in `m-agent`; the model call lives in `m-reason`; the
capability lives in `m-terminal`. Nothing else is required.

---

## 8. Example 2 — adding a new tool

A tool is a small component that offers one capability. **Adding it to any agent
is a one-liner in archml, with zero changes to `m-agent` or `m-reason`** — the
`capability` event does the wiring. Here is a real file-read tool, contained to
the workspace:

```js
// src/mindComponents/mReadFile.js
import A from "amanita"
import fs from "node:fs/promises"
import path from "node:path"
import { MBaseComponent } from "./mBaseComponent.js"
import { mindHome } from "../infrastructure/memoryVault.js"

export class MReadFile extends MBaseComponent {
  onConnect() {
    // The directory the agent may read within (default: its own workspace home).
    this._root = path.resolve(this.attr("root") || mindHome(this, "workspace"))
    this.offerCapability({
      name: this.attr("name") || "read_file",
      description: "Read a UTF-8 text file from the workspace, returned with line numbers.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "path relative to the workspace root" },
          maxBytes: { type: "integer", description: "cap on bytes read (default 65536)" },
        },
        required: ["path"],
      },
      readonly: true,
      execute: (args) => this._read(args),
    })
  }

  async _read({ path: rel, maxBytes = 65536 }) {
    // Containment: the resolved path must stay under the workspace root.
    const abs = path.resolve(this._root, rel)
    if (abs !== this._root && !abs.startsWith(this._root + path.sep)) {
      return { observation: `refused: "${rel}" is outside the workspace`, isError: true }
    }
    try {
      const buf = await fs.readFile(abs)
      const text = buf.subarray(0, maxBytes).toString("utf8")
      const numbered = text.split("\n").map((l, i) => `${i + 1}\t${l}`).join("\n")
      const more = buf.length > maxBytes ? `\n… (${buf.length - maxBytes} more bytes)` : ""
      return { observation: numbered + more, data: { path: rel, bytes: buf.length } }
    } catch (error) {
      return { observation: `could not read "${rel}": ${error.message}`, isError: true }
    }
  }
}

A.define("m-read-file", MReadFile)
```

Drop it into the coder:

```xml
  <m-terminal name="terminal" wall="60s" network="off"></m-terminal>
  <m-read-file name="read_file"></m-read-file>        <!-- ← that's the whole change -->
```

The loader auto-imports `mReadFile.js` for the `<m-read-file>` tag; `onConnect`
bubbles the capability; `m-agent` adds it to the `tools` set on the next turn.
`<m-write-file>`, `<m-edit>` (search/replace), `<m-fetch>` (HTTP GET),
`<m-grep>`, `<m-glob>` follow the identical ~40-line shape. **This is the
extensibility claim in one screen:** a new capability is a new leaf component,
never a change to the core.

> Note: a tool that serves *both* minds and agents just adds a `felt:` line and
> an `experience:` field to its result — then the same file works inside `<m-act>`
> (mind) or under `<m-agent>` (agent). `validateAgainstSchema` **was** hoisted
> from `mAct.js` into a shared `toolSchema.js` used by both harnesses (milestone 2),
> so `m-agent` and its tools no longer import from a mind component.

> **As built (milestone 2):** the three file tools share one small `fileTool.js`
> spine — `toolRoot(el)` (an explicit `root="…"` attribute, else the agent's
> `memory/<agent>/workspace` home, the same root `m-terminal` uses) and
> `resolveWithin(root, rel)` (the security-critical containment check). The escape
> check lives in that one audited place rather than being copy-pasted across three
> leaves; each leaf stays a ~40-line component that only declares its schema and does
> its I/O. `<m-write-file>` / `<m-edit>` are `readonly:false` (the governance flag a
> norm gates on); `<m-edit>` requires a unique match unless `replace_all`.

---

## 9. Example 3 — a loop / stall detector for the agent

Agents fail differently from minds. A mind *circles a refrain*; an agent *repeats
an action* — runs the same failing command, edits the same line back and forth,
retries an identical call. So the agent's loop detector watches **actions**, not
prose. It follows the same **sense → bid → break** shape as
`loop-detection-redesign.md`, but the "break" is a **message injected into the
transcript**, not a tail reseed:

```js
// src/mindComponents/mRepeatGuard.js
import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mRepeatGuard.js")

// Same tool + same args → same signature. (A smarter guard could also compare
// observation similarity to catch "different call, identical error".)
const signature = (call) => `${call.name}(${JSON.stringify(call.args ?? {})})`

/**
 * m-repeat-guard — a stall detector for an agent, the operational twin of the
 * mind's m-loop-detector. It watches `step` boundaries; when the SAME action
 * recurs within a short window it does not stop the loop — it NUDGES (a redirect
 * the agent reads next turn), and if the rut persists it ESCALATES to a halt.
 */
export class MRepeatGuard extends MBaseComponent {
  _recent = []   // ring buffer of recent action signatures

  onConnect() {
    // `step` is a FIRED event (m-agent does `this.fire("step", …)`), so subscribe with
    // the "@" event ref and read the payload from `e.detail` — NOT a retained topic. It
    // fires on the m-agent element itself, so the ref has no child-name segment.
    const stepSrc = this.attr("stepSrc") || "..m-agent/@step"
    this.sub(stepSrc, e => this._onStep(e?.detail)).catch(() => {})
    this._window  = Number(this.attr("window")  || 6)   // look-back
    this._nudgeAt = Number(this.attr("nudgeAt") || 3)   // repeats → nudge
    this._haltAt  = Number(this.attr("haltAt")  || 5)   // repeats → halt
  }

  _onStep(step) {
    for (const call of step?.calls || []) this._recent.push(signature(call))
    this._recent = this._recent.slice(-this._window)

    const last = this._recent.at(-1)
    if (!last) return
    const repeats = this._recent.filter((s) => s === last).length

    if (repeats >= this._haltAt) {
      log.warn(`repeat-guard halting: "${last}" ×${repeats}`)
      this.fire("halt", { reason: `Repeated the same action ${repeats}× with no new result.` })
    } else if (repeats >= this._nudgeAt) {
      log.info(`repeat-guard nudging: "${last}" ×${repeats}`)
      this.fire("nudge", {
        text: `You have now run essentially the same action ${repeats} times and gotten `
            + `the same result. Stop repeating it: re-examine your assumptions, inspect `
            + `something you have not looked at yet, or try a genuinely different approach.`,
        severity: repeats,
      })
    }
  }
}

A.define("m-repeat-guard", MRepeatGuard)
```

Wire it in — again, one line, no core change:

```xml
  <m-terminal name="terminal" wall="60s" network="off"></m-terminal>
  <m-repeat-guard nudgeAt="3" haltAt="5"></m-repeat-guard>
```

`m-agent` already listens for bubbling `nudge`/`halt` (§3). A `nudge` becomes a
`user` message on the next turn ("[note] …"); a `halt` is a stop condition. Note
what did *not* change: not `m-agent`, not `m-reason`, not the tools. The detector
is a pure observer, added and removed by editing one line of archml — the same
way `m-loop-detector`, `m-resurface`, and `m-associate` are optional observers on
a mind.

---

## 10. Example 4 — a service agent (objective via port, context compaction, richer belt)

To show the design scales past a one-shot: a long-running agent that takes tasks
over a socket, keeps its context bounded, and reports status.

```xml
<m-agent name="librarian"
         model="voice" utilityModel="utility"
         maxSteps="60" stopWhen="finish-tool">
  You are a research librarian agent. You take a question, gather sources, verify
  claims against them, and produce a cited answer. Call finish(summary) when the
  answer is complete and every claim is backed by a fetched source.

  <!-- No static objective: tasks arrive over the membrane as `user` turns. -->
  <m-reason name="reason" toolTokens="3000" temperature="0.3"></m-reason>

  <!-- The toolbelt as an explicit group — a natural seam for a permission policy
       or a governing norm to attach to (see the codex doc). Tools inside it
       register exactly as if placed directly under the agent. -->
  <m-tools name="tools">
    <m-fetch    name="fetch"    allowHosts="*.wikipedia.org, arxiv.org"></m-fetch>
    <m-read-file name="read_file"></m-read-file>
    <m-write-file name="write_file"></m-write-file>
  </m-tools>

  <!-- Context management: the transcript grows; when it exceeds the budget,
       m-context compacts the oldest tool observations into a summary (reusing
       m-memory's compressor) and keeps the recent turns verbatim. The agent's
       "memory". Persists to the home so a restarted service resumes mid-task. -->
  <m-context name="context" budget="24000" keepRecent="8"
             persist="memory/librarian/transcript"></m-context>

  <m-repeat-guard nudgeAt="3" haltAt="6"></m-repeat-guard>

  <!-- Status out; tasks in. -->
  <m-report name="status" port="status" every="1"></m-report>
  <m-ws name="ws" port="7641"></m-ws>
  <m-economy name="economy" budget="1.00"></m-economy>
</m-agent>
```

`<m-context>` is the agent's `m-memory`: it subscribes to `step`, and when
`messages` exceed `budget` it summarizes the oldest observations (one `complete`
call, the same compressor `m-memory` uses) and rewrites the working set to
`[summary] + last keepRecent turns`. This is the standard "context window fills
up" answer, expressed as one optional component.

---

## 11. Composition with minds (the One Rule preserved)

The two stances meet without contradiction:

**A mind owns an agent as a hand.** The mind wonders ("I should actually make
that change and check it"); `m-act` realizes the reach by handing a *task* to a
private `<m-agent>`; the agent runs its whole tool-calling loop backstage; its
final result returns to the mind as a **single first-person sensation**. The
conscious stream never saw a tool — the One Rule holds at the mind's membrane,
even though a full agent ran inside it.

```xml
<m-mind name="researcher">
  …
  <m-act name="hands" every="6" threshold="0.62" cooldown="5m">
    <m-note name="note"></m-note>
    <!-- A whole agent, used as one hand. Its loop is the deed; only the
         outcome re-enters as a sensation (out.experience). -->
    <m-agent name="builder" role="subagent" maxSteps="30" stopWhen="finish-tool">
      You are the researcher's hands for real code work. …
      <m-reason name="reason"></m-reason>
      <m-terminal name="terminal"></m-terminal>
    </m-agent>
  </m-act>
</m-mind>
```

**An agent consults a mind** as a deliberative faculty: the agent's `m-reason`
(or `m-plan`) reads a child `<m-mind>`'s spoken conclusions to get hypotheses or
critique, while the agent stays outward-facing. (Sketched in the codex doc §
"Can an Agent contain a Mind?".)

**Governance seam.** The `govern` phase (§6) is exactly where the codex doc's
norms attach: a `<m-norm>` sits between `reason` and `act`, sees each proposed
tool call as a proposal, and permits / denies / modifies before execution — with
no change to the agent, because it is just another subscriber on the seam. This
doc deliberately stops at the seam and leaves norms to that doc.

---

## 12. Reasoning caveats to get right (so the loop is honest)

- **Assistant echo shape.** The `assistant` message stored back into the
  transcript must carry `tool_calls` in the provider's exact shape
  (`completeWithTools` already returns `[{id,type,function:{name,arguments}}]`);
  each must be answered by exactly one `tool` message with the matching
  `tool_call_id`. Missing/duplicated ids make providers reject the next request.
- **Parallel calls.** When the model returns several tool calls, execute them
  concurrently (they are independent) and append the `tool` messages in call
  order.
- **Local tool-calling.** vLLM must be launched with `--enable-auto-tool-choice`
  and a matching `--tool-call-parser` (llm.js already warns about this for
  `m-act`). Same requirement for `m-reason`.
- **Dry-run.** `llm.js`'s `dryCompleteWithTools` already reaches for a `terminal`
  tool if present, so a dry coder agent takes one real-shaped step offline. Enrich
  the stub to drive several steps (and to emit `finish`) so the whole loop is
  exercised without a model — the same discipline the mind's dry-run stubs follow.
- **Truthfulness.** The project's recurring failure mode is confabulated tool
  results (`doc/research/confabulation-and-real-tools.md`). An agent that *reads
  real observations* is structurally more honest than a mind narrating a hand —
  but only if we never let the model's `assistant` text stand in for a `tool`
  result. Keep observations sourced strictly from `execute()`.

---

## 13. Milestones

1. **Kernel + loop.** ✅ **DONE (2026-07-01).** `<m-agent>` (`mAgent.js`) + `<m-reason>`
   (`mReason.js`) + `<m-objective>` (`mObjective.js`); `<m-terminal>` made dual-use
   (an agent branch `_runForAgent` returns the raw screen as an `observation`, no
   grace-race). `MEDITATOR_OBJECTIVE` + `MEDITATOR_AGENT_NAME` overrides
   (`applyObjectiveOverride` / `applyAgentNameOverride` in `architecture.js`);
   `mindHome` and `start.js` shutdown broadened to `m-agent`; the dry-run tool stub
   drives the loop offline (`debugTag:"reason"`). The §7 coder is
   `architecture/agents/coder.archml` and runs end-to-end (validated dry via CLI +
   the wiring test, and the terminal against the real sandbox). Tests:
   `tests/wiring/agent-loop.test.js`, `tests/wiring/agent-terminal.test.js`,
   `tests/unit/objective-override.test.js`. (`validateAgainstSchema` was hoisted out
   of `mAct.js` in milestone 2 — see below.)
2. **Extensibility proof.** ✅ **DONE (2026-07-01).** Three file tools —
   `<m-read-file>` (`mReadFile.js`, read-only), `<m-write-file>` (`mWriteFile.js`) and
   `<m-edit>` (`mEdit.js`, exact-string replace, unique-match unless `replace_all`) —
   each a ~40-line leaf that registers via the bubbling `capability` event with ZERO
   change to `m-agent`/`m-reason`, sharing one `fileTool.js` spine (`toolRoot` +
   the `resolveWithin` containment check). `<m-repeat-guard>` (`mRepeatGuard.js`): a
   pure observer that watches the `step` boundary and nudges then halts a repeated
   action (twin of `m-loop-detector`) — subscribing to the FIRED `..m-agent/@step`
   event (the design sketch's `/step` topic form was a pre-events-refactor artefact,
   now corrected in §9). `validateAgainstSchema` hoisted to a shared `toolSchema.js`
   so both harnesses (and the tools) share the closed-menu guarantee without importing
   a mind component. `coder.archml` now wires all four in as the living proof. Tests:
   `tests/unit/file-tool.test.js`, `tests/wiring/agent-files.test.js`,
   `tests/wiring/agent-repeat-guard.test.js`. → §8, §9.
3. **Context + service mode.** `<m-context>` (compaction, persistence),
   task-over-port, `<m-report>`, `stopWhen="finish-tool"`. → §10.
4. **Studio.** Transcript + tool-call panel for `m-agent` roots (feeds off
   `step`/`status`/`tools`).
5. **Compose + govern.** Agent-as-hand inside `m-act`; the `govern` seam for
   `<m-norm>` (hands off to the codex doc).

---

## 14. Open questions

1. **One `<m-terminal>`, two modes, or two components?** Dual-use (one file that
   returns both `observation` and `experience`) is elegant but the mind's
   grace-race path is dead weight for an agent. Leaning: keep `m-terminal`
   dual-use for parity, and let the async path be a mind-only branch.
2. **Streaming the assistant text.** Discrete `completeWithTools` is simplest.
   Streaming the natural-language part (via `chatStream`) would reuse the
   Studio's stream renderer for the "thinking out loud between tool calls" — nice
   but not required for v1.
3. **Nudge arbitration.** A human message and a loop-guard nudge can both want
   the next turn. v1 folds both into the user turn in arrival order; if agents
   grow many interrupt sources, reuse the mind's `InterruptRecord` + a small
   arbiter instead of a plain queue.
4. **Shared kernel now or later?** `MEntityKernel` removes ~20 lines of
   duplication between `MMind` and `MAgent` but touches the mind. Probably
   milestone 5, once the agent shape has settled.

---

## 15. Reasoning strategies — why `<m-reason>` earns its own component

`<m-reason>` owns exactly one seam: **turn in → next move out**
(`{system, messages, tools}` → `{text, tool_calls}`). That seam is where most
agent research actually lives, so it should be swappable without touching the
loop, the tools, or the observers — the same reason `m-stream` is separable under
`m-mind`. Thinking-mode and prompt-role are only two of ~ten things that vary
there:

- **Single-shot** — one `completeWithTools`. The baseline.
- **Thinking mode** — more than a boolean: whether to enable per call, how much
  budget, and whether to *persist* the reasoning trace across turns or drop it (a
  real token/coherence tradeoff; `llm.js` already surfaces `reasoning_content`).
- **Plan-then-act** — an internal planning call (no tools) before the acting
  call. Two model calls per external step; `m-agent` still sees one move.
- **Sample-and-vote / self-consistency** — sample N moves, return the majority or
  a judged best.
- **Reflexion / critic** — after a failed observation, a "why did that fail" pass
  before the next move; or critique-and-revise a move before emitting it.
- **Model cascade / routing** — try a cheap model, escalate to a strong one on
  low confidence, malformed tool calls, or a hard-task flag. A policy over models.
- **Speculative draft-then-verify** — small model drafts, big model approves.
- **Constrained / forced sequencing** — force `tool_choice` to `plan` first,
  forbid `write` before a `read`, etc.
- **Tool-call repair** — on malformed JSON or a hallucinated tool name, retry
  with a corrective message *inside the same step* rather than surfacing garbage
  to the loop.
- **Consult-a-mind** — the reasoner produces its move by asking a child
  `<m-mind>` for hypotheses/critique (the "agent contains a mind" case). This is
  the natural mount point for it.

So a reasoning strategy spans model choice, number of internal calls, sampling,
reflection, routing, decoding constraints, and repair — genuinely more than
thinking + prompt assembly. **Verdict: keep it separate.** `m-agent` binds to the
*contract* (consume `../turn`, publish `reply`), not the implementation. Expose
the family as `<m-reason strategy="plan|vote|cascade">` or as distinct tags;
strategies **compose** (cascade + thinking) and can **wrap** one another.

---

## 16. Async operation — async agency without an async loop

**The load-bearing insight: async behavior comes from async-shaped *tools*, not
from an async loop.** A tool-calling step already blocks on each tool's return; to
get concurrency you make the *tool semantics* non-blocking, backed by a small
**job registry** (a new infra piece, sized like `sandbox.js`). Five tools over it:

- `spawn(command)` → start a background job, return *immediately* with a handle
  (`"started job 3"`). Non-blocking.
- `check(id)` → status + new output since last check. Non-blocking.
- `wait(id, timeout)` → block up to `timeout` **or until a user message arrives**.
  The long-poller.
- `list_jobs()` / `kill(id)`.

The model now has full async agency on a synchronous loop: spawn a test run, keep
editing other files while it runs, then `wait` on it when there is nothing else
to do.

### The interruptible `wait` is m-terminal's grace-race with a third racer

```js
async _wait({ id, timeout = "120s" }) {
  const job = this._registry.get(id)
  if (!job) return { observation: `no such job: ${id}`, isError: true }
  const TIMEOUT = Symbol(), INTERRUPT = Symbol()
  const outcome = await Promise.race([
    job.done,                                          // the job finished
    delay(parseTime(timeout)).then(() => TIMEOUT),
    this._userMessageArrived().then(() => INTERRUPT),  // sub once to ..m-agent/ws/message
  ])
  if (outcome === INTERRUPT) return { observation: `(waiting on ${id} interrupted — a message came in)`, data: { pending: id } }
  if (outcome === TIMEOUT)   return { observation: `${id} still running; last output:\n${job.tail()}`, data: { pending: id } }
  return { observation: `${id} finished (exit ${outcome.exitCode}):\n${job.screen()}`, data: { done: true } }
}
```

This is literally `m-terminal`'s `Promise.race([handle.done, delay(graceMs)…])`
with the inbound-message subscription added as a third racer — so a long poll is
responsive to the user with **zero loop changes**.

### Three ways to learn a job finished (best last)

- **Poll** — the agent calls `check(id)` when curious.
- **Wait** — it long-polls with `wait`.
- **Notify** — the registry fires a **nudge** on completion; `m-agent` folds it
  into the next turn ("job 3 finished: tests passed"). The agent finds out
  *between steps without asking* — reusing the exact nudge seam the loop-detector
  uses (§9). Most ergonomic; pure reuse.

### Why this stays correct in the transcript

An async result re-enters as a **fresh observation at a later step**, never as a
late `tool` response to the original `spawn` call (which already got its immediate
"started" reply). So transcript integrity — every `tool_call` answered exactly
once — is preserved. This is the same "deferred consequence returns as a *new*
sensation, not a patch to the old frame" rule `m-terminal` already follows for a
mind (`terminal.md` §2). The philosophy carries straight over.

### Two payoffs, and the optional upgrade

- A background job can be **another `<m-agent>`**, not just a shell — so *parallel
  sub-agents* (spawn, keep working, collect results) fall out of the same
  abstraction for free.
- **Level 2 (true preemption)** — to stop the agent mid-`reason`: reuse
  `m-stream._supersede()` (already aborts an in-flight burst on a new prompt),
  add an abort signal to `completeWithTools`, and let `m-agent` borrow the
  `m-interrupts` arbiter. **Safe-point rule:** abort the `reason` call freely (no
  state committed), but let in-flight *tool* executions finish (or write a
  synthetic cancelled result) so the transcript stays valid.

### The ladder

- **Level 0** — blocking tools. Fine for a one-shot coder.
- **Level 1** — job registry + interruptible `wait`/notify. Full async agency,
  synchronous deterministic loop, responsive to the user. **Recommended default.**
- **Level 2** — preemptible loop via the mind's supersede/arbiter machinery.
  Nice-to-have; mostly reuse.

A minimal async-capable coder is just the §7 file plus a job tool:

```xml
  <m-terminal name="terminal" wall="60s" network="off"></m-terminal>
  <m-jobs name="jobs"></m-jobs>   <!-- registers spawn / check / wait / kill / list_jobs -->
```
