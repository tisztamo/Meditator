import { runScript } from './sandbox.js';
import { logger } from './logger.js';

const log = logger('jobRegistry.js');

/**
 * The JOB REGISTRY — the small piece of infrastructure behind an agent's async agency
 * (agent-loop.md §16). The load-bearing insight there: async behavior comes from
 * async-shaped *tools*, not from an async loop. A tool-calling step already blocks on
 * each tool's return; to get concurrency you make the tool SEMANTICS non-blocking, and
 * back them with this registry. <m-jobs> is the component that offers those tools
 * (spawn / check / wait / kill / list_jobs); this module is the bookkeeping underneath.
 *
 * Each job is one background sandboxed run (the same sandbox m-terminal uses), started
 * with a handle that returns IMMEDIATELY. The registry keeps a live tail of its output
 * (via the sandbox's optional onData hook) so `check` can show progress before the run
 * ends, tracks a per-job read cursor so `check` returns only what is NEW since last time,
 * and fires an `onComplete` callback when a job finishes — the seam <m-jobs> uses to
 * NOTIFY the agent (a nudge folded into the next turn: "job-3 finished", agent-loop.md
 * §16, "three ways to learn a job finished").
 *
 * The sandbox runner is injected (`run`, default the real runScript) so the whole thing
 * is testable — and dry-runnable — without spawning a process.
 */

const DEFAULT_MAX_BUFFER = 65536;   // live-tail cap per job (chars); the tail, not the whole log

/** One background job: its handle, its live-tail buffer, its lifecycle state. */
export class Job {
    constructor(id, meta = {}, maxBuffer = DEFAULT_MAX_BUFFER) {
        this.id = id;
        this.command = meta.command || '';   // a short human label of what is running
        this.state = 'running';              // running | done | timeout | error | killed
        this.outcome = null;                 // the sandbox outcome once it settles
        this.error = null;                   // a spawn failure (a hand-slip), if any
        this.startedAt = Date.now();
        this.finishedAt = null;
        this._handle = null;
        this._maxBuffer = maxBuffer;
        this._buf = '';        // the tail of the output seen so far (capped to _maxBuffer)
        this._seen = 0;        // total chars ever appended (may exceed _buf.length)
        this._cursor = 0;      // total chars already returned by check() — the read watermark
    }

    _attach(handle) { this._handle = handle; }

    // A live stdout chunk from the sandbox (onData). Append to the tail buffer, keeping
    // only the last _maxBuffer chars — enough to show recent progress without unbounded
    // growth. Never throws (it runs inside the sandbox's stdout listener).
    _ingest(chunk) {
        const s = typeof chunk === 'string' ? chunk : chunk?.toString('utf8') || '';
        if (!s) return;
        this._buf += s;
        this._seen += s.length;
        if (this._buf.length > this._maxBuffer) this._buf = this._buf.slice(-this._maxBuffer);
    }

    _settle(outcome) {
        this.outcome = outcome;
        this.finishedAt = Date.now();
        // A deliberate kill wins over whatever exit the sandbox reports for it.
        if (this.state !== 'killed') this.state = outcome?.timedOut ? 'timeout' : 'done';
    }

    _fail(error) {
        this.error = error;
        this.finishedAt = Date.now();
        if (this.state !== 'killed') this.state = 'error';
    }

    get running() { return this.state === 'running'; }
    get done() { return this._handle?.done; }

    /** The output that is NEW since the last read, advancing the cursor. Returns
     *  { text, dropped } — `dropped` is how many chars scrolled past the tail cap
     *  before we could return them (so the model is told its view has a gap, never
     *  silently misled — the project's confabulation guard applies to tools too). */
    readNew() {
        const bufStart = this._seen - this._buf.length;   // absolute offset of _buf[0]
        const from = Math.max(this._cursor, bufStart);
        const dropped = Math.max(0, from - this._cursor);
        const text = this._buf.slice(from - bufStart);
        this._cursor = this._seen;
        return { text, dropped };
    }

    /** The last `n` chars of output seen so far (for a status snapshot; no cursor move). */
    tail(n = 2000) {
        return this._buf.length <= n ? this._buf : this._buf.slice(-n);
    }

    /** A one-line status summary for list_jobs / a completion notice. */
    summary() {
        const ms = (this.finishedAt || Date.now()) - this.startedAt;
        const label = this.command ? ` — ${this.command}` : '';
        if (this.running) return `${this.id}: running (${Math.round(ms / 1000)}s)${label}`;
        if (this.state === 'error') return `${this.id}: failed to start (${this.error?.message || this.error})${label}`;
        if (this.state === 'killed') return `${this.id}: killed${label}`;
        if (this.state === 'timeout') return `${this.id}: timed out after ${Math.round(ms / 1000)}s${label}`;
        return `${this.id}: finished (exit ${this.outcome?.exitCode ?? 0}, ${Math.round(ms / 1000)}s)${label}`;
    }
}

export class JobRegistry {
    constructor({ run = runScript, maxBuffer = DEFAULT_MAX_BUFFER, onComplete } = {}) {
        this._run = run;
        this._maxBuffer = maxBuffer;
        this._onComplete = onComplete;   // (job) => void — fired once when a job settles
        this._jobs = new Map();
        this._seq = 0;
    }

    /**
     * Start a background job. `opts` is passed straight to the sandbox runner (backend,
     * language, runDir, scriptPath, wall, …); `meta.command` is a short label. Returns
     * the Job immediately — the whole point (agent-loop.md §16: spawn is non-blocking).
     */
    spawn(opts, meta = {}) {
        const id = `job-${++this._seq}`;
        const job = new Job(id, meta, this._maxBuffer);
        this._jobs.set(id, job);
        let handle;
        try {
            handle = this._run({ ...opts, onData: chunk => job._ingest(chunk) });
        } catch (error) {
            job._fail(error);
            this._notify(job);
            return job;
        }
        job._attach(handle);
        // Settle the job when the run ends — success or spawn failure — then notify once.
        handle.done.then(
            outcome => { job._settle(outcome); this._notify(job); },
            error => { job._fail(error); this._notify(job); },
        );
        return job;
    }

    get(id) { return this._jobs.get(id); }
    list() { return [...this._jobs.values()]; }

    /** Kill one job's process group. Idempotent; marks it killed so its eventual
     *  outcome does not overwrite the deliberate stop. */
    kill(id) {
        const job = this._jobs.get(id);
        if (!job || !job.running) return false;
        job.state = 'killed';
        try { job._handle?.kill(); } catch { /* already gone */ }
        return true;
    }

    /** Kill every running job — called when the agent sleeps so no background process
     *  is orphaned across shutdown. */
    killAll() {
        for (const job of this._jobs.values()) {
            if (job.running) { job.state = 'killed'; try { job._handle?.kill(); } catch { /* gone */ } }
        }
    }

    _notify(job) {
        try { this._onComplete?.(job); }
        catch (error) { log.debug(`job onComplete threw: ${error?.message || error}`); }
    }
}
