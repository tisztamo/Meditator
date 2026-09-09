/** Owner-local comparison capacity and commit order. Not a public queue component. */

export const MAX_COMPARE_IN_FLIGHT = 32
export const DEFAULT_COMPARE_DEADLINE_MS = 2000

export class CompareBudget {
    constructor(limit = MAX_COMPARE_IN_FLIGHT) {
        this.limit = limit
        this.inFlight = 0
    }

    tryAcquire() {
        const cap = Number.isFinite(this.limit) ? this.limit : MAX_COMPARE_IN_FLIGHT
        if (this.inFlight >= cap) return false
        this.inFlight++
        return true
    }

    release() {
        if (this.inFlight > 0) this.inFlight--
    }
}

/** FIFO commit gate for one sensory source or one act's consequences. */
export class CommitOrder {
    constructor() {
        this._tail = Promise.resolve()
    }

    enqueue() {
        const previous = this._tail
        let release = () => {}
        const gate = new Promise(resolve => { release = resolve })
        this._tail = previous.then(() => gate, () => gate)
        let finished = false
        return {
            wait: () => previous,
            complete() {
                if (finished) return
                finished = true
                release()
            },
        }
    }
}

export function asEvaluations(result, Evaluation) {
    if (!Array.isArray(result)) return []
    return result.filter(item => item instanceof Evaluation)
}

export function compareDeadlineMs(host, fallback = DEFAULT_COMPARE_DEADLINE_MS) {
    if (Number.isFinite(host?._compareDeadlineOverride) && host._compareDeadlineOverride > 0) {
        return host._compareDeadlineOverride
    }
    return fallback
}

export function verdictsOf(evaluations) {
    return evaluations.map(item => item.verdict)
}

export function evaluationIdsOf(evaluations) {
    return evaluations.map(item => item.id)
}

/** Comparator may ignore AbortSignal; the owner still must not hang past abort. */
export function awaitUntilAbort(promise, signal) {
    const pending = Promise.resolve(promise)
    if (!signal) return pending.catch(() => [])
    if (signal.aborted) return Promise.resolve([])
    return new Promise(resolve => {
        let done = false
        const finish = value => {
            if (done) return
            done = true
            signal.removeEventListener('abort', onAbort)
            resolve(value)
        }
        const onAbort = () => finish([])
        signal.addEventListener('abort', onAbort, { once: true })
        pending.then(
            value => finish(Array.isArray(value) ? value : []),
            () => finish([]),
        )
    })
}
