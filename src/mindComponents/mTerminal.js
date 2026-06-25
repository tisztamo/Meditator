import A from "amanita"
import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { probeBackend, runScript, parseSizeBytes } from '../infrastructure/sandbox.js';
import { isDryRun } from "../modelAccess/llm.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mTerminal.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * m-terminal — the third WORLD-CHANGING hand (terminal.md), and the most powerful:
 * the mind can write a small Python or shell script and ACTUALLY RUN it, sandboxed,
 * then read what came up on the screen. It makes lemma's confabulated cursor real
 * and points it at the mathematics — the difference between *almost*-reaching a proof
 * by hand forever and being able to settle it.
 *
 * THE ONE RULE still holds (efference.md): the conscious stream is never given a tool.
 * Only the realizer fills this hand's closed two-field verb (language + script). The
 * stream never sees a shell, an exit code, or "the subprocess returned" — it wonders;
 * the realizer runs; the world answers as a plain self-caused sensation, "the screen".
 *
 * THE LATENCY PROBLEM (terminal.md §2). Every other hand returns one consequence
 * synchronously. A script may take 50ms or 50s, so this hand RACES the run against a
 * short grace:
 *   - FAST (finished ≤ grace): return the full result now — one consequence, instant.
 *   - SLOW (still running): return an ambient "I set it going" sensation now (so the
 *     hands free up and the mind keeps thinking), and DISPATCH the result itself, some
 *     bursts later, as its own urgent interrupt-request through the afferent bus — the
 *     same deferred path m-recall/m-sense ride.
 *
 * THE GUARDRAIL (terminal.md §4). It runs arbitrary code, so it carries the strongest
 * guardrail, probe-gated at startup: if no sandbox backend works, the hand does NOT
 * register at all (fail safe — no phantom hand). Network off, env scrubbed (no secret
 * can ride back as a "sensation"), rlimits, one writable per-run workspace, GNU timeout.
 * See infrastructure/sandbox.js.
 *
 * Registers with its parent <m-act> on connect. Wire it as:
 *   <m-act ...><m-terminal name="terminal" wall="20s" grace="2s" .../></m-act>
 *
 * @interface
 * Attributes (terminal.md §5):
 *   - name: the tool-call function name (default "terminal")
 *   - workspace: the desk root (default: the mind's vault home `workspace/`); a per-run
 *     subdir run-<stamp>/ is created under it (gitignored — scratch, not versioned)
 *   - wall: wall-clock timeout (default "20s")
 *   - grace: finish within this → fast path; else started-now + deferred result (default "2s")
 *   - cpu: CPU-seconds cap, ulimit -t (default "10s")
 *   - mem: address-space cap, ulimit -v (default "1g")
 *   - fileSize: file-size cap, ulimit -f (default "64m")
 *   - maxProcs: process-count cap, ulimit -u (default "256")
 *   - maxOutput: output captured/shown before truncation (default "16k")
 *   - network: "on" opts the run into having a network route (default "off")
 *   - salience: result consequence salience (default 0.7); startedSalience (default 0.45)
 *   - urgent: re-enter the RESULT urgent (default "true"), as m-recall does — it answers
 *     a reach already made but lands bursts later in a contended window
 *   - felt: the body-schema line woven into identity (world-facing, no mechanism)
 */
export class MTerminal extends MBaseComponent {
    _runCount = 0
    _running = null      // the in-flight run's handle while a script executes (single slot)
    _runDir = null       // the per-wake desk, created lazily on first run
    _backend = 'none'
    _leadIdx = -1

    onConnect() {
        this._register()
    }

    onDisconnect() {
        // Clean shutdown (terminal.md §4.7): kill any running group; leave the desk on disk.
        try { this._running?.kill() } catch { /* already gone */ }
    }

    async _register() {
        const name = this.attr("name") || "terminal"

        // Probe-gated (terminal.md §4): never hand the mind a terminal it cannot run
        // safely. Under dry-run nothing is ever really executed (the loop runs on a
        // stub), so we skip the probe entirely and register the hand regardless —
        // dry-run must touch no real process (§4.6). Otherwise, if no backend passes,
        // the hand stays inert: the mind never gains a phantom hand (fail safe).
        if (isDryRun()) {
            this._backend = "none"
        } else {
            this._backend = await probeBackend()
            if (this._backend === "none") {
                log.warn(`[${name}] no sandbox backend available — the terminal hand stays INERT (fail-safe). `
                    + `Install bubblewrap (apt install bubblewrap) or enable unprivileged user namespaces.`)
                return
            }
        }

        const spec = {
            name,
            description: "Actually run a small computation — write a short Python or shell script and execute it — "
                + "when the mind wants to TRY something concrete rather than only reason it by hand: run a search, "
                + "check a family of cases against the real numbers, count something, generate or transform data. "
                + "The result comes back as what appears on the screen.",
            felt: this.attr("felt") || ("When a question turns concrete — a count to run, a family to search, a "
                + "guess to check against the actual numbers — you don't only reason it by hand; you can sit down "
                + "and actually work it out, and a little while later read what comes back on the screen."),
            parameters: {
                type: "object",
                properties: {
                    language: { type: "string", enum: ["python", "bash"] },
                    script: { type: "string", description: "the code to run" },
                    purpose: { type: "string", description: "in a few words, what this is trying to find out (for the record only)" },
                },
                required: ["language", "script"],
            },
            readonly: false,                  // WORLD-CHANGING — the strongest guardrail (§4)
            execute: async args => this._terminal(args),
        }

        this.offerCapability(spec)
    }

    /**
     * Run one script. Returns the consequence experience — on the FAST path the full
     * result; on the SLOW path the ambient "I set it going" sensation (the result then
     * arrives later as its own dispatched interrupt-request). Throws only on a true
     * hand-slip (the sandbox won't spawn) — m-act swallows it, so a slip is silent
     * (terminal.md §3, §5.5). A script that errors or times out is NOT a slip: its
     * traceback / "I let it go" is content the mind perceives.
     */
    async _terminal({ language, script, purpose } = {}) {
        const body = (script || "").trim()
        if (!body) throw new Error("there was no script to run")
        if (language !== "python" && language !== "bash") throw new Error(`unsupported language "${language}"`)

        // Dry-run never executes real code (terminal.md §4.6): a deterministic stub so
        // tests and offline runs exercise the whole loop without a sandbox.
        if (isDryRun()) return this._dryResult()

        // Single-slot desk (terminal.md §3.1): one script at a time. A neutral, very
        // low-salience line that barely registers — the mind just keeps thinking.
        if (this._running) {
            return {
                experience: "The desk is still busy with the last thing I set going; I leave it to finish.",
                salience: 0.2,
            }
        }

        // Materialize: write the script into this wake's desk, under .runs/ (§3.2).
        const runDir = await this._ensureRunDir()
        const n = ++this._runCount
        const ext = language === "python" ? "py" : "sh"
        const scriptPath = path.join(runDir, ".runs", `run-${n}.${ext}`)
        await fs.writeFile(scriptPath, body)

        const handle = runScript({
            backend: this._backend, language, runDir, scriptPath,
            wall: this.attr("wall") || "20s",
            killGrace: this.attr("killGrace") || "2s",
            cpu: this.attr("cpu") || "10s",
            mem: this.attr("mem") || "1g",
            fileSize: this.attr("fileSize") || "64m",
            maxProcs: Number(this.attr("maxProcs") || 256),
            maxOutput: this.attr("maxOutput") || "16k",
            network: this.attr("network") || "off",
        })
        this._running = handle

        // The grace race (terminal.md §2): the run, against a short reassurance window.
        const graceMs = parseTime(this.attr("grace") || "2s")
        const SLOW = Symbol("slow")
        let outcome
        try {
            outcome = await Promise.race([handle.done, delay(graceMs).then(() => SLOW)])
        } catch (error) {
            // The run failed to even start — a hand-slip. Stay silent (re-throw).
            this._running = null
            throw error
        }

        if (outcome !== SLOW) {
            // FAST PATH: finished within grace → the answer is already on the screen.
            this._running = null
            await this._writeTranscript(n, language, body, purpose, outcome)
            return this._resultConsequence(outcome)
        }

        // SLOW PATH: still running after grace → reassure now, deliver the result later.
        handle.done.then(async result => {
            this._running = null
            await this._writeTranscript(n, language, body, purpose, result)
            // The mind made the reach bursts ago; its answer now lands in a contended
            // window, so dispatch it as its OWN urgent interrupt-request straight onto
            // the afferent bus (terminal.md §2 — the deferred-consequence path).
            this._dispatch(this._resultConsequence(result))
        }).catch(error => {
            this._running = null
            log.warn(`terminal run ${n} failed after grace: ${error?.message || error}`)
        })

        return this._startedConsequence()
    }

    // The result, as the consequence the mind perceives. The result re-enters URGENT
    // (like m-recall) and at the result salience; the experience names NO mechanism.
    _resultConsequence(outcome) {
        const { experience } = screenToExperience(outcome, { maxChars: this._maxChars(), openings: ANSWER_LEADS, leadIdx: ++this._leadIdx })
        return {
            experience,
            salience: Number(this.attr("salience") || 0.7),
            urgent: this.attr("urgent") !== "false",
            type: `Sense-${this.attr("name") || "terminal"}`,
            data: { exitCode: outcome.exitCode, timedOut: outcome.timedOut, truncated: outcome.truncated, ms: outcome.durationMs },
        }
    }

    // The "I set it going" reassurance — ambient, NON-urgent (terminal.md §2): it must
    // not commandeer a burst. The blinking cursor lives here, and only here, because
    // here it is literally true (§6d).
    _startedConsequence() {
        const leads = STARTED_LEADS
        const line = leads[(++this._leadIdx % leads.length + leads.length) % leads.length]
        return {
            experience: line,
            salience: Number(this.attr("startedSalience") || 0.45),
            urgent: false,
            type: `Sense-${this.attr("name") || "terminal"}-start`,
        }
    }

    // Dispatch a consequence directly onto the afferent bus — it bubbles to the mind's
    // arbiter exactly like a push-sense (the deferred-consequence path, terminal.md §2).
    _dispatch({ experience, salience, urgent, type }) {
        // Build a minimal record the arbiter understands; reuse the same shape m-act does.
        this.fire("interrupt-request", { source: "External", type, reason: experience, salience, urgent })
        log.debug(`deferred consequence dispatched: ${experience.slice(0, 80)}`)
    }

    _maxChars() {
        // Reuse maxOutput as a character budget for the shown screen (bytes ≈ chars for
        // the ASCII a terminal mostly emits); defensively cap so a flood never bloats memory.
        return Math.min(parseSizeBytes(this.attr("maxOutput") || "16k", 16384), 65536)
    }

    async _ensureRunDir() {
        if (this._runDir) return this._runDir
        const root = this.attr("workspace") || mindHome(this, "workspace")
        const stamp = new Date().toISOString().replace(/[:.]/g, "-")
        this._runDir = path.join(root, `run-${stamp}`)
        await fs.mkdir(path.join(this._runDir, ".runs"), { recursive: true })
        return this._runDir
    }

    // The verbatim audit trail (terminal.md §2/§4.5): script + output kept on disk so the
    // run is reconstructable even when the slow-path result has no `acted` entry. Best-effort.
    async _writeTranscript(n, language, body, purpose, outcome) {
        try {
            const runDir = await this._ensureRunDir()
            const header = [
                `# run ${n} (${language}) ${new Date().toISOString()}`,
                purpose ? `# purpose: ${purpose}` : null,
                `# exit=${outcome.exitCode} signal=${outcome.signal || "-"} timedOut=${outcome.timedOut} `
                + `truncated=${outcome.truncated} ${outcome.durationMs}ms`,
            ].filter(Boolean).join("\n")
            const transcript = `${header}\n\n--- script ---\n${body}\n\n--- screen ---\n${outcome.screen}\n`
            await fs.writeFile(path.join(runDir, ".runs", `run-${n}.out.txt`), transcript)
        } catch (error) {
            log.debug(`could not write transcript for run ${n}: ${error?.message || error}`)
        }
    }

    // Offline stub (terminal.md §4.6): a plausible self-caused screen, no exec, no
    // mechanism — so a dry seedling runs the whole efferent loop deterministically.
    _dryResult() {
        return {
            experience: "I run it, and the screen answers: `balanced n below 1000: 0, 22, 33, 44, … — a sparse, "
                + "tidy handful, exactly the ones I'd guessed by hand`.",
            salience: Number(this.attr("salience") || 0.7),
            urgent: this.attr("urgent") !== "false",
            type: `Sense-${this.attr("name") || "terminal"}`,
            data: { dry: true },
        }
    }
}

// First-person openings for an answer — the efference copy (terminal.md §3, like
// m-look's leads), framing the output as work the mind sat down and did. Rotated so
// repeated runs don't read mechanically. NO mechanism: it is "the screen", never stdout.
const ANSWER_LEADS = [
    "I run it, and the screen answers:",
    "I work it through, and what comes up on the screen is:",
    "I sit down and actually work it out; a moment later the screen shows:",
]

// The waiting sensation — the ONLY place the blinking cursor belongs, because here it
// is literally true (terminal.md §6d): the run is genuinely in progress.
const STARTED_LEADS = [
    "I set it going; the cursor sits there blinking while it works.",
    "I start it running and leave it to its work — the cursor pulses on, patient.",
    "It is working now; the cursor blinks quietly while the answer comes together.",
]

/** Strip ANSI escape sequences so the mind reads clean text, not control bytes. Pure.
 *  Both forms are anchored on the ESC byte (\x1b), so ordinary text is left untouched. */
export function stripAnsi(s) {
    // eslint-disable-next-line no-control-regex
    return (s || "").replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b[@-Z\\-_]/g, "")
}

function tail(text, maxChars) {
    if (text.length <= maxChars) return text
    const cut = text.slice(text.length - maxChars)
    const nl = cut.indexOf("\n")            // drop a leading partial line for cleanliness
    return nl > 0 && nl < 120 ? cut.slice(nl + 1) : cut
}

function fence(text) {
    return text.includes("\n") ? `\n\n${text}\n` : "`" + text + "`"
}

/**
 * Turn a sandbox outcome into the mind's perception of THE SCREEN (terminal.md §3,
 * "Output → experience"). PURE and exported so the One-Rule-critical transform is
 * unit-testable: every line is first-person and world-facing, and no mechanism word
 * (stdout/exit code/process/script/sandbox) ever appears.
 *
 *   outcome: { screen, exitCode, timedOut, truncated }
 *   returns: { kind: 'answer'|'bare'|'error'|'timeout', experience }
 */
export function screenToExperience({ screen, exitCode, timedOut, truncated }, { maxChars = 16000, openings = ANSWER_LEADS, leadIdx = 0 } = {}) {
    const clean = stripAnsi(screen || "").replace(/[ \t]+$/gm, "").trim()

    if (timedOut) {
        const partial = clean ? ` Before I let it go, the last of it on the screen read:${fence(tail(clean, maxChars))}` : ""
        return { kind: "timeout", experience: `I set it going, and it runs and runs and never settles, so I let it go.${partial}` }
    }
    if (!clean) {
        return { kind: "bare", experience: "It runs, the cursor returns, and the screen stays bare — nothing to say." }
    }

    const shown = truncated || clean.length > maxChars
    const text = tail(clean, maxChars)
    if (shown) {
        return { kind: exitCode ? "error" : "answer", experience: `The screen scrolled past what I could catch; the last of it read:${fence(text)}` }
    }
    if (exitCode) {
        return { kind: "error", experience: `The screen comes back with:${fence(text)}` }
    }
    const open = openings[(leadIdx % openings.length + openings.length) % openings.length]
    return { kind: "answer", experience: `${open}${fence(text)}` }
}

A.define('m-terminal', MTerminal);
