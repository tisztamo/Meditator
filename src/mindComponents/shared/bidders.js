// The bidder port as messages (doc/architecture/message-rule.md, review §7 step 8).
//
// An evidence owner (m-region for a sensed percept, m-act for an act's consequence)
// turns its percept and committed evaluations into an attention bid. With an
// owner-local bidder inside it (m-bid), the bidder chooses the weighting: the
// floors, the mismatch weight, the signal set. Before the message rule the owner
// looked the bidder up and called createBid() on it, reading an AttentionBid
// instance back. Now it asks:
//
//   bid {evidence, evaluations, gainTrail, requestedFloor}  →  {bid}   (bidData)
//
// The request is fired on the owner itself (bubbles: false). The bidder answers
// from a listener bound on its owner at connect (bidOwnerOf: the nearest aperture
// or hands, M4). The owner admits the answer only when it is a bid over the same
// percept id with the same powers, evaluation ids and signal set
// (bidderPolicy.admitBidderBid), and then issues it again over its OWN percept, so
// a bidder weighs the evidence but can never replace it. Invalid output is
// refused, as before. A bidder silent past the owner's `bidDeadline` (default 2 s)
// is refused too (M6): no default bid is substituted for a bound bidder.
//
// Authoring surface (unchanged): a bidder extends MBidder and writes
// createBid({evidence, evaluations, gainTrail, requestedFloor}), returning an
// AttentionBid. `evidence` is a Percept and `evaluations` are Evaluations, rebuilt
// from the request's data.

import { MBaseComponent } from "./mBaseComponent.js"
import { bidOwnerOf, part } from "./enclosure.js"
import { respond, responderName } from "../../infrastructure/requestReply.js"
import { sentByComponent } from "../../infrastructure/messageOrigin.js"
import { AttentionBid, bidData } from "../../infrastructure/attentionBid.js"
import { Percept, perceptData } from "../../infrastructure/percept.js"
import { admitBidderBid, issueOwnerBid } from "../../infrastructure/bidderPolicy.js"
import { evaluationData, evaluationsFrom } from "./comparators.js"
import { parseTime } from "../../config/timeParser.js"

export const BID_REQUEST = "bid"
export const DEFAULT_BID_DEADLINE_MS = 2000

export class MBidder extends MBaseComponent {
    static provides = { bidder: true }

    _owner = null

    onConnect() {
        super.onConnect()
        const owner = bidOwnerOf(this)
        this._owner = owner
        if (!owner) return
        this._onBid = respond(this, BID_REQUEST, (detail, event) => this._answerBid(detail, event), { on: owner })
    }

    onDisconnect() {
        if (this._owner && this._onBid) this._owner.removeEventListener(BID_REQUEST, this._onBid)
        this._owner = null
        this._onBid = null
    }

    /** The bid's wire form, or undefined (abstain) for a request that is not the
     *  owner's own. A throw is an error reply, which the owner refuses. */
    _answerBid(detail, event) {
        if (!this._owner || event.target !== this._owner || !sentByComponent(event)) return undefined
        const evidence = Percept.fromData(detail.evidence)
        const bid = this.createBid({
            evidence,
            evaluations: evaluationsFrom(detail.evaluations),
            gainTrail: Array.isArray(detail.gainTrail) ? detail.gainTrail : [],
            requestedFloor: detail.requestedFloor ?? 0,
        })
        if (!(bid instanceof AttentionBid)) throw new Error("createBid did not return an AttentionBid")
        return { bid: bidData(bid) }
    }
}

/**
 * The owner's side: its owner-local bidder as a NAME (M4), or null for none. More
 * than one is an authoring error and throws, as it always has. `label` names the
 * owner in the message.
 */
export function bidderOf(owner, label) {
    const found = part(owner, "bidder").filter(el => bidOwnerOf(el) === owner)
    if (found.length > 1) throw new Error(`${label} may have only one bidder`)
    return found[0] ? responderName(found[0]) : null
}

function bidDeadlineMs(owner) {
    const raw = owner.attr?.("bidDeadline")
    if (!raw) return DEFAULT_BID_DEADLINE_MS
    try {
        const ms = parseTime(raw)
        return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_BID_DEADLINE_MS
    } catch { return DEFAULT_BID_DEADLINE_MS }
}

/**
 * Issue the owner's bid on `evidence`. Without a bidder: the default bid, at once.
 * With one: ask it, and admit its answer. Resolves to {bid} or {refused: reason}
 * ("invalid-bidder" for an answer that is not admissible or an error,
 * "bidder-silent" past the deadline); never rejects.
 */
export async function issueBid(owner, { bidder, evidence, evaluations = [], gainTrail = [], requestedFloor = 0 }) {
    if (!bidder) {
        return { bid: issueOwnerBid({ evidence, evaluations, gainTrail, requestedFloor }) }
    }
    const reply = await owner.request(BID_REQUEST, {
        evidence: perceptData(evidence),
        evaluations: evaluations.map(evaluationData),
        gainTrail: gainTrail.map(entry => ({ gate: entry.gate, factor: entry.factor })),
        requestedFloor,
    }, { bubbles: false, deadline: bidDeadlineMs(owner) })
    if (reply.status === "timeout") return { refused: "bidder-silent" }
    if (reply.status !== "ok" || reply.from !== bidder) return { refused: "invalid-bidder" }
    let candidate
    try { candidate = AttentionBid.fromData(reply.data?.bid) } catch { return { refused: "invalid-bidder" } }
    const bid = admitBidderBid(candidate, { evidence, evaluations })
    return bid ? { bid } : { refused: "invalid-bidder" }
}
