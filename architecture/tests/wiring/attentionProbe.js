// What an arbiter admitted, observed through its messages (review §5: takePending
// → push). Tests used to pull the arbiter's queue; the global arbiter now
// pushes `accepted {bid}` / `withdrawn {bidIds}` and hears `taken {bidIds}` on its
// membrane. This probe records those per arbiter, the way m-mind does, and drains
// with the same `taken` message, so the arbiter (and a real mind's own queue)
// clear exactly as they would after a frame.
//
// Installed once, capturing on the document, so it sees every arbiter from the
// moment the module is imported. In sync delivery the record is complete when the
// offer returns; under chaos, await delivery first.
import { AttentionQueue } from "../../../src/infrastructure/attentionQueue.js";
import { AttentionBid, isBidData } from "../../../src/infrastructure/attentionBid.js";
import { sentByComponent } from "../../../src/infrastructure/messageOrigin.js";

const queues = new WeakMap();
const queueOf = arbiter => {
    let q = queues.get(arbiter);
    if (!q) queues.set(arbiter, q = new AttentionQueue());
    return q;
};

if (!globalThis.__attentionProbe) {
    globalThis.__attentionProbe = true;
    document.addEventListener("accepted", e => {
        const data = e.detail?.bid;
        if (data) queueOf(e.target).accept(AttentionBid.from(data, { trusted: true }));
    }, true);
    document.addEventListener("withdrawn", e => queueOf(e.target).withdraw(e.detail?.bidIds), true);
    // A real mind drained its own queue: those bids are gone for every observer.
    document.addEventListener("taken", e => {
        const ids = e.detail?.bidIds;
        for (const el of document.querySelectorAll("*")) queues.get(el)?.withdraw(ids);
    }, true);
}

/** The bids `arbiter` admitted and nobody has taken yet, oldest first, without draining. */
export function acceptedBy(arbiter) {
    return [...queueOf(arbiter).items].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
}

/** Drain what `arbiter` admitted, oldest first, and tell it (and its mind) they were taken. */
export function takeAccepted(arbiter) {
    const taken = queueOf(arbiter).take();
    if (taken.length) {
        const host = arbiter.membrane?.() || document;
        host.dispatchEvent(new CustomEvent("taken", { detail: { bidIds: taken.map(b => b.id) }, bubbles: false }));
    }
    return taken;
}

export const bidIds = list => list.map(b => b?.id);

/** The bid an arbiter would build from an `interrupt-request` event: a bid's wire
 *  form rebuilt with its sender's trust (messageOrigin.js), else null. */
export function heardBid(e) {
    return isBidData(e?.detail) ? AttentionBid.from(e.detail, { trusted: sentByComponent(e) }) : null;
}
