// Controllers and apertures as messages (doc/architecture/message-rule.md,
// review §7 step 8): m-orient and m-search asking the membrane's apertures.
//
// Before the message rule a controller walked the membrane for an aperture element
// and called requestOrientation() / requestControl() / contractFor() /
// sourceNames() on it, and m-orient called start() on the search controller. Now
// each is a request addressed by NAME (M4), fired from the controller and heard
// on the membrane:
//
//   orient {request: OrientationRequest fields}     → {accepted}
//   control {aperture, request: ControlRequest fields} → {delivered}
//   aperture-contract {aperture, source}             → {contract | null}
//   aperture-sources {}                              → {aperture, sources}
//   search-start {template, routes, actId}           → {targetId}
//
// Every aperture binds on its membrane at connect and answers only what names it
// (`aperture` / `request.aperture`), and only a component's request. Aperture
// names are unique within a membrane (asserted at bind), so at most one answers.
// `aperture-sources` is asked of every aperture with a roster (requestAll). The
// membrane stops all five: they are addressed inside it, and `search-start`
// carries the search template.
//
// What stays a method: the region's requestOrientation / requestControl /
// contractFor are the implementation the responder runs (tests still drive and
// stub them). Inside one aperture tree a parent forwards to its child apertures
// with these same requests, by the child's name.

import { respond, responderName, rosterAnswered } from "../../infrastructure/requestReply.js"
import { sentByComponent } from "../../infrastructure/messageOrigin.js"
import { part } from "./enclosure.js"

export const ORIENT_REQUEST = "orient"
export const CONTROL_REQUEST = "control"
export const CONTRACT_REQUEST = "aperture-contract"
export const SOURCES_REQUEST = "aperture-sources"
export const SEARCH_START_REQUEST = "search-start"
export const APERTURE_REQUESTS = [ORIENT_REQUEST, CONTROL_REQUEST, CONTRACT_REQUEST, SOURCES_REQUEST, SEARCH_START_REQUEST]

const DEFAULT_DEADLINE_MS = 2000

/** The names of every aperture in `mind`, nested ones included, in tree order:
 *  addresses, not handles (M4). */
export function apertureNames(mind) {
    if (!mind) return []
    const names = []
    const walk = node => {
        for (const el of part(node, "aperture")) {
            names.push(el.getAttribute("name") || el.localName)
            walk(el)
        }
    }
    walk(mind)
    return names
}

/**
 * A ref to a topic of the aperture whose id (gateIdOf: `name`, else the tag) is
 * `id`: an address to subscribe to (M4), never a handle. `scope` prefixes it
 * ("!scope" from anywhere in the membrane); without one it resolves inside the
 * subscriber (a parent aperture subscribing to a child). A nameless aperture is
 * matched by tag. Ids are unique among a membrane's apertures.
 */
export function apertureRef(id, topic, { scope = null } = {}) {
    const byName = `[provides~="aperture"][name=${JSON.stringify(String(id))}]`
    const byTag = /^[a-z][a-z0-9-]*$/.test(id) ? `, ${id}[provides~="aperture"]:not([name])` : ""
    return `${scope ? `${scope}/` : ""}${byName}${byTag}/${topic}`
}

/** A request's plain fields, for any of the frozen request records. */
export function requestFields(record) {
    return record ? JSON.parse(JSON.stringify(record)) : null
}

/** Ask the aperture `request.aperture` to orient. Resolves to whether it did. */
export async function askOrientation(el, request, { deadline = DEFAULT_DEADLINE_MS } = {}) {
    if (!apertureNames(el.membrane()).includes(request.aperture)) return false
    const reply = await el.request(ORIENT_REQUEST, { request: requestFields(request) }, { deadline })
    return reply.status === "ok" && reply.from === request.aperture && reply.data?.accepted === true
}

/** Deliver `request` (a ControlRequest) through the aperture named `aperture`.
 *  Resolves to whether any source was asked. */
export async function askControl(el, aperture, request, { deadline = DEFAULT_DEADLINE_MS } = {}) {
    if (!apertureNames(el.membrane()).includes(aperture)) return false
    const reply = await el.request(CONTROL_REQUEST, { aperture, request: requestFields(request) }, { deadline })
    return reply.status === "ok" && reply.from === aperture && reply.data?.delivered === true
}

/** The frozen contract of `source` on the aperture named `aperture`, as data, or null. */
export async function askContract(el, aperture, source, { deadline = DEFAULT_DEADLINE_MS } = {}) {
    if (!apertureNames(el.membrane()).includes(aperture)) return null
    const reply = await el.request(CONTRACT_REQUEST, { aperture, source }, { deadline })
    if (reply.status !== "ok" || reply.from !== aperture) return null
    return reply.data?.contract ?? null
}

/** The registered source names of each aperture in the membrane: a Map name →
 *  [source names]. An aperture that does not answer by the deadline is missing. */
export async function askSources(el, { deadline = DEFAULT_DEADLINE_MS } = {}) {
    const names = apertureNames(el.membrane())
    const out = new Map()
    if (!names.length) return out
    const { replies } = await el.requestAll(SOURCES_REQUEST, {}, { until: rosterAnswered(names), deadline })
    for (const reply of replies) {
        if (reply.status !== "ok" || !names.includes(reply.from) || out.has(reply.from)) continue
        out.set(reply.from, Array.isArray(reply.data?.sources) ? reply.data.sources.filter(n => typeof n === "string" && n) : [])
    }
    return out
}

/**
 * The aperture's side: bind the responders on its membrane. `region` supplies the
 * implementation (requestOrientation, requestControl, contractFor, sourceNames)
 * and its name. Returns an unbind function.
 */
export function serveApertureRequests(region, mind) {
    if (!mind) return () => {}
    const mine = () => region.getAttribute("name") || region.localName
    const fromComponent = event => sentByComponent(event)
    const bound = [
        [ORIENT_REQUEST, respond(region, ORIENT_REQUEST, async (d, e) => {
            if (!fromComponent(e) || d?.request?.aperture !== mine()) return undefined
            // A substituted regulator answers by message: the orientation is a Promise.
            return { accepted: (await region._orientFromRequest(d.request)) === true }
        }, { on: mind })],
        [CONTROL_REQUEST, respond(region, CONTROL_REQUEST, async (d, e) => {
            if (!fromComponent(e) || d?.aperture !== mine()) return undefined
            // Forwarding to child apertures is itself asked: the delivery is a Promise.
            return { delivered: (await region._controlFromRequest(d.request)) === true }
        }, { on: mind })],
        [CONTRACT_REQUEST, respond(region, CONTRACT_REQUEST, (d, e) => {
            if (!fromComponent(e) || d?.aperture !== mine()) return undefined
            const contract = region.contractFor(d.source)
            return { contract: contract ? { ...contract, powers: { ...contract.powers } } : null }
        }, { on: mind })],
        [SOURCES_REQUEST, respond(region, SOURCES_REQUEST, (d, e) => {
            if (!fromComponent(e) || !region.aperture) return undefined
            return { aperture: mine(), sources: region.sourceNames() }
        }, { on: mind })],
    ]
    return () => {
        for (const [name, listener] of bound) mind.removeEventListener(name, listener)
    }
}

/** The search controller's side of `search-start`: bind on its membrane. */
export function serveSearchStart(search, mind, start) {
    if (!mind) return () => {}
    const listener = respond(search, SEARCH_START_REQUEST, (d, e) => {
        if (!sentByComponent(e)) return undefined
        return { targetId: start(d) }
    }, { on: mind })
    return () => mind.removeEventListener(SEARCH_START_REQUEST, listener)
}

/** Ask the membrane's search controller to start looking. Resolves to the target
 *  id, or null when there is no controller or it did not start. */
export async function askSearchStart(el, { template, routes, actId = null }, { deadline = DEFAULT_DEADLINE_MS } = {}) {
    const mind = el.membrane()
    const search = mind ? part(mind, "search")[0] : null
    if (!search) return null
    const reply = await el.request(SEARCH_START_REQUEST, { template, routes, actId }, { deadline })
    if (reply.status !== "ok" || reply.from !== responderName(search)) return null
    return typeof reply.data?.targetId === "string" ? reply.data.targetId : null
}
