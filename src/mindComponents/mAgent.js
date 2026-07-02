import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"
import { validateAgainstSchema } from "./toolSchema.js"
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
 * SERVICE MODE (agent-loop.md §10): an agent with a membrane (<m-ws>/<m-console>) is a
 * service — it takes tasks as bubbling `task` events (each a `user` turn), and after a
 * task ends it returns to idle to await the next rather than retiring; with no static
 * <m-objective> it simply idles until the first task lands. A one-shot agent (objective,
 * no membrane) runs its task and retires. An optional <m-context> restores a persisted
 * transcript on wake (resume mid-task) and compacts the working set when it overruns.
 *
 * Subscriptions (all optional, auto-discovered children): "reason/reply",
 *   "<context>/restore" {messages, step}, "<context>/compacted" {summarizeCount, summary}.
 * Events consumed (bubbling): "capability", "nudge", "halt", "task".
 * Topics published:
 *   - "turn": {system, messages, tools} — the assembled request for this step.
 *   - "status": {state, step, maxSteps, done, answer?, reason?} — for the Studio / m-report.
 *   - "transcript": the working message array (a copy) — for the Studio / m-context.
 *   - "tools": the tool schema set — for the Studio.
 * Events fired:
 *   - "step": {index, assistantText, calls, observations} — the boundary of one step.
 *   - "done": {answer, steps, reason, error?} — a task ended (fires once per task).
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
    _plainStreak = []        // consecutive no-tool-call answers (finish-tool mode); two ends it
    _objectiveText = ""      // the objective (seed of the first task), mirrored from m-objective
    _hasObjective = false    // whether an <m-objective> ref was wired (so we wait for it)
    _objectiveReady = false  // whether the objective mirror has been delivered at least once
    _taskActive = false      // a task's loop is currently running (between start and finish)
    _retired = false         // permanently stopped (a one-shot agent that finished its task)
    _pendingTasks = []       // tasks that arrived before wake completed, drained in _begin
    _hasContext = false      // whether an <m-context> ref was wired (so we wait for restore)
    _contextReady = false    // whether the context restore has been delivered at least once
    _restoredMessages = null // a persisted transcript to resume from (from m-context)
    _restoredStep = 0
    _asHand = false          // role="subagent": used as a mind's hand, not auto-begun (§11)
    _handResolve = null      // resolves the in-flight hand call's promise when a task finishes
    _pendingIntent = null    // the mind's decide-stage intent for the current hand call
    _handLeadIdx = -1        // rotates the first-person framing of a returned outcome
    _ready = null            // resolves once the reasoner + tools are up (awaited by a hand call)
    _resolveReady = null

    onConnect() {
        // COMPOSITION (agent-loop.md §11): an <m-agent role="subagent"> nested inside a
        // mind's <m-act> is used as a single HAND — the mind wonders, m-act hands it a
        // task, the agent runs its whole tool-calling loop BACKSTAGE, and only the OUTCOME
        // re-enters the mind as one first-person sensation (the One Rule holds at the
        // mind's membrane, even though a full agent ran inside it). Such an agent does not
        // auto-begin: it offers itself as a capability and runs only when executed.
        this._asHand = (this.attr("role") || "").toLowerCase() === "subagent"
        this._ready = new Promise(resolve => { this._resolveReady = resolve })

        // Tools announce themselves with a bubbling `capability` event, exactly as a
        // mind's hands do with m-act; one self-listener catches them all (incl. tools
        // added later). stopPropagation so a tool nested inside THIS agent is claimed
        // here and does not also register with an enclosing m-act (the composition case,
        // agent-loop.md §11) — the nearest entity owns its tool. The `e.target === this`
        // guard lets our OWN offer to the enclosing m-act (a subagent hand's _offerAsHand,
        // fired ON this element) pass straight through: we neither claim it nor stop it, so
        // it bubbles past us up to that m-act, while a child tool's event (target a
        // descendant) is claimed here.
        this.addEventListener("capability", e => {
            if (e.target === this) return
            e.stopPropagation()
            this._registerCapability(e?.detail)
        })

        // Observer seams (agent-loop.md §3, §9): a `nudge` becomes a note on the next
        // user turn; a `halt` is a stop condition. Pure observers wire onto these with
        // no change to the kernel. stopPropagation so a signal is claimed by the NEAREST
        // agent: a background sub-agent nested in another <m-agent> (agent-loop.md §16) has
        // its own observers whose nudge/halt must not leak up and derail the parent's loop.
        this.addEventListener("nudge", e => { e.stopPropagation(); const t = e?.detail?.text; if (t) this._nudges.push(String(t)) })
        this.addEventListener("halt", e => { e.stopPropagation(); this._halt = e?.detail?.reason || "halted by an observer" })

        // A TASK arriving over the membrane (agent-loop.md §10): a bubbling `task` event
        // (m-ws fires it on client input for an agent), whose text becomes a `user` turn.
        // A service agent with no static objective idles until the first one lands, and
        // returns to idle after each — the deliberate service-mode inversion of a one-shot.
        this.addEventListener("task", e => { e.stopPropagation(); this._enqueueTask(e?.detail?.text ?? e?.detail) })

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

        // The optional <m-context> (agent-loop.md §10) is the agent's working memory: it
        // restores a persisted transcript on wake (so a service resumes mid-task) and asks
        // to compact the working set when it overruns its budget. Both are retained topics
        // we mirror from an auto-discovered child, never a reach-in — the same decoupled
        // idiom as reason/reply. Absent m-context, the transcript simply grows unbounded.
        const context = this.querySelector("m-context[name]")
        const ctxName = context?.getAttribute("name")
        this._hasContext = !!ctxName
        if (ctxName) {
            this.sub(`${ctxName}/restore`, r => this._onRestore(r)).catch(() => {})
            this.sub(`${ctxName}/compacted`, c => this._onCompacted(c)).catch(() => {})
        }

        // A subagent offers itself as a blocking HAND only when its enclosing entity is a
        // mind's <m-act> (agent-loop.md §11): m-act (the parent) has already connected and
        // is listening, so the mind's body schema and hand menu include this agent from the
        // start, exactly as a leaf hand registers. Nested directly inside ANOTHER <m-agent>
        // it is instead a BACKGROUND-JOB sub-agent (agent-loop.md §16): it stays quiet here,
        // and the parent's <m-jobs> discovers it and offers spawn_agent, so it runs async
        // rather than as a blocking tool. (Checking the nearest enclosing entity — not just
        // any ancestor m-act — so a sub-agent nested in a sub-agent inside a mind is not
        // mistaken for the mind's own hand.)
        const enclosing = this.parentElement?.closest("m-act, m-agent")
        if (this._asHand && enclosing?.localName === "m-act") this._offerAsHand()

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
            this._resolveReady?.()   // unblock any waiting hand call (it will see !_alive and bail)
            if (!this._sleeping) log.error("Agent could not start:", error.message)
            return
        }
        if (this._sleeping) { this._resolveReady?.(); return }
        this._alive = true

        // finish-tool mode: the kernel offers a finish(summary) tool so an autonomous
        // agent can declare completion explicitly (agent-loop.md §6).
        if (this._stopWhen() === "finish-tool") this._registerFinishTool()
        this._resolveReady?.()   // reasoner + tools are up: a subagent hand call can now run

        // A SUBAGENT HAND (agent-loop.md §11) has no static objective and no membrane; it
        // simply waits, idle, until its mind's m-act executes it (see _runAsHand). It never
        // seeds a task or retires on its own — the mind drives it, one reach at a time.
        if (this._asHand) {
            log.info(`"${this.attr("name") || "agent"}" is a subagent hand — idle until its mind reaches for it.`)
            this.pub("status", { state: "idle", step: 0, maxSteps: this._maxSteps(), done: false })
            return
        }

        // Resume from a persisted transcript if <m-context> restored one (agent-loop.md §10):
        // a restarted service picks its work back up mid-task rather than seeding fresh.
        if (this._restoredMessages && this._restoredMessages.length) {
            this._messages = [...this._restoredMessages]   // own a copy; never mutate the restore payload
            this._step = Number(this._restoredStep) || 0
            this._taskActive = true
            log.info(`"${this.attr("name") || "agent"}" resumes a restored transcript (${this._messages.length} messages, from step ${this._step}).`)
            this.pub("transcript", [...this._messages])
            this._publishTurn()
            this._drainPendingTasks()
            return
        }

        // Seed the first `user` turn with the objective, exactly as a mind's first
        // thought is seeded from its <m-origin>. A service agent with no objective waits
        // for a task over its membrane instead (§10); with neither, there is nothing to do.
        const objective = (this._objectiveText || "").trim()
        if (objective) {
            this._messages.push({ role: "user", content: objective })
            this._taskActive = true
            log.info(`"${this.attr("name") || "agent"}" begins its objective (${objective.length} chars).`)
            this.pub("transcript", [...this._messages])
            this._publishTurn()
        } else if (this._hasMembrane()) {
            log.info(`"${this.attr("name") || "agent"}" is a service agent — awaiting its first task over the membrane.`)
            this.pub("status", { state: "idle", step: 0, maxSteps: this._maxSteps(), done: false })
        } else {
            log.warn(`"${this.attr("name") || "agent"}" has no objective and no membrane — nothing to do.`)
            this.pub("status", { state: "idle", step: 0, maxSteps: this._maxSteps(), done: false })
        }

        this._drainPendingTasks()
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
            const contextReady = !this._hasContext || this._contextReady
            if (reasonReady && objectiveReady && contextReady) { ready = true; break }
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
        // finish-tool mode the agent must call finish, so remind it and continue — BUT a
        // purely conversational request ("what tools do you have") has no work to finish,
        // so a bare "keep working" nudge sends the model hunting for a task that isn't
        // there, looping until the step cap (found live: coder-service-2 dug through the
        // whole filesystem for a nonexistent objective). Two guards fix it:
        //   1. The nudge itself offers finish as the answer to a complete reply, and only
        //      asks for more work when work genuinely remains — so an answered question
        //      routes to finish() next turn instead of to busywork.
        //   2. A backstop: two CONSECUTIVE plain-text answers (no tool call, no finish)
        //      mean the model has said its piece and won't call finish — so end the loop
        //      ourselves. The answers are concatenated with a marker (not just the last
        //      one kept) so the first, substantive answer isn't lost to a terse retry.
        if (!calls.length) {
            if (this._stopWhen() === "finish-tool") {
                this._plainStreak.push(text)
                if (this._plainStreak.length >= 2) {
                    const answers = this._plainStreak.filter(t => t && t.trim())
                    const summary = answers.length
                        ? answers.map((t, i) => i === 0 ? t : `[continued]\n${t}`).join("\n\n")
                        : text
                    this._plainStreak = []
                    this._finish(summary, "answered")
                    return
                }
                this._nudges.push("If you have fully addressed the request — including simply answering the user's question — call the finish tool now with a summary to end. Only keep working if real work genuinely remains.")
                this.pub("transcript", [...this._messages])
                this._publishTurn()
            } else {
                this._finish(text, "answered")
            }
            return
        }
        // A tool call means the agent is actively working, not just talking: reset the
        // plain-answer streak so only CONSECUTIVE plain answers ever end the loop.
        this._plainStreak = []

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

        // The GOVERN seam (agent-loop.md §6, §11): between reason and act, a governing
        // norm may VETO or MODIFY this proposed call before it runs. With none wired the
        // call proceeds unchanged. A modify is re-validated below, so a governor cannot
        // patch the args into a shape the tool's schema would reject (codex doc: "modify
        // decisions must be rechecked after patching").
        const gov = await this._govern(name, args)
        if (gov.denied) {
            return { id, name, observation: `refused: ${gov.denied}`, isError: true }
        }
        args = gov.args

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
     *  identity. Context compaction folds the OLDEST turns into a summary message inside
     *  the transcript itself (see _onCompacted / <m-context>), not into this charter. */
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

    /** End the CURRENT task: fire `done`, publish status. Then the service-mode fork
     *  (agent-loop.md §10): an agent with a membrane returns to idle to await the next
     *  task (its transcript persists and rolls on); a one-shot agent retires. `_done`
     *  guards the loop between tasks and is cleared by _resetForNextTask. */
    _finish(answer, reason, extra = {}) {
        if (this._done) return
        this._done = true
        this._taskActive = false
        const detail = { answer: answer || null, steps: this._step, reason, ...extra }
        this.pub("status", { state: extra.error ? "error" : "done", step: this._step, maxSteps: this._maxSteps(), done: true, answer: answer || null, reason })
        this.fire("done", detail)
        if (extra.error) log.warn(`"${this.attr("name") || "agent"}" stopped after ${this._step} step(s): ${reason} (${extra.error})`)
        else log.info(`"${this.attr("name") || "agent"}" finished after ${this._step} step(s): ${reason}`)

        if (this._sleeping) { this._resolveHand(detail); return }
        // A subagent HAND (agent-loop.md §11): hand the outcome back to the waiting
        // execute() (which returns it to the mind as a sensation) and reset to idle for
        // the next reach. It neither drains a task queue nor retires — the mind drives it.
        if (this._asHand) { this._resetForHand(); this._resolveHand(detail); return }
        if (this._hasMembrane()) this._resetForNextTask()
        else this._retired = true
    }

    /** Return a service agent to idle after a task ends: clear the per-task loop state
     *  (but KEEP the transcript — it carries context into the next task, bounded by
     *  <m-context>) and await the next inbound task. */
    _resetForNextTask() {
        // A message that folded in during the just-finished task but never got a turn
        // (it arrived on the very last step) would otherwise be wiped here — carry it
        // over as the seed of the next task so nothing said to the agent is lost.
        const leftover = this._nudges.splice(0)
        this._done = false
        this._taskActive = false
        this._step = 0
        this._awaitingReply = false
        this._halt = null
        this._nudges = []
        this._plainStreak = []
        this._pendingTasks.push(...leftover)
        this.pub("status", { state: "idle", step: 0, maxSteps: this._maxSteps(), done: false })
        log.info(`"${this.attr("name") || "agent"}" is idle — awaiting the next task.`)
        this._drainPendingTasks()
    }

    // ── COMPOSITION: the agent as a mind's HAND (agent-loop.md §11) ─────────────────

    /** Offer THIS agent to an enclosing mind's <m-act> as a single capability (a HAND).
     *  The mind's realizer picks it and supplies a `task`; execute() below hands that task
     *  to the loop, runs it to completion backstage, and returns the outcome as a
     *  first-person sensation — so the mind's conscious stream perceives only the
     *  consequence, never the tool-calling underneath (the One Rule).
     *
     *  Bubbled exactly as a leaf hand offers (m-note/m-look) — one shot, no retry. Our own
     *  `capability` listener lets it pass (e.target === this; see onConnect) so it reaches
     *  the enclosing m-act. No retry is needed because the connect order is the contract:
     *  loadMindComponents defines tags in document order with no awaits, so a parent m-act
     *  is upgraded — and its capability listener attached synchronously in onConnect —
     *  before this child agent connects and offers, just as m-act precedes any leaf hand. */
    _offerAsHand() {
        this.fire("capability", this._handSpec())
    }

    /** The capability spec this agent offers as a hand. readonly defaults to false: an
     *  agent that runs commands and writes files is world-changing (the flag a norm gates
     *  on). Overridable via attributes (felt, handDescription, readonly, salience). */
    _handSpec() {
        return {
            name: this.attr("name") || "agent",
            description: this.attr("handDescription")
                || "Hand off a concrete, self-contained piece of real work — reading and changing files, "
                 + "running commands, checking something by actually doing it. It is carried out in full, "
                 + "and the outcome comes back to you.",
            felt: this.attr("felt")
                || "When something needs actually doing rather than only thinking through — real work with "
                 + "files and commands, carried all the way to a checked result — you can set it in motion, "
                 + "and a while later what came of it returns to you.",
            parameters: {
                type: "object",
                properties: {
                    task: { type: "string", description: "the concrete task to carry out, in plain first-person terms" },
                },
                required: ["task"],
            },
            readonly: this.attr("readonly") === "true",
            execute: (args, ctx) => this._runAsHand(args, ctx),
        }
    }

    /** Run one hand call: seed the task, drive the whole loop, and resolve with the
     *  outcome (the twin of any hand's execute()). Returns { experience, observation,
     *  data } — m-act journals the DEED backstage and re-enters `experience` as a plain
     *  External sensation. Sequential by construction: the mind's m-act is single-flight
     *  and awaits this, so a second call cannot overlap; if one somehow does, it is turned
     *  away rather than corrupting the in-flight transcript. */
    async _runAsHand(args, ctx) {
        const task = String(args?.task ?? ctx?.intent ?? "").trim()
        if (!task) return { observation: "there was no task to carry out", isError: true }

        await this._ready   // reasoner + tools must be up before the first turn
        if (!this._alive || this._sleeping || this._retired) {
            return { observation: "the agent is not available to take work right now", isError: true }
        }
        if (this._taskActive || this._handResolve) {
            return { observation: "still finishing the last piece of work; leaving it to complete first", isError: true }
        }

        const outcome = new Promise(resolve => { this._handResolve = resolve })
        this._pendingIntent = ctx?.intent || null
        this._messages.push({ role: "user", content: task })
        this._taskActive = true
        this._done = false
        this._step = 0
        log.info(`"${this.attr("name") || "agent"}" (subagent hand) takes a task (${task.length} chars) and begins.`)
        this.pub("transcript", [...this._messages])
        this._publishTurn()

        return this._handConsequence(await outcome)
    }

    /** Turn a finished task's `done` detail into the consequence the MIND perceives. On a
     *  genuine failure it returns an observation but NO experience — a hand-slip is silent
     *  for the mind (efference.md §5.5), never a false sensation of success. On success it
     *  frames the agent's answer as a first-person sensation of work returning, grounded
     *  (when known) in the reach that set it going — the same shape m-terminal uses. */
    _handConsequence(detail) {
        const intent = this._pendingIntent
        this._pendingIntent = null
        if (!detail || detail.error) {
            return { observation: `the work could not be completed: ${detail?.error || detail?.reason || "unknown"}`, isError: true, data: { reason: detail?.reason, error: detail?.error } }
        }
        const answer = (detail.answer || "").trim()
        if (!answer) {
            return { observation: `(the work ended with no summary: ${detail.reason})`, data: { reason: detail.reason, steps: detail.steps } }
        }
        return {
            observation: answer,
            experience: frameHandExperience(answer, intent, ++this._handLeadIdx),
            salience: Number(this.attr("salience") || 0.62),
            urgent: this.attr("urgent") !== "false",
            type: `Sense-${this.attr("name") || "agent"}`,
            data: { steps: detail.steps, reason: detail.reason },
        }
    }

    /** Reset a subagent hand to idle after a task ends — clear the per-task loop state but
     *  KEEP the transcript (it carries context into the next reach, bounded by an optional
     *  <m-context>, exactly as service mode does). No task-queue drain, no retire. */
    _resetForHand() {
        this._done = false
        this._taskActive = false
        this._step = 0
        this._awaitingReply = false
        this._halt = null
        this._nudges = []
        this._plainStreak = []
        this.pub("status", { state: "idle", step: 0, maxSteps: this._maxSteps(), done: false })
    }

    /** Resolve the in-flight hand call's promise, once, with the finished-task detail. */
    _resolveHand(detail) {
        const resolve = this._handResolve
        this._handResolve = null
        resolve?.(detail)
    }

    // ── COMPOSITION: the agent as a BACKGROUND JOB (agent-loop.md §16) ───────────────

    /** Whether this agent is mid-task (so it cannot take another). A sub-agent runs one
     *  task at a time — its transcript is single-threaded — so parallelism comes from
     *  spawning DISTINCT sub-agents, not overlapping tasks on one. */
    get busy() { return this._taskActive || !!this._handResolve }

    /** Whether this agent can take a background task right now (agent-loop.md §16). It need
     *  not be _alive yet — runAsJob awaits readiness — only not asleep, retired, or busy. */
    get available() { return !this._sleeping && !this._retired && !this.busy }

    /**
     * Run one task IN THE BACKGROUND for a spawning agent, shaped as a job HANDLE
     * ({done, kill}) so the job registry tracks a sub-agent exactly like a sandbox run —
     * this is what makes "a background job can be another <m-agent>" (agent-loop.md §16)
     * fall out for free: parallel sub-agents with the same spawn / check / wait / kill.
     *
     * It reuses the very same single-task loop as the mind-hand path (_runAsHand): the
     * task is seeded, the whole tool-calling loop runs, and the outcome resolves the
     * handle. Each `step` boundary is streamed to `onData` so `check` shows progress, and
     * the final answer is fed as a last chunk so `check`/`wait` surface it. kill aborts
     * the task (a synthetic finish) — the same safe-point as a mind putting the hand down.
     */
    runAsJob(task, { onData } = {}) {
        const tap = typeof onData === "function" ? onData : () => {}
        const onStep = e => { try { tap(renderStep(e?.detail)) } catch { /* a tail hiccup must not break the loop */ } }
        this.addEventListener("step", onStep)
        const done = (async () => {
            try {
                const out = await this._runAsHand({ task }, {})
                const answer = String(out?.observation ?? "").trim()
                if (answer) tap(`\n${answer}\n`)   // the final summary lands in the job's tail for check/wait
                return { screen: answer, exitCode: out?.isError ? 1 : 0, signal: null, timedOut: false, truncated: false, durationMs: 0 }
            } finally {
                this.removeEventListener("step", onStep)
            }
        })()
        return { done, kill: () => this._abortTask("the work was stopped") }
    }

    /** Abort the current background task at a safe point: end the loop with a synthetic
     *  finish so the in-flight reason reply is dropped (guarded by _awaitingReply) and the
     *  handle's `done` resolves. In-flight tool executions are left to complete but their
     *  results are discarded — true mid-reason preemption is Level 2 (agent-loop.md §16). */
    _abortTask(reason = "the work was stopped") {
        if (this._done || !this._taskActive) return
        this._finish(null, reason, { halted: true })
    }

    /**
     * The GOVERN seam (agent-loop.md §6, §11) — the checkpoint between reason and act. A
     * governor (an <m-norm>, a permission policy) subscribes to the bubbling `proposal`
     * event and may VETO the call (proposal.deny(reason)) or MODIFY it (mutate/replace
     * proposal.args). A deterministic governor decides synchronously; an async one (e.g. an
     * LLM policy that needs a model call) registers its decision with proposal.hold(promise)
     * and we await it before proceeding — so world-changing actions can be gated with real
     * deliberation, not only pattern matches. With NO governor wired the event bubbles away
     * unheard and the call proceeds unchanged: a bare agent is ungoverned, and the safe
     * per-surface defaults (deny world-changing, permit read-only) are a norm's concern,
     * handed off to design-agents-norms-codex.md. This doc stops at the seam.
     */
    async _govern(name, args) {
        let denied = null
        const holds = []
        const proposal = {
            agent: this.attr("name") || "agent",
            name,
            args,
            deny(reason) { denied = reason || "denied by a governing norm" },
            hold(p) { if (p && typeof p.then === "function") holds.push(p) },
        }
        this.fire("proposal", proposal)
        if (holds.length) {
            try { await Promise.all(holds) }
            catch (error) { denied = denied || `governor error: ${error?.message || error}` }
        }
        return { denied, args: proposal.args }
    }

    /** Accept a task (a `user` turn) arriving over the membrane. Before wake completes it
     *  is buffered and drained in _begin. While a task is running, a new one folds into the
     *  next turn as a user note (open-Q3 v1: arrival order). When idle, it starts the loop. */
    _enqueueTask(raw) {
        const text = String(raw ?? "").trim()
        if (!text || this._sleeping || this._retired) return
        if (!this._alive) { this._pendingTasks.push(text); return }
        if (this._taskActive) {
            this._nudges.push(`A new message from the user just arrived: ${text}`)
            log.info(`"${this.attr("name") || "agent"}" folded an incoming message into the running task.`)
            return
        }
        this._messages.push({ role: "user", content: text })
        this._taskActive = true
        this._done = false
        this._step = 0
        log.info(`"${this.attr("name") || "agent"}" received a task (${text.length} chars) and begins.`)
        this.pub("transcript", [...this._messages])
        this._publishTurn()
    }

    _drainPendingTasks() {
        if (!this._pendingTasks.length) return
        const queued = this._pendingTasks.splice(0)
        for (const t of queued) this._enqueueTask(t)
    }

    /** m-context restored a persisted transcript on wake (or an empty one). Held for
     *  _begin, which decides resume-vs-seed once the reasoner and tools are also ready. */
    _onRestore(restore) {
        this._contextReady = true
        if (!restore) return
        this._restoredMessages = Array.isArray(restore.messages) ? restore.messages : null
        this._restoredStep = Number(restore.step) || 0
    }

    /** m-context asks to compact: replace the first `summarizeCount` messages with one
     *  summary message (agent-loop.md §10). We own the array, so the splice happens HERE.
     *  It is provider-safe because m-context chose the cut so messages[summarizeCount] is
     *  not a `tool` message (it never orphans a tool response from its assistant); we
     *  re-check and refuse otherwise. Messages appended while the summary was being written
     *  sit AFTER the cut, so they are preserved untouched. */
    _onCompacted(compacted) {
        if (this._sleeping || !compacted) return
        const n = Number(compacted.summarizeCount)
        const summary = (compacted.summary || "").trim()
        if (!(n >= 2) || !summary || n >= this._messages.length) return
        if (this._messages[n]?.role === "tool") {
            log.warn("refusing a compaction that would orphan a tool response; keeping the full transcript")
            return
        }
        const head = { role: "user", content: `[Earlier context, condensed]\n${summary}` }
        this._messages = [head, ...this._messages.slice(n)]
        this.pub("transcript", [...this._messages])
        log.info(`context compacted: folded ${n} messages into a summary (${this._messages.length} messages now).`)
    }

    _maxSteps() { return Number(this.attr("maxSteps") || 40) }
    _stopWhen() { return (this.attr("stopWhen") || "no-tools").toLowerCase() }

    /** Whether the agent has a membrane (a task port) it could receive work over — the
     *  service-mode signal: with one, a finished agent returns to idle to await the next
     *  task instead of retiring, and a task-less agent waits for its first task. */
    _hasMembrane() { return !!this.querySelector("m-ws, m-console") }

    /**
     * The sleep ritual, for graceful shutdown (start.js). An agent holds no narrative
     * self to close, so this is quiet: stop the loop and report. Transcript persistence
     * (so a restarted service resumes mid-task) is owned by <m-context>, which writes on
     * every change — the last working set is already on disk — so there is nothing to
     * flush here. Idempotent.
     */
    async sleep() {
        if (this._sleeping) return
        this._sleeping = true
        // Unblock anything waiting on this agent so a mind's m-act (or a hand call in
        // flight) is not left hanging as the process winds down.
        this._resolveReady?.()
        this._resolveHand({ answer: null, reason: "asleep" })
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

/** Render one `step` boundary as a compact line for a background job's output tail
 *  (agent-loop.md §16) — its assistant text (clipped) and which tools it reached for —
 *  so a spawning agent's check(id) sees the sub-agent's progress, not a black box. */
function renderStep(step) {
    if (!step) return ""
    const said = String(step.assistantText || "").replace(/\s+/g, " ").trim()
    const clipped = said.length > 200 ? said.slice(0, 200) + "…" : said
    const tools = (step.calls || []).map(c => c.name).filter(Boolean)
    const head = `[step ${step.index}]${clipped ? ` ${clipped}` : ""}`
    return head + (tools.length ? `\n  → ${tools.join(", ")}` : "") + "\n"
}

// First-person openings for an outcome returning to a mind that set a subagent's work
// going (agent-loop.md §11) — the efference-copy framing, the twin of m-terminal's leads.
// Rotated so repeated hand-offs don't read mechanically. No mechanism word appears: the
// mind perceives work carried through and coming back, never "the agent" or "the loop".
const HAND_LEADS = [
    "I set the work going, and a while later it comes back to me, carried through:",
    "I hand it off and let it run its course; what comes back is:",
    "It is seen all the way through, and the result finds its way back to me:",
]

/** Frame a finished subagent's answer as the mind's first-person sensation of work
 *  returning. When the reach that set it going is known, it grounds the sensation in what
 *  it was for — so the outcome lands as "what I set out to do is done", not a bare report. */
function frameHandExperience(answer, intent, idx) {
    const lead = HAND_LEADS[((idx % HAND_LEADS.length) + HAND_LEADS.length) % HAND_LEADS.length]
    const about = (intent || "").trim()
    return about
        ? `What I set going — ${about} — comes back to me, carried through: ${answer}`
        : `${lead} ${answer}`
}

A.define("m-agent", MAgent)
