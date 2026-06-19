import fs from 'node:fs/promises';
import path from 'node:path';
import { MObserver } from "./mObserver.js"
import { loopScore, contentStems, containment } from "./mLoopGuard.js"
import { parseNotebook } from "./mNote.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mResurface.js');

/**
 * m-resurface — INVOLUNTARY recall. When the mind loses its thread (circles the
 * same ground in lightly-paraphrased words), it does not wait to *want* a note —
 * the most relevant thing it has set down comes back to it, unbidden.
 *
 * This closes the half of the note loop that m-note / m-recall left open. m-note
 * writes; m-recall *can* read back, but only as a HAND — it fires only when the
 * conscious stream already reaches toward it (the m-act DECIDE gate), and a
 * forgetting mind, by definition, does not know it has anything to look up. The
 * graveyard proves the cost: lemma-6 logged 43 note-writes and 0 recalls, then
 * re-derived a proof it had already written hours earlier, while that proof sat
 * unread a few entries above in the same notebook. Writing is content-pushed ("this
 * matters — keep it"); reading is desire-pulled ("I should check what I concluded"),
 * and that desire rarely surfaces, least of all in the trough where it is needed.
 * So reads always lose. m-resurface gives the mind's own stored truth a PUSH
 * channel — the way m-associate pushes a confabulated "this reminds me of…", except
 * grounded in a real kept note rather than the model's latent training.
 *
 * It shares m-loop-guard's instinct (turn the circling mind elsewhere) and its
 * pure-code trigger (the same `loopScore`, no LLM cost to decide). But where the
 * loop-guard offers a generic "pick something unrelated" — which a forgetting mind
 * answers with sensory escape hatches that collapse into a fresh loop — m-resurface
 * hands back what this mind actually worked out, chosen by cue-overlap with the very
 * thought it is circling. One notebook read; no model call.
 *
 * Wire it as a DIRECT CHILD of the mind (not inside the drift region) so its high
 * salience is not damped by a region gain, and raise it `urgent` so it is never
 * suppressed by the global rate limit a co-firing loop-guard would otherwise win —
 * recovering lost work should break in like the keep-alive watchdog does:
 *   <m-resurface name="resurface" overlap="0.4" salience="0.9" cooldown="3m"></m-resurface>
 *
 * The surfaced note re-enters as an Observer stimulus through the arbiter (so it is
 * journaled perceived ⟂ like any afference), framed first-person and self-caused —
 * never as a mechanism, exactly like every other sensation.
 *
 * @interface (plus MObserver's window / cooldown / salience / src)
 * Attributes:
 *   - overlap: loop score that counts as "I've lost the thread" (default 0.4, matching
 *     a calm mind's m-loop-guard)
 *   - minWindow: min stream chars before it will judge a loop (default 700)
 *   - minNoteChars: a note must be at least this long to count as substantive — so a
 *     terse meta-note ("I notice I am looping") never wins over a real result (default 120)
 *   - urgent: "true" to supersede the looping burst immediately (default true)
 *   - dir: notes directory (default: the mind's vault home `notes/`, matching m-note)
 *   - salience: salience of the resurfaced note (default 0.9 — recovering lost work is
 *     as important as the keep-alive watchdog, so it lands even on a tired mind)
 */
export class MResurface extends MObserver {
    _busy = false
    _lastStamp = null

    onBoundary(boundary) {
        if (boundary?.reason !== "completed") return
        if (this._busy) return
        if (this.window.length < Number(this.attr("minWindow") || 700)) return

        const score = loopScore(this.window)
        if (score < Number(this.attr("overlap") || 0.4)) return

        // The cheap gate held: the mind is circling. The only cost from here is one
        // notebook read — never a model call.
        this._busy = true
        this._resurface(score).catch(error => log.warn("resurface failed:", error.message || error))
            .finally(() => { this._busy = false })
    }

    async _resurface(score) {
        const dir = this.attr("dir") || mindHome(this, "notes")
        let raw
        try {
            raw = await fs.readFile(path.join(dir, "notebook.md"), "utf8")
        } catch (error) {
            if (error.code === "ENOENT") return   // nothing set down yet — leave it to the loop-guard
            throw error
        }
        const notes = parseNotebook(raw)
        if (!notes.length) return

        const note = this._pickRelevant(notes)
        if (!note) return

        const text = note.text.length > 400 ? note.text.slice(0, 400).trimEnd() + "…" : note.text
        const raised = this.raise(
            `I realize I have been going over the same ground. I turn back to something I set down before`
            + `${note.title ? `, about ${note.title.toLowerCase()}` : ""}: “${text}”`,
            {
                salience: Number(this.attr("salience") || 0.9),
                urgent: this.attr("urgent") !== "false",
                type: "Recall",
            }
        )
        if (raised) {
            this._lastStamp = note.stamp
            this.window = ""   // start fresh so the same loop does not re-fire next boundary
            log.info(`resurfaced a kept note (loop ${(score * 100).toFixed(0)}%)${note.title ? `: ${note.title}` : ""}`)
        }
    }

    /**
     * Pick the kept note most worth handing back to a circling mind: the one whose
     * own words most overlap what the mind is now turning over (so it is RELEVANT to
     * the loop, not a random memory), preferring substantive notes over short
     * meta-notes, and never the one just resurfaced. Pure code — no model call.
     */
    _pickRelevant(notes) {
        const minNoteChars = Number(this.attr("minNoteChars") || 120)
        const nowCues = contentStems(this.window)
        if (!nowCues.size) return null

        const fresh = notes.filter(n => n.stamp !== this._lastStamp)
        const pool = fresh.length ? fresh : notes
        const substantive = pool.filter(n => n.text.length >= minNoteChars)
        const candidates = substantive.length ? substantive : pool

        let best = null, bestScore = -Infinity
        for (let i = 0; i < candidates.length; i++) {
            const n = candidates[i]
            const relevance = containment(contentStems(`${n.title || ""} ${n.text}`), nowCues)
            // recency as a gentle tiebreaker, so equally-relevant notes prefer the newer
            const score = relevance + i * 1e-4
            if (score > bestScore) { bestScore = score; best = n }
        }
        return best
    }
}

if (!customElements.get('m-resurface')) customElements.define('m-resurface', MResurface);
