// Hands as messages (doc/architecture/message-rule.md, review §5 row "capability").
//
// A HAND offers itself to its ASSEMBLER (m-act for a mind, m-agent for an agent) as
// plain data: {name, description, parameters, felt, readonly, …, offerId}. Its code
// never crosses — the assembler invokes it with `request("call", {hand, offerId,
// args, ctx})` fired on itself, and the hand answers from a listener it bound on its
// assembler at connect. The reply is whatever the hand's execute() returned
// ({experience, salience, data, …}, plain data); a throw is an error reply. So the
// hand could run anywhere the call and its reply can travel.
//
// Addressing (M4). A hand finds its assembler once, at connect, by role: the
// nearest `hands` provider above it (`enclosing("hands")`), or an explicit `to`
// for a hand that sits beside its assembler (m-facts). That lookup yields the
// address the hand listens on; nothing on it is called. The offer bubbles up from
// the hand when the assembler is an ancestor (the nearest assembler claims it);
// only the sibling case is delivered straight to the assembler, like a reply is.
//
// Idempotent re-offer. An offer carries an `offerId` stable for that hand's name. A
// second offer with the same id REPLACES the entry (m-orient's aperture enum after
// a late aperture), one with the same name but another id is a duplicate and is
// ignored. An assembler coming up after its hands (upgrade order, a sibling) fires
// `capability-wanted` on itself, and every hand bound there offers again.
//
// Deadline (M6). A call waits at most `deadline` ms (the offer's, else the
// assembler's `callDeadline`, else 30 min — an agent hand runs a whole sub-loop). A
// hand that never answers is a slip: the assembler's execute() throws, exactly as a
// hand that threw.

import { respond } from "../../infrastructure/requestReply.js"

export const OFFER_EVENT = "capability"
export const CALL_EVENT = "call"
export const SOLICIT_EVENT = "capability-wanted"
export const DEFAULT_CALL_DEADLINE_MS = 30 * 60_000

// The plain fields an offer may carry. Anything else (execute, infoton) stays behind.
const OFFER_FIELDS = [
    "name", "description", "parameters", "felt", "readonly", "predictionTarget", "lane",
    "cooldown", "intentThreshold", "acceptsTemplate", "consequenceType", "deadline",
]

const KEY_PREFIX = Math.random().toString(36).slice(2, 8)
let keySeq = 0

// ------------------------------------------------------------------ hand side

// hand element → { key, specs: Map(name → {offer, execute, asm}), bound: Map(asm → listeners) }
const handState = new WeakMap()

function stateOf(el) {
    let state = handState.get(el)
    if (!state) {
        state = { key: `h-${KEY_PREFIX}-${++keySeq}`, specs: new Map(), bound: new Map() }
        handState.set(el, state)
    }
    return state
}

/** The plain-data projection of a spec: the fields an assembler reads, nothing callable. */
export function offerOf(spec, offerId) {
    const offer = {}
    for (const field of OFFER_FIELDS) {
        if (spec[field] !== undefined) offer[field] = spec[field]
    }
    offer.offerId = offerId
    return offer
}

function deliver(el, asm, offer) {
    const detail = { ...offer }
    if (asm.contains(el) && asm !== el) {
        if (typeof el.fire === "function") el.fire(OFFER_EVENT, detail)
        else el.dispatchEvent(new CustomEvent(OFFER_EVENT, { detail, bubbles: true }))
    } else {
        // A hand beside its assembler: no bubbling path reaches it. Delivered to the
        // address, the same reach a reply takes (infrastructure, not component code).
        asm.dispatchEvent(new CustomEvent(OFFER_EVENT, { detail, bubbles: false }))
    }
}

function bind(el, asm, state) {
    if (state.bound.has(asm)) return
    // A call names the offer it is for; every other hand bound here abstains. A hand
    // that returns nothing still answers (null), so it is never mistaken for silence.
    const onCall = respond(el, CALL_EVENT, async detail => {
        const entry = [...state.specs.values()].find(s => s.offer.offerId === detail.offerId && s.asm === asm)
        if (!entry) return undefined
        const out = await entry.execute.call(entry.spec, detail.args ?? {}, detail.ctx ?? {})
        return out ?? null
    }, { on: asm })
    const onSolicit = () => {
        for (const entry of state.specs.values()) {
            if (entry.asm === asm) deliver(el, asm, entry.offer)
        }
    }
    asm.addEventListener(SOLICIT_EVENT, onSolicit)
    state.bound.set(asm, { onCall, onSolicit })
}

/**
 * Offer `spec` ({name, …, execute(args, ctx)}) from hand element `el` to its
 * assembler: `to`, else the nearest `hands` provider above `el`. Returns false
 * when the spec is malformed or no assembler is in reach. Calling it again for the
 * same name re-offers (replacing the assembler's entry).
 */
export function offerHand(el, spec, { to = null, log = null } = {}) {
    if (!spec || typeof spec.name !== "string" || !spec.name || typeof spec.execute !== "function") {
        log?.warn?.(`ignoring a malformed capability offer: ${JSON.stringify(spec?.name)}`)
        return false
    }
    const asm = to || (typeof el.enclosing === "function" ? el.enclosing("hands") : null)
    if (!asm) {
        log?.debug?.(`no assembler in reach for "${spec.name}" — not offered`)
        return false
    }
    const state = stateOf(el)
    const offer = offerOf(spec, `${state.key}:${spec.name}`)
    state.specs.set(spec.name, { spec, offer, execute: spec.execute, asm })
    bind(el, asm, state)
    deliver(el, asm, offer)
    return true
}

/** Unbind every hand `el` offered (on disconnect); a reconnect offers afresh. */
export function withdrawHands(el) {
    const state = handState.get(el)
    if (!state) return
    for (const [asm, { onCall, onSolicit }] of state.bound) {
        asm.removeEventListener(CALL_EVENT, onCall)
        asm.removeEventListener(SOLICIT_EVENT, onSolicit)
    }
    state.bound.clear()
    state.specs.clear()
}

// -------------------------------------------------------------- assembler side

function normalize(spec) {
    return {
        name: spec.name,
        description: spec.description || "",
        parameters: spec.parameters || { type: "object", properties: {} },
        felt: (spec.felt || "").trim(),
        readonly: spec.readonly !== false,   // read-only unless explicitly opted out (efference.md §6c)
        predictionTarget: spec.predictionTarget,
        lane: typeof spec.lane === "string" && spec.lane ? spec.lane : null,
        cooldown: spec.cooldown ?? null,
        intentThreshold: spec.intentThreshold == null ? null : Number(spec.intentThreshold),
        acceptsTemplate: spec.acceptsTemplate === true,
        consequenceType: Object.prototype.hasOwnProperty.call(spec, "consequenceType")
            ? spec.consequenceType
            : undefined,
        deadline: Number.isFinite(Number(spec.deadline)) && Number(spec.deadline) > 0 ? Number(spec.deadline) : null,
    }
}

/**
 * The registry an assembler keeps: the closed menu of offered hands. Each entry is
 * the normalized offer plus `execute(args, ctx)`, which sends the call and resolves
 * to the hand's reply (or throws on an error reply or a missed deadline).
 *
 * opts: {noun ("hand" | "tool", for logs), log, onChange(entries), claim (stop an
 * offer at this assembler — the nearest owns its tool), deadline() (ms default),
 * normalizeEntry(entry, spec) (an assembler's own extra fields)}.
 */
export class HandRegistry {
    entries = []

    constructor(host, { noun = "hand", log = null, onChange = () => {}, claim = false, deadline = null, normalizeEntry = null } = {}) {
        this.host = host
        this.noun = noun
        this.log = log
        this.onChange = onChange
        this.claim = claim
        this.deadline = deadline
        this.normalizeEntry = normalizeEntry
    }

    /** Listen for offers (and ask hands already bound here to offer again). */
    listen() {
        this.host.addEventListener(OFFER_EVENT, event => {
            // My own offer bubbling up to MY assembler (an agent that is a mind's hand) passes.
            if (event.target === this.host && event.bubbles) return
            if (this.claim) event.stopPropagation()
            this.register(event?.detail)
        })
        this.host.dispatchEvent(new CustomEvent(SOLICIT_EVENT, { bubbles: false }))
    }

    find(name) {
        return this.entries.find(e => e.name === name)
    }

    /**
     * Register an offer (plain data with an `offerId`) or the assembler's own tool
     * (a spec with a local `execute`, e.g. m-agent's finish). Returns whether the
     * menu changed. A malformed spec warns rather than throws — a broken hand must
     * not crash a wake.
     */
    register(spec) {
        const local = typeof spec?.execute === "function"
        if (!spec || typeof spec.name !== "string" || !spec.name || (!local && typeof spec.offerId !== "string")) {
            this.log?.warn?.(`ignoring a malformed capability registration: ${JSON.stringify(spec?.name)}`)
            return false
        }
        const existing = this.find(spec.name)
        if (existing && (local || existing.offerId !== spec.offerId)) {
            this.log?.warn?.(`a ${this.noun} named "${spec.name}" is already registered; ignoring the duplicate`)
            return false
        }
        const entry = normalize(spec)
        this.normalizeEntry?.(entry, spec)
        entry.offerId = local ? null : spec.offerId
        entry.execute = local ? spec.execute.bind(spec) : (args, ctx) => this._call(entry.name, args, ctx)
        if (existing) {
            Object.assign(existing, entry)   // idempotent re-offer: the same hand, a new schema
        } else {
            this.entries.push(entry)
            this.log?.info?.(`${this.noun} registered: ${spec.name}${this.noun === "hand" && spec.readonly === false ? " (WORLD-CHANGING)" : ""}`)
        }
        this.onChange(this.entries)
        return true
    }

    async _call(name, args, ctx) {
        const entry = this.find(name)
        if (!entry) throw new Error(`no ${this.noun} named "${name}"`)
        const deadline = entry.deadline ?? this.deadline?.() ?? DEFAULT_CALL_DEADLINE_MS
        const reply = await this.host.request(CALL_EVENT, {
            hand: name, offerId: entry.offerId, args: args ?? {}, ctx: ctx ?? {},
        }, { bubbles: false, deadline })
        if (reply.status === "ok") return reply.data
        if (reply.status === "error") throw new Error(reply.error || `"${name}" failed`)
        throw new Error(`"${name}" did not answer within ${Math.round(deadline / 1000)}s`)
    }
}
