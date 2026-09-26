// Delivery chaos — the measuring instrument for the message rule
// (doc/architecture/message-rule.md, doc/improvements/message-rule-async-review.md §6).
//
// jsdom dispatches events synchronously; a distributed mind will not. This module
// lets a test run (or a dry smoke run) drop that accident of the substrate:
//
//   MEDITATOR_DELIVERY = sync | microtask | macrotask | jitter
//       sync (default)  events dispatch inside fire(), as today
//       microtask       every CustomEvent is delivered on a microtask
//       macrotask       ... on setTimeout(0)
//       jitter          ... after a seeded random 0–20 ms (reorders channels)
//   MEDITATOR_DELIVERY_SEED    PRNG seed for jitter (default 1)
//   MEDITATOR_DELIVERY_WIRE    ref (default) | json — what a deferred listener
//       receives. "ref" copies only the plain part (arrays, records) and passes
//       functions, elements and class instances by reference; "json" sends the
//       detail through a JSON round trip, as a process boundary would: functions
//       and elements vanish, instances arrive as plain records without methods.
//   MEDITATOR_DELIVERY_CHECK   off | report | throw — plain-data check on every
//       fired detail and published value. Defaults to "report" whenever the mode
//       is not sync; can be turned on alone to list M2 violations without deferral.
//   MEDITATOR_DELIVERY_REPORT  write the violation registry as JSON here on exit
//
// In a deferred mode the sender gets `true` back from dispatchEvent and its own
// event object is never dispatched, so defaultPrevented stays false and anything
// a listener would have written into detail is written into a COPY. Every
// request/response-over-sync-event protocol (review §3.1) therefore degrades
// exactly as it would across a process boundary. Nothing here changes behaviour
// unless an env var is set or configureDelivery() is called.

import { writeFileSync } from "node:fs"

const MODES = new Set(["sync", "microtask", "macrotask", "jitter"])
const CHECKS = new Set(["off", "report", "throw"])

const state = {
    installed: false,
    mode: "sync",
    check: "off",
    wire: "ref",
    rand: mulberry32(1),
    registry: new Map(),   // key "channel|name|kind" → { count, senders:Set, paths:Set }
    reportPath: null,
    window: null,
}

/** Current settings (for tests and the ratchet tool). */
export function deliverySettings() {
    return { mode: state.mode, check: state.check, wire: state.wire, installed: state.installed }
}

/** Change mode/check at runtime; installs the hook on first use. Returns the
 *  previous settings so a test can restore them. */
export function configureDelivery({ mode, check, wire, seed, window: win } = {}) {
    const prev = { mode: state.mode, check: state.check, wire: state.wire }
    if (mode != null) {
        if (!MODES.has(mode)) throw new Error(`deliveryChaos: unknown mode "${mode}"`)
        state.mode = mode
    }
    if (check != null) {
        if (!CHECKS.has(check)) throw new Error(`deliveryChaos: unknown check "${check}"`)
        state.check = check
    }
    if (wire != null) {
        if (wire !== "ref" && wire !== "json") throw new Error(`deliveryChaos: unknown wire "${wire}"`)
        state.wire = wire
    }
    if (seed != null) state.rand = mulberry32(Number(seed) || 1)
    install(win || state.window || globalThis.window)
    return prev
}

/** Read the env and install the hook if anything is asked of it. Called once
 *  from startup/jsdom.js right after the window exists. */
export function installFromEnv(win, env = process.env) {
    state.window = win
    const mode = env.MEDITATOR_DELIVERY || "sync"
    const check = env.MEDITATOR_DELIVERY_CHECK || (mode === "sync" ? "off" : "report")
    if (mode === "sync" && check === "off") return
    state.reportPath = env.MEDITATOR_DELIVERY_REPORT || null
    configureDelivery({ mode, check, wire: env.MEDITATOR_DELIVERY_WIRE || "ref", seed: env.MEDITATOR_DELIVERY_SEED, window: win })
    process.on("exit", writeDeliveryReport)
}

/** Violations collected so far, as sorted plain records. */
export function deliveryViolations() {
    return [...state.registry.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
        key, count: v.count,
        senders: [...v.senders].sort(),
        paths: [...v.paths].sort().slice(0, 5),
    }))
}

/** Swap in a fresh registry (for the instrument's own tests, which must not
 *  erase what the rest of a chaos run collected). Returns the restore function. */
export function isolateDeliveryRegistry() {
    const saved = state.registry
    state.registry = new Map()
    return () => { state.registry = saved }
}

/**
 * The M2 check: is `value` plain data? Records each violation under
 * `channel|name|kind` (channel = "fire" | "pub"). Returns the violations found
 * in this payload. With check="throw" the first violation throws instead.
 */
export function checkPayload(channel, name, value, sender) {
    if (state.check === "off") return []
    const found = []
    walk(value, "", 0, new Set(), found)
    if (!found.length) return found
    for (const { kind, path } of found) record(channel, name, kind, sender, path)
    if (state.check === "throw") {
        const { kind, path } = found[0]
        throw new TypeError(`message rule M2: ${channel} "${name}" from <${senderTag(sender)}> carries ${kind} at ${path || "(root)"}`)
    }
    return found
}

// ------------------------------------------------------------------ the hook

function install(win) {
    if (state.installed || !win) return
    const proto = win.EventTarget.prototype
    const original = proto.dispatchEvent
    const CustomEventCtor = win.CustomEvent
    proto.dispatchEvent = function chaosDispatch(event) {
        // Only component messages: CustomEvents we did not ourselves re-dispatch.
        if (!(event instanceof CustomEventCtor) || event.__chaosDelivered) {
            return original.call(this, event)
        }
        if (state.check !== "off") checkPayload("fire", event.type, event.detail, this)
        if (state.mode === "sync") return original.call(this, event)

        const detail = event.detail
        const sentShape = shape(detail)
        const copy = new CustomEventCtor(event.type, {
            detail: state.wire === "json" ? jsonWire(detail) : cloneData(detail),
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            composed: event.composed,
        })
        Object.defineProperty(copy, "__chaosDelivered", { value: true })
        const target = this
        schedule(() => {
            // M2: "a payload is never mutated after sending; a change is a new message".
            if (state.check !== "off" && detail && typeof detail === "object" && shape(detail) !== sentShape) {
                record("fire", event.type, "mutated-after-send", target, "")
            }
            original.call(target, copy)
        })
        return true
    }
    state.installed = true
}

function schedule(fn) {
    switch (state.mode) {
    case "microtask": queueMicrotask(fn); break
    case "macrotask": setTimeout(fn, 0); break
    case "jitter": setTimeout(fn, Math.floor(state.rand() * 21)); break
    default: fn()
    }
}

// ------------------------------------------------------------ plain-data walk

function isPlainProto(v) {
    const p = Object.getPrototypeOf(v)
    return p === Object.prototype || p === null
}

function kindOf(v) {
    if (typeof v === "function") return "function"
    if (typeof v === "symbol") return "symbol"
    if (typeof v === "bigint") return "bigint"
    if (v === null || typeof v !== "object") return null
    if (Array.isArray(v) || isPlainProto(v)) return null
    const w = state.window
    if (w && v instanceof w.Node) return "element"
    if (w && v instanceof w.Event) return "event"
    if (typeof Promise !== "undefined" && v instanceof Promise) return "promise"
    if (typeof AbortSignal !== "undefined" && v instanceof AbortSignal) return "signal"
    const name = v.constructor?.name || "anonymous"
    return `instance:${name}`
}

function walk(v, path, depth, seen, found) {
    const kind = kindOf(v)
    if (kind) { found.push({ kind, path }); return }
    if (v === null || typeof v !== "object") return
    if (seen.has(v)) { found.push({ kind: "cycle", path }); return }
    if (depth > 12) return
    seen.add(v)
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`, depth + 1, seen, found)
    } else {
        for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k, depth + 1, seen, found)
    }
    seen.delete(v)
}

function record(channel, name, kind, sender, path) {
    const key = `${channel}|${name}|${kind}`
    let rec = state.registry.get(key)
    if (!rec) state.registry.set(key, rec = { count: 0, senders: new Set(), paths: new Set() })
    rec.count++
    rec.senders.add(senderTag(sender))
    rec.paths.add(path || "(root)")
}

/** Deep copy of the plain part of a payload. Non-plain values (already reported
 *  by the walk) pass by reference — the copy is about arrays and records that a
 *  listener would fill for the sender to read back. */
function cloneData(v, seen = new Map()) {
    if (v === null || typeof v !== "object") return v
    if (seen.has(v)) return seen.get(v)
    if (Array.isArray(v)) {
        const out = []
        seen.set(v, out)
        for (const x of v) out.push(cloneData(x, seen))
        return out
    }
    if (!isPlainProto(v)) return v
    const out = {}
    seen.set(v, out)
    for (const k of Object.keys(v)) out[k] = cloneData(v[k], seen)
    return out
}

/** What a process boundary delivers: a JSON round trip. Functions, elements,
 *  events and cycles are dropped; class instances arrive as plain records
 *  (their own enumerable fields, or their toJSON()). */
function jsonWire(v) {
    if (v === undefined) return null
    const seen = new Set()
    try {
        const text = JSON.stringify(v, (k, x) => {
            if (typeof x === "function" || typeof x === "symbol") return undefined
            if (x && typeof x === "object") {
                const kind = kindOf(x)
                if (kind === "element" || kind === "event" || kind === "signal" || kind === "promise") return undefined
                if (seen.has(x)) return undefined
                seen.add(x)
            }
            return x
        })
        return text === undefined ? null : JSON.parse(text)
    } catch {
        return null
    }
}

/** A cheap structural fingerprint for the mutated-after-send check. */
function shape(v) {
    const seen = new Set()
    try {
        return JSON.stringify(v, (k, x) => {
            if (typeof x === "function") return "ƒ"
            if (x && typeof x === "object") {
                if (seen.has(x)) return "↺"
                seen.add(x)
                if (!Array.isArray(x) && !isPlainProto(x) && kindOf(x) !== null && !kindOf(x).startsWith("instance:")) return `<${kindOf(x)}>`
            }
            return x
        })
    } catch {
        return "?"
    }
}

function senderTag(el) {
    return (el && (el.localName || el.constructor?.name)) || "unknown"
}

/** Write the registry to MEDITATOR_DELIVERY_REPORT (bun test does not run exit
 *  handlers, so the test preload calls this from a global afterAll). */
export function writeDeliveryReport() {
    if (!state.reportPath) {
        if (state.registry.size) {
            process.stderr.write(`[deliveryChaos] ${state.registry.size} message-rule violation kinds (set MEDITATOR_DELIVERY_REPORT for the list)\n`)
        }
        return
    }
    try {
        writeFileSync(state.reportPath, JSON.stringify({
            mode: state.mode, check: state.check, violations: deliveryViolations(),
        }, null, 2))
    } catch (err) {
        process.stderr.write(`[deliveryChaos] could not write report: ${err.message}\n`)
    }
}

function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0
        let t = Math.imul(a ^ a >>> 15, 1 | a)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}
