// Who sent a message — the one notion of trust that survives a process boundary
// (doc/architecture/message-rule.md, "Authority comes from the sender").
//
// Before the message rule, a stimulus kept its architecture-owned powers
// (`urgent`, `clearsTail`, act lineage, `progress`) when it was an in-process
// `InterruptRecord` instance, and lost them when it was a plain object. A JSON
// wire strips every prototype, so that test cannot cross a boundary: every
// payload arrives plain. What does cross is where the event was dispatched. Under
// Amanita's worker model the element stays on the host as a proxy, so the
// receiver still sees the dispatching element.
//
// So the receiver asks whether a registered component sent the message. A raw
// `dispatchEvent` from a plain node (a test's `<span>`, `document.body`) is not
// one, and its claims are stripped as a coerced payload's were before. A
// component that spreads world data into a stimulus is accountable for what it
// claims, as it was when it built an `InterruptRecord` from that data.
//
// Two components dispatch on an element that is not themselves: m-region issues
// a bid on its source (so the bid bubbles from the source's place, through any
// faculty between), and a nested arbiter promotes on its region's parent (off
// its own listen path). Those go through dispatchOnBehalf(), which marks the
// event as component-sent. That is a reach (review §2.5), and the mark is its
// stopgap: a transport that forwards such a dispatch must forward the mark.

/** Whether `el` is an upgraded custom element, i.e. a component (Amanita or MBaseComponent). */
export function isComponentElement(el) {
    const name = el?.localName
    if (typeof name !== "string" || !name.includes("-")) return false
    const ctor = globalThis.customElements?.get(name)
    return !!ctor && el instanceof ctor
}

/** Whether a component sent the event: it is the target, or it dispatched on behalf of one. */
export function sentByComponent(event) {
    return isComponentElement(event?.target) || onBehalf.has(event)
}

const onBehalf = new WeakSet()

/** Dispatch `name` on `el` for a component that is not `el` (see above). */
export function dispatchOnBehalf(el, name, detail, { bubbles = true } = {}) {
    const event = new CustomEvent(name, { detail, bubbles })
    onBehalf.add(event)
    return el.dispatchEvent(event)
}

/** A transport re-dispatching `from` as `to` keeps its origin (deliveryChaos). */
export function carryOrigin(from, to) {
    if (onBehalf.has(from)) onBehalf.add(to)
}
