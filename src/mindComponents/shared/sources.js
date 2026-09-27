// A source and its aperture as messages (doc/architecture/message-rule.md, review
// §7 step 8, seventh part).
//
// Before the message rule a sense announced itself with an `aperture-register`
// carrying its `sample` callback, and its candidate() looked up the enclosing
// aperture and called `region.registerSource(this, …)` for an `offer` closure that
// held the materializer. Now the three steps are messages between the source and
// its nearest aperture:
//
//   aperture-register {}                            (bubbling, the nearest aperture stops it)
//   sample {source, request: ControlRequest fields} → {offers, failed?}
//   offer {offerId, controlId, header}              → {bid: bidData | null}
//   materialize {source, offerId, rendition}        → {text}
//
// `sample` and `materialize` are fired on the aperture itself (bubbles: false); the
// source answers from listeners bound on its aperture at connect (M4: the nearest
// enclosing aperture, found once), and only when the request names it. `offer` is
// fired by the source and bubbles to the nearest aperture, which answers it and
// stops it (the membrane stops it too). The materializer stays with the source: the
// offer carries an `offerId`, and the aperture asks for the text by that id only
// after acquisition is permitted. An offer id is used once.
//
// Lineage. A source may name the control request it is answering (`controlId`,
// the top of its own stack of samples in flight, as the region's stack was
// before), but lineage comes only from a control the aperture itself armed for
// that source: an id it never sent is ignored, and an actId never rides the
// header. The `sample` reply counts the offers the source sent under that control,
// so the aperture forgets the control once it heard them all, whatever order the
// messages arrive in (M5).
//
// Deadlines (M6): an aperture waits `sampleDeadline` (default 30 s) for a sample
// and `materializeDeadline` (default 10 s) for text; a silent source rendered
// nothing (a materialization failure). A source waits `offerDeadline` (default
// 60 s, the whole offer path: gates, comparison, bidding) for its offer's answer.
//
// The region's registerSource(element, sample) stays the test/demo door: a source
// registered with a callback is sampled by call, as before.

import { randomUUID } from "node:crypto"
import { respond } from "../../infrastructure/requestReply.js"
import { sentByComponent } from "../../infrastructure/messageOrigin.js"
import { AttentionBid, isBidData } from "../../infrastructure/attentionBid.js"
import { ControlRequest, RenditionRequest } from "../../infrastructure/perceptionContracts.js"
import { parseTime } from "../../config/timeParser.js"
import { logger } from "../../infrastructure/logger.js"

const log = logger("sources.js")

export const SAMPLE_REQUEST = "sample"
export const OFFER_REQUEST = "offer"
export const MATERIALIZE_REQUEST = "materialize"
export const SOURCE_REQUESTS = [SAMPLE_REQUEST, OFFER_REQUEST, MATERIALIZE_REQUEST]

export const DEFAULT_SAMPLE_DEADLINE_MS = 30_000
export const DEFAULT_MATERIALIZE_DEADLINE_MS = 10_000
export const DEFAULT_OFFER_DEADLINE_MS = 60_000

/** A deadline attribute of `el` in ms, else `fallback`. */
export function deadlineAttr(el, name, fallback) {
    const raw = el.attr?.(name) ?? el.getAttribute?.(name)
    if (!raw) return fallback
    try {
        const ms = parseTime(raw)
        return Number.isFinite(ms) && ms > 0 ? ms : fallback
    } catch { return fallback }
}

/** A source's name, as its contract records it (SourceContract.fromElement). */
export function sourceNameOf(el) {
    return el?.getAttribute?.("name") || el?.localName || null
}

/** A candidate header's plain fields: what the aperture builds its candidate from. */
function headerFields(header = {}) {
    const out = {}
    if (Number.isFinite(header.changeMagnitude)) out.changeMagnitude = header.changeMagnitude
    if (header.changeKey != null) out.changeKey = String(header.changeKey)
    if (Number.isFinite(header.occurredAt)) out.occurredAt = header.occurredAt
    if (typeof header.requestId === "string" && header.requestId) out.requestId = header.requestId
    return out
}

/**
 * The source's side: responders bound on its aperture, the samples in flight, and
 * the materializers of its open offers. `source.onSense(request)` is what a sample
 * runs. Owned by the source (plain state, one heap); close() unbinds.
 */
export class SourcePort {
    constructor(source, aperture) {
        this.source = source
        this.aperture = aperture
        this._controls = []           // samples in flight: [{id, offers}]
        this._offers = new Map()      // offerId → materializer
        this._onSample = respond(source, SAMPLE_REQUEST, (d, e) => this._sample(d, e), { on: aperture })
        this._onMaterialize = respond(source, MATERIALIZE_REQUEST, (d, e) => this._materialize(d, e), { on: aperture })
    }

    close() {
        this.aperture.removeEventListener(SAMPLE_REQUEST, this._onSample)
        this.aperture.removeEventListener(MATERIALIZE_REQUEST, this._onMaterialize)
        this._offers.clear()
        this._controls = []
    }

    _mine(detail, event) {
        return event?.target === this.aperture && sentByComponent(event)
            && detail?.source === sourceNameOf(this.source)
    }

    async _sample(detail, event) {
        if (!this._mine(detail, event)) return undefined
        let request
        try { request = new ControlRequest(detail.request) } catch { return { offers: 0, failed: true } }
        const control = { id: request.id, offers: 0 }
        this._controls.push(control)
        let failed = false
        try {
            await this.source.onSense(request)
        } catch (error) {
            failed = true
            log.debug(`[${sourceNameOf(this.source)}] sample quiet (${error?.message || error})`)
        } finally {
            const i = this._controls.lastIndexOf(control)
            if (i >= 0) this._controls.splice(i, 1)
        }
        return failed ? { offers: control.offers, failed } : { offers: control.offers }
    }

    async _materialize(detail, event) {
        if (!this._mine(detail, event)) return undefined
        const materialize = this._offers.get(detail.offerId)
        if (!materialize) return undefined
        this._offers.delete(detail.offerId)
        const rendition = new RenditionRequest(detail.rendition || {})
        const text = await materialize(rendition.kinds, rendition)
        return { text: typeof text === "string" ? text : null }
    }

    /** Offer a candidate to the aperture. Resolves to the issued AttentionBid, or
     *  null (refused, dropped, or no answer by `offerDeadline`); rejects when the
     *  aperture refused to register this source. */
    offer(header, materialize) {
        if (typeof materialize !== "function") throw new Error("A candidate needs a lazy materializer")
        const offerId = randomUUID()
        const control = this._controls[this._controls.length - 1] ?? null
        if (control) control.offers += 1
        this._offers.set(offerId, materialize)
        const data = { offerId, controlId: control?.id ?? null, header: headerFields(header) }
        return this.source.request(OFFER_REQUEST, data, {
            deadline: deadlineAttr(this.source, "offerDeadline", DEFAULT_OFFER_DEADLINE_MS),
        }).then(reply => {
            if (reply.status === "error") throw new Error(reply.error)
            const bid = reply.status === "ok" ? reply.data?.bid : null
            return isBidData(bid) ? AttentionBid.fromData(bid) : null
        }).finally(() => this._offers.delete(offerId))
    }
}

/** The aperture asks `source` to sample for `request` (a ControlRequest). Resolves
 *  to how many offers the source sent under it (0 when it did not answer). */
export async function askSample(region, source, request) {
    const reply = await region.request(SAMPLE_REQUEST, { source, request: JSON.parse(JSON.stringify(request)) },
        { bubbles: false, deadline: deadlineAttr(region, "sampleDeadline", DEFAULT_SAMPLE_DEADLINE_MS) })
    if (reply.status !== "ok" || reply.from !== source) return 0
    return Number.isInteger(reply.data?.offers) && reply.data.offers > 0 ? reply.data.offers : 0
}

/** The aperture asks `source` for the text of its offer `offerId`. Throws when the
 *  source did not render (a materialization failure). */
export async function askMaterialize(region, source, offerId, rendition) {
    const reply = await region.request(MATERIALIZE_REQUEST,
        { source, offerId, rendition: JSON.parse(JSON.stringify(rendition)) },
        { bubbles: false, deadline: deadlineAttr(region, "materializeDeadline", DEFAULT_MATERIALIZE_DEADLINE_MS) })
    if (reply.status !== "ok" || reply.from !== source) throw new Error("materialize: no text")
    return reply.data?.text
}
