import { MBaseComponent } from "../shared/mBaseComponent.js"
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

export class MStream extends MBaseComponent {
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

    _supersede() {
        if (this._current) {
            this._current.superseded = true
            this._current.burst.abort()
            this._current = null
        }
    }

    async _startBurst(payload, generation) {
        const { system, instruction, prefill, frame, prefix, dedupe, burstTokens } =
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

        const messages = []
        if (system) messages.push({ role: 'system', content: system })
        if (prefill && thinking) {
            messages.push({ role: 'user', content: `${userTurn}\n\nYour most recent words:\n"…${prefill}"` })
        } else {
            if (userTurn) messages.push({ role: 'user', content: userTurn })
            if (prefill) messages.push({ role: 'assistant', content: prefill })
        }

        // The bridge (or any injected text) physically enters the stream:
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
            context = { burst, superseded: false }
            this._current = context

            // Models often re-anchor by echoing the last words of the carried
            // tail. Buffer the first ~100 chars and trim the overlap so burst
            // seams read as one continuous text.
            // In thinking mode the model does not echo the carried tail (it thinks a
            // fresh continuation), so there is no seam overlap to trim.
            let pending = ""
            let seamChecked = !dedupe || thinking
            for await (const text of burst) {
                if (context.superseded) break
                if (!seamChecked) {
                    pending += text
                    if (pending.length >= 100) {
                        const trimmed = trimSeamOverlap(dedupe, pending)
                        seamChecked = true
                        this._emitChunk(trimmed)
                        burstChars += trimmed.length
                        pending = ""
                    }
                    continue
                }
                this._emitChunk(text)
                burstChars += text.length
            }
            if (!seamChecked && pending && !context.superseded) {
                const trimmed = trimSeamOverlap(dedupe, pending)
                this._emitChunk(trimmed)
                burstChars += trimmed.length
            }

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
        this.fire("boundary", boundary)
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
