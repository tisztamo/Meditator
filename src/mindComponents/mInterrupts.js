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
 * POSITION decides the role, so the same component works at any depth:
 *   - GLOBAL arbiter (a direct child of m-mind): non-urgent stimuli are QUEUED
 *     and collected by m-mind at the next burst boundary (an interruption is
 *     just an attended boundary); urgent stimuli additionally dispatch an
 *     "interrupt" event, making the mind think immediately.
 *   - NESTED arbiter (inside an m-region): it governs that faculty. It gates
 *     locally, re-weights survivors by `gain`, stops the original event at the
 *     region, and re-dispatches the survivor one level up — to the enclosing
 *     region's arbiter, or finally to the global one. Layered competition; a
 *     single global broadcast. (doc/architecture/deep-structure.md.)
 *
 * Binding is structural, not via the "../@…" auto-sub: a nested arbiter must
 * listen on its region (not skip past a not-yet-upgraded region up to the mind),
 * so we addEventListener on closest('m-region') || closest('m-mind') directly.
 *
 * @interface
 * Attributes:
 *   - threshold: minimum salience for non-urgent stimuli (default 0.35)
 *   - rateLimit: minimum time between accepted non-urgent stimuli (default "15s")
 *   - keep: max queued stimuli, highest salience wins (default 2; global only)
 *   - gain: salience multiplier applied to survivors a NESTED arbiter promotes
 *     (default 1; <1 makes a faculty matter less, >1 more)
 *   - arousalSensitivity: if >0 (global only), the effective threshold rises as
 *     arousal falls — a tired mind is harder to interrupt (default 0, off)
 *
 * DOM events:
 *   - listens (on its region or the mind): "interrupt-request"
 *   - dispatches: "interrupt" (bubbling) for urgent stimuli — global only
 */
export class MInterrupts extends MBaseComponent {
    pending = []
    lastAcceptedAt = 0
    _region = null
    _container = null
    _arousal = 1

    onConnect() {
        super.onConnect()
        // The faculty this arbiter governs, if any. A nested arbiter listens on
        // its region; a global one on the mind (or the document as a last
        // resort). closest() is DOM-structural, so it is correct regardless of
        // component upgrade order — the race that makes "../@…" unreliable here.
        this._region = this.closest('m-region')
        this._container = this._region || this.closest('m-mind') || document
        this._container.addEventListener('interrupt-request', this._onRequest)

        // Optional interoception (global only): subscribe to the mind's arousal
        // so a tired mind raises its own bar. Gated, so minds without an economy
        // — or that don't want this — raise no errors and behave exactly as before.
        if (!this._region && Number(this.attr("arousalSensitivity") || 0) > 0) {
            this.sub("..m-mind/economy/arousal", value => { this._arousal = value })
        }
    }

    onDisconnect() {
        this._container?.removeEventListener('interrupt-request', this._onRequest)
    }

    _onRequest = e => {
        const record = InterruptRecord.coerce(e.detail)
        // A nested arbiter is the gate for its faculty: it consumes EVERY request
        // bubbling to its region — whether it ends up promoting or dropping it —
        // so a locally-rejected bid never leaks up to the mind. The global
        // arbiter never stops propagation (m-speech also listens on the mind to
        // hear when it is addressed).
        if (this._region) e.stopPropagation()
        const rateLimitMs = parseTime(this.attr("rateLimit") || "15s")
        const now = Date.now()

        let threshold = Number(this.attr("threshold") || 0.35)
        const sensitivity = Number(this.attr("arousalSensitivity") || 0)
        if (sensitivity > 0) threshold = Math.min(0.99, threshold + (1 - this._arousal) * sensitivity)

        // `urgent` and `clearsTail` both bypass the threshold + rate-limit gate — they are
        // ADMITTED unconditionally. The difference is downstream: only `urgent` additionally
        // PREEMPTS (fires "interrupt"). A confirmed loop break (`clearsTail`) is important
        // enough to always be heard past the bar a tired mind raises and past the rate-limit
        // that would otherwise drop whichever breaker bids second — but it is not a now-now
        // interruption (loop-detection-redesign.md §contracts·2). `urgent` ‖ `clearsTail`
        // splits admit from preempt.
        if (!record.urgent && !record.clearsTail) {
            if (record.salience < threshold) {
                log.debug(`drop (salience ${record.salience} < ${threshold.toFixed(2)}): ${record}`)
                this._publishDecision(record, false, `salience ${record.salience.toFixed(2)} < ${threshold.toFixed(2)}`)
                return
            }
            if (now - this.lastAcceptedAt < rateLimitMs) {
                log.debug(`drop (rate limit): ${record}`)
                this._publishDecision(record, false, "rate-limited")
                return
            }
        }

        this.lastAcceptedAt = now

        if (this._region) {
            // Nested: re-weight and promote one level up — to the enclosing
            // region's arbiter, or finally the mind's. No loop: we re-dispatch
            // on the region's PARENT, which is off this arbiter's listen path.
            const gain = Number(this.attr("gain") || 1)
            if (gain !== 1) record.salience = Math.max(0, Math.min(1, record.salience * gain))
            log.debug(`promote${gain !== 1 ? ` ×${gain}` : ""}: ${record}`)
            this._publishDecision(record, true, gain !== 1 ? `promoted ×${gain}` : "promoted")
            this._region.parentElement?.dispatchEvent(
                new CustomEvent("interrupt-request", { bubbles: true, detail: record }))
            return
        }

        // Global: queue for the mind. Only `urgent` additionally interrupts now; a
        // `clearsTail` bid is admitted but waits to be collected at the next boundary
        // (admit, not preempt) — the mind enacts the cut there.
        this._enqueue(record)
        const note = record.urgent ? " URGENT" : record.clearsTail ? " CLEARS-TAIL" : ""
        log.debug(`accepted${note}: ${record}`)
        this._publishDecision(record, true, record.urgent ? "urgent" : record.clearsTail ? "clears-tail" : "accepted")

        if (record.urgent) {
            this.fire("interrupt", record)
        }
    }

    /** Announces the accept/drop verdict for a stimulus, so an observer (e.g. the
     *  websocket dashboard) can show why a bid did or didn't get through. */
    _publishDecision(record, accepted, why) {
        this.pub("decision", {
            source: record.source,
            type: record.type,
            reason: record.reason,
            text: record.renderForFrame(),
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
