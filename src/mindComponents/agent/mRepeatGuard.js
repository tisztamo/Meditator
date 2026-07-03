import A from "amanita"
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { logger } from "../../infrastructure/logger.js"

const log = logger("mRepeatGuard.js")

// Same tool + same args → same signature. Args are key-order-normalized so the same call
// hashes identically even if the model happens to serialize its arguments differently.
const signature = (call) => `${call?.name}(${stableStringify(call?.args ?? {})})`

/**
 * <m-repeat-guard> — a stall detector for an agent, the operational twin of a mind's
 * <m-loop-detector> (agent-loop.md §9). Agents fail differently from minds: a mind
 * *circles a refrain* (prose), an agent *repeats an action* — runs the same failing
 * command, edits the same line back and forth, retries an identical call. So this guard
 * watches ACTIONS, not prose. It follows the same sense → bid → break shape as
 * loop-detection-redesign.md, but the "break" is a MESSAGE injected into the transcript,
 * not a tail reseed:
 *
 *   - when the SAME action recurs `nudgeAt` times in the window → it NUDGES (a redirect
 *     the agent reads on its next turn), and
 *   - if the rut persists to `haltAt` → it ESCALATES to a HALT (a stop condition).
 *
 * It is a PURE OBSERVER: added and removed by editing one line of archml, with no change
 * to m-agent, m-reason, or the tools. m-agent already listens for the bubbling
 * `nudge`/`halt` events (mAgent.onConnect) — a nudge folds into the next `user` turn, a
 * halt ends the loop.
 *
 * @interface
 * Attributes:
 *   - stepSrc: the agent's step-event ref (default "..m-agent/@step" — the nearest
 *     enclosing agent's `step` boundary event)
 *   - window: how many recent action signatures to keep (default 6)
 *   - nudgeAt: repeats of the same action within the window that trigger a nudge (default 3)
 *   - haltAt: repeats that escalate to a halt (default 5)
 */
export class MRepeatGuard extends MBaseComponent {
    _recent = []       // ring buffer of recent action signatures
    _halted = false    // fire the halt once

    onConnect() {
        // Subscribe to the agent's `step` BOUNDARY. m-agent FIRES it (this.fire("step", …)),
        // so it is a DOM event, addressed with the "@" form and read from e.detail — NOT a
        // retained topic. Explicit .catch() (never an auto-sub field) so a guard placed
        // outside an <m-agent> fails quietly instead of leaking an unhandled ref rejection.
        const stepSrc = this.attr("stepSrc") || "..m-agent/@step"
        this.sub(stepSrc, e => this._onStep(e?.detail)).catch(() => {
            log.warn("m-repeat-guard found no <m-agent>/@step to watch — it must sit inside an <m-agent>")
        })
        this._window  = Number(this.attr("window")  || 6)
        this._nudgeAt = Number(this.attr("nudgeAt") || 3)
        this._haltAt  = Number(this.attr("haltAt")  || 5)
    }

    _onStep(step) {
        for (const call of step?.calls || []) this._recent.push(signature(call))
        this._recent = this._recent.slice(-this._window)

        const last = this._recent.at(-1)
        if (!last) return
        const repeats = this._recent.filter(s => s === last).length

        if (repeats >= this._haltAt) {
            if (this._halted) return
            this._halted = true
            log.warn(`repeat-guard halting: "${last}" ×${repeats}`)
            this.fire("halt", { reason: `Repeated the same action ${repeats}× with no new result.` })
        } else if (repeats >= this._nudgeAt) {
            log.info(`repeat-guard nudging: "${last}" ×${repeats}`)
            this.fire("nudge", {
                text: `You have now run essentially the same action ${repeats} times and gotten the same result. `
                    + `Stop repeating it: re-examine your assumptions, inspect something you have not looked at yet, `
                    + `or try a genuinely different approach.`,
                severity: repeats,
            })
        }
    }
}

/** Deterministic JSON with sorted object keys, so {a,b} and {b,a} hash identically. */
function stableStringify(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null"
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`
}

A.define("m-repeat-guard", MRepeatGuard)
