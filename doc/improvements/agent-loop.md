# Agents in Meditator: the agent loop as archml

**Date:** 2026-07-01
**Status:** Milestones 1 (kernel + loop), 2 (extensibility proof), 3 (context +
service mode), 4 (Studio panel) and 5 (compose + govern) IMPLEMENTED (2026-07-01);
6 (async operation — the job registry) and 7 (parallel sub-agents — a background
job that is another `<m-agent>`) IMPLEMENTED (2026-07-02).
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

*(Named more precisely since: the inversion is **inversion of control**. An
agent calls the world — `m-agent` awaits every tool call, so the loop cannot
turn until the world answers. The world calls a mind — a consequence re-enters
as an `interrupt-request` that queues at the boundary and may never win the
arbiter's race. Tool-visibility, the axis above, is the corollary: a model
that never waits for the world has no use for seeing tools. The two figures in
`docs/media/` — `agent-mind-mirror.svg` and `agent-mind-control.svg` — draw
exactly this.)*

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
  - Studio catalog/roster recognizes `m-mind` roots; it now also recognizes `m-agent`
    and gives agents a **transcript + tool-call panel** (`<studio-transcript>`) instead of
    a thought stream, fed by the `step`/`status`/`tools` telemetry `m-ws` forwards.
    ✅ **DONE — milestone 4** (see §13).
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

> **As built (milestone 5).** The agent-as-hand is `role="subagent"` on `<m-agent>`:
> such an agent does not auto-begin (no objective seed, no membrane idle) — it offers
> itself to the enclosing `<m-act>` as one capability whose `execute(task)` drives the
> whole loop and returns the answer as a first-person sensation (m-act journals the deed
> and re-enters it as an External `Sense-<name>`; the terminal, file tools, etc. register
> with the *subagent*, not the mind, because the nearest entity owns its tool). The govern
> seam is a `proposal` event `mAgent` fires before every tool call: a governor subscribes
> and calls `proposal.deny(reason)` (veto), mutates/replaces `proposal.args` (modify,
> re-validated), or `proposal.hold(promise)` (decide asynchronously — e.g. an LLM policy —
> which the loop awaits). No governor ⇒ the call proceeds unchanged. Both live in
> `mAgent.js` alone; `architecture/lab/researcher.archml` is the living §11 mind. The
> DECIDE-stage intent rides all the way into the consequence — m-act forwards its gist as
> `ctx.intent`, `_runAsHand` holds it, and `_handConsequence` weaves it in — so the mind
> reads an outcome that still remembers the reach that asked for it (the twin of the
> terminal intent fix, commit bf98a26).

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
   **First live run (coder.archml on ardincoder-1, 2026-07-01):** it completed a
   write-script → run → read-back → report task correctly and honestly (read real
   errors and adapted rather than confabulating success — §12 held). It also exposed
   the **workspace-coherence** flaw (open-Q #1): the file tools wrote to the workspace
   root but the terminal ran in a per-wake `run-<stamp>/` subdir (the only writable
   path), so `write_file foo.py` → `terminal python3 foo.py` failed until the model
   reverse-engineered the layout. **Fixed:** an agent's terminal now runs IN the shared
   workspace root itself (`_ensureRunDir` branches on `_forAgent`), so write → run →
   read composes with plain relative paths. Test: `tests/wiring/agent-workspace-coherence.test.js`
   (real sandbox). The mind's per-wake-subdir path is unchanged.
3. **Context + service mode.** ✅ **DONE (2026-07-01).** `<m-context>` (`mContext.js`) is
   the agent's working memory, a PURE OBSERVER (zero change to `m-agent`/`m-reason`): it
   mirrors the `transcript`, and on each `step`, when the transcript exceeds `budget`, it
   condenses the oldest turns into a summary and publishes a `compacted` intent that
   `m-agent` splices in — reusing `m-memory`'s `compressToFit` length-loop (dedupe →
   rewrite → re-drive → nearest-fallback) with an agent-transcript voice via an injected
   `buildPrompt` (the one small change to `mMemory.js`). The split point (`planCompaction`)
   never orphans a `tool` response from its `assistant`, so the spliced transcript stays
   provider-valid (§12). It also persists the transcript (JSON) to the agent home on every
   change and publishes `restore` on wake, so a restarted service resumes mid-task.
   **Service mode:** an agent with a membrane (`<m-ws>`/`<m-console>`) takes tasks as
   bubbling `task` events (each a `user` turn) and, after a task ends, returns to idle to
   await the next rather than retiring; with no static `<m-objective>` it idles until the
   first task lands (a one-shot agent — objective, no membrane — still retires). Tasks
   arriving before wake are buffered; one arriving mid-task folds into the next turn
   (open-Q3 v1). `<m-ws>` is now **dual-use**: under an `<m-agent>` it is a TASK PORT —
   inbound client input fires a `task` event (not a mind `interrupt-request`) and it
   broadcasts the agent's `status` — with the mind path byte-for-byte unchanged (guarded by
   `_forAgent()`). `<m-report>` (`mReport.js`): a pure observer that republishes `status`
   as a `report` topic and logs each state change. `stopWhen="finish-tool"` was already in
   M1. The §10 service agent is `architecture/agents/coder-service.archml` and runs
   end-to-end (validated dry via CLI, over a live socket — idle → task → terminal ×2 →
   finish → idle — and by the wiring tests). Tests: `tests/unit/context-compaction.test.js`,
   `tests/wiring/agent-context.test.js`, `tests/wiring/agent-service.test.js`. → §10.
4. **Studio.** ✅ **DONE (2026-07-01).** A transcript + tool-call panel for `m-agent`
   roots, the operational twin of the mind's stream. **Producer:** `m-ws`'s agent branch
   (`_instrumentAgent` in `mWs.js`) forwards the loop as telemetry — the classic
   `{type:"status"}` state frame (drives the header pill) plus `agent/status` (rich
   snapshot), `agent/step` (assistant text + calls + observations — the transcript body),
   `agent/answer` (the final answer, in order) and `agent/tools` (the palette); the
   m-agent subtree structure was already sent on connect, so the Structure column works
   unchanged. **Supervisor:** `architectureSurface.js` recognizes the `<m-agent>` root
   (kind `"agent"`, `<m-objective>` surfaced as the editable `origin` seed, plus
   `maxSteps`/`stopWhen`); `server.js` scans `architecture/agents/` into a dedicated
   `"agents"` catalog group, maps the wake seed to `MEDITATOR_OBJECTIVE` / the name to
   `MEDITATOR_AGENT_NAME`, and routes `agent/step`/`agent/answer` into the persisted
   stream timeline (`streamTimelineKind` → `rowToWire`), reusing the exact backfill/delta
   machinery a mind's stream uses. **Browser:** a new `<studio-transcript>` pane (the twin
   of `<studio-stream>`) renders steps/tools/answer; both panes gate on a new
   `/conn/focusedKind` topic so exactly one owns the stream column (the transcript for an
   agent, the stream for a mind); the speak box becomes a task port and the header pill
   shows the agent's own loop state. Tests: `studio-architecture-surface` (agent parse),
   `studio-transcript` (pane render + gating), `agent-studio` (producer telemetry over a
   real socket). Live-validated through the supervisor end-to-end: catalogued as an agent
   → woken dry → focused (projection snapshots) → a task streamed `agent/step`×N +
   `agent/answer` live, then a re-focus replayed them from the persisted timeline.
5. **Compose + govern.** ✅ **DONE (2026-07-01).** Two additions to `mAgent.js`, no new
   components. **Agent-as-hand (§11):** an `<m-agent role="subagent">` nested in a mind's
   `<m-act>` does not auto-begin — it offers ITSELF to that m-act as one capability
   (`_offerAsHand` / `_handSpec`, `readonly:false` by default) and runs only when the
   realizer executes it (`_runAsHand`): it seeds the task, drives its whole loop backstage,
   and returns the outcome as a first-person sensation (`_handConsequence` + the
   `frameHandExperience` leads, the twin of m-terminal's), which m-act journals as a DEED
   and re-enters as an External `Sense-<name>` — the One Rule held at the mind's membrane.
   After each task it resets to idle for the next reach (`_resetForHand`), never retiring;
   an in-flight call is resolved on sleep. It offers itself by BUBBLING a `capability`
   event exactly as a leaf hand does — the agent's own listener lets its self-offer pass
   (`e.target === this`) so it reaches the enclosing m-act — relying on the same connect
   order every hand relies on (a parent m-act is upgraded, and its listener attached in
   onConnect, before a child offers; loadMindComponents defines tags in document order with
   no awaits). **The govern seam (§6, §11):**
   before each tool runs, `_runOne` calls `_govern(name, args)`, which fires a bubbling
   `proposal` event a governor may VETO (`proposal.deny(reason)`) or MODIFY (mutate/replace
   `proposal.args`), synchronously or asynchronously (`proposal.hold(promise)`, awaited); a
   deny returns a `refused:` observation, and a modify is re-validated against the schema
   before execution. With no governor wired the call proceeds unchanged — the seam a
   `<m-norm>` attaches to, with the norm subsystem left to the codex doc. The §11 mind is
   `architecture/lab/researcher.archml` (a mind whose `<m-act>` owns a `builder` subagent
   alongside a plain note hand) and dry-wakes end-to-end. Tests:
   `tests/wiring/agent-compose.test.js` (register-as-hand, tool ownership, no-auto-begin,
   execute→sensation, idle-reuse, and the whole path through m-act's decide→realize→
   consequence), `tests/wiring/agent-govern.test.js` (default permit, sync veto, sync
   modify + re-validation, and async veto via hold). → §11.
6. **Async operation — the job registry.** ✅ **DONE (2026-07-02).** Level 1 of the ladder
   (§16): async agency on a synchronous, deterministic loop, via async-shaped *tools*, not
   an async loop. `infrastructure/jobRegistry.js` is the bookkeeping — one `Job` per
   background sandboxed run (the SAME `sandbox.js`), started with a handle that returns
   immediately; it keeps a live output tail (via a new OPTIONAL `onData` hook on
   `runScript` — the one tiny, backward-compatible change to the sandbox), tracks a per-job
   read cursor so `check` returns only what is NEW (and reports honestly when the tail cap
   dropped output — the confabulation guard applies to tools too), and fires an
   `onComplete` callback when a job settles. The sandbox runner is INJECTED (default the
   real `runScript`) so the whole registry is unit-tested — and dry-runnable — with a
   controllable fake handle, no process.
   `<m-jobs>` (`mJobs.js`) is the agent tool that offers five capabilities by bubbling a
   `capability` event each, with ZERO change to `m-agent`/`m-reason`: `spawn(language,
   script)` (non-blocking, returns a job id), `check(id)` (status + new output),
   `wait(id, timeout)` (the interruptible long-poll), `list_jobs()`, `kill(id)`. The
   `wait` is literally m-terminal's grace-race with a THIRD racer — `Promise.race([job.done,
   delay(timeout), messageArrived])` — where the inbound message is m-ws's bubbling `task`
   event (listened for on the enclosing `m-agent`), so a long poll stays responsive to the
   user with no loop change. NOTIFY (the "best" of the three ways to learn a job finished):
   the registry's `onComplete` fires a bubbling `nudge` — the SAME seam the loop-detector
   uses — which `m-agent` folds into the next turn ("Background job-1 finished; call
   check(...)"), so the agent learns between steps without polling; a deliberate `kill`
   raises no notice. Transcript integrity holds because an async result re-enters as a
   fresh observation at a later step, never as a late `tool` reply to the original `spawn`
   (§16). It is probe-gated like m-terminal (no sandbox ⇒ the tools stay inert, fail-safe)
   and shares the agent's ONE workspace with the terminal and file tools (a file written
   with `write_file` is directly runnable as a job; scripts land under `.runs/job-<n>`).
   `killAll` on disconnect so no background process is orphaned on sleep. The §16 async
   coder is `architecture/agents/coder-async.archml` (the §7 belt + one `<m-jobs>` line)
   and dry-wakes end-to-end (all nine tools register, the loop runs). Tests:
   `tests/unit/job-registry.test.js` (spawn-returns-immediately, cursor-only-new-output,
   tail-cap-with-honest-gap, done/timeout/kill/error settle, kill-wins-over-outcome,
   onComplete-once, sync-throw), `tests/wiring/agent-jobs.test.js` (all five register,
   spawn/list/check happy paths dry, new-output-only + final report, wait-blocks-then-
   reports, wait-times-out, wait-interrupted-by-message, finished-job-notifies-via-nudge,
   kill-suppresses-notice, killAll-on-disconnect). → §16.
7. **Parallel sub-agents — a background job that is another `<m-agent>`.** ✅ **DONE (2026-07-02).**
   The §16 payoff with NO new subsystem — a background job need not be a shell command. `JobRegistry`
   grew a generic `start(makeHandle, meta)` (register a `Job` around any `{done, kill}` handle + its
   tail sink); `spawn` is now a thin specialization of it over the sandbox runner, and `Job.kind`
   (`shell`|`agent`) lets the pollers report an agent job in agent terms ("completed"/"could not
   complete") rather than a shell exit code. `mAgent.runAsJob(task, {onData})` reuses the milestone-5
   `_runAsHand` single-task loop but shapes it as a job handle — streaming each `step` to the tail,
   feeding the final answer as a last chunk, and `kill` → `_abortTask` ending the loop at a safe point.
   `<m-jobs>` discovers its enclosing agent's `role="subagent"` children and offers `spawn_agent(agent,
   task)` backed by `registry.start(onData => sub.runAsJob(task,{onData}))`, so `check`/`wait`/`kill`/
   `list_jobs` and the completion `nudge` work on sub-agent jobs unchanged. Gating split: shell `spawn`
   needs a sandbox, `spawn_agent` needs a sub-agent (a job is a loop, not a process), neither ⇒ inert.
   Two composition fixes fell out: `_offerAsHand` fires only when the nearest enclosing entity is a
   mind's `<m-act>` (nested directly in an `<m-agent>`, a sub-agent is a background job, not a blocking
   hand), and `nudge`/`halt` now `stopPropagation` so a nested sub-agent's observer signals don't leak
   up to the parent's loop. A sub-agent is single-flight (a `busy`/`available` guard turns work away),
   so parallelism = distinct sub-agents. Example: `architecture/agents/coder-team.archml` (lead + two
   background workers), dry-wakes end-to-end. Tests: `tests/unit/job-registry.test.js` (generic
   `start()` + agent-kind summary), `tests/wiring/agent-subagent-jobs.test.js` (discovery, spawn_agent
   runs a worker's whole loop dry, kind, progress tail, notify, busy guard, `_abortTask`, gating).
   → §16. Level 2 (preemptible loop) is the only remaining rung.
   **First live run (rpn-team.archml on ardincoder-1, 2026-07-02):** a 3-agent team (an architect +
   two workers `math`/`parse`) built a working RPN calculator — the architect delegated the two
   independent modules IN PARALLEL via `spawn_agent` in one step (knowing the workers only from the
   `spawn_agent` schema, which enumerates them by name — they are NOT registered as hands), the
   progress-tail and NOTIFY nudges surfaced each worker's steps and completion, and the architect
   integrated + ran the tests + saw them pass (honest — §12 held: when a run errored it read the real
   error and adapted, never faked success). It exposed a **shared-workspace coherence flaw** (the same
   class as milestone 2's): a *team* needs one shared workspace (`root=` on every tool), but `m-terminal`
   read the `workspace=` attribute while the file tools read `root=`, so `root=` on the terminal was
   silently ignored and it diverged to `memory/<agent>/workspace` — files written with `write_file`
   (shared root) were invisible to the terminal (per-agent home). **Fixed:** `m-terminal` now resolves
   `root` \|\| `workspace` \|\| `mindHome` — the same canonical `root=` the file tools and `m-jobs` use.
   Also fixed pre-emptively: an agent's `.runs/run-<n>` script files are namespaced `run-<agent>-<n>`
   so sub-agents sharing one workspace can't clobber each other's scripts. Re-run after the fix: one
   clean shared workspace, no scattered homes, 7 architect steps (down from 18), tests pass.

---

## 14. Open questions

1. **One `<m-terminal>`, two modes, or two components?** ✅ **Resolved (M1–2):**
   `m-terminal` is dual-use — the async grace-race path is a mind-only branch, and the
   agent branch runs synchronously. The first live run added a second, concrete
   resolution: an agent's terminal shares its file tools' workspace root as its writable
   working directory (not a per-wake `run-<stamp>/` subdir), so write → run → read
   composes. The mind keeps the per-wake subdir. See §7 milestone 2.
2. **Streaming the assistant text.** Discrete `completeWithTools` is simplest.
   Streaming the natural-language part (via `chatStream`) would reuse the
   Studio's stream renderer for the "thinking out loud between tool calls" — nice
   but not required for v1.
3. **Nudge arbitration.** A human message and a loop-guard nudge can both want
   the next turn. v1 folds both into the user turn in arrival order; if agents
   grow many interrupt sources, reuse the mind's `InterruptRecord` + a small
   arbiter instead of a plain queue.
4. **Shared kernel now or later?** `MEntityKernel` removes ~20 lines of
   duplication between `MMind` and `MAgent` but touches the mind. Probably a later
   milestone, once the agent shape has settled (milestone 5 duplicated the ~20 lines
   rather than extracting the base, as planned).
5. **One-shot capability offers rely on connect order (by design).** Every capability
   offer — a leaf hand's and the subagent's `_offerAsHand` alike — bubbles a `capability`
   event exactly once in `onConnect`, with no retry, and reaches its `m-act` only because
   the connect order is the contract: `loadMindComponents` defines tags in document order
   with no awaits, so a parent `m-act` is upgraded (and its listener attached synchronously
   in `onConnect`) before any child offers. This holds for the initial CLI load and for a
   Studio re-wake (all tags already registered ⇒ innerHTML upgrades in tree order, parent
   first). It can only break in the *test harness*, where cross-file registration state may
   leave `m-act` unregistered at innerHTML-parse time so it upgrades late, after a child
   already offered — surfaced when building this milestone as an occasionally-lost `m-note`.
   The fix belongs in the tests (register components in production order first), not the
   runtime; `agent-compose.test.js` does exactly that in `beforeAll`.

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
  abstraction for free. ✅ **DONE — milestone 7** (see §13).
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

> **As built (milestone 6).** Level 1 exactly as sketched. `infrastructure/jobRegistry.js`
> is the job registry (one `Job` per background `sandbox.js` run, a live output tail via a
> new optional `onData` hook on `runScript`, a per-job read cursor so `check` returns only
> NEW output, an injected runner so it is unit-tested with no process); `<m-jobs>`
> (`mJobs.js`) offers `spawn` / `check` / `wait` / `list_jobs` / `kill` by bubbling a
> `capability` event each — no change to `m-agent`/`m-reason`. The interruptible `wait` IS
> the code above: `Promise.race([job.done, delay(timeout), messageArrived])`, where the
> message is m-ws's bubbling `task` event (§10), listened for on the enclosing `m-agent`.
> NOTIFY is the registry's `onComplete` firing a bubbling `nudge` (§9's seam) that
> `m-agent` folds into the next turn — the "best last" way to learn a job finished — so the
> async result re-enters as a fresh observation at a later step, never a late `tool` reply
> (transcript stays valid). Probe-gated and sharing the agent's one workspace, exactly like
> the terminal. Example: `architecture/agents/coder-async.archml`. Level 2 (preemption) is the
> remaining rung; "a background job is another `<m-agent>`" (parallel sub-agents) landed in
> milestone 7 (below).
>
> **As built (milestone 7 — parallel sub-agents).** The payoff of §16 without a new subsystem:
> a background job can be another `<m-agent>`. `JobRegistry` grew a generic `start(makeHandle,
> meta)` — register a `Job` around ANY `{done, kill}` handle given the tail sink — and `spawn`
> is now a thin specialization of it over the sandbox runner, so a sub-agent job and a shell job
> settle through the same path (and `Job.kind` = `shell`|`agent` lets `check`/`wait`/`list_jobs`
> report each honestly — an agent job says "completed"/"could not complete", not a shell exit
> code). `mAgent` gained a `runAsJob(task, {onData})` seam that reuses the milestone-5
> `_runAsHand` single-task loop but shapes it as a job handle: each `step` boundary streams to
> the tail (so `check` shows the sub-agent's progress, never a black box), the final answer is
> fed as a last chunk, and `kill` → `_abortTask` ends the loop at a safe point (the in-flight
> `reason` reply is dropped; true mid-`reason` preemption is still Level 2). `<m-jobs>` discovers
> its enclosing agent's `role="subagent"` children and offers `spawn_agent(agent, task)` alongside
> the shell tools, backing each spawn with `registry.start(onData => sub.runAsJob(task,{onData}))`
> — so `check`/`wait`/`kill`/`list_jobs` and the completion `nudge` all work on sub-agent jobs
> unchanged ("parallel sub-agents for free"). Gating split cleanly: shell `spawn` needs a sandbox
> (probe-gated as before), `spawn_agent` needs a sub-agent (no sandbox — a job is a loop), and
> with neither the tool stays inert. Two composition fixes fell out: `_offerAsHand` now fires
> ONLY when the sub-agent's nearest enclosing entity is a mind's `<m-act>` (nested directly in an
> `<m-agent>` it is a background-job sub-agent, discovered by `<m-jobs>`, not a blocking hand), and
> `mAgent`'s `nudge`/`halt` listeners `stopPropagation` so a nested sub-agent's observer signals
> are claimed by the nearest agent and don't leak up to derail the parent's loop. A sub-agent runs
> one task at a time (single-threaded transcript), so real parallelism = distinct sub-agents (a
> `busy`/`available` guard turns work away rather than corrupt an in-flight transcript). Example:
> `architecture/agents/coder-team.archml` (a lead + two background workers), dry-wakes end-to-end.
> Tests: `job-registry.test.js` (the generic `start()` + agent-kind summary), `agent-subagent-jobs.test.js`
> (discovery + spawn_agent runs a worker's whole loop dry, kind, progress tail, notify, busy guard,
> `_abortTask`, and no-sub-agent gating). Level 2 (preemptible loop) is the only remaining rung.
