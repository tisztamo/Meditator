import { MBaseComponent } from "./mBaseComponent.js"
import { InterruptRecord } from "../infrastructure/interruptRecord.js"
import { parseTime } from "../config/timeParser.js"
import { langOf } from "./i18n.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mEar.js")

/**
 * m-ear — the ingress port of a mind: it overhears another mind in the same society and
 * raises what it hears as a stimulus on THIS mind's arbiter. The runtime form of an
 * inter-mind connection (doc/architecture/multi-mind.md).
 *
 * The membrane is thin and one-directional: a mind exposes its VOICE as a published
 * topic (m-speech `spoken {text, at}`), and a listening mind places an m-ear pointed at
 * it. The ear lives INSIDE the listener and only ever fires a local, bubbling
 * `interrupt-request` — so the link never reaches into a foreign interior; "intent up
 * the tree" stays intact, and a duplex channel is simply two ears.
 *
 * A peer utterance is experienced as a VOICE: framed "<who> says: …" (InterruptRecord
 * type "Peer" → renderForFrame), in the mind's own language. NON-urgent by default, so
 * it is collected at the next boundary (turn-taking) rather than preempting the running
 * burst the way a human voice does — set urgent="true" to let a peer break in.
 *
 * @interface
 * Attributes:
 *   - from: ref to the peer's egress topic, e.g. "..m-society/prover/voice/spoken". A
 *           society-relative ref addresses a member by its (unique) MIND name, so members
 *           may reuse component names ("voice"). "off" / empty makes the ear inert.
 *   - as: how the speaker is named in the framing (default "someone").
 *   - salience: the bid's salience, 0..1 (default 0.8).
 *   - urgent: "true" to preempt the running burst (default false — wait for the boundary).
 *   - cooldown: minimum time between raised stimuli, so a chatty peer can't bid every
 *               burst (default "0ms").
 *   - ignoreSelf: "true" to ignore messages whose `speaker` equals this mind's name
 *                 (for commons/gossip relays).
 *   - ignoreSpeaker: explicit speaker name to ignore.
 *
 * DOM events: fires "interrupt-request" (bubbling) on each fresh peer utterance.
 */
export class MEar extends MBaseComponent {
    onConnect() {
        this._from = this.attr("from")
        this._as = this.attr("as") || "someone"
        const salience = this.attr("salience")
        this._salience = salience == null || salience === "" ? 0.8 : Number(salience)
        this._urgent = this.attr("urgent") === "true"
        this._cooldownMs = parseTime(this.attr("cooldown") || "0ms")
        this._ignoreSpeaker = this.attr("ignoreSpeaker") || (
            this.attr("ignoreSelf") === "true" ? this.closest("m-mind")?.getAttribute("name") : null
        )
        this._lastAt = null
        this._lastHeardAt = 0
        if (!this._from || this._from === "off") {
            log.debug("m-ear has no `from` (inert).")
            return
        }
        // The peer's voice is a behaviour-value topic, so a late or re-subscribe replays
        // the last utterance — dedupe on `at` (the shape m-memory already uses for `spoken`).
        this.sub(this._from, msg => this._hear(msg), 12)
            .catch(err => log.debug(`m-ear could not bind ${this._from}: ${err?.message || err}`))
    }

    _hear(msg) {
        if (!msg) return
        const text = (typeof msg === "string" ? msg : msg.text) || ""
        const at = typeof msg === "string" ? null : msg.at
        const speaker = typeof msg === "string" ? null : (msg.as || msg.speaker || msg.from)
        if (this._ignoreSpeaker && speaker === this._ignoreSpeaker) return
        if (!text.trim()) return                       // an empty utterance is not a voice
        if (at != null && at === this._lastAt) return  // retained-replay / repeat guard
        this._lastAt = at
        const now = Date.now()
        if (this._cooldownMs && now - this._lastHeardAt < this._cooldownMs) return
        this._lastHeardAt = now

        this.fire("interrupt-request", new InterruptRecord({
            source: "Peer",
            type: "Peer",
            reason: text,
            from: speaker || this._as,
            lang: langOf(this),
            salience: this._salience,
            urgent: this._urgent,
        }))
        log.debug(`heard ${this._as}: ${text.slice(0, 60)}`)
    }
}
