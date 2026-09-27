// Stream filters as messages (doc/architecture/message-rule.md, review §7 step 7).
//
// m-stream runs the model's text through its FILTER CHAIN before emitting it: every
// part inside it that provides `stream-filter`, in tree order. A filter can pass,
// rewrite or hold text back, and a `signal` stops the burst. Before the message rule
// the stream looked the filters up and called begin() / feed() / flush() / react() on
// them, reading {emit, signal} back from each call. Now each stage is asked:
//
//   filter {op: "begin", stage, burstIndex, prefill, prefix, payload}  → {began}
//   filter {op: "feed",  stage, burstIndex, text}                      → {emit, signal?}
//   filter {op: "flush", stage, burstIndex}                            → {emit, signal?}
//   filter-stopped {stage, signal, burstIndex, burstChars}              (a plain fire)
//
// The requests are fired on the stream itself (bubbles: false). A filter answers
// from a listener it bound on its stream at connect, and only for its own stage.
// `filter-stopped` follows a signal once the stream has stopped, so the filter's
// react() runs after the burst is out of the way.
//
// Addressing (M4). A stage is the filter's name (its `name` attribute, else its
// tag), the same responderName() its replies carry. The stream takes the names in
// tree order per burst, with part(): a lookup that yields names, never a handle.
// Two filters with the same name in one stream cannot be told apart. The stream
// warns and runs only the first.
//
// Why a request per stage and not a pipeline of topics (the review's first sketch).
// The chain's two orderings (a stop further down on text passed before an upstream
// stop wins; flush releases held text through the filters below before flushing
// them) stay in one place, the stream's composition below, and are carried by the
// awaits (M5). A pipeline would need an in-band end marker and a reorder buffer in
// every filter.
//
// Deadline (M6). Each stage answers within `deadline` (the stream's `filterDeadline`,
// default 2s). A filter that throws passes that text through, as before: a broken
// filter degrades to no filter and never kills the burst. A filter that stays
// silent is dropped from the chain for the rest of the burst. Its late answer could
// not be used anyway, and its held text must not come back at flush.
//
// Authoring. A filter extends MStreamFilter and writes the same four optional
// methods as before (feed may now be async). Only what crosses changed.

import { request, respond, responderName } from "../../infrastructure/requestReply.js"
import { MBaseComponent } from "./mBaseComponent.js"
import { enclosingOf, isMembrane, part } from "./enclosure.js"
import { logger } from "../../infrastructure/logger.js"

const defaultLog = logger("streamFilters.js")

export const FILTER_ROLE = "stream-filter"
export const CHAIN_ROLE = "filter-chain"
export const FILTER_EVENT = "filter"
export const STOPPED_EVENT = "filter-stopped"
export const DEFAULT_FILTER_DEADLINE_MS = 2000

// ---------------------------------------------------------------- filter side

// filter element → the chain elements it is bound on
const boundOn = new WeakMap()

/** Custom-element tags above `el`, up to its membrane, that are not defined yet. */
function undefinedAncestors(el) {
    const tags = []
    for (let cur = el.parentElement; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (cur.localName.includes("-") && !customElements.get(cur.localName) && !tags.includes(cur.localName)) {
            tags.push(cur.localName)
        }
        if (isMembrane(cur)) break
    }
    return tags
}

/** A method's return value as plain reply data: a string is `{emit}`; anything
 *  that is not an object is null (the stream passes the text through). */
function portReply(out) {
    if (typeof out === "string") return { emit: out }
    if (!out || typeof out !== "object") return null
    const reply = { emit: typeof out.emit === "string" ? out.emit : "" }
    if (out.signal) reply.signal = out.signal
    return reply
}

/**
 * Serve the filter element `el` to its stream (the nearest `filter-chain` above
 * it): answer the stream's `filter` requests for this stage with el.begin / feed /
 * flush, and call el.react on `filter-stopped`. A missing feed passes text through
 * and a missing flush releases nothing. Returns false when no stream is in reach.
 */
export function serveStreamFilter(el, { log = defaultLog } = {}) {
    const chain = el.parentElement ? enclosingOf(el.parentElement, CHAIN_ROLE) : null
    if (!chain) {
        // A filter defined before its stream (same batch, or a test that defines its
        // own filter first) connects while the stream is still an unknown tag. Wait
        // for the undefined ancestors, then look again.
        const pending = undefinedAncestors(el)
        if (pending.length) {
            Promise.all(pending.map(tag => customElements.whenDefined(tag)))
                .then(() => { if (el.isConnected) serveStreamFilter(el, { log }) })
            return false
        }
        log?.warn?.(`<${el.localName}> provides ${FILTER_ROLE} but no stream encloses it — not serving`)
        return false
    }
    let chains = boundOn.get(el)
    if (!chains) boundOn.set(el, chains = new WeakSet())
    if (chains.has(chain)) return true
    chains.add(chain)

    // A filter moved out of this stream stops answering it; the stream's roster no
    // longer names it anyway, but a newcomer with the same name must not meet a
    // stale answer.
    const mine = detail => detail?.stage === responderName(el) && chain.contains(el)

    respond(el, FILTER_EVENT, async detail => {
        if (!mine(detail)) return undefined
        const { op, burstIndex } = detail
        if (op === "begin") {
            if (typeof el.begin === "function") {
                await el.begin({ burstIndex, prefill: detail.prefill, prefix: detail.prefix, payload: detail.payload })
            }
            return { began: true }
        }
        if (op === "feed") {
            if (typeof el.feed !== "function") return { emit: detail.text ?? "" }
            return portReply(await el.feed(detail.text ?? ""))
        }
        if (op === "flush") {
            if (typeof el.flush !== "function") return { emit: "" }
            return portReply(await el.flush())
        }
        return undefined
    }, { on: chain })

    chain.addEventListener(STOPPED_EVENT, async event => {
        const detail = event?.detail
        if (!mine(detail) || typeof el.react !== "function") return
        try {
            await el.react(detail.signal, { burstIndex: detail.burstIndex, burstChars: detail.burstChars })
        } catch (error) {
            log?.warn?.(`${FILTER_ROLE} <${el.localName}> react() failed:`, error?.message || error)
        }
    })
    return true
}

/**
 * The base class for a stream filter: provides `stream-filter` and serves itself
 * to its stream on connect. Write any of begin(ctx), feed(text), flush() and
 * react(signal, {burstIndex, burstChars}); see doc/extending.md.
 */
export class MStreamFilter extends MBaseComponent {
    static provides = { [FILTER_ROLE]: true }

    connectedCallback() {
        super.connectedCallback()
        serveStreamFilter(this)
    }
}

// ---------------------------------------------------------------- stream side

const PASS = text => ({ emit: text, signal: null })
const NOTHING = { emit: "", signal: null }

/**
 * Run `text` through stages[from..], each asked with `ask(stage, "feed", text)`,
 * which resolves to {emit, signal}. A stage's signal stops the chain, but what it
 * passed before stopping still runs through the stages below it: a stop further
 * down on that earlier text wins, since it came first in the text. Resolves to
 * {emit, signal, by} (`by`: the stopping stage).
 */
export async function feedChain(stages, text, ask, from = 0) {
    let out = text
    for (let i = from; i < stages.length; i++) {
        if (!out) return NOTHING
        const r = await ask(stages[i], "feed", out)
        if (r.signal) {
            const down = await feedChain(stages, r.emit, ask, i + 1)
            return down.signal ? down : { emit: down.emit, signal: r.signal, by: stages[i] }
        }
        out = r.emit
    }
    return PASS(out)
}

/** End of burst: flush each stage in order, running what it releases through the
 *  stages below it before flushing those, so held text is judged by all of them. */
export async function flushChain(stages, ask) {
    let emit = ""
    for (let i = 0; i < stages.length; i++) {
        const r = await ask(stages[i], "flush")
        const down = await feedChain(stages, r.emit, ask, i + 1)
        emit += down.emit
        if (down.signal) return { emit, signal: down.signal, by: down.by }
        if (r.signal) return { emit, signal: r.signal, by: stages[i] }
    }
    return { emit, signal: null }
}

// stream element → names already warned about (a duplicate stage)
const warnedDuplicates = new WeakMap()

/** The stream's stages this burst: its `stream-filter` parts' names, in tree order.
 *  A repeated name runs once (the first), with a warning. */
export function chainStages(stream, { log = null } = {}) {
    const names = []
    for (const f of part(stream, FILTER_ROLE)) {
        const name = responderName(f)
        if (!names.includes(name)) { names.push(name); continue }
        let warned = warnedDuplicates.get(stream)
        if (!warned) warnedDuplicates.set(stream, warned = new Set())
        if (!warned.has(name)) {
            warned.add(name)
            log?.warn?.(`two stream filters are named "${name}" — only the first runs; give them distinct names`)
        }
    }
    return names
}

/**
 * One burst's chain, as the stream runs it. `open()` asks every stage to begin (in
 * parallel) and resolves to the chain; a stage that does not answer is dropped for
 * the burst. Then feed(text) and flush() resolve to {emit, signal, by}, and
 * stopped(stage, signal, info) tells the stopping stage to react.
 */
export class FilterChain {
    constructor(stream, stages, { burstIndex = null, deadline = DEFAULT_FILTER_DEADLINE_MS, log = null } = {}) {
        this.stream = stream
        this.stages = stages
        this.burstIndex = burstIndex
        this.deadline = deadline
        this.log = log
        this.dropped = new Set()
        this.ask = (stage, op, text) => this._ask(stage, op, text)
    }

    static async open(stream, ctx = {}, opts = {}) {
        const chain = new FilterChain(stream, opts.stages ?? chainStages(stream, opts), { ...opts, burstIndex: ctx.burstIndex ?? null })
        await Promise.all(chain.stages.map(stage => chain._send(stage, "begin", {
            prefill: ctx.prefill, prefix: ctx.prefix, payload: ctx.payload,
        })))
        return chain
    }

    get live() {
        return this.stages.filter(s => !this.dropped.has(s))
    }

    feed(text) {
        return feedChain(this.live, text, this.ask)
    }

    flush() {
        return flushChain(this.live, this.ask)
    }

    /** The burst has stopped on `stage`'s signal: let it react. */
    stopped(stage, signal, info = {}) {
        const detail = { stage, signal, burstIndex: info.burstIndex ?? this.burstIndex, burstChars: info.burstChars ?? 0 }
        if (typeof this.stream.fire === "function") this.stream.fire(STOPPED_EVENT, detail, { bubbles: false })
        else this.stream.dispatchEvent(new CustomEvent(STOPPED_EVENT, { detail, bubbles: false }))
    }

    async _ask(stage, op, text) {
        const fallback = op === "feed" ? PASS(text) : NOTHING
        if (this.dropped.has(stage)) return fallback
        const reply = await this._send(stage, op, op === "feed" ? { text } : {})
        if (!reply) return fallback
        return { emit: typeof reply.emit === "string" ? reply.emit : "", signal: reply.signal || null }
    }

    /** One request to one stage: its reply data, or null (error: passed through;
     *  silence: the stage is dropped for the burst). */
    async _send(stage, op, data) {
        const reply = await request(this.stream, FILTER_EVENT, { ...data, op, stage, burstIndex: this.burstIndex },
            { bubbles: false, deadline: this.deadline })
        if (reply.status === "ok") return reply.data
        if (reply.status === "error") {
            this.log?.warn?.(`${FILTER_ROLE} "${stage}" ${op} failed:`, reply.error)
            return null
        }
        this.dropped.add(stage)
        this.log?.warn?.(`${FILTER_ROLE} "${stage}" did not answer ${op} within ${this.deadline}ms — dropped for this burst`)
        return null
    }
}
