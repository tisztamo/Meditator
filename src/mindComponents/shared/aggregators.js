// The aggregator port as messages (doc/architecture/message-rule.md, review §7 step 8).
//
// The mind's global arbiter lowers its threshold by the contact pressure of the
// membrane's top-level apertures, mixed into one number (the built-in mix is the
// mean). A child `aggregator` replaces that mix. Before the message rule the
// arbiter looked the aggregator up, checked it had an `aggregate` method and called
// it at every bid, over pressures it read off the aperture elements. Now:
//
//   - the arbiter holds each top-level aperture's pressure from its retained
//     `contactPressure` topic (subscribed by id, apertureRef), not from the element;
//   - when one changes it asks the aggregator (by name, M4):
//       aggregate {pressures: number[]}  →  {pressure}
//     and keeps the answer for its next bids;
//   - the aggregator announces `aggregator-up` when it connects, so an arbiter that
//     asked before the aggregator's tag was defined asks again.
//
// The request bubbles from the arbiter and is heard on the membrane, where the
// aggregator binds at connect; the membrane stops both events (a nested mind's
// arbiter must not reach its host's aggregator). An aggregator that has not
// answered yet, or stays silent past the deadline, leaves the built-in mean in
// force (M6). A non-finite answer fails closed at 0, as before.
//
// Authoring surface (unchanged): an aggregator extends MAggregator and writes
// aggregate(pressures) → number (or a Promise of it). A missing method throws at
// connect (`aggregator is missing aggregate`); a second aggregator in one mind
// throws at the arbiter's connect (`a mind may have only one aggregator`).

import { MBaseComponent } from "./mBaseComponent.js"
import { membraneOf, part } from "./enclosure.js"
import { respond, responderName } from "../../infrastructure/requestReply.js"
import { sentByComponent } from "../../infrastructure/messageOrigin.js"

export const AGGREGATE_REQUEST = "aggregate"
export const AGGREGATOR_UP = "aggregator-up"
export const DEFAULT_AGGREGATE_DEADLINE_MS = 2000

export class MAggregator extends MBaseComponent {
    static provides = { aggregator: true }

    _membrane = null

    onConnect() {
        super.onConnect()
        if (typeof this.aggregate !== "function") throw new Error("aggregator is missing aggregate")
        const mind = membraneOf(this)
        this._membrane = mind
        if (!mind) return
        this._onAggregate = respond(this, AGGREGATE_REQUEST, (detail, event) => this._answer(detail, event), { on: mind })
        this.fire(AGGREGATOR_UP, {})
    }

    onDisconnect() {
        if (this._membrane && this._onAggregate) this._membrane.removeEventListener(AGGREGATE_REQUEST, this._onAggregate)
        this._membrane = null
        this._onAggregate = null
    }

    async _answer(detail, event) {
        if (!this._membrane || !sentByComponent(event) || membraneOf(event.target) !== this._membrane) return undefined
        const pressures = Array.isArray(detail.pressures) ? detail.pressures.map(Number) : []
        return { pressure: Number(await this.aggregate(pressures)) }
    }
}

/** The membrane's aggregator as a NAME (M4), or null. More than one throws. */
export function aggregatorOf(mind) {
    if (!mind) return null
    const found = part(mind, "aggregator")
    if (found.length > 1) throw new Error("a mind may have only one aggregator")
    return found[0] ? responderName(found[0]) : null
}

/** Ask `name` to mix `pressures`. Resolves to the answer as a number (the caller
 *  clamps it; a non-finite one fails closed), or null for silence, an error or an
 *  answer from anyone else; never rejects. */
export async function askAggregate(el, name, pressures, { deadline = DEFAULT_AGGREGATE_DEADLINE_MS } = {}) {
    const reply = await el.request(AGGREGATE_REQUEST, { pressures: [...pressures] }, { deadline })
    if (reply.status !== "ok" || reply.from !== name) return null
    return Number(reply.data?.pressure)
}
