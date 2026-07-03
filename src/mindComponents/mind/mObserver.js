import { MBaseComponent } from "../shared/mBaseComponent.js"
import { InterruptRecord } from '../../infrastructure/interruptRecord.js';
import { logger } from '../../infrastructure/logger.js';
import { parseTime } from '../../config/timeParser.js';

const log = logger('mObserver.js');

/**
 * Base class for observers: independent processes that watch the stream of
 * consciousness and occasionally bid for attention by raising salience-scored
 * interrupt requests. Subclasses override onStreamChunk() and/or onBoundary().
 *
 * The default stream source is MIND-RELATIVE ("..m-mind/stream/chunk"), not the
 * global "/stream/chunk". In a flat mind these resolve to the same element, but
 * the relative form binds to *this* observer's enclosing mind — so an observer
 * keeps working when it lives inside an m-region, or inside a nested submind,
 * without grabbing some other mind's stream. (See doc/architecture/deep-structure.md.)
 *
 * @interface
 * Attributes:
 *   - src (default "..m-mind/stream/chunk"), boundarySrc (default "..m-mind/stream/@boundary")
 *   - window: chars of stream kept in this.window (default 1600)
 *   - cooldown: minimum time between two raises by this observer (default "60s")
 *   - salience: default salience for raise() (default 0.6)
 */
export class MObserver extends MBaseComponent {
    window = ""
    _lastRaisedAt = 0

    onConnect() {
        this.windowSize = Number(this.attr("window") || 1600)
        this.sub(this.attr("src") || "..m-mind/stream/chunk", chunk => {
            this.window = (this.window + chunk).slice(-this.windowSize)
            this.onStreamChunk(chunk)
        })
        this.sub(this.attr("boundarySrc") || "..m-mind/stream/@boundary", e => this.onBoundary(e.detail))
        this.onObserverConnect()
    }

    /** Subclass hooks */
    onObserverConnect() {}
    onStreamChunk(chunk) {}
    onBoundary(boundary) {}

    /**
     * Raises an interrupt request (respecting this observer's own cooldown).
     * @param {string} reason - first-person experience line for the frame
     * @param {Object} [opts] - {salience, urgent, suggestion, type, clearsTail, settle, episode, kind}
     * @returns {boolean} whether the request was dispatched
     */
    raise(reason, opts = {}) {
        const cooldownMs = parseTime(this.attr("cooldown") || "60s")
        const now = Date.now()
        if (now - this._lastRaisedAt < cooldownMs) return false
        this._lastRaisedAt = now

        const record = new InterruptRecord({
            source: 'Observer',
            type: opts.type || `Observer-${this.attr("name") || this.localName}`,
            reason,
            suggestion: opts.suggestion || null,
            salience: opts.salience ?? Number(this.attr("salience") || 0.6),
            urgent: !!opts.urgent,
            // Loop-break bid properties — passed straight through so a breaker
            // (m-clear-mind / m-resurface) can ask the mind to start fresh if it wins.
            clearsTail: !!opts.clearsTail,
            settle: opts.settle ?? null,
            episode: opts.episode ?? null,
            kind: opts.kind ?? null,
        })
        log.debug(`[${this.attr("name") || this.localName}] raises: ${record}`)
        this.fire("interrupt-request", record)
        return true
    }
}
