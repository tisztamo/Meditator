import { MBaseComponent } from "../shared/mBaseComponent.js"
import { ENERGY } from "../shared/infoton.js"
import { part } from "../shared/enclosure.js"
import { chatStream } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { logger } from '../../infrastructure/logger.js';

const log = logger('mStream.js');

/**
 * The thinking voice. Produces the stream of consciousness as a sequence of
 * short BURSTS — each burst is one streamed LLM call. The continuity between
 * bursts is not this component's job: m-mind assembles every burst's prompt
 * (the attention frame) so that the verbatim tail of the previous burst is
 * always carried forward.
 *
 * An interruption is therefore not a special state here. A new prompt simply
 * supersedes the current burst: the in-flight stream is aborted quietly and a
 * new one starts. The old pause/resume fiction is gone — you cannot resume a
 * closed HTTP stream, and with tail-carryover you do not need to.
 *
 * @interface
 * Attributes:
 *   - model: model for the voice (falls back to ancestor "model" attr, then default)
 *   - burstTokens: max tokens per burst (default 350)
 *   - temperature: sampling temperature (default 0.9)
 *
 * Subscriptions:
 *   - "../prompt": receives {system, frame, prefix?, kind?} or a plain string
 *
 * Topics published:
 *   - "chunk": each text fragment as it arrives (the prefix is emitted as a chunk too)
 *   - "boundary": {reason: completed|aborted|error|superseded, burstIndex, burstChars, error?}
 *                 emitted when a burst ends and was NOT superseded by a newer prompt
 *   - "state": {oldState, newState, timestamp} — kept for the websocket client
 *
 * Role port `stream-filter` (the OUTPUT FILTER CHAIN): every child that `provides`
 * `stream-filter` — found per burst via part(), run in tree order — sees the model's
 * text BEFORE it is emitted, so a filter can pass, rewrite, hold back or stop it
 * before it reaches the chunk topic, the tail and the journal. Unlike other role
 * ports this is a CHAIN, not a singleton. Only model-authored text is filtered (after
 * seam trimming); the mechanism's own `prefix` bypasses the chain. Port shape:
 *   - begin?({burstIndex, prefill, prefix, payload})  a burst starts: reset state
 *   - feed(text) → {emit, signal?}   emit = text to pass on now ("" holds it back)
 *   - flush?()   → {emit, signal?}   the burst ended: release (or judge) held text
 *   - react?(signal, {burstIndex, burstChars})   called AFTER the stream stopped
 * A `signal` STOPS the burst: the stream emits what the filter passed, aborts,
 * supersedes (no boundary — the mind neither reschedules nor backs off) and only
 * then calls that filter's react(). The ordering is the stream's job, so a filter can
 * safely fire `interrupt-request` (which may start the next burst synchronously) from
 * react() without re-entering a burst that is still running.
 */
/**
 * Trims the longest overlap between the end of the carried text and the start
 * of the new burst (also when the new text starts with extra whitespace).
 */
function stripLeadingContinuationMarker(text) {
    if (!text) return text
    return text.replace(/^\s*(?:\.{3,}|…)+\s*/, "")
}

export function trimSeamOverlap(prev, next) {
    const stripped = stripLeadingContinuationMarker(next)
    const cueStripped = stripped !== next
    const lead = (stripped.match(/^\s*/) || [""])[0]
    const body = stripped.slice(lead.length)
    // After a continuation cue the model has re-anchored on the tail, so even a
    // short echo (e.g. one repeated word) is a real overlap worth trimming. With
    // no cue we stay conservative to avoid trimming coincidental short matches.
    const minOverlap = cueStripped ? 2 : 4
    const max = Math.min(prev.length, body.length, 100)
    for (let k = max; k >= minOverlap; k--) {
        if (prev.endsWith(body.slice(0, k))) return body.slice(k)
    }
    return cueStripped ? stripped : next
}

/**
 * Builds the chat messages for one burst. Pure, so the image-percept path can be
 * tested without a stream. A pending image (image.dataUrl) rides the user turn as
 * an image_url content part — the mind SAW this; it is what it just generated. The
 * local voice is a VLM, so the pixels are perceivable; with a non-VLM voice the
 * provider drops or errors the part, and the prompt line in the tail is the
 * fallback. Thinking mode folds the prefill into the user turn (the reasoning
 * channel only fires on a fresh assistant turn), so the image joins that same
 * user turn.
 */
export function buildBurstMessages({ system, userTurn, prefill, thinking, image }) {
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    const imageDataUrl = image?.dataUrl
    if (prefill && thinking) {
        const text = `${userTurn}\n\nThe monologue so far:\n"…${prefill}"`
        messages.push(imageDataUrl
            ? { role: 'user', content: [
                { type: 'text', text },
                { type: 'image_url', image_url: { url: imageDataUrl } },
            ] }
            : { role: 'user', content: text })
    } else {
        if (userTurn) {
            if (imageDataUrl) {
                messages.push({ role: 'user', content: [
                    { type: 'text', text: userTurn },
                    { type: 'image_url', image_url: { url: imageDataUrl } },
                ] })
            } else {
                messages.push({ role: 'user', content: userTurn })
            }
        }
        if (prefill) messages.push({ role: 'assistant', content: prefill })
    }
    return messages
}

export class MStream extends MBaseComponent {
    chunkHistory = []
    streamState = "idle"
    burstIndex = 0
    _current = null      // {burst, generation}
    _generation = 0
    _badFilters = new WeakSet()   // filters already warned about (a port without feed())

    "../prompt" = async payload => {
        this._generation += 1
        const generation = this._generation
        this._supersede()
        await this._startBurst(payload, generation)
    }

    _supersede() {
        if (this._current) {
            this._current.superseded = true
            this._current.burst.abort()
            this._current = null
        }
    }

    async _startBurst(payload, generation) {
        const { system, instruction, prefill, frame, prefix, dedupe, burstTokens, image } =
            typeof payload === 'string' ? { frame: payload } : payload

        this.burstIndex += 1
        const burstIndex = this.burstIndex
        let burstChars = 0

        // Three turns: a `system` message (identity + memory + what just happened),
        // a `user` message carrying the instruction, and — when a thought is already
        // underway — an `assistant` prefill the model is asked to continue. The
        // instruction MUST be a user turn: litellm/vLLM reject a system-only or
        // system+assistant request ("No user query found in messages"). Ending on the
        // assistant prefill (with continueFinal) keeps the model continuing the
        // thought rather than answering. `frame`/`instruction` are interchangeable
        // labels for the user turn; `frame` is the legacy/string-payload fallback.
        const userTurn = instruction || frame
        // Thinking mode (LOCAL_LLM_THINKING=1, local provider): the model's reasoning
        // channel only fires on a FRESH assistant turn — an assistant-prefill
        // continuation (continue_final_message) suppresses it entirely. So when the
        // voice thinks, the running thought is folded into the user turn as "the mind's
        // most recent words" instead of being sent as a trailing assistant prefill, and
        // the model thinks the monologue onward (its reasoning trace becomes the stream).
        const voiceModel = resolveModelRef(this.attr("model") || this.env("model"), "voice")
        const thinking = voiceModel?.thinking === true
        const continueFinal = Boolean(prefill) && !thinking

        const messages = buildBurstMessages({ system, userTurn, prefill, thinking, image })

        // Injected prefix (landing opener, optional bridge, …) physically enters the stream:
        // it becomes part of the monologue, the tail, the memory, the journal.
        if (prefix) {
            this._emitChunk(prefix)
            burstChars += prefix.length
        }

        this._changeState("streaming")
        let context = null
        try {
            const burst = await chatStream({
                model: voiceModel,
                messages,
                continueFinal,
                maxTokens: Number(burstTokens || this.attr("burstTokens") || 350),
                temperature: Number(this.attr("temperature") || 0.9),
                debugTag: "stream",
                debugEl: this,
            })
            // Superseded while the stream was still OPENING: _supersede() could not
            // abort us then (we only become _current now, after open returns), so
            // check the generation before emitting anything. Without this, a prompt
            // arriving during a slow open left BOTH bursts streaming and their chunks
            // interleaved character-by-character into the tail and journal (seen live
            // 2026-07-04). No boundary: superseded bursts never emit one.
            if (generation !== this._generation) {
                burst.abort()
                return
            }
            context = { burst, superseded: false }
            this._current = context

            // Models often re-anchor by echoing the last words of the carried
            // tail. Buffer the first ~100 chars and trim the overlap so burst
            // seams read as one continuous text.
            // In thinking mode the model does not echo the carried tail (it thinks a
            // fresh continuation), so there is no seam overlap to trim.
            let pending = ""
            let seamChecked = !dedupe || thinking
            // THE OUTPUT FILTER CHAIN (role port `stream-filter`, see the class doc): the
            // model's text runs through every filter before it is emitted. With no
            // filters the chain is a pass-through.
            const filters = this._filters()
            for (const f of filters) this._callFilter(f, "begin", { burstIndex, prefill, prefix, payload })
            // Emit what the chain passed; true when a filter stopped the burst.
            const pass = ({ emit, signal, by }) => {
                if (emit) { this._emitChunk(emit); burstChars += emit.length }
                if (!signal) return false
                this._stopBurst(context, by, signal, { burstIndex, burstChars })
                return true
            }
            for await (const text of burst) {
                if (context.superseded) break
                let modelText = text
                if (!seamChecked) {
                    pending += text
                    if (pending.length < 100) continue
                    modelText = trimSeamOverlap(dedupe, pending)
                    seamChecked = true
                    pending = ""
                }
                if (pass(this._feedChain(filters, modelText))) break
            }
            if (!seamChecked && pending && !context.superseded) {
                pass(this._feedChain(filters, trimSeamOverlap(dedupe, pending)))
            }
            if (!context.superseded) pass(this._flushChain(filters))

            if (!context.superseded) {
                this._finishBurst({ reason: "completed", burstIndex, burstChars })
            }
        } catch (error) {
            if (context?.superseded) return
            log.error("Burst error:", error.message || error)
            this._finishBurst({ reason: "error", burstIndex, burstChars, error: error.message || String(error) })
        } finally {
            if (this._current === context) this._current = null
        }
    }

    _finishBurst(boundary) {
        this._changeState("idle")
        process.stdout.write("\n")
        this.fire("boundary", boundary, { energy: ENERGY.deed })
    }

    /** This burst's output filters: the `stream-filter` providers inside me, in tree
     *  order. Resolved per burst, so adding or removing one takes effect at the next. */
    _filters() {
        return part(this, "stream-filter").filter(f => {
            if (typeof f.feed === "function") return true
            if (!this._badFilters.has(f)) {
                this._badFilters.add(f)
                log.warn(`<${f.localName}> provides stream-filter but has no feed() — skipped`)
            }
            return false
        })
    }

    /** Call one port method, normalized to {emit, signal}. A missing method, a
     *  non-object result or a throw PASSES THROUGH (feed) / releases nothing (flush):
     *  a broken filter degrades to no filter, it never kills the burst. */
    _callFilter(filter, method, arg) {
        const passThrough = { emit: method === "feed" ? arg : "", signal: null }
        const fn = filter[method]
        if (typeof fn !== "function") return passThrough
        try {
            const r = fn.call(filter, arg)
            if (typeof r === "string") return { emit: r, signal: null }
            if (!r || typeof r !== "object") return passThrough
            return { emit: typeof r.emit === "string" ? r.emit : "", signal: r.signal || null }
        } catch (error) {
            log.warn(`stream-filter <${filter.localName || "filter"}> ${method}() failed:`, error.message || error)
            return passThrough
        }
    }

    /** Run text through filters[from..]. A filter's signal stops the chain, but what
     *  it passed BEFORE stopping still runs through the filters below it (a downstream
     *  stop on that earlier text wins — it happened first in the text). */
    _feedChain(filters, text, from = 0) {
        let out = text
        for (let i = from; i < filters.length; i++) {
            if (!out) return { emit: "", signal: null }
            const r = this._callFilter(filters[i], "feed", out)
            if (r.signal) {
                const down = this._feedChain(filters, r.emit, i + 1)
                return down.signal ? down : { emit: down.emit, signal: r.signal, by: filters[i] }
            }
            out = r.emit
        }
        return { emit: out, signal: null }
    }

    /** End of burst: flush each filter in order, running what it releases through the
     *  filters below it before flushing those — so held text is judged by all of them. */
    _flushChain(filters) {
        let emit = ""
        for (let i = 0; i < filters.length; i++) {
            const r = this._callFilter(filters[i], "flush")
            const down = this._feedChain(filters, r.emit, i + 1)
            emit += down.emit
            if (down.signal) return { emit, signal: down.signal, by: down.by }
            if (r.signal) return { emit, signal: r.signal, by: filters[i] }
        }
        return { emit, signal: null }
    }

    /**
     * A filter stopped the burst. Stop FIRST — mark it superseded (so no boundary: the
     * mind neither reschedules from it nor backs off), abort the model call — and only
     * THEN hand the signal to the filter's react(). react() may fire `interrupt-request`,
     * which can assemble the next frame and start a new burst synchronously; by then this
     * one is already out of the way, and `context.superseded` keeps the caller's loop and
     * finally from touching the new burst.
     */
    _stopBurst(context, filter, signal, info) {
        log.info(`Burst ${info.burstIndex} stopped by stream-filter <${filter.localName || "filter"}>.`)
        context.superseded = true
        if (this._current === context) this._current = null
        try { context.burst.abort() } catch { /* already closed */ }
        this._changeState("idle")
        process.stdout.write("\n")
        if (typeof filter.react !== "function") return
        try { filter.react(signal, info) }
        catch (error) { log.warn(`stream-filter <${filter.localName || "filter"}> react() failed:`, error.message || error) }
    }

    _emitChunk(text) {
        this.chunkHistory.push(text)
        if (this.chunkHistory.length > 4000) {
            this.chunkHistory.splice(0, this.chunkHistory.length - 2000)
        }
        this.pub("chunk", text)
        process.stdout.write(text)
    }

    _changeState(newState) {
        if (this.streamState === newState) return
        const oldState = this.streamState
        this.streamState = newState
        this.pub("state", { oldState, newState, timestamp: new Date().toISOString() })
    }

    /**
     * Recent verbatim output — fallback tail source when no m-memory is present.
     * @param {number} maxChars
     * @returns {string}
     */
    getRecentOutput(maxChars = 1000) {
        let total = 0
        let start = this.chunkHistory.length
        while (start > 0 && total < maxChars) {
            start -= 1
            total += this.chunkHistory[start].length
        }
        return this.chunkHistory.slice(start).join("")
    }
}
