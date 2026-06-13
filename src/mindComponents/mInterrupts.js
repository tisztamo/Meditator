import { MBaseComponent } from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { parseTime } from '../config/timeParser.js';

const log = logger('mInterrupts.js');

/**
 * The attention arbiter. Generators anywhere in the mind (timeouts, observers,
 * websocket, console) dispatch bubbling "interrupt-request" DOM events carrying
 * an InterruptRecord; this component decides what gets through to the mind.
 *
 * The decision is mechanical, not an LLM pipeline: the generator that raised
 * the interrupt knows why it fired and supplies the salience itself. The only
 * intelligence spent on a context switch is the mind's bridge call.
 *
 * Non-urgent stimuli are QUEUED and collected by m-mind at the next burst
 * boundary (an interruption is just an attended boundary). Urgent stimuli
 * (user speaking) additionally dispatch an "interrupt" event, which makes the
 * mind think immediately, superseding the running burst.
 *
 * @interface
 * Attributes:
 *   - threshold: minimum salience for non-urgent stimuli (default 0.35)
 *   - rateLimit: minimum time between accepted non-urgent stimuli (default "15s")
 *   - keep: max queued stimuli, highest salience wins (default 2)
 *
 * DOM events:
 *   - listens (on parent): "interrupt-request"
 *   - dispatches (bubbling): "interrupt" for urgent stimuli
 */
export class MInterrupts extends MBaseComponent {
    pending = []
    lastAcceptedAt = 0

    "../@interrupt-request" = e => {
        const record = InterruptRecord.coerce(e.detail)
        const threshold = Number(this.attr("threshold") || 0.35)
        const rateLimitMs = parseTime(this.attr("rateLimit") || "15s")
        const now = Date.now()

        if (!record.urgent) {
            if (record.salience < threshold) {
                log.debug(`drop (salience ${record.salience} < ${threshold}): ${record}`)
                this._publishDecision(record, false, `salience ${record.salience.toFixed(2)} < ${threshold}`)
                return
            }
            if (now - this.lastAcceptedAt < rateLimitMs) {
                log.debug(`drop (rate limit): ${record}`)
                this._publishDecision(record, false, "rate-limited")
                return
            }
        }

        this.lastAcceptedAt = now
        this._enqueue(record)
        log.debug(`accepted${record.urgent ? " URGENT" : ""}: ${record}`)
        this._publishDecision(record, true, record.urgent ? "urgent" : "accepted")

        if (record.urgent) {
            this.dispatchEvent(new CustomEvent("interrupt", { bubbles: true, detail: record }))
        }
    }

    /** Announces the accept/drop verdict for a stimulus, so an observer (e.g. the
     *  websocket dashboard) can show why a bid did or didn't get through. */
    _publishDecision(record, accepted, why) {
        this.pub("decision", {
            source: record.source,
            type: record.type,
            reason: record.reason,
            salience: record.salience,
            urgent: !!record.urgent,
            accepted,
            why,
        })
    }

    _enqueue(record) {
        this.pending.push(record)
        const keep = Number(this.attr("keep") || 2)
        if (this.pending.length > keep) {
            this.pending.sort((a, b) => (b.urgent - a.urgent) || (b.salience - a.salience))
            const dropped = this.pending.splice(keep)
            dropped.forEach(r => { log.debug(`crowded out: ${r}`); this._publishDecision(r, false, "crowded out") })
        }
    }

    /** Called by m-mind at each boundary. Returns queued stimuli, oldest first, and clears the queue. */
    takePending() {
        const taken = this.pending
        this.pending = []
        return taken.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
    }
}
