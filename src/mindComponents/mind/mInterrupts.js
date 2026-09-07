import { MBaseComponent } from "../shared/mBaseComponent.js"
import { part, isCustomElementDefined } from "../shared/enclosure.js"
import { extractInfoton } from "../shared/infoton.js"
import { logger } from '../../infrastructure/logger.js';
import { AttentionBid } from '../../infrastructure/attentionBid.js';
import { parseTime } from '../../config/timeParser.js';

const log = logger('mInterrupts.js');

/**
 * The attention arbiter. Generators anywhere in the mind (timeouts, observers,
 * websocket, console) dispatch bubbling "interrupt-request" DOM events carrying
 * an InterruptRecord or AttentionBid; this component decides what gets through to the mind.
 * takePending() returns bids. assembleFrame must read evidence through
 * AttentionBid.evidenceOf — coercing a bid through Percept.fromInterrupt would
 * mint a new id and break receipt crediting.
 *
 * The decision is mechanical, not an LLM pipeline: the generator that raised
 * the interrupt knows why it fired and supplies the salience itself. The only
 * intelligence spent on a context switch is the mind's bridge call. Nested
 * arbiters re-weight by appending a gain-trail entry on the bid — they never
 * write the evidence.
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
 * listen on its faculty (not skip past a not-yet-upgraded region up to the mind),
 * so we addEventListener on enclosing('faculty') || membrane() directly. Role
 * lookup reads the derived `provides` attribute, which is reflected before
 * upgrade, so the race that used to force tag closest() is still safe.
 *
 * @interface
 * Attributes:
 *   - threshold: minimum salience for non-urgent stimuli (default 0.35)
 *   - rateLimit: minimum time between accepted non-urgent stimuli (default "15s")
 *   - keep: max queued stimuli, highest salience wins (default 2; global only)
 *   - gain: salience multiplier applied to survivors a NESTED arbiter promotes
 *     (default 1; <1 makes a faculty matter less, >1 more)
 *   - arousalSensitivity: if >0 (global only), the effective threshold rises as
 *     arousal falls — a tired mind is harder to interrupt (default 0, off). Each drop it
 *     causes (a stimulus that clears the base bar but not the raised one) is announced as a
 *     backstage `muffled` event so a memory can journal the withdrawal (finding 7).
 *   - contactSensitivity: threshold reduction at full contact pressure (default 0.25).
 *     Inactive without modality regions. Global pressure follows a 60s exponential
 *     mean of `part(mind, 'aperture')` — top-level providers only, each already
 *     folded. A child `aggregator` (`aggregate(pressures: number[]) → number`)
 *     replaces that spatial mix; it is the mind-level combination, not a second
 *     contact regulator. Absent one, the built-in mean is today's numbers for
 *     flat minds. Nested arbiters read the region's retained (folded) pressure.
 *     Topic: contactPressure.
 *
 * DOM events:
 *   - listens (on its region or the mind): "interrupt-request"
 *   - dispatches: "interrupt" (bubbling) for urgent stimuli — global only
 *   - dispatches: "muffled" (bubbling) when low arousal alone dropped a stimulus — global
 *     only, throttled to rateLimit; a record-only signal the mind never perceives
 */
export class MInterrupts extends MBaseComponent {
    static provides = { arbiter: true }
    pending = []
    lastAcceptedAt = 0
    _region = null
    _container = null
    _arousal = 1
    _lastMuffledAt = 0
    _pressureAt = Date.now()
    contactPressure = 0
    _aggregator = null

    onConnect() {
        super.onConnect()
        // The faculty this arbiter governs, if any. A nested arbiter listens on
        // its region; a global one on the mind (or the document as a last
        // resort). Role lookup is DOM-structural (the reflected `provides`
        // attribute), so it is correct regardless of component upgrade order —
        // the race that makes "../@…" unreliable here.
        this._region = this.enclosing('faculty')
        this._container = this._region || this.membrane() || document
        this._container.addEventListener('interrupt-request', this._onRequest)

        if (!this._region) this._aggregator = this._boundAggregator()

        // Optional interoception (global only): subscribe to the mind's arousal
        // so a tired mind raises its own bar. Gated, so minds without an economy
        // — or that don't want this — behave exactly as before. The .catch mirrors
        // m-act's arousal sub: with no economy the topic never resolves, and arousal
        // stays 1 (never muffles), rather than leaking an unhandled RefResolutionError.
        if (!this._region && Number(this.attr("arousalSensitivity") || 0) > 0) {
            this.sub("..m-mind/economy/arousal", value => { this._arousal = value }).catch(() => {})
        }
    }

    /** Unique `aggregator` inside the membrane. Zero → built-in mean.
     * More than one fails loudly. If the tag is already defined, the port
     * check runs during this onConnect. A same-batch child that is not yet
     * defined is bound from `whenDefined` — upgrade() cannot define a tag. */
    _boundAggregator() {
        if (this._aggregator) return this._aggregator
        const mind = this.membrane()
        if (!mind) return null
        const found = part(mind, 'aggregator')
        if (found.length > 1) throw new Error('a mind may have only one aggregator')
        const aggregator = found[0]
        if (!aggregator) return null
        const take = () => {
            customElements.upgrade(aggregator)
            this._assertAggregatorPort(aggregator)
            return aggregator
        }
        if (isCustomElementDefined(aggregator)) return take()
        if (!this._aggregatorWait) {
            this._aggregatorWait = customElements.whenDefined(aggregator.localName).then(() => {
                this._aggregatorWait = null
                if (!this.isConnected) return
                this._aggregator = take()
            })
        }
        return null
    }

    _assertAggregatorPort(aggregator) {
        if (typeof aggregator.aggregate !== 'function') throw new Error('aggregator is missing aggregate')
    }

    onDisconnect() {
        this._container?.removeEventListener('interrupt-request', this._onRequest)
        this._aggregator = null
        this._aggregatorWait = null
    }

    _onRequest = e => {
        // The bid's infoton: this arbiter hears through a raw listener (not sub()),
        // so the receiver-side step happens here — one pull toward the bidding
        // faculty per bid, before any gating (plenum.md §3.2: the message arrived;
        // what the handler does with the content is separate).
        this.applyInfoton(extractInfoton(e))
        const bid = AttentionBid.from(e.detail)
        // A nested arbiter is the gate for its faculty: it consumes EVERY request
        // bubbling to its region — whether it ends up promoting or dropping it —
        // so a locally-rejected bid never leaks up to the mind. The global
        // arbiter never stops propagation (m-speech also listens on the mind to
        // hear when it is addressed).
        if (this._region) e.stopPropagation()
        const rateLimitMs = parseTime(this.attr("rateLimit") || "15s")
        const now = Date.now()

        const baseThreshold = Number(this.attr("threshold") || 0.35)
        const sensitivity = Number(this.attr("arousalSensitivity") || 0)
        let threshold = baseThreshold
        if (sensitivity > 0) threshold = Math.min(0.99, baseThreshold + (1 - this._arousal) * sensitivity)
        this._updateContactPressure(now)
        threshold = Math.max(0, threshold - this.contactPressure * Number(this.attr('contactSensitivity') ?? 0.25))

        // `urgent` and `clearsTail` both bypass the threshold + rate-limit gate — they are
        // ADMITTED unconditionally. The difference is downstream: only `urgent` additionally
        // PREEMPTS (fires "interrupt"). A confirmed loop break (`clearsTail`) is important
        // enough to always be heard past the bar a tired mind raises and past the rate-limit
        // that would otherwise drop whichever breaker bids second — but it is not a now-now
        // interruption (loop-detection-redesign.md §contracts·2). `urgent` ‖ `clearsTail`
        // splits admit from preempt.
        if (!bid.bypassAdmission) {
            if (bid.salience < threshold) {
                // When arousal is what pushed this under — it clears the base bar but not the
                // raised one — leave a backstage trail (finding 7): otherwise a tired mind grows
                // isolated with no felt or recorded cause. The mind is told nothing (it never
                // perceived the stimulus); only the record gains the reason. Throttled below.
                if (sensitivity > 0 && bid.salience >= baseThreshold) this._noteMuffled(bid)
                log.debug(`drop (salience ${bid.salience} < ${threshold.toFixed(2)}): ${bid}`)
                this._publishDecision(bid, false, `salience ${bid.salience.toFixed(2)} < ${threshold.toFixed(2)}`)
                return
            }
            if (now - this.lastAcceptedAt < rateLimitMs) {
                log.debug(`drop (rate limit): ${bid}`)
                this._publishDecision(bid, false, "rate-limited")
                return
            }
        }

        this.lastAcceptedAt = now

        if (this._region) {
            // Nested: re-weight and promote one level up — to the enclosing
            // region's arbiter, or finally the mind's. No loop: we re-dispatch
            // on the region's PARENT, which is off this arbiter's listen path.
            // Arbiter gain is competition, not enclosure: it may be > 1 and
            // must not go through pushGainTrail (that helper rejects > 1).
            const gain = Number(this.attr("gain") || 1)
            if (gain !== 1) {
                bid.gainTrail.push(Object.freeze({
                    gate: this.attr("name") || this.localName,
                    factor: gain,
                }))
                bid.recomputeSalience()
            }
            log.debug(`promote${gain !== 1 ? ` ×${gain}` : ""}: ${bid}`)
            this._publishDecision(bid, true, gain !== 1 ? `promoted ×${gain}` : "promoted")
            this._region.parentElement?.dispatchEvent(
                new CustomEvent("interrupt-request", { bubbles: true, detail: bid }))
            return
        }

        // Global: queue for the mind. Only `urgent` additionally interrupts now; a
        // `clearsTail` bid is admitted but waits to be collected at the next boundary
        // (admit, not preempt) — the mind enacts the cut there.
        this._enqueue(bid)
        const note = bid.urgent ? " URGENT" : bid.clearsTail ? " CLEARS-TAIL" : ""
        log.debug(`accepted${note}: ${bid}`)
        this._publishDecision(bid, true, bid.urgent ? "urgent" : bid.clearsTail ? "clears-tail" : "accepted")

        if (bid.urgent) {
            this.fire("interrupt", bid)
        }
    }

    /** A stimulus a RESTED mind would have taken, dropped only because low arousal raised the
     *  bar (arousalSensitivity). Announce it as a bubbling backstage `muffled` event so a memory
     *  can leave a ⌁ trail — the honest counterpart to a tired mind quietly withdrawing from the
     *  world (philosophical-review-2026-07-02 finding 7). Throttled to the rate-limit so a
     *  low-energy stretch leaves a trail, not a flood. The event never reaches the mind's frame;
     *  it is a record-only signal, exactly like a deed's ⌁ note. */
    _noteMuffled(record) {
        const now = Date.now()
        const rateLimitMs = parseTime(this.attr("rateLimit") || "15s")
        if (now - this._lastMuffledAt < rateLimitMs) return
        this._lastMuffledAt = now
        this.fire("muffled", { arousal: this._arousal, type: record.type, salience: record.salience })
    }

    /** Announces the accept/drop verdict for a stimulus, so an observer (e.g. the
     *  websocket dashboard) can show why a bid did or didn't get through. */
    _publishDecision(bid, accepted, why) {
        bid.decisions.push(Object.freeze({
            by: this.attr("name") || this.localName,
            accepted,
            why,
            at: Date.now(),
        }))
        this.pub("decision", {
            source: bid.source,
            type: bid.type,
            reason: bid.reason,
            text: bid.renderForFrame(),
            salience: bid.salience,
            urgent: !!bid.urgent,
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
        this._updateContactPressure(Date.now())
        const taken = this.pending
        this.pending = []
        return taken.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
    }

    _updateContactPressure(now) {
        if (this._region) {
            const pressure = this._clampPressure(this._region.contactPressure)
            this.contactPressure = pressure
            this.pub('contactPressure', pressure)
        } else {
            if (!this._aggregator) this._aggregator = this._boundAggregator()
            const regions = part(this.membrane(), 'aperture')
            const pressures = regions.map(region => this._clampPressure(region.contactPressure))
            const mixed = this._clampPressure(this._aggregator
                ? this._aggregator.aggregate(pressures)
                : pressures.reduce((sum, p) => sum + p, 0) / (pressures.length || 1))
            const weight = 1 - Math.exp(-Math.max(0, now - this._pressureAt) / 60000)
            const next = this._clampPressure(
                this.contactPressure + (mixed - this.contactPressure) * weight)
            this.contactPressure = next
            this.pub('contactPressure', next)
        }
        this._pressureAt = now
    }

    /** Invalid aggregator output must not NaN the threshold (salience < NaN is
     * false, so every bid would pass). Non-finite values fail closed at 0. */
    _clampPressure(value) {
        const n = Number(value)
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
    }
}
