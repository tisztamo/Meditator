// The mind's copy of its arbiter's queue (review §5: takePending → push).
//
// The global arbiter pushes `accepted {bid}` and `withdrawn {bidIds}`; the mind
// keeps this queue from those messages and drains it at a boundary, then fires
// `taken {bidIds}` so the arbiter clears its own. Two channels have no
// guaranteed order (M5), so a bid already withdrawn or taken is remembered and a
// late `accepted` for it is ignored rather than perceived twice.

const REMEMBER = 512

export class AttentionQueue {
    items = []
    _gone = new Set()

    /** Queue a bid (an AttentionBid). False when it is a duplicate or already gone. */
    accept(bid) {
        if (!bid?.id || this._gone.has(bid.id) || this.items.some(b => b.id === bid.id)) return false
        this.items.push(bid)
        return true
    }

    /** Drop these bids (crowded out by the arbiter, or taken elsewhere). */
    withdraw(ids) {
        if (!Array.isArray(ids) || !ids.length) return
        for (const id of ids) this._forget(id)
        const gone = new Set(ids)
        this.items = this.items.filter(b => !gone.has(b.id))
    }

    /** Every queued bid, oldest first; the queue is left empty. */
    take() {
        const taken = this.items.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        this.items = []
        for (const bid of taken) this._forget(bid.id)
        return taken
    }

    _forget(id) {
        this._gone.add(id)
        if (this._gone.size > REMEMBER) this._gone.delete(this._gone.values().next().value)
    }
}
