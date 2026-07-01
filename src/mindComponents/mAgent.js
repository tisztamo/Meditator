import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"
import { validateAgainstSchema } from "./mAct.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mAgent.js")

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The AGENT KERNEL — the tool-calling loop, and the deliberate inversion of a mind
 * (agent-loop.md §1). Where a <m-mind> is anti-agentic (its conscious stream is
 * NEVER given tools; a subconscious m-act realizes a wondering and the world answers
 * later as a plain sensation), an <m-agent> is instrumental: the model IS given the
 * tools, emits tool calls deliberately, sees the RAW results, and loops —
 *
 *     assemble turn → reason (m-reason) → run tools → append observations → repeat
 *
 * — until it answers with no tool call, calls an explicit finish tool, or a budget
 * trips. It mirrors the mind's decomposition part-for-part (agent-loop.md §3): this
 * kernel is the twin of m-mind, <m-reason> of m-stream, <m-objective> of m-origin,
 * and a tool is the SAME capability object a mind's hand offers (§4) — only the
 * harness around it changes.
 *
 * THE WIRING CONTRACT (agent-loop.md §3 — state down as retained topics, intent up
 * as bubbling events):
 *   - m-agent publishes `turn` {system, messages, tools} — the assembled request.
 *   - m-reason subscribes ../turn, calls the model, publishes `reply`.
 *   - m-agent subscribes reason/reply; appends the assistant message; runs the tool
 *     calls; appends the `tool` messages; FIRES a `step` boundary event; loops.
 *   - Tools self-register by bubbling a `capability` event (identical to a mind's
 *     hands registering with m-act); m-agent catches them anywhere in its subtree
 *     and republishes the schema set as a retained `tools` topic.
 *   - Observers (loop guard, …) subscribe to `step` and bubble `nudge` / `halt`
 *     events up; a nudge folds into the next `user` turn, a halt is a stop condition.
 *   - m-agent publishes `status` and `transcript` for the Studio / a report port.
 *
 * Because m-reason is a separate, swappable component, the reasoning strategy can be
 * replaced without touching the loop, the tools, or the observers (agent-loop.md §15).
 *
 * @interface
 * Attributes:
 *   - name: the agent's name (its home + ref path); overridable at wake with
 *     MEDITATOR_AGENT_NAME (applyAgentNameOverride).
 *   - model / utilityModel: default models for the whole agent (children inherit via env()).
 *   - maxSteps: hard budget backstop on reason calls (default 40).
 *   - stopWhen: "no-tools" (default — the model answered with no tool call → done) or
 *     "finish-tool" (loop until the model calls the auto-registered finish(summary)).
 *   - toolSettleMs: how long tool registrations must be quiet before the first turn
 *     (default 300) — so the first turn already carries the tools that probe async.
 *
 * Topics published:
 *   - "turn": {system, messages, tools} — the assembled request for this step.
 *   - "status": {state, step, maxSteps, done, answer?, reason?} — for the Studio.
 *   - "transcript": the working message array (a copy) — for the Studio.
 *   - "tools": the tool schema set — for the Studio.
 * Events fired:
 *   - "step": {index, assistantText, calls, observations} — the boundary of one step.
 *   - "done": {answer, steps, reason, error?} — the loop ended.
 */
export class MAgent extends MBaseComponent {
    _tools = []              // registered capabilities (from bubbling `capability` events)
    _messages = []           // the transcript: user / assistant(+tool_calls) / tool messages
    _step = 0
    _awaitingReply = false   // true between publishing a turn and draining its reply
    _alive = false
    _done = false
    _sleeping = false
    _halt = null             // set by a bubbling `halt` event; a stop condition
    _nudges = []             // pending observer nudges, folded into the next user turn
    _objectiveText = ""      // the objective (seed of the first task), mirrored from m-objective
    _hasObjective = false    // whether an <m-objective> ref was wired (so we wait for it)
    _objectiveReady = false  // whether the objective mirror has been delivered at least once

    onConnect() {
        // Tools announce themselves with a bubbling `capability` event, exactly as a
        // mind's hands do with m-act; one self-listener catches them all (incl. tools
        // added later). stopPropagation so a tool nested inside THIS agent is claimed
        // here and does not also register with an enclosing m-act (the composition case,
        // agent-loop.md §11) — the nearest entity owns its tool.
        this.addEventListener("capability", e => { e.stopPropagation(); this._registerCapability(e?.detail) })

        // Observer seams (agent-loop.md §3, §9): a `nudge` becomes a note on the next
        // user turn; a `halt` is a stop condition. Pure observers wire onto these with
        // no change to the kernel.
        this.addEventListener("nudge", e => { const t = e?.detail?.text; if (t) this._nudges.push(String(t)) })
        this.addEventListener("halt", e => { this._halt = e?.detail?.reason || "halted by an observer" })

        // Mirror the OBJECTIVE — the task this agent was set — the decoupled way
        // (decoupling.md): m-objective publishes its text on `prompt`; we mirror it
        // from an auto-discovered, overridable ref, never a querySelector reach-in.
        // The querySelector here only reads m-objective's NAME to build the ref, exactly
        // as m-mind discovers m-origin. Read once, at wake, by _begin().
        const objective = this.querySelector("m-objective[name]")
        const objName = objective?.getAttribute("name")
        const objectiveSrc = this.attr("objectiveSrc") || (objName ? `..m-agent/${objName}/prompt` : null)
        this._hasObjective = !!(objectiveSrc && objectiveSrc !== "off")
        if (this._hasObjective) this.sub(objectiveSrc, o => { this._objectiveText = o || ""; this._objectiveReady = true }).catch(() => {})

        // m-reason's move for the turn we just published. Subscribed explicitly (not as
        // an auto-sub field) with a .catch(): a bare/misconfigured agent with no
        // <m-reason> then fails quietly instead of leaking an unhandled ref-resolution
        // rejection when the ref never resolves. (The loop itself won't start without a
        // reasoner — _whenAlive throws and _begin bails.)
        this.sub("reason/reply", reply => this._onReply(reply)).catch(() => {})

        this._begin()
    }

    onDisconnect() {
        this._sleeping = true
    }

    // Register a tool from its bubbling `capability` event detail — the SAME closed
    // contract m-act uses (agent-loop.md §4): {name, description, parameters, execute}.
    // Returns false (and warns) on a malformed spec rather than throwing — a broken tool
    // must not crash a wake. The menu is closed: the model can only ever call a
    // registered tool with schema-validated args.
    _registerCapability(spec) {
        if (!spec || typeof spec.name !== "string" || typeof spec.execute !== "function") {
            log.warn(`ignoring a malformed capability registration: ${JSON.stringify(spec?.name)}`)
            return false
        }
        if (this._tools.some(t => t.name === spec.name)) {
            log.warn(`a tool named "${spec.name}" is already registered; ignoring the duplicate`)
            return false
        }
        this._tools.push({
            name: spec.name,
            description: spec.description || "",
            parameters: spec.parameters || { type: "object", properties: {} },
            execute: spec.execute.bind(spec),
        })
        log.info(`tool registered: ${spec.name}`)
        this.pub("tools", this._toolSchemas())
        return true
    }

    async _begin() {
        try {
            await this._whenAlive()
        } catch (error) {
            if (!this._sleeping) log.error("Agent could not start:", error.message)
            return
        }
        if (this._sleeping) return
        this._alive = true

        // finish-tool mode: the kernel offers a finish(summary) tool so an autonomous
        // agent can declare completion explicitly (agent-loop.md §6).
        if (this._stopWhen() === "finish-tool") this._registerFinishTool()

        // Seed the first `user` turn with the objective, exactly as a mind's first
        // thought is seeded from its <m-origin>. A service agent with no objective
        // waits for a task over its membrane instead (Phase 3); with neither, idle.
        const objective = (this._objectiveText || "").trim()
        if (objective) {
            this._messages.push({ role: "user", content: objective })
            log.info(`"${this.attr("name") || "agent"}" begins its objective (${objective.length} chars).`)
        } else if (!this._hasMembrane()) {
            log.warn(`"${this.attr("name") || "agent"}" has no objective and no membrane — nothing to do.`)
            this.pub("status", { state: "idle", step: 0, maxSteps: this._maxSteps(), done: false })
            return
        }

        this.pub("transcript", [...this._messages])
        this._publishTurn()
    }

    /** Wait until m-reason is upgraded, the objective mirror has landed (if declared),
     *  and tool registrations have gone quiet — so the very first turn already carries
     *  the tools (the terminal probes its sandbox asynchronously). */
    async _whenAlive() {
        let ready = false
        for (let i = 0; i < 100; i++) {
            if (this._sleeping) return   // disconnected during wake — stop quietly
            const reason = this.querySelector("m-reason")
            const reasonReady = reason && reason.on
            const objectiveReady = !this._hasObjective || this._objectiveReady
            if (reasonReady && objectiveReady) { ready = true; break }
            await delay(100)
        }
        if (!ready) throw new Error("m-reason did not come up in time")

        // Tool settle: break once the tool count has been stable for `toolSettleMs`,
        // hard-capped so a perpetually-registering tool cannot stall the wake.
        const settleMs = Number(this.attr("toolSettleMs") || 300)
        let last = this._tools.length
        let stableFor = 0
        for (let waited = 0; waited < 3000; waited += 60) {
            await delay(60)
            if (this._tools.length === last) {
                stableFor += 60
                if (stableFor >= settleMs) break
            } else {
                last = this._tools.length
                stableFor = 0
            }
        }
    }

    /** Assemble the turn for this step and publish it. Evaluates the step-budget and
     *  halt stop conditions first; a nudge (if any) folds into a fresh `user` turn. */
    _publishTurn() {
        if (this._done || this._sleeping) return
        if (this._halt) { this._finish(null, this._halt, { halted: true }); return }

        // Fold any pending observer nudges into the transcript as a note (agent-loop.md §9).
        if (this._nudges.length) {
            const note = this._nudges.splice(0).map(t => `[note] ${t}`).join("\n")
            this._messages.push({ role: "user", content: note })
        }

        this._step += 1
        const maxSteps = this._maxSteps()
        if (this._step > maxSteps) {
            this._finish(null, `reached the step budget (${maxSteps})`, { halted: true })
            return
        }

        const turn = {
            system: this._system(),
            messages: [...this._messages],
            tools: this._toolSchemas(),
        }
        this._awaitingReply = true
        this.pub("status", { state: "reasoning", step: this._step, maxSteps, done: false })
        this.pub("turn", turn)
    }

    /** Drain one reply from m-reason: append the assistant move, run its tool calls,
     *  append the observations, fire the step boundary, and loop. */
    async _onReply(reply) {
        if (this._done || this._sleeping) return
        if (!this._awaitingReply) return   // stale/duplicate (retained-topic replay guard)
        this._awaitingReply = false
        if (!reply) return

        if (reply.finish_reason === "error") {
            this._finish(null, "the reasoner failed", { error: reply.error || "reason error" })
            return
        }

        const calls = Array.isArray(reply.tool_calls) ? reply.tool_calls : []
        const text = reply.text || ""

        // Append the assistant move in the provider's exact shape (agent-loop.md §12):
        // tool_calls must round-trip verbatim, and each must be answered by exactly one
        // `tool` message with the matching id.
        const assistant = { role: "assistant", content: text }
        if (calls.length) assistant.tool_calls = calls
        this._messages.push(assistant)

        // No tool calls → the model answered. In no-tools mode that ends the loop; in
        // finish-tool mode the agent must call finish, so remind it and continue.
        if (!calls.length) {
            if (this._stopWhen() === "finish-tool") {
                this._nudges.push("Do not stop yet: when the objective is complete and verified, call the finish tool with a summary. Otherwise keep working.")
                this.pub("transcript", [...this._messages])
                this._publishTurn()
            } else {
                this._finish(text, "answered")
            }
            return
        }

        const { toolMessages, observations, finished } = await this._runCalls(calls)
        for (const m of toolMessages) this._messages.push(m)
        this.pub("transcript", [...this._messages])

        // The step boundary — a transient event, the twin of m-stream's `boundary`.
        // Observers (m-repeat-guard, m-todo, the Studio) watch it (agent-loop.md §3, §9).
        this.fire("step", {
            index: this._step,
            assistantText: text,
            calls: calls.map(c => ({ id: c.id, name: c.function?.name, args: safeArgs(c.function?.arguments) })),
            observations,
        })

        if (finished) { this._finish(finished.summary || text, "finish-tool"); return }
        if (this._sleeping || this._done) return
        this._publishTurn()
    }

    /** Run every tool call the model returned. They are independent, so execute them
     *  concurrently, but append the `tool` messages in CALL ORDER (agent-loop.md §12).
     *  Every tool_call gets exactly one `tool` message — even a failure — so the
     *  transcript stays valid. Observations are sourced strictly from execute()
     *  (agent-loop.md §12: never let assistant text stand in for a tool result). */
    async _runCalls(calls) {
        const results = await Promise.all(calls.map(call => this._runOne(call)))
        const toolMessages = []
        const observations = []
        let finished = null
        for (const r of results) {
            toolMessages.push({ role: "tool", tool_call_id: r.id, content: r.observation })
            observations.push({ name: r.name, observation: r.observation, isError: r.isError })
            if (r.finished) finished = r.finished
        }
        return { toolMessages, observations, finished }
    }

    async _runOne(call) {
        const id = call.id || A.uid("call")
        const name = call.function?.name
        const tool = this._tools.find(t => t.name === name)
        if (!tool) {
            return { id, name, observation: `error: no such tool "${name}" (the menu is closed)`, isError: true }
        }

        let args
        try {
            args = JSON.parse(call.function?.arguments || "{}")
        } catch {
            return { id, name, observation: `error: arguments for "${name}" were not valid JSON`, isError: true }
        }
        const invalid = validateAgainstSchema(args, tool.parameters)
        if (invalid) {
            return { id, name, observation: `error: arguments for "${name}" failed the schema (${invalid})`, isError: true }
        }

        let out
        try {
            out = await tool.execute(args)
        } catch (error) {
            // A tool that throws must not crash the loop; the model reads the error and
            // decides what to do next.
            return { id, name, observation: `error: "${name}" threw: ${error?.message || error}`, isError: true }
        }

        const finished = name === FINISH_TOOL ? { summary: args?.summary || "" } : null
        return { id, name, observation: observationOf(out, name), isError: !!(out && out.isError), finished }
    }

    /** The agent's CHARTER — the system turn, standing in every step. The <m-agent>'s
     *  own prose (its direct text, ignoring child elements), the twin of a mind's
     *  identity. Context compaction (a prepended summary) lands in Phase 3 (m-context). */
    _system() {
        return this.getPrompt().trim()
    }

    _toolSchemas() {
        return this._tools.map(t => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
    }

    /** finish(summary): the explicit completion verb for autonomous (finish-tool) mode.
     *  A synthetic, read-only capability the kernel registers itself; calling it ends
     *  the loop (handled in _runOne / _onReply). */
    _registerFinishTool() {
        if (this._tools.some(t => t.name === FINISH_TOOL)) return
        this._registerCapability({
            name: FINISH_TOOL,
            description: "Call this ONLY when the objective is fully complete and verified. Provide a short summary of what was accomplished. This ends the task.",
            parameters: { type: "object", properties: { summary: { type: "string", description: "a short summary of what was done" } }, required: ["summary"] },
            execute: args => ({ observation: `finished: ${args?.summary || ""}`, data: { summary: args?.summary || "" } }),
        })
    }

    _finish(answer, reason, extra = {}) {
        if (this._done) return
        this._done = true
        const detail = { answer: answer || null, steps: this._step, reason, ...extra }
        this.pub("status", { state: extra.error ? "error" : "done", step: this._step, maxSteps: this._maxSteps(), done: true, answer: answer || null, reason })
        this.fire("done", detail)
        if (extra.error) log.warn(`"${this.attr("name") || "agent"}" stopped after ${this._step} step(s): ${reason} (${extra.error})`)
        else log.info(`"${this.attr("name") || "agent"}" finished after ${this._step} step(s): ${reason}`)
    }

    _maxSteps() { return Number(this.attr("maxSteps") || 40) }
    _stopWhen() { return (this.attr("stopWhen") || "no-tools").toLowerCase() }

    /** Whether the agent has a membrane (a task port) it could receive work over —
     *  so a service agent with no static objective isn't mistaken for having nothing
     *  to do. (m-ws / task-port wiring lands in Phase 3.) */
    _hasMembrane() { return !!this.querySelector("m-ws, m-console") }

    /**
     * The sleep ritual, for graceful shutdown (start.js). An agent holds no narrative
     * self to close, so this is quiet: stop the loop and report. Persistence of the
     * transcript (so a restarted service resumes mid-task) lands with <m-context> in
     * Phase 3; here there is nothing to flush. Idempotent.
     */
    async sleep() {
        if (this._sleeping) return
        this._sleeping = true
        this.pub("status", { state: "asleep", step: this._step, maxSteps: this._maxSteps(), done: this._done })
        log.info(`"${this.attr("name") || "agent"}" put to sleep after ${this._step} step(s).`)
    }
}

const FINISH_TOOL = "finish"

/** The agent-facing text a tool returns to the model (agent-loop.md §4): its
 *  `observation`. Falls back to a mind-only tool's `experience`, then a structured
 *  `data` payload, so a dual-use hand works under an agent unchanged. */
function observationOf(out, name) {
    if (out == null) return `(${name} returned nothing)`
    if (typeof out.observation === "string") return out.observation
    if (typeof out.experience === "string") return out.experience
    if (out.data !== undefined) return typeof out.data === "string" ? out.data : JSON.stringify(out.data)
    return `(${name} returned no observation)`
}

/** Parse a tool call's argument JSON for the `step` event's convenience; never throws. */
function safeArgs(raw) {
    try { return JSON.parse(raw || "{}") } catch { return raw ?? null }
}

A.define("m-agent", MAgent)
