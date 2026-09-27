import { MBaseComponent } from "../shared/mBaseComponent.js"
import { ENERGY } from "../shared/infoton.js"
import { FilterChain, CHAIN_ROLE, DEFAULT_FILTER_DEADLINE_MS } from "../shared/streamFilters.js"
import { chatStream } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { parseTime } from "../../config/timeParser.js"
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
 *   - "!scope/@hush" (hushSrc): a request; the running burst is superseded and the
 *     reply {hushed, burstIndex} follows, so the mind perceives after the burst stopped
 *
 * Topics published:
 *   - "chunk": each text fragment as it arrives (the prefix is emitted as a chunk too)
 *   - "boundary": {reason: completed|aborted|error|superseded, burstIndex, burstChars, error?}
 *                 emitted when a burst ends and was NOT superseded by a newer prompt
 *   - "state": {oldState, newState, timestamp} — kept for the websocket client
 *
 * The OUTPUT FILTER CHAIN (role `filter-chain`; shared/streamFilters.js): every part
 * inside me that provides `stream-filter`, in tree order, sees the model's text BEFORE
 * it is emitted, so a filter can pass, rewrite, hold back or stop it before it reaches
 * the chunk topic, the tail and the journal. Only model-authored text is filtered (after
 * seam trimming); the mechanism's own `prefix` bypasses the chain. Each stage is ASKED,
 * by name, with a `filter` request fired on me: {op: begin|feed|flush} → {emit, signal?}
 * ("" holds text back). A `signal` STOPS the burst: the stream emits what the chain
 * passed, aborts, supersedes (no boundary — the mind neither reschedules nor backs off)
 * and only then fires `filter-stopped` for that stage, whose react() may redirect the
 * mind. A stage that throws passes its text through; one silent past `filterDeadline`
 * (default 2s) is dropped for the rest of the burst (M6).
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
    static provides = { [CHAIN_ROLE]: true }

    chunkHistory = []
    streamState = "idle"
    burstIndex = 0
    _current = null      // {burst, generation}
    _generation = 0

    "../prompt" = async payload => {
        this._generation += 1
        const generation = this._generation
        this._supersede()
        await this._startBurst(payload, generation)
    }

    onConnect() {
        super.onConnect()
        // The mind asks for quiet before it perceives (message-rule.md): stop the
        // running burst now, so its last words are recorded before what reached the
        // mind, not after. The reply is sent once the burst is aborted.
        if (this.attr("hushSrc") !== "off") {
            this.respond("hush", () => this._hush(), { src: this.attr("hushSrc") || "!scope/@hush" })
                .catch(err => { if (this.isConnected) log.warn('stream hush bind failed:', err.message) })
        }
    }

    /** Supersede the running (or opening) burst without starting another. */
    _hush() {
        const running = !!this._current
        this._generation += 1
        this._supersede()
        return { hushed: running, burstIndex: this.burstIndex }
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
            // THE OUTPUT FILTER CHAIN (see the class doc): the model's text runs through
            // every filter before it is emitted. With no filters it is a pass-through.
            const chain = await FilterChain.open(this, { burstIndex, prefill, prefix, payload },
                { deadline: this._filterDeadline(), log })
            // Emit what the chain passed; true when the burst is over (a filter stopped
            // it, or it was superseded while the chain was still answering).
            const pass = ({ emit, signal, by }) => {
                if (context.superseded) return true
                if (emit) { this._emitChunk(emit); burstChars += emit.length }
                if (!signal) return false
                this._stopBurst(context, chain, by, signal, { burstIndex, burstChars })
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
                if (pass(await chain.feed(modelText))) break
            }
            if (!seamChecked && pending && !context.superseded) {
                pass(await chain.feed(trimSeamOverlap(dedupe, pending)))
            }
            if (!context.superseded) pass(await chain.flush())

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

    /** `filterDeadline` in parseTime form ("2s", "500ms"), else the default. */
    _filterDeadline() {
        const raw = this.attr("filterDeadline")
        if (!raw) return DEFAULT_FILTER_DEADLINE_MS
        try { return parseTime(raw) } catch { return DEFAULT_FILTER_DEADLINE_MS }
    }

    /**
     * A filter stopped the burst. Stop FIRST — mark it superseded (so no boundary: the
     * mind neither reschedules from it nor backs off), abort the model call — and only
     * THEN tell the stopping stage (`filter-stopped`), so its react() never meets a
     * burst that is still running.
     */
    _stopBurst(context, chain, stage, signal, info) {
        log.info(`Burst ${info.burstIndex} stopped by stream-filter "${stage}".`)
        context.superseded = true
        if (this._current === context) this._current = null
        try { context.burst.abort() } catch { /* already closed */ }
        this._changeState("idle")
        process.stdout.write("\n")
        chain.stopped(stage, signal, info)
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
