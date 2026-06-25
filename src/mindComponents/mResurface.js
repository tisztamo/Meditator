import A from "amanita"
import { MObserver } from "./mObserver.js"
import { loopScore, contentStems, containment, LOOP_PHRASES } from "./mLoopGuard.js"
import { blissStemSet, blissSaturation } from "./attractorLexicon.js"
import { makePhrasebook } from "./i18n.js"
import { readKept } from "./recallSources.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mResurface.js');

/**
 * What m-resurface says, as localizable phrases (i18n.js). The English defaults are
 * verbatim what it has always raised; a non-English mind overrides any slot from the
 * .archml with <m-phrase for="…"> on the element. It shares the loop-guard's `notice`
 * and `redirect` slots for the content-free floor, and adds its own for the recalled
 * note: `ground` opens it, `turn-note` / `turn-knowledge` say how the thought was met
 * (set down vs. come to understand — the One Rule), and `about` names it. The note's own
 * words and the quotation marks are assembled in code, around these slots.
 */
const RESURFACE_PHRASES = {
    en: {
        notice: LOOP_PHRASES.en.notice,
        redirect: LOOP_PHRASES.en.redirect,
        ground: ["I realize I have been going over the same ground."],
        "turn-note": ["I turn back to something I set down before"],
        "turn-knowledge": ["I turn back to something I came to understand"],
        about: [", about {title}"],
    },
}

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
 *   - kb: the scribe's knowledge directory, folded into the same candidate pool so a
 *     filed conclusion can resurface too — not only a hand-written note (default: the
 *     mind's vault home `knowledge/`, matching m-kb; "off" to draw from notes only)
 *   - salience: salience of the resurfaced note (default 0.9 — recovering lost work is
 *     as important as the keep-alive watchdog, so it lands even on a tired mind)
 *   - blissThreshold: attractor-saturation 0..1 above which the looping window counts as a
 *     *bliss loop* rather than a normal content loop (default 0.2; see below and
 *     attractorLexicon.js). The lexicon is language-aware (the ambient <m-mind lang>) and
 *     extensible from the .archml with <m-phrase for="bliss"> words on this element.
 *
 * THE BLISS LOOP. Overlap-ranked recall is right for a normal content loop — hand back the
 * kept thought most relevant to what the mind is circling. But when the loop *is itself the
 * spiritual bliss attractor* (presence, silence, stillness, "I am here, now, and that is
 * enough"; doc/improvements/bliss-loop-recall.md), overlap is exactly wrong: the
 * most-overlapping note is by definition the most presence-soaked note the mind owns, so
 * the one component meant to break the loop would feed it. So this is a DOUBLE GATE — the
 * pure-code loop detector says "circling," AND attractorLexicon says the circled text is
 * bliss-saturated — and on a bliss loop m-resurface does NOT rank by overlap: it hands back
 * the freshest substantive *least-bliss* kept note (ideally a real result — the
 * inexhaustible outside the mind can climb out on), never the attractor's own words. If
 * every kept note is itself bliss-saturated, it falls through to the same content-free
 * change-of-direction nudge it raises with an empty notebook — never silent, never
 * re-injecting presence.
 */
export class MResurface extends MObserver {
    _busy = false
    _lastKey = null

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
        const notesDir = this.attr("dir") || mindHome(this, "notes")
        const kb = this.attr("kb")
        const kbDir = kb === "off" ? null : (kb || mindHome(this, "knowledge"))

        // Both stores in one pool, oldest-first; pure file reads, never a model call.
        const kept = await readKept({ notesDir, kbDir })
        if (!kept.length) {
            // Nothing to resurface — fall back to the generic change-of-direction stimulus.
            this._raiseFloor()
            return
        }

        // The double gate: the loop is already confirmed (above); is the circled text the
        // *bliss attractor* rather than real content? If so, overlap-ranking would feed the
        // loop, so hand back the least-bliss substantive note instead (a real result if the
        // mind has one) — and if even that is presence-soaked, fall through to the nudge.
        const threshold = Number(this.attr("blissThreshold") || 0.2)
        const blissy = blissSaturation(this.window, this._blissStems()) >= threshold
        const note = blissy ? this._pickLeastBliss(kept, threshold) : this._pickRelevant(kept)
        if (!note) {
            this._raiseFloor()   // a bliss loop whose every kept note is itself bliss
            return
        }

        const text = note.text.length > 400 ? note.text.slice(0, 400).trimEnd() + "…" : note.text
        // Felt by where it came from, never how it was stored (the One Rule): a note was
        // deliberately "set down"; filed knowledge is something the mind "came to understand".
        const book = this._book()
        const turn = book.line(note.source === "knowledge" ? "turn-knowledge" : "turn-note")
        const about = note.title ? book.line("about", { title: note.title.toLowerCase() }) : ""
        const raised = this.raise(
            `${book.line("ground")} ${turn}${about}: “${text}”`,
            {
                salience: Number(this.attr("salience") || 0.9),
                urgent: this.attr("urgent") !== "false",
                type: "Recall",
            }
        )
        if (raised) {
            this._lastKey = note.key
            this.window = ""   // start fresh so the same loop does not re-fire next boundary
            log.info(`resurfaced ${blissy ? "least-bliss " : ""}kept ${note.source} (loop ${(score * 100).toFixed(0)}%${blissy ? ", bliss" : ""})${note.title ? `: ${note.title}` : ""}`)
        }
    }

    /**
     * The generic, content-free change-of-direction stimulus — the same message
     * m-loop-guard raises. The safe floor: used when there is nothing kept to resurface,
     * and when a bliss loop's every kept note is itself bliss-saturated (so re-injecting
     * any of them would feed the attractor). Never silent, never presence words.
     */
    _raiseFloor() {
        const book = this._book()
        const raised = this.raise(book.line("notice"), {
            salience: Number(this.attr("salience") || 0.9),
            urgent: this.attr("urgent") !== "false",
            suggestion: book.line("redirect"),
            type: "LoopGuard",
        })
        if (raised) this.window = ""
        return raised
    }

    /** This mind's localized phrases for what resurface says (i18n.js). Fixed after
     *  connect — the <m-phrase> children do not change — so built once. */
    _book() {
        return (this.__book ||= makePhrasebook(this, RESURFACE_PHRASES))
    }

    /** The mind's attractor stem-set: its language's built-in bliss words plus any
     *  <m-phrase for="bliss"> the .archml added. Fixed after connect, so computed once. */
    _blissStems() {
        return (this.__blissStems ||= blissStemSet(this))
    }

    /**
     * Pick the kept note most worth handing back to a circling mind: the one whose
     * own words most overlap what the mind is now turning over (so it is RELEVANT to
     * the loop, not a random memory), preferring substantive notes over short
     * meta-notes, and never the one just resurfaced. Pure code — no model call.
     */
    _pickRelevant(notes) {
        const minNoteChars = Number(this.attr("minNoteChars") || 120)

        const fresh = notes.filter(n => n.key !== this._lastKey)
        const pool = fresh.length ? fresh : notes
        const substantive = pool.filter(n => n.text.length >= minNoteChars)
        const candidates = substantive.length ? substantive : pool

        // A loop that still carries content: surface the kept note whose own words most
        // overlap it, so what comes back is RELEVANT to the loop, not a random memory.
        // But a loop can collapse into content-free spam ("1. 1. 1.", repeated
        // punctuation) that yields no cues to rank by — and that trough is exactly when
        // a real kept result is most worth pulling back. So when there are no cues, fall
        // back to the freshest substantive note rather than going silent and ceding the
        // boundary to the loop-guard's generic "pick something unrelated" (lemma-7: its
        // one in-notebook loop was digit-spam, so resurface never once fired).
        const nowCues = contentStems(this.window)
        if (!nowCues.size) return candidates[candidates.length - 1]

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

    /**
     * Pick the kept note to hand a mind in a BLISS loop: the *least* bliss-saturated
     * substantive note, so what comes back is the most "outside" thing the mind owns — a
     * real result (saturation ~0) wins over a presence note. Deliberately the opposite of
     * _pickRelevant's overlap ranking, because on a bliss loop the most-overlapping note is
     * the most presence-soaked one. Recency breaks ties (prefer the newer). Returns null
     * when even the least-bliss substantive note is itself at or above the bliss threshold —
     * the notebook is all presence, so the caller raises the content-free floor rather than
     * re-injecting the attractor. Pure code — no model call.
     */
    _pickLeastBliss(notes, threshold) {
        const minNoteChars = Number(this.attr("minNoteChars") || 120)
        const stems = this._blissStems()

        const fresh = notes.filter(n => n.key !== this._lastKey)
        const pool = fresh.length ? fresh : notes
        const substantive = pool.filter(n => n.text.length >= minNoteChars)
        const candidates = substantive.length ? substantive : pool

        let best = null, bestSat = Infinity
        for (let i = 0; i < candidates.length; i++) {
            const n = candidates[i]
            const sat = blissSaturation(`${n.title || ""} ${n.text}`, stems)
            // lowest saturation wins; <= lets a later (newer) note win an exact tie
            if (sat <= bestSat) { bestSat = sat; best = n }
        }
        // If even the least-bliss note is itself bliss-saturated, do not re-inject it.
        if (!best || bestSat >= threshold) return null
        return best
    }
}

A.define('m-resurface', MResurface);
