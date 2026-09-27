// The regulator port as messages (doc/architecture/message-rule.md, review §7 step 8).
//
// An aperture's contact dynamics (debt, habituation, the reopening reflex) are its
// regulator. Absent a `regulator` part, the region runs the reference policy
// (infrastructure/aperture.js) in place: a plain object it owns, not a component,
// so that stays synchronous (the rule's one exception). A substituted regulator is
// a component, and before the message rule the region ADOPTED it as
// `this.aperture`: it checked the port by reading the element's fields and methods,
// then called observe/advance/orient/attended on it and read state, focus, deficit,
// gain and version off it at every gate answer. Now the regulator is a peer:
//
//   regulator-up {snapshot}                  (bubbling, the nearest aperture stops it)
//   regulate {op: "snapshot"}                → {changed: false, snapshot}
//   regulate {op: "observe", source, change, now}      → {changed: false, snapshot}
//   regulate {op: "advance", now, awake, arousal}      → {changed, snapshot}
//   regulate {op: "orient", state, source, now}        → {changed, snapshot}
//   regulate {op: "attended", occurredAt, now}         → {changed, snapshot}
//
// The request is fired on the aperture itself (bubbles: false); the regulator
// answers from a listener bound on its aperture at connect (M4: the nearest
// enclosing aperture, found once), and only that aperture's own request. The
// snapshot is {state, focus, deficit, gain, version, seq}: the region keeps it as a
// mirror (RegulatorMirror) and reads the gate's state from there, never from the
// element. `seq` counts answers, so a reply overtaken by a later one is not applied
// (M5). `change` is the candidate's change header ({kind: "change", candidateId,
// changeKey, changeMagnitude, occurredAt}; changeKey is already a hash): never the
// text, and never a tier-1 score, which is refused by kind as Aperture refuses
// EdgeEvidence by type. `now` travels with each op, so delivery latency does not
// shift the dynamics.
//
// A regulator silent past the region's `regulateDeadline` (default 2 s) changes
// nothing (M6): the aperture stays as the mirror last saw it. One that never comes
// up leaves the aperture unbound, so its gate never answers and its candidates are
// gate-missing (monotone authority).
//
// Authoring surface (unchanged fields and methods, a new base): a regulator extends
// MRegulator and keeps `state`, `focus`, `deficit`, `gain`, `version` and writes
// observe(source, change, now), advance(now, {awake, arousal}),
// orient(state, {source, now}) and attended(occurredAt, now), each returning
// whether the aperture changed (or a Promise of it). A missing one throws at
// connect, naming it (`regulator is missing attended`). `allows` is no longer part
// of the port: which sources a state lets through is the gate's reading of
// state and focus (decideGate), and the region applies the same reading to skip
// broadcasts (apertureAllows).

import { MBaseComponent } from "./mBaseComponent.js"
import { enclosingOf } from "./enclosure.js"
import { respond } from "../../infrastructure/requestReply.js"
import { sentByComponent } from "../../infrastructure/messageOrigin.js"
import { clamp01 } from "../../infrastructure/percept.js"
import { parseTime } from "../../config/timeParser.js"

export const REGULATE_REQUEST = "regulate"
export const REGULATOR_UP = "regulator-up"
export const DEFAULT_REGULATE_DEADLINE_MS = 2000

const STATES = ["open", "soft", "narrow", "closed"]
const PORT_FIELDS = ["state", "focus", "deficit", "gain", "version"]
const PORT_METHODS = ["observe", "advance", "orient", "attended"]

/** Which sources `state`/`focus` let through, the gate's reading (decideGate):
 *  closed lets nothing through, narrow only its focus, bypassAperture everything. */
export function apertureAllows({ state, focus }, source, powers = {}) {
    return powers.bypassAperture === true || (state !== "closed"
        && (state !== "narrow" || source === focus))
}

/** A candidate's change header, as the regulator hears it: plain, no text. */
export function changeHeader(candidate) {
    return {
        kind: "change",
        candidateId: candidate.id,
        changeKey: candidate.changeKey,
        changeMagnitude: candidate.changeMagnitude,
        occurredAt: candidate.occurredAt,
    }
}

/** A validated snapshot, or null. */
export function snapshotFrom(data) {
    if (!data || typeof data !== "object" || !STATES.includes(data.state)) return null
    const num = (v, fallback) => Number.isFinite(v) ? v : fallback
    return {
        state: data.state,
        focus: data.state === "narrow" && typeof data.focus === "string" ? data.focus : null,
        deficit: clamp01(num(data.deficit, 0)),
        gain: num(data.gain, 1),
        version: num(data.version, 0),
        seq: num(data.seq, 0),
    }
}

/**
 * The region's view of a substituted regulator: the last snapshot it answered with.
 * Owned by the region (plain state, read synchronously by the gate); written only
 * from regulator replies. `version` is also bumped by the region itself on
 * disconnect, which invalidates every version it handed out, as before.
 */
export class RegulatorMirror {
    constructor(snapshot) {
        this.state = "open"
        this.focus = null
        this.deficit = 0
        this.gain = 1
        this.version = 0
        this.seq = -Infinity
        this.apply(snapshot)
    }

    /** Take a newer snapshot. Returns whether it was applied. */
    apply(data) {
        const snapshot = snapshotFrom(data)
        if (!snapshot || snapshot.seq < this.seq) return false
        Object.assign(this, snapshot)
        return true
    }

    allows(source, powers = {}) { return apertureAllows(this, source, powers) }
}

export function regulateDeadlineMs(region) {
    const raw = region.attr?.("regulateDeadline")
    if (!raw) return DEFAULT_REGULATE_DEADLINE_MS
    try {
        const ms = parseTime(raw)
        return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_REGULATE_DEADLINE_MS
    } catch { return DEFAULT_REGULATE_DEADLINE_MS }
}

/**
 * The region's side: one `regulate` op to its regulator (named `name`). Resolves
 * to {changed, snapshot} from the reply, or {changed: false, snapshot: null} for a
 * timeout, an error, or a reply from anyone else; never rejects.
 */
export async function askRegulator(region, name, op, data = {}) {
    const reply = await region.request(REGULATE_REQUEST, { ...data, op },
        { bubbles: false, deadline: regulateDeadlineMs(region) })
    if (reply.status !== "ok" || reply.from !== name) return { changed: false, snapshot: null }
    return { changed: reply.data?.changed === true, snapshot: reply.data?.snapshot ?? null }
}

export class MRegulator extends MBaseComponent {
    static provides = { regulator: true }

    _aperture = null
    _seq = 0

    onConnect() {
        super.onConnect()
        this._assertPort()
        const aperture = enclosingOf(this, "aperture")
        this._aperture = aperture
        if (!aperture) return
        this._onRegulate = respond(this, REGULATE_REQUEST, (detail, event) => this._answer(detail, event), { on: aperture })
        this.fire(REGULATOR_UP, { snapshot: this._snapshot() })
    }

    onDisconnect() {
        if (this._aperture && this._onRegulate) this._aperture.removeEventListener(REGULATE_REQUEST, this._onRegulate)
        this._aperture = null
        this._onRegulate = null
    }

    /** The regulator checks itself: a missing field or method is an authoring error. */
    _assertPort() {
        for (const name of PORT_FIELDS) {
            if (!(name in this)) throw new Error(`regulator is missing ${name}`)
        }
        for (const name of PORT_METHODS) {
            if (typeof this[name] !== "function") throw new Error(`regulator is missing ${name}`)
        }
    }

    _snapshot() {
        return {
            state: this.state,
            focus: this.focus ?? null,
            deficit: Number(this.deficit),
            gain: Number(this.gain),
            version: Number(this.version),
            seq: ++this._seq,
        }
    }

    /** One op's reply, or undefined (abstain) for a request that is not the own
     *  aperture's. A throw is an error reply, which changes nothing on the region. */
    async _answer(detail, event) {
        if (!this._aperture || event.target !== this._aperture || !sentByComponent(event)) return undefined
        const now = Number.isFinite(detail.now) ? detail.now : Date.now()
        let changed = false
        switch (detail.op) {
            case "snapshot":
                break
            case "observe": {
                const change = detail.change
                if (change?.kind !== "change") throw new Error("a regulator observes only change headers")
                await this.observe(detail.source, Object.freeze({ ...change }), now)
                break
            }
            case "advance":
                changed = await this.advance(now, { awake: detail.awake !== false, arousal: detail.arousal ?? 1 })
                break
            case "orient":
                changed = await this.orient(detail.state, { source: detail.source ?? null, now })
                break
            case "attended":
                changed = await this.attended(detail.occurredAt, now)
                break
            default:
                return undefined
        }
        return { changed: changed === true, snapshot: this._snapshot() }
    }
}
