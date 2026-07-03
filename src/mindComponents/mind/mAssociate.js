import { MObserver } from "./mObserver.js"
import { complete } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { logger } from '../../infrastructure/logger.js';

const log = logger('mAssociate.js');

/**
 * The associative observer — the internal source of direction changes. Every
 * `every` burst boundaries it reads the recent stream with a tiny model and
 * asks: does this remind you of something genuinely different? If yes, the
 * association is raised as a stimulus with the salience the model itself
 * assigned, and the arbiter decides whether it wins attention.
 *
 * @interface
 * Attributes (plus MObserver's):
 *   - every: evaluate at every Nth boundary (default 4)
 *   - model: tiny model for the association call (default ancestor utilityModel)
 */
export class MAssociate extends MObserver {
    _boundaryCount = 0
    _busy = false

    async onBoundary(boundary) {
        if (boundary?.reason !== "completed") return
        this._boundaryCount += 1
        const every = Number(this.attr("every") || 4)
        if (this._boundaryCount % every !== 0) return
        if (this._busy || this.window.length < 400) return

        this._busy = true
        try {
            const result = await complete({
                model: resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility"),
                maxTokens: 120,
                temperature: 0.9,
                debugTag: "associate",
                debugEl: this,
                prompt: `You are the associative undercurrent of a mind. Below is its current stream of thought:

<stream>
…${this.window.slice(-1200)}
</stream>

Does this genuinely remind you of something DIFFERENT — a memory, an image, a question, a connection from another domain — that would be worth drifting to? Only answer yes if the association is truly distinct from what the stream is already doing, not a continuation of it.

If nothing comes to mind, output exactly: NONE
Otherwise output exactly two lines:
SALIENCE: <0.0-1.0, how strongly this calls for attention>
THOUGHT: <one first-person sentence, e.g. "This reminds me of …">`,
            })

            const text = result.text.trim()
            if (/^NONE\b/i.test(text)) return
            const salience = parseFloat((text.match(/SALIENCE:\s*([\d.]+)/i) || [])[1])
            const thought = (text.match(/THOUGHT:\s*(.+)/i) || [])[1]
            if (!thought) return

            this.raise(thought.trim(), {
                salience: Number.isFinite(salience) ? salience : 0.5,
                type: "Association",
            })
        } catch (error) {
            log.warn("Association call failed:", error.message)
        } finally {
            this._busy = false
        }
    }
}
