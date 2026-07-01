import A from "amanita"
import fs from "node:fs/promises"
import path from "node:path"
import { MBaseComponent } from "./mBaseComponent.js"
import { compressToFit } from "./mMemory.js"
import { complete } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { mindHome } from "../infrastructure/memoryVault.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mContext.js")

/**
 * <m-context> — an agent's working memory, the twin of a mind's <m-memory>
 * (agent-loop.md §3, §10). The transcript grows one step at a time; left unbounded it
 * eventually overruns the model's context window. m-context keeps it bounded and
 * durable, as a PURE OBSERVER with no change to m-agent or m-reason:
 *
 *   - COMPACTION: it mirrors the agent's `transcript`, and on each `step` boundary, when
 *     the transcript exceeds `budget`, it condenses the OLDEST messages (everything but
 *     the last `keepRecent`) into a single summary — one compaction call reusing the very
 *     length-loop m-memory uses (compressToFit: dedupe → rewrite → re-drive → nearest
 *     fallback), only with an agent-transcript voice — and asks m-agent to splice that
 *     summary in via a `compacted` intent. The recent turns stay verbatim.
 *   - PERSISTENCE: it writes the transcript to a home on every change, and on wake reads
 *     it back and publishes `restore`, so a restarted service agent resumes mid-task.
 *
 * THE WIRING CONTRACT (state down as retained topics, intent up — here, a compaction is
 * an intent m-agent applies to the array IT owns, so it flows as a retained topic m-agent
 * subscribes to, exactly as m-agent subscribes reason/reply):
 *   - subscribes  ..m-agent/transcript  (mirror the working set) and ..m-agent/@step
 *     (the compaction trigger; carries the step index for persistence).
 *   - publishes    restore   {messages, step}  — once, after load (empty if none/off).
 *   - publishes    compacted {summarizeCount, summary} — asks m-agent to replace the
 *     first `summarizeCount` messages with one summary message. m-agent owns the array
 *     and applies the splice; m-context never mutates it (decoupling.md).
 *
 * The split point NEVER orphans a `tool` message from its `assistant` (planCompaction),
 * so the spliced transcript stays provider-valid (agent-loop.md §12).
 *
 * @interface
 * Attributes:
 *   - budget: char budget for the whole transcript before compaction (default 24000).
 *   - keepRecent: how many trailing messages to keep verbatim (default 8).
 *   - summaryChars: target size of the condensed summary (default budget/3, capped 2000).
 *   - persist: directory for transcript.json (default the agent's home; "off" disables).
 *   - model: compaction model (defaults to the ancestor utilityModel, then the default).
 *
 * Topics published:
 *   - "restore":   {messages, step} — the loaded transcript (published once, after load).
 *   - "compacted": {summarizeCount, summary} — a compaction for m-agent to apply.
 */
export class MContext extends MBaseComponent {
    _messages = []          // mirror of the agent's transcript (the working set)
    _step = 0               // last seen step index, persisted for resume
    _compacting = false
    _persistQueue = Promise.resolve()
    _loaded = false

    onConnect() {
        this._budget = Number(this.attr("budget") || 24000)
        this._keepRecent = Number(this.attr("keepRecent") || 8)
        this._summaryChars = Number(this.attr("summaryChars") || Math.min(2000, Math.round(this._budget / 3)))

        // Mirror the working set and watch the step boundary. Subscribed explicitly with a
        // .catch() (never auto-sub fields) so an <m-context> placed outside an <m-agent>
        // fails quietly instead of leaking an unhandled ref-resolution rejection.
        this.sub("..m-agent/transcript", messages => this._onTranscript(messages)).catch(() => {
            log.warn("m-context found no ..m-agent/transcript — it must sit inside an <m-agent>")
        })
        this.sub("..m-agent/@step", e => this._onStep(e?.detail)).catch(() => {})

        // Load the persisted transcript and publish `restore` so the agent wakes resuming
        // (or, if nothing persisted / persist off, a clean empty restore so it seeds fresh).
        this._load().finally(() => {
            this._loaded = true
            this.pub("restore", { messages: this._messages, step: this._step })
        })
    }

    _onTranscript(messages) {
        if (!Array.isArray(messages)) return
        this._messages = messages
        // Persist the freshest working set on every change (seed, step, and the splice
        // m-agent applies after a compaction all republish `transcript`). Best-effort.
        if (this._loaded) this._schedulePersist()
    }

    _onStep(step) {
        if (step && Number.isFinite(step.index)) this._step = step.index
        this._schedulePersist()
        this._maybeCompact()
    }

    // ------------------------------------------------------------- compaction

    _maybeCompact() {
        if (this._compacting) return
        if (!(this._budget > 0)) return
        if (transcriptSize(this._messages) <= this._budget) return
        const plan = planCompaction(this._messages, this._keepRecent)
        if (!plan) return
        this._compact(plan.summarizeCount)   // not awaited — never blocks the loop
    }

    async _compact(summarizeCount) {
        this._compacting = true
        // Snapshot the prefix NOW; m-agent may append while we summarize, but those land
        // AFTER summarizeCount, so the count still names the same prefix when it splices.
        const prefix = this._messages.slice(0, summarizeCount)
        const rendered = renderForSummary(prefix)
        try {
            const summary = await compressToFit({
                established: "",
                fresh: rendered,
                targetChars: this._summaryChars,
                tier: "brief",
                buildPrompt: buildBriefPrompt,
                generate: async (prompt, maxTokens) => {
                    const result = await complete({
                        model: resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility"),
                        maxTokens,
                        temperature: 0.3,
                        debugTag: "context",
                        debugEl: this,
                        prompt,
                    })
                    return result.text
                },
            })
            if (summary && summary.trim()) {
                this.pub("compacted", { summarizeCount, summary: summary.trim() })
                log.info(`condensed ${summarizeCount} messages into a ${summary.length}-char summary`)
            }
        } catch (error) {
            log.warn("context compaction failed, keeping the full transcript:", error?.message || error)
        } finally {
            this._compacting = false
        }
    }

    // ------------------------------------------------------------ persistence

    _persistDir() {
        const dir = this.attr("persist") || mindHome(this, "transcript")
        return dir === "off" ? null : dir
    }

    _schedulePersist() {
        const dir = this._persistDir()
        if (!dir) return
        // Chain writes so a burst of changes coalesces into ordered atomic writes and a
        // sleep ritual can await everything in flight, exactly as m-memory journals.
        this._persistQueue = this._persistQueue.then(() => this._write(dir)).catch(error =>
            log.warn("Could not persist transcript:", error?.message || error))
    }

    async _write(dir) {
        await fs.mkdir(dir, { recursive: true })
        const content = JSON.stringify({ savedAt: new Date().toISOString(), step: this._step, messages: this._messages }, null, 2)
        const file = path.join(dir, "transcript.json")
        const tmp = `${file}.${process.pid}.tmp`
        await fs.writeFile(tmp, content)
        await fs.rename(tmp, file)
    }

    async _load() {
        const dir = this._persistDir()
        if (!dir) return
        try {
            const raw = await fs.readFile(path.join(dir, "transcript.json"), "utf8")
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed?.messages)) this._messages = parsed.messages
            this._step = Number(parsed?.step) || 0
            if (this._messages.length) log.info(`Transcript loaded (${this._messages.length} messages, step ${this._step}).`)
        } catch (error) {
            if (error.code !== "ENOENT") log.warn("Could not load transcript:", error.message)
        }
    }
}

// ---------------------------------------------------------------------------
// Compaction internals — pure of the component and of model wiring, so the
// split-point safety and the rendering are unit-testable on their own.
// ---------------------------------------------------------------------------

/** The whole transcript's rough size in characters — message content plus the
 *  arguments carried on any tool calls (which count against the context window too). */
export function transcriptSize(messages) {
    let n = 0
    for (const m of messages || []) {
        n += (m?.content || "").length
        for (const c of m?.tool_calls || []) n += (c?.function?.arguments || "").length + (c?.function?.name || "").length
    }
    return n
}

/**
 * Choose how many leading messages to fold into a summary, keeping the last `keepRecent`
 * verbatim — but NEVER cutting between an `assistant` that made tool calls and the `tool`
 * messages that answer them: the kept suffix must start on a non-`tool` message, or the
 * provider rejects the next request (agent-loop.md §12). We advance the cut FORWARD past
 * any leading `tool` messages of the kept side so their `assistant` parent stays with them
 * in the summarized prefix. Returns {summarizeCount} or null when there is nothing worth
 * folding (too few messages, or the whole thing is one open tool group).
 */
export function planCompaction(messages, keepRecent) {
    const n = (messages || []).length
    if (n <= keepRecent + 1) return null
    let cut = n - keepRecent
    while (cut < n && messages[cut]?.role === "tool") cut++
    if (cut < 2 || cut >= n) return null   // nothing meaningful to fold / nothing left to keep
    return { summarizeCount: cut }
}

/** Render a slice of transcript messages into readable text for the summarizer. Long
 *  observations are capped — the compaction is lossy by design, and an uncapped dump of
 *  raw tool output would bloat the prompt past the context window. */
export function renderForSummary(messages, maxPerMessage = 4000) {
    const cap = (s) => {
        s = String(s || "")
        return s.length > maxPerMessage ? s.slice(0, maxPerMessage) + `\n… (${s.length - maxPerMessage} more chars)` : s
    }
    const lines = []
    for (const m of messages || []) {
        if (m.role === "user") lines.push(`USER: ${cap(m.content)}`)
        else if (m.role === "assistant") {
            if (m.content) lines.push(`ASSISTANT: ${cap(m.content)}`)
            for (const c of m.tool_calls || []) lines.push(`ASSISTANT called ${c.function?.name}(${cap(c.function?.arguments)})`)
        } else if (m.role === "tool") lines.push(`OBSERVATION: ${cap(m.content)}`)
        else lines.push(`${(m.role || "?").toUpperCase()}: ${cap(m.content)}`)
    }
    return lines.join("\n\n")
}

/**
 * The agent-transcript compaction prompt — the third-person, operational twin of
 * m-memory's first-person buildCompressionPrompt, injected into compressToFit so the
 * shared length-loop keeps the right voice (agent-loop.md §10). Keeps the SPINE of the
 * work (the task, what was tried, key results/errors, decisions, what remains) and cuts
 * the CHAFF (raw output already acted on, dead ends). Two shapes — initial and a re-drive
 * that tightens an over-long draft — matching compressToFit's contract. Contains the words
 * "condense"/"summary" so the offline dry-run stub (llm.js dryComplete) recognizes it.
 */
export function buildBriefPrompt({ text = "", targetChars, draft = "" }) {
    if (draft) {
        const over = Math.max(1, Math.round((draft.length / targetChars - 1) * 100))
        return `You are keeping a running summary of an AI agent's work on a task.

Your previous summary is below. It is ${draft.length} characters — about ${over}% over the limit of ${targetChars}. Condense it to AT MOST ${targetChars} characters. Keep the task, what has been tried, the key results and errors observed, decisions made, and what remains to do. Cut raw command/file output that has already been acted on, and abandoned dead ends. Do not add anything not already present. Output only the shortened summary.

<summary>
${draft}
</summary>`
    }
    return `You are keeping a running summary of an AI agent's work on a task, so the earliest steps can be dropped from its context without losing the thread.

Condense the agent transcript inside <transcript> into a single, compact status brief of AT MOST ${targetChars} characters. Keep: the task or objective, what has already been tried, the key observations, results, and errors, the decisions made, and what still remains to do. Remove: verbatim command output or file contents that have already been acted on, and exploratory dead ends. Write it as a terse third-person brief, not first person. Never invent anything not in the transcript. Output only the summary.

<transcript>
${text}
</transcript>`
}

A.define("m-context", MContext)
