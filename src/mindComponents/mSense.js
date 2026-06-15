import { MBaseComponent } from "./mBaseComponent.js"
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { logger } from '../infrastructure/logger.js';
import { parseTime } from '../config/timeParser.js';

const log = logger('mSense.js');

/**
 * Base class for SENSES — world-facing afferent generators (lifecycle.md §Phase 5).
 * Abstract, like m-observer / m-base-component: never used as a tag directly, only
 * subclassed (m-daylight, m-weather, m-feed).
 *
 * The mirror of m-observer. Where an observer watches the inner stream and bids
 * for attention from WITHIN, a sense watches the OUTSIDE and bids from WITHOUT:
 * it runs on its own clock (`timeout` ± normal `sigma`), reads some real
 * exteroceptive source, and raises a first-person sensation as a bubbling
 * `interrupt-request`. Senses are what give the mind an outside that is neither
 * itself nor the human it waits on, so the stream is not alone in the dark.
 *
 * A sense faces the WORLD, never the SUBSTRATE. It must never grow toward host
 * metrics, token counts, latency, the cursor, or the process itself — that
 * mechanistic interoception is exactly what grew the §1 "cursor/pause/void"
 * attractor. A felt outside, yes; the implementation, never.
 *
 * Subclass contract:
 *   - override `onSense()` (may be async); inside it call `this.feel(reason, …)`;
 *   - pass a `key` to `feel` when the sense has discrete states (a part of the day,
 *     a kind of weather): the base scores a CHANGE of key at `salienceShift` and an
 *     unchanged key at the ambient `salience` (jittered, so it is peripheral — the
 *     way the light is when you are not looking at it). Pass neither key nor
 *     salience for a plain ambient reading; pass an explicit `salience` to override;
 *   - return from `onSense()` without calling `feel` to stay quiet this round;
 *   - override `ready()` to stay dormant when unconfigured (e.g. no location/url);
 *   - override the `defaultTimeout` / `defaultSigma` getters for the natural cadence.
 *
 * Errors in `onSense()` (e.g. a network blip) are swallowed and logged — a sense
 * going quiet must never crash the mind.
 *
 * @interface
 * Attributes:
 *   - timeout: base interval between readings (subclass default)
 *   - sigma: normal-distributed jitter on the interval (subclass default)
 *   - salience: centre salience of an ambient reading (jittered ±0.08)
 *   - salienceShift: salience when a keyed sense changes state
 *
 * Events dispatched (bubbling): "interrupt-request" with an InterruptRecord
 * (source "External", never urgent).
 */
export class MSense extends MBaseComponent {
    _timer = null
    _lastKey = null

    get defaultTimeout() { return "8m" }
    get defaultSigma() { return "2m" }

    onConnect() {
        this.timeoutMs = parseTime(this.attr("timeout") || this.defaultTimeout)
        this.sigmaMs = parseTime(this.attr("sigma") || this.defaultSigma)
        if (this.ready() === false) return       // unconfigured — stay dormant (subclass warns)
        this._schedule(this._nextDelay())
    }

    onDisconnect() {
        if (this._timer) clearTimeout(this._timer)
    }

    /** Subclass hooks. */
    ready() { return true }
    async onSense() {}

    _nextDelay() {
        const normal = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
        return Math.max(500, this.timeoutMs + normal * this.sigmaMs)
    }

    _schedule(delayMs) {
        if (this._timer) clearTimeout(this._timer)
        this._timer = setTimeout(this._onTimer, delayMs)
    }

    _onTimer = async () => {
        try { await this.onSense() }
        catch (e) { log.debug(`[${this.attr("name") || this.localName}] sense quiet (${e?.message || e})`) }
        this._schedule(this._nextDelay())
    }

    /**
     * Raise a sensation into the attention bus.
     * @param {string} reason - first-person experience line for the frame
     * @param {{key?: string, salience?: number, type?: string}} [opts]
     * @returns {InterruptRecord}
     */
    feel(reason, { key = null, salience = null, type = null } = {}) {
        let sal = salience
        if (sal == null) {
            const base = Number(this.attr("salience") || 0.4)
            const shift = Number(this.attr("salienceShift") || 0.6)
            const shifted = key != null && key !== this._lastKey
            sal = shifted ? shift : base + (Math.random() * 2 - 1) * 0.08
        }
        if (key != null) this._lastKey = key

        const record = new InterruptRecord({
            source: 'External',                 // the world reaching in, not the mind reaching down
            type: type || `Sense-${this.attr("name") || this.localName}`,
            reason,
            salience: sal,
            urgent: false,                      // a sense is ambient, never commandeers a burst
        })
        log.debug(`[${this.attr("name") || this.localName}]${key != null ? ` ${key}` : ""}: ${record}`)
        this.dispatchEvent(new CustomEvent("interrupt-request", { bubbles: true, detail: record }))
        return record
    }
}
