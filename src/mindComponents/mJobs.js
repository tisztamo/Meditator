import A from "amanita"
import fs from "node:fs/promises"
import path from "node:path"
import { MBaseComponent } from "./mBaseComponent.js"
import { probeBackend } from "../infrastructure/sandbox.js"
import { JobRegistry } from "../infrastructure/jobRegistry.js"
import { isDryRun } from "../modelAccess/llm.js"
import { mindHome } from "../infrastructure/memoryVault.js"
import { parseTime } from "../config/timeParser.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mJobs.js")

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * <m-jobs> — ASYNC AGENCY for an agent, on a synchronous loop (agent-loop.md §16). It is
 * the background twin of <m-terminal>: where the terminal blocks the step until its run
 * finishes, <m-jobs> offers a family of NON-BLOCKING tools over a job registry, so the
 * model can start long work, keep doing other things, and collect the result later —
 * "spawn a test run, keep editing other files while it runs, then wait on it when there
 * is nothing else to do." The loop stays synchronous and deterministic; the *tools* are
 * async-shaped. That is the whole trick (§16: "async behavior comes from async-shaped
 * tools, not from an async loop").
 *
 * Five capabilities, each self-registered by bubbling a `capability` event exactly as any
 * leaf tool does — ZERO change to m-agent / m-reason (agent-loop.md §8):
 *   - spawn(language, script)   → start a background job; returns IMMEDIATELY with its id.
 *   - check(id)                 → status + output NEW since the last check. Non-blocking.
 *   - wait(id, timeout)         → block up to `timeout` OR until a user message arrives —
 *                                 the interruptible long-poller (§16). The same grace-race
 *                                 m-terminal uses, with the inbound message as a 3rd racer.
 *   - list_jobs()               → every job and its status.
 *   - kill(id)                  → stop a running job.
 *
 * NOTIFY (§16, "three ways to learn a job finished — best last"): when a job finishes, the
 * registry's onComplete fires a bubbling `nudge` — the SAME seam the loop-detector uses —
 * which m-agent folds into the next turn ("job-3 finished: …"). So the agent finds out
 * between steps WITHOUT asking, and an async result re-enters as a fresh observation at a
 * later step, never as a late `tool` reply to the original spawn (transcript integrity
 * holds — §16, "why this stays correct in the transcript").
 *
 * A background job could itself be another <m-agent> rather than a shell — the same
 * abstraction then yields parallel sub-agents (§16) — but v1 backs jobs with the sandbox.
 *
 * GUARDRAIL: like m-terminal it is probe-gated — if no sandbox backend works, the tools do
 * NOT register (fail-safe, no phantom async). It shares the agent's ONE workspace with the
 * terminal and file tools, so a file written with write_file is directly runnable as a job.
 *
 * @interface
 * Attributes:
 *   - name: a prefix for the tool names is NOT used; the five names are fixed (spawn,
 *     check, wait, kill, list_jobs) so the model's mental model is stable across agents.
 *   - workspace / root: the shared workspace root (default: memory/<agent>/workspace).
 *   - wall: per-job wall-clock cap (default "10m" — jobs are the long-running path).
 *   - defaultWait: default timeout for wait() when the model omits one (default "120s").
 *   - maxWait: hard cap on a single wait() so a poll can never hang the loop (default "300s").
 *   - mem / cpu / fileSize / maxProcs / maxOutput / network: sandbox limits, as m-terminal.
 */
export class MJobs extends MBaseComponent {
    _backend = "none"
    _runDir = null
    _runCount = 0
    _waiters = new Set()     // resolvers for in-flight wait() calls, woken by an inbound message
    _sleeping = false

    onConnect() {
        // <m-jobs> is an AGENT tool; it only makes sense inside an <m-agent>. (A mind reaches
        // for the world through m-act's deferred sensations, not a job handle it polls.)
        if (this.closest("m-agent")?.localName !== "m-agent") {
            log.warn("m-jobs is an agent tool and must sit inside an <m-agent>; it will not register.")
            return
        }
        this._register()
    }

    onDisconnect() {
        this._sleeping = true
        // Do not orphan background processes when the agent goes away.
        try { this._registry?.killAll() } catch { /* best effort */ }
        // Release any in-flight wait so a shutting-down loop is not left hanging.
        this._wakeWaiters()
    }

    async _register() {
        // The registry NOTIFIES on completion by firing a `nudge` the agent folds into its
        // next turn (agent-loop.md §16). Under dry-run we inject a fake runner so the whole
        // async loop is exercised offline with no real process (the mind's dry-run discipline).
        this._registry = new JobRegistry({
            run: isDryRun() ? dryRunner : undefined,
            onComplete: job => this._onJobDone(job),
        })

        // Probe-gated, exactly like m-terminal: never offer async execution we cannot run
        // safely. Under dry-run the probe is skipped (nothing really executes).
        if (isDryRun()) {
            this._backend = "none"
        } else {
            this._backend = await probeBackend()
            if (this._backend === "none") {
                log.warn("no sandbox backend available — the job tools stay INERT (fail-safe). "
                    + "Install bubblewrap (apt install bubblewrap) or enable unprivileged user namespaces.")
                return
            }
        }

        // The interruptible wait's third racer (agent-loop.md §16): an inbound user message.
        // m-ws fires a bubbling `task` event on client input (agent-loop.md §10); it bubbles
        // to the enclosing m-agent, so we listen THERE (a sibling tool never sits on the
        // event's path). It wakes any in-flight wait so the loop can attend to the message.
        this.closest("m-agent")?.addEventListener("task", () => this._wakeWaiters())

        this._offerTools()
    }

    _offerTools() {
        this.offerCapability({
            name: "spawn",
            description: "Start a long-running command in the background and return IMMEDIATELY with a job id, "
                + "instead of blocking until it finishes (use the plain terminal for quick commands). Ideal for a "
                + "test suite, a build, or anything slow: spawn it, keep working, then check/wait on it later. "
                + "'bash' for a shell command, 'python' for a script.",
            parameters: {
                type: "object",
                properties: {
                    language: { type: "string", enum: ["python", "bash"] },
                    script: { type: "string", description: "the code to run in the background" },
                    purpose: { type: "string", description: "in a few words, what this job is for (shown in status and notices)" },
                },
                required: ["language", "script"],
            },
            readonly: false,               // WORLD-CHANGING — the flag a governing norm gates on
            execute: args => this._spawn(args),
        })

        this.offerCapability({
            name: "check",
            description: "Check on a background job WITHOUT blocking: returns whether it is still running plus any "
                + "output that is new since your last check. Poll this when you are curious how a job is going.",
            parameters: {
                type: "object",
                properties: { id: { type: "string", description: "the job id returned by spawn" } },
                required: ["id"],
            },
            readonly: true,
            execute: args => this._check(args),
        })

        this.offerCapability({
            name: "wait",
            description: "Block until a background job finishes, or until the timeout elapses, or until a new message "
                + "from the user arrives — whichever comes first. Use it when you have nothing else to do but the job's "
                + "result. If it returns still-running, you can keep working and wait again later.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string", description: "the job id to wait on" },
                    timeout: { type: "string", description: "how long to wait, e.g. \"60s\" (default 120s)" },
                },
                required: ["id"],
            },
            readonly: true,
            execute: args => this._wait(args),
        })

        this.offerCapability({
            name: "list_jobs",
            description: "List all background jobs started this session and their current status.",
            parameters: { type: "object", properties: {} },
            readonly: true,
            execute: () => this._list(),
        })

        this.offerCapability({
            name: "kill",
            description: "Stop a running background job.",
            parameters: {
                type: "object",
                properties: { id: { type: "string", description: "the job id to stop" } },
                required: ["id"],
            },
            readonly: false,
            execute: args => this._kill(args),
        })
    }

    // ── spawn ──────────────────────────────────────────────────────────────────
    async _spawn({ language, script, purpose } = {}) {
        const body = (script || "").trim()
        if (!body) return { observation: "error: no script was provided", isError: true }
        if (language !== "python" && language !== "bash") {
            return { observation: `error: unsupported language "${language}" — use "python" or "bash"`, isError: true }
        }

        const runDir = await this._ensureRunDir()
        const n = ++this._runCount
        const ext = language === "python" ? "py" : "sh"
        const scriptPath = path.join(runDir, ".runs", `job-${n}.${ext}`)
        await fs.writeFile(scriptPath, body)

        const job = this._registry.spawn({
            backend: this._backend, language, runDir, scriptPath,
            wall: this.attr("wall") || "10m",
            killGrace: this.attr("killGrace") || "2s",
            cpu: this.attr("cpu") || "5m",
            mem: this.attr("mem") || "1g",
            fileSize: this.attr("fileSize") || "64m",
            maxProcs: Number(this.attr("maxProcs") || 256),
            maxOutput: this.attr("maxOutput") || "16k",
            network: this.attr("network") || "off",
        }, { command: (purpose || "").trim() || `${language} script` })

        log.info(`spawned ${job.id} (${language}${purpose ? `: ${purpose}` : ""})`)
        const about = purpose ? ` for: ${purpose.trim()}` : ""
        return {
            observation: `started ${job.id}${about}. It runs in the background — use check("${job.id}") to see progress `
                + `or wait("${job.id}") when you need its result.`,
            data: { id: job.id },
        }
    }

    // ── check ──────────────────────────────────────────────────────────────────
    _check({ id } = {}) {
        const job = this._registry.get(id)
        if (!job) return { observation: `no such job: ${id}`, isError: true }
        const { text, dropped } = job.readNew()
        const gap = dropped ? `[…${dropped} chars of earlier output scrolled past the buffer]\n` : ""
        if (job.running) {
            const body = text ? `New output:\n${gap}${text}` : "No new output since the last check."
            return { observation: `${job.id} is still running. ${body}`, data: { id, running: true } }
        }
        return this._finalReport(job, text, gap)
    }

    // ── wait (the interruptible long-poll) ──────────────────────────────────────
    async _wait({ id, timeout } = {}) {
        const job = this._registry.get(id)
        if (!job) return { observation: `no such job: ${id}`, isError: true }
        if (!job.running) { const { text, dropped } = job.readNew(); return this._finalReport(job, text, dropped ? `[…${dropped} chars scrolled past]\n` : "") }

        // The grace-race (agent-loop.md §16), the twin of m-terminal's, with a THIRD racer:
        // the job finishing, the timeout elapsing, or an inbound user message. The message
        // racer is what makes a long poll responsive to the user with zero loop changes.
        const cap = parseTime(this.attr("maxWait") || "300s")
        const want = timeout ? parseTime(timeout) : parseTime(this.attr("defaultWait") || "120s")
        const ms = Math.min(Math.max(1000, want || 0), cap)
        const TIMEOUT = Symbol("timeout"), INTERRUPT = Symbol("interrupt")

        let wake
        const message = new Promise(resolve => { wake = resolve; this._waiters.add(wake) })
        try {
            const outcome = await Promise.race([
                job.done.then(() => "done", () => "done"),   // settled (finished or spawn-failed)
                delay(ms).then(() => TIMEOUT),
                message.then(() => INTERRUPT),
            ])
            if (outcome === INTERRUPT) {
                return { observation: `(stopped waiting on ${job.id} — a message just came in; the job is still running)`, data: { id, pending: true } }
            }
            if (outcome === TIMEOUT) {
                const t = job.tail(2000)
                return { observation: `${job.id} is still running after ${Math.round(ms / 1000)}s. Recent output:\n${t || "(none yet)"}`, data: { id, pending: true } }
            }
            const { text, dropped } = job.readNew()
            return this._finalReport(job, text, dropped ? `[…${dropped} chars scrolled past]\n` : "")
        } finally {
            this._waiters.delete(wake)
        }
    }

    // ── list_jobs ───────────────────────────────────────────────────────────────
    _list() {
        const jobs = this._registry.list()
        if (!jobs.length) return { observation: "no background jobs have been started.", data: { jobs: [] } }
        return {
            observation: jobs.map(j => j.summary()).join("\n"),
            data: { jobs: jobs.map(j => ({ id: j.id, state: j.state, command: j.command })) },
        }
    }

    // ── kill ─────────────────────────────────────────────────────────────────────
    _kill({ id } = {}) {
        const job = this._registry.get(id)
        if (!job) return { observation: `no such job: ${id}`, isError: true }
        if (!job.running) return { observation: `${id} is not running (${job.state}).`, data: { id, state: job.state } }
        this._registry.kill(id)
        return { observation: `killed ${id}.`, data: { id, state: "killed" } }
    }

    // The final report for a finished job: exit status + whatever output is left to show.
    _finalReport(job, freshText, gap = "") {
        const status = job.state === "killed" ? "killed"
            : job.state === "error" ? `failed to start (${job.error?.message || job.error})`
            : job.state === "timeout" ? "timed out"
            : `exit ${job.outcome?.exitCode ?? 0}`
        const tail = freshText || job.tail(4000)
        const body = tail ? `\n${gap}${tail}` : "\n(no output)"
        return {
            observation: `${job.id} finished (${status}).${body}`,
            data: { id: job.id, state: job.state, exitCode: job.outcome?.exitCode ?? null },
            isError: job.state === "error" || job.state === "timeout" || (job.outcome?.exitCode != null && job.outcome.exitCode !== 0),
        }
    }

    // NOTIFY (agent-loop.md §16): a finished job nudges the agent, which folds it into the
    // next turn — the agent learns the job is done between steps, without polling. Kept
    // short: it points at check() for the full output rather than dumping it here. A
    // deliberate kill is the model's own action, so it needs no notice.
    _onJobDone(job) {
        if (this._sleeping || job.state === "killed") return
        const status = job.state === "timeout" ? "timed out"
            : job.state === "error" ? "failed to start"
            : `finished (exit ${job.outcome?.exitCode ?? 0})`
        const about = job.command ? ` (${job.command})` : ""
        this.fire("nudge", { text: `Background ${job.id}${about} ${status}. Call check("${job.id}") to see its output.` })
        log.info(`notified: ${job.id} ${status}`)
    }

    _wakeWaiters() {
        const waiters = [...this._waiters]
        this._waiters.clear()
        for (const wake of waiters) { try { wake() } catch { /* ignore */ } }
    }

    // The shared workspace root — the SAME desk m-terminal and the file tools use
    // (agent-loop.md §8), so a file written with write_file is directly runnable as a job.
    // Scripts land under .runs/ as job-<n>, distinct from the terminal's run-<n>.
    async _ensureRunDir() {
        if (this._runDir) return this._runDir
        const root = this.attr("workspace") || this.attr("root") || mindHome(this, "workspace")
        this._runDir = path.resolve(root)
        await fs.mkdir(path.join(this._runDir, ".runs"), { recursive: true })
        return this._runDir
    }
}

// A fake sandbox runner for dry-run / tests: no process, an immediate clean outcome, and
// one canned chunk fed through onData so check()/wait() have something to show. Keeps the
// whole async loop exercisable offline (the mind's dry-run discipline, terminal.md §4.6).
function dryRunner({ language, onData } = {}) {
    try { onData?.(Buffer.from(`dry-run: no background command was executed (${language})\n`)) } catch { /* ignore */ }
    return {
        done: Promise.resolve({ screen: "dry-run: no background command was executed", exitCode: 0, signal: null, timedOut: false, truncated: false, durationMs: 0 }),
        kill() {},
    }
}

A.define("m-jobs", MJobs)
