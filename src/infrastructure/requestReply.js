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

export const REPLY_EVENT = "request-reply"

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
 * Collect replies to one request. Resolves when `expect` replies arrived or the
 * deadline passed: {status: "ok" | "timeout", requestId, replies}. `expect`
 * defaults to Infinity (collect until the deadline). Replies are
 * {status: "ok", data, from} or {status: "error", error, from}.
 */
export function requestAll(el, name, data, { expect = Infinity, deadline = DEFAULT_DEADLINE_MS, bubbles = true } = {}) {
    const requestId = newRequestId()
    const pending = pendingFor(el)
    return new Promise(resolve => {
        const replies = []
        let timer = null
        const settle = status => {
            if (!pending.has(requestId)) return
            pending.delete(requestId)
            if (timer) clearTimeout(timer)
            resolve({ status, requestId, replies })
        }
        pending.set(requestId, {
            onReply(reply) {
                replies.push({ status: reply.status, data: reply.data ?? null, error: reply.error, from: reply.from ?? null })
                if (replies.length >= expect) settle("ok")
            },
        })
        timer = setTimeout(() => settle(replies.length >= expect ? "ok" : "timeout"), Math.max(0, deadline))
        // An expectation of zero is already met; still send, so listeners hear it.
        send(el, name, requestDetail(data, requestId), bubbles)
        if (expect <= 0) settle("ok")
    })
}

/**
 * One request, the first reply wins: {status: "ok", data, from},
 * {status: "error", error, from}, or {status: "timeout"}.
 */
export async function request(el, name, data, { deadline = DEFAULT_DEADLINE_MS, bubbles = true } = {}) {
    const result = await requestAll(el, name, data, { expect: 1, deadline, bubbles })
    const first = result.replies[0]
    if (!first) return { status: "timeout", requestId: result.requestId }
    return { ...first, requestId: result.requestId }
}

/**
 * Answer requests named `name`. Without `src`, listens on `el` itself (a
 * bubbling request from a descendant). With `src`, subscribes through that ref
 * (e.g. "!scope/@sleep"), which must name an `@event`. With `on`, listens on that
 * element: an address found by lookup at connect (M4), such as a hand's
 * assembler, whose own non-bubbling requests the responder answers. Events of
 * the same name that carry no `requestId` are not requests and are ignored.
 * Returns the listener (or the subscription promise, with `src`).
 */
export function respond(el, name, handler, { src, on } = {}) {
    const listener = async event => {
        const detail = event?.detail
        if (!detail || typeof detail.requestId !== "string") return
        const target = event.target
        let reply
        try {
            const data = await handler(detail, event)
            if (data === undefined) return
            reply = { requestId: detail.requestId, status: "ok", data }
        } catch (error) {
            reply = { requestId: detail.requestId, status: "error", error: String(error?.message || error) }
        }
        reply.from = el.getAttribute?.("name") || el.localName || null
        target?.dispatchEvent(new CustomEvent(REPLY_EVENT, { detail: reply, bubbles: false }))
    }
    if (src) return el.sub(src, listener)
    ;(on || el).addEventListener(name, listener)
    return listener
}
