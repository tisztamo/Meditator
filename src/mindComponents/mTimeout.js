import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';

const log = logger('mTimeout.js');

/**
 * Time-based interrupt generator. Two roles, one component:
 *
 *   - wander:   fires every `timeout` (± normal-distributed `sigma`), simulating
 *               spontaneous drift of attention.
 *   - watchdog: with `reset` set to a stream ref (e.g. "/stream/chunk"), the
 *               timer only fires after that ref has been SILENT for `timeout` —
 *               any activity pushes the deadline forward. Keeps the mind alive.
 *
 * @interface
 * Attributes:
 *   - timeout: base interval (default "60s"), sigma: jitter (default "0s")
 *   - salience: salience of the raised stimulus (default 0.5)
 *   - urgent: "true" to make the stimulus supersede the running burst (default false)
 *   - reset: optional ref; activity on it resets the silence clock (watchdog mode)
 *   - prompt / text content: first-person reason injected into the frame
 *
 * Events dispatched (bubbling): "interrupt-request" with an InterruptRecord
 */
export class MTimeout extends MBaseComponent {
    _timer = null
    _lastActivity = 0

    onConnect() {
        this.timeoutMs = parseTime(this.attr("timeout") || "60s")
        this.sigmaMs = parseTime(this.attr("sigma") || "0ms")
        this._lastActivity = Date.now()

        const resetRef = this.attr("reset")
        if (resetRef) {
            this.sub(resetRef, () => { this._lastActivity = Date.now() })
        }
        this._schedule(this._nextDelay())
    }

    onDisconnect() {
        if (this._timer) clearTimeout(this._timer)
    }

    _nextDelay() {
        const normal = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
        return Math.max(500, this.timeoutMs + normal * this.sigmaMs)
    }

    _schedule(delayMs) {
        if (this._timer) clearTimeout(this._timer)
        this._timer = setTimeout(this._onTimer, delayMs)
    }

    _onTimer = () => {
        // Watchdog mode: only fire after true silence; otherwise wait out the rest.
        if (this.attr("reset")) {
            const silentFor = Date.now() - this._lastActivity
            if (silentFor < this.timeoutMs) {
                this._schedule(this.timeoutMs - silentFor)
                return
            }
        }

        const record = new InterruptRecord({
            source: 'Internal',
            type: `Time-${this.attr("name") || "timer"}`,
            reason: this.getPrompt().trim() || "Time passes.",
            salience: Number(this.attr("salience") || 0.5),
            urgent: this.attr("urgent") === "true",
        })
        log.debug(`[${this.attr("name")}] fires: ${record}`)
        this.fire("interrupt-request", record)

        this._lastActivity = Date.now()
        this._schedule(this._nextDelay())
    }
}

A.define('m-timeout', MTimeout);
