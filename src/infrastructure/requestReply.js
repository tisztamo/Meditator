// The request/reply seam of the message rule (doc/architecture/message-rule.md,
// M1–M6). A request is a fired event carrying a `requestId`; a reply is a
// non-bubbling `request-reply` event dispatched on the requesting element.
// Everything crossing is plain data (M2), nothing is read back from the request
// event itself (M3), and every wait has a deadline (M6): a missing reply
// resolves to {status: "timeout"}, it never rejects and never hangs.
//
// Routing. Events only bubble up, so a responder hears a request either as an
// ancestor (it listens on itself for the bubbling event) or by subscribing to
// the requester's event through a ref (`!scope/@sleep` — the membrane asking its
// own parts). Either way the reply goes to `event.target`. That reach to the
// target is the one place the M4 line is crossed, and it lives here, in
// infrastructure, not in component code: if the transport changes, only this
// module changes. It is also the shape Amanita's worker proxies forward (the
// element stays on the host).
//
// Responder contract: the handler gets the request's detail (its data plus
// `requestId`) and returns the reply data, or a Promise of it. Returning
// `undefined` abstains — no reply is sent (a gate that does not cover this
// percept). A throw becomes {status: "error", error: message}.
//
// Cancellation. A requester that no longer wants the answer (sleep, a deadline of
// its own, a disconnect) passes `signal`: when it aborts, the request settles as
// {status: "cancelled"} and a `request-cancel {requestId}` is fired from the
// requester on the request's own path, so it reaches the same responders. A
// responder bound on an element (itself or `on`) gets it as the `signal` in its
// handler's third argument; one bound through `src` does not hear cancels. A
// cancel may overtake its request under reordering delivery (M5), so a responder
// remembers the last few cancelled ids and starts such a request already aborted.

export const REPLY_EVENT = "request-reply"
export const CANCEL_EVENT = "request-cancel"

const DEFAULT_DEADLINE_MS = 5000
const PREFIX = Math.random().toString(36).slice(2, 8)
let seq = 0

// requester element → Map(requestId → pending entry)
const pendingByEl = new WeakMap()

export function newRequestId() {
    return `rq-${PREFIX}-${++seq}`
}

function pendingFor(el) {
    let pending = pendingByEl.get(el)
    if (pending) return pending
    pending = new Map()
    pendingByEl.set(el, pending)
    el.addEventListener(REPLY_EVENT, event => {
        const reply = event.detail
        if (!reply || typeof reply.requestId !== "string") return
        pending.get(reply.requestId)?.onReply(reply)
    })
    return pending
}

function send(el, name, detail, bubbles) {
    if (typeof el.fire === "function") el.fire(name, detail, { bubbles })
    else el.dispatchEvent(new CustomEvent(name, { detail, bubbles }))
}

function requestDetail(data, requestId) {
    if (data != null && (typeof data !== "object" || Array.isArray(data))) {
        throw new TypeError("request data must be a plain object (wrap arrays: {lines: [...]})")
    }
    return { ...(data || {}), requestId }
}

/**
 * Collect replies to one request. Resolves when `expect` replies arrived, when
 * `until(replies)` holds, or when the deadline passed: {status: "ok" |
 * "timeout" | "cancelled", requestId, replies} ("cancelled": `signal` aborted
 * first; see the module comment). `expect` defaults to Infinity (collect until
 * the deadline). `until` is the quorum for a known roster of responders, which
 * a count cannot express (every named gate answered, or one refused). Replies
 * are {status: "ok", data, from} or {status: "error", error, from}.
 */
export function requestAll(el, name, data, { expect = Infinity, until = null, deadline = DEFAULT_DEADLINE_MS, bubbles = true, signal = null } = {}) {
    const requestId = newRequestId()
    const pending = pendingFor(el)
    return new Promise(resolve => {
        const replies = []
        let timer = null
        const onAbort = () => {
            if (!pending.has(requestId)) return
            settle("cancelled")
            send(el, CANCEL_EVENT, { requestId }, bubbles)
        }
        const settle = status => {
            if (!pending.has(requestId)) return
            pending.delete(requestId)
            if (timer) clearTimeout(timer)
            signal?.removeEventListener?.("abort", onAbort)
            resolve({ status, requestId, replies })
        }
        pending.set(requestId, {
            onReply(reply) {
                replies.push({ status: reply.status, data: reply.data ?? null, error: reply.error, from: reply.from ?? null })
                if (met()) settle("ok")
            },
        })
        const met = () => replies.length >= expect || (typeof until === "function" && !!until(replies))
        timer = setTimeout(() => settle(met() ? "ok" : "timeout"), Math.max(0, deadline))
        if (signal?.aborted) {
            // Never asked: nothing to cancel on the path.
            settle("cancelled")
            return
        }
        signal?.addEventListener?.("abort", onAbort, { once: true })
        // An expectation already met (zero, an empty roster) still sends, so listeners hear it.
        send(el, name, requestDetail(data, requestId), bubbles)
        if (met()) settle("ok")
    })
}

/**
 * One request, the first reply wins: {status: "ok", data, from},
 * {status: "error", error, from}, {status: "timeout"}, or {status: "cancelled"}
 * when `signal` aborted first.
 */
export async function request(el, name, data, { deadline = DEFAULT_DEADLINE_MS, bubbles = true, signal = null } = {}) {
    const result = await requestAll(el, name, data, { expect: 1, deadline, bubbles, signal })
    const first = result.replies[0]
    if (!first) return { status: result.status === "cancelled" ? "cancelled" : "timeout", requestId: result.requestId }
    return { ...first, requestId: result.requestId }
}

// Listening element → {live: Map(requestId → AbortController), cancelled: ids seen
// before their request}. One `request-cancel` listener per element, shared by
// every responder bound there.
const CANCELLED_MEMORY = 64
const cancelsByEl = new WeakMap()

function cancelsFor(el) {
    let entry = cancelsByEl.get(el)
    if (entry) return entry
    entry = { live: new Map(), cancelled: [] }
    cancelsByEl.set(el, entry)
    el.addEventListener(CANCEL_EVENT, event => {
        const id = event?.detail?.requestId
        if (typeof id !== "string") return
        const controllers = entry.live.get(id)
        if (controllers) {
            for (const c of controllers) c.abort()
            return
        }
        entry.cancelled.push(id)
        if (entry.cancelled.length > CANCELLED_MEMORY) entry.cancelled.shift()
    })
    return entry
}

function watchCancel(entry, requestId) {
    const controller = new AbortController()
    const i = entry.cancelled.indexOf(requestId)
    if (i >= 0) {
        entry.cancelled.splice(i, 1)
        controller.abort()
    }
    let set = entry.live.get(requestId)
    if (!set) entry.live.set(requestId, set = new Set())
    set.add(controller)
    const done = () => {
        set.delete(controller)
        if (!set.size) entry.live.delete(requestId)
    }
    return { signal: controller.signal, done }
}

/**
 * Answer requests named `name`. Without `src`, listens on `el` itself (a
 * bubbling request from a descendant). With `src`, subscribes through that ref
 * (e.g. "!scope/@sleep"), which must name an `@event`. With `on`, listens on that
 * element: an address found by lookup at connect (M4), such as a hand's
 * assembler, whose own non-bubbling requests the responder answers. Events of
 * the same name that carry no `requestId` are not requests and are ignored.
 * The handler's third argument is `{signal}`, aborted when the requester cancels
 * (never with `src`: see the module comment).
 * Returns the listener (or the subscription promise, with `src`).
 */
export function respond(el, name, handler, { src, on } = {}) {
    const cancels = src ? null : cancelsFor(on || el)
    const listener = async event => {
        const detail = event?.detail
        if (!detail || typeof detail.requestId !== "string") return
        const target = event.target
        const watch = cancels ? watchCancel(cancels, detail.requestId) : null
        let reply
        try {
            const data = await handler(detail, event, { signal: watch?.signal ?? null })
            if (data === undefined) return
            reply = { requestId: detail.requestId, status: "ok", data }
        } catch (error) {
            reply = { requestId: detail.requestId, status: "error", error: String(error?.message || error) }
        } finally {
            watch?.done()
        }
        reply.from = responderName(el)
        target?.dispatchEvent(new CustomEvent(REPLY_EVENT, { detail: reply, bubbles: false }))
    }
    if (src) return el.sub(src, listener)
    ;(on || el).addEventListener(name, listener)
    return listener
}

/** The name a responder's replies carry as `from`: its `name` attribute, else its tag. */
export function responderName(el) {
    return el?.getAttribute?.("name") || el?.localName || null
}

/**
 * An `until` for a known roster of responders (their responderName()s): met when
 * every one has replied (a name listed twice needs two replies), or as soon as
 * one reply satisfies `decides` (a refusal that settles the question anyway).
 * Replies from outside the roster count only through `decides`.
 */
export function rosterAnswered(names, decides = null) {
    return replies => {
        if (decides && replies.some(decides)) return true
        const left = new Map()
        for (const n of names) left.set(n, (left.get(n) || 0) + 1)
        for (const r of replies) {
            if (left.get(r.from) > 0) left.set(r.from, left.get(r.from) - 1)
        }
        return [...left.values()].every(v => v === 0)
    }
}
