import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"
import { completeWithTools } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mReason.js")

/**
 * The REASONER — an agent's model call, the twin of a mind's <m-stream>. It owns
 * exactly one seam (agent-loop.md §3, §15): turn in → next move out.
 *
 *   consume  ../turn  { system, messages, tools }
 *   produce  reply    { text, tool_calls, finish_reason }
 *
 * m-agent assembles the turn and drains the reply; m-reason only decides the move.
 * Because the loop binds to this CONTRACT (not to this implementation), the whole
 * reasoning strategy is swappable without touching the loop, the tools, or the
 * observers — plan-then-act, sample-and-vote, a model cascade, thinking mode — the
 * same way m-stream is separable under m-mind (agent-loop.md §15). This is the
 * single-shot baseline: one completeWithTools per step.
 *
 * @interface
 * Attributes:
 *   - model: the tool-calling model (falls back to the ancestor `model` attr, then
 *     the "voice" role). Same resolution as m-act's realizer and m-stream's voice.
 *   - toolTokens: max tokens for the move (default 2048) — roomy, because a
 *     tool-calling turn carries arguments as well as any natural-language text.
 *   - temperature: sampling temperature (default 0.2) — low; an agent acts, it does
 *     not free-associate.
 *
 * Subscriptions:
 *   - "../turn": the assembled request for this step, published by m-agent.
 *
 * Topics published:
 *   - "reply": { text, tool_calls, finish_reason } — the move. On a model/config
 *     error it still publishes a reply with finish_reason "error" (and an `error`
 *     field) so the loop is never left waiting forever.
 */
export class MReason extends MBaseComponent {
    _busy = false

    onConnect() {
        // Subscribe explicitly (not as an auto-sub field) so a misplaced m-reason with
        // no m-agent parent fails quietly instead of leaking an unhandled ref-resolution
        // rejection — the pattern m-mind uses for its optional mirrors. m-agent controls
        // the cadence — it never publishes a new turn until it has drained the last reply
        // — so turns never overlap; the _busy guard is belt-and-suspenders.
        this.sub("../turn", turn => this._onTurn(turn)).catch(() => {
            log.warn("m-reason found no ../turn to subscribe to — it must sit directly inside an <m-agent>")
        })
    }

    async _onTurn(turn) {
        if (!turn || !Array.isArray(turn.messages)) return
        if (this._busy) {
            // Should not happen (m-agent is strictly ping-pong); if it ever does, drop
            // the extra turn rather than issue an overlapping model call.
            log.warn("a turn arrived while a move was still in flight — ignoring it")
            return
        }
        this._busy = true
        try {
            const reply = await this._move(turn)
            this.pub("reply", reply)
        } catch (error) {
            // A genuine client/config error (completeWithTools does not retry). Surface
            // it as an error reply so m-agent can stop honestly instead of hanging.
            log.warn("reason move failed:", error?.message || error)
            this.pub("reply", { text: "", tool_calls: [], finish_reason: "error", error: error?.message || String(error) })
        } finally {
            this._busy = false
        }
    }

    /** One move: assemble the chat request, call the model, return the raw reply. */
    async _move(turn) {
        const model = resolveModelRef(this.attr("model") || this.env("model"), "voice")
        const messages = [
            ...(turn.system ? [{ role: "system", content: turn.system }] : []),
            ...turn.messages,
        ]
        const result = await completeWithTools({
            model,
            messages,
            tools: turn.tools?.length ? turn.tools : undefined,
            toolChoice: turn.tools?.length ? "auto" : undefined,
            maxTokens: Number(this.attr("toolTokens") || 2048),
            temperature: Number(this.attr("temperature") ?? 0.2),
            debugTag: "reason",
            debugEl: this,
        })
        return {
            text: result.text || "",
            tool_calls: result.tool_calls || [],
            finish_reason: result.finish_reason ?? null,
        }
    }
}

A.define("m-reason", MReason)
