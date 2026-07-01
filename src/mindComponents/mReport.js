import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mReport.js")

/**
 * <m-report> — an agent's status-out port (agent-loop.md §3, §10). A pure observer: it
 * watches the agent's `status` and `step` and republishes a compact progress `report`,
 * and logs each state change, so a supervisor, a socket, or the Studio can follow a
 * long-running service agent without reaching into the kernel. Added and removed by
 * editing one line of archml, with no change to m-agent.
 *
 * @interface
 * Attributes:
 *   - port: the topic name to publish the report on (default "report").
 *   - every: log a step-progress line every Nth step (default 1); status changes always log.
 *
 * Subscriptions: "..m-agent/status", "..m-agent/@step".
 * Topics published: the report (name given by `port`) — {state, step, maxSteps, done, answer?}.
 */
export class MReport extends MBaseComponent {
    _lastState = null

    onConnect() {
        this._topic = this.attr("port") || "report"
        this._every = Math.max(1, Number(this.attr("every") || 1))
        // Explicit .catch() (never auto-sub fields) so a report placed outside an <m-agent>
        // fails quietly rather than leaking an unhandled ref-resolution rejection.
        this.sub("..m-agent/status", s => this._onStatus(s)).catch(() => {
            log.warn("m-report found no ..m-agent/status — it must sit inside an <m-agent>")
        })
        this.sub("..m-agent/@step", e => this._onStep(e?.detail)).catch(() => {})
    }

    _onStatus(status) {
        if (!status) return
        this.pub(this._topic, { ...status, at: new Date().toISOString() })
        if (status.state !== this._lastState) {
            this._lastState = status.state
            const tail = status.done && status.reason ? ` (${status.reason})` : ""
            log.info(`agent status: ${status.state} @ step ${status.step}/${status.maxSteps}${tail}`)
        }
    }

    _onStep(step) {
        if (!step || !Number.isFinite(step.index)) return
        if (step.index % this._every !== 0) return
        const tools = (step.calls || []).map(c => c.name).join(", ") || "(answered)"
        log.info(`step ${step.index}: ${tools}`)
    }
}

A.define("m-report", MReport)
