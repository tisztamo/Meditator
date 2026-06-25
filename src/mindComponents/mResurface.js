import A from "amanita"
import { MObserver } from "./mObserver.js"
import { contentStems, containment } from "./loopMath.js"
import { makePhrasebook } from "./i18n.js"
import { readKept } from "./recallSources.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mResurface.js');

/**
 * What m-resurface says, as localizable phrases (i18n.js). It supplies only its
 * CONTINUATION — the act of clearing the mind (the "I have been going over the same
 * ground; I set it down and come back fresh" prefix) is owned by the mechanism on m-mind
 * and shared by every breaker, so there is zero phrase-sharing between breakers. The slots:
 * `turn-note` / `turn-knowledge` say how the thought was met (set down vs. come to
 * understand — the One Rule), and `about` names it. The note's own words and the quotation
 * marks are assembled in code, around these slots.
 */
const RESURFACE_PHRASES = {
    en: {
        "turn-note": ["I turn back to something I set down before"],
        "turn-knowledge": ["I turn back to something I came to understand"],
        about: [", about {title}"],
    },
}

/**
 * m-resurface — a BREAKER. When m-loop-detector publishes that the mind is circling,
 * m-resurface bids to break the loop by handing back a kept thought that pulls AWAY from the
 * rut: the substantive note whose vocabulary is FARTHEST from the loop's vocabulary. This is
 * the involuntary return arc m-note / m-recall left open — a forgetting mind does not know it
 * has anything to look up, so the most useful thing it set down comes back to it unbidden.
 *
 * DETECT ≠ RECALL ≠ RESURFACE. Three jobs the old design tangled:
 *   - m-loop-detector SENSES the loop (the LLM call) and publishes `loop`.
 *   - m-recall is the desire-pulled hand: recall-when-you-reach-for-it ranks by RELEVANCE
 *     (overlap). Untouched — a different job.
 *   - m-resurface is a loop breaker: resurface-to-break-a-loop must introduce DISTANCE. So
 *     it ranks by FAR-from-the-detected-vocabulary, the opposite of relevance. "Far" also
 *     subsumes the old least-bliss pick with no lexicon: a bliss loop → bliss `vocabulary` →
 *     the farthest note IS the least-bliss note; an all-presence notebook → even the farthest
 *     note is still presence → too close → it does not bid, and the m-clear-mind floor takes
 *     the cut rather than re-injecting the attractor.
 *
 * It owns no detection and no floor: with an empty notebook, or when every kept note is too
 * close to the loop, it simply does not bid — m-clear-mind guarantees the break either way.
 *
 * Its bid carries `clearsTail` (the arbiter admits it past threshold + rate-limit without
 * preempting) and `episode` (the detection's timestamp, so co-bidding breakers resolve to one
 * cut). A higher salience than the floor, so it wins when it has something worth surfacing.
 *
 * Wire it as a direct child of the mind alongside the detector and the floor:
 *   <m-resurface name="resurface" minNoteChars="120" salience="0.75"
 *                farThreshold="0.4" cooldown="0ms"></m-resurface>
 *
 * @interface (plus MObserver's)
 * Attributes:
 *   - salience: bid salience (default 0.75 — above the m-clear-mind floor, below an urgent voice)
 *   - minNoteChars: a note must be at least this long to count as substantive, so a terse
 *     meta-note never wins over a real result (default 120)
 *   - farThreshold: how much of the loop's vocabulary a note may share and still count as
 *     "far enough" to surface — if even the farthest note's overlap is at/above this, it does
 *     not bid and the floor takes the cut (default 0.4)
 *   - dir: notes directory (default: the mind's vault home `notes/`, matching m-note)
 *   - kb: the scribe's knowledge directory, folded into the same pool ("off" for notes only)
 *   - loopSrc: the detector's loop topic (default: the mind's m-loop-detector `<name>/loop`,
 *     auto-discovered; "off" disables)
 *   - cooldown: minimum time between bids (default "0ms"; the per-episode guard is the real one)
 */
export class MResurface extends MObserver {
    _busy = false
    _lastEpisode = null
    _lastKey = null

    onObserverConnect() {
        // Per-episode dedup + m-mind's cut dedup do the throttling; the 60s observer
        // cooldown would only drop a fresh loop's bid, so default it off.
        if (this.getAttribute("cooldown") == null) this.setAttribute("cooldown", "0ms")

        const det = this.closest("m-mind")?.querySelector("m-loop-detector[name]")
        const detName = det?.getAttribute("name")
        const loopSrc = this.attr("loopSrc") || (detName ? `..m-mind/${detName}/loop` : null)
        if (loopSrc && loopSrc !== "off") this.sub(loopSrc, loop => this._onLoop(loop)).catch(() => {})
    }

    _onLoop(loop) {
        if (!loop || !loop.active) return
        if (this._busy) return
        if (loop.at && loop.at === this._lastEpisode) return
        this._lastEpisode = loop.at || null

        this._busy = true
        this._resurface(loop).catch(error => log.warn("resurface failed:", error.message || error))
            .finally(() => { this._busy = false })
    }

    async _resurface(loop) {
        const notesDir = this.attr("dir") || mindHome(this, "notes")
        const kb = this.attr("kb")
        const kbDir = kb === "off" ? null : (kb || mindHome(this, "knowledge"))

        // Both stores in one pool, oldest-first; pure file reads, never a model call.
        const kept = await readKept({ notesDir, kbDir })
        if (!kept.length) return   // nothing set down — the m-clear-mind floor breaks the loop

        const farThreshold = Number(this.attr("farThreshold") || 0.4)
        const note = this._pickFarthest(kept, loop.vocabulary || [], farThreshold)
        if (!note) return          // every kept note is too close to the loop — let the floor take it

        const text = note.text.length > 400 ? note.text.slice(0, 400).trimEnd() + "…" : note.text
        // Felt by where it came from, never how it was stored (the One Rule): a note was
        // deliberately "set down"; filed knowledge is something the mind "came to understand".
        const book = this._book()
        const turn = book.line(note.source === "knowledge" ? "turn-knowledge" : "turn-note")
        const about = note.title ? book.line("about", { title: note.title.toLowerCase() }) : ""
        const raised = this.raise(
            `${turn}${about}: “${text}”`,
            {
                salience: Number(this.attr("salience") || 0.75),
                clearsTail: true,
                episode: loop.at || null,
                kind: loop.kind || null,
                type: "Recall",
            }
        )
        if (raised) {
            this._lastKey = note.key
            log.info(`resurfaced far-from-loop kept ${note.source} (loop ${loop.kind})${note.title ? `: ${note.title}` : ""}`)
        }
    }

    /** This mind's localized phrases. Fixed after connect, so built once. */
    _book() {
        return (this.__book ||= makePhrasebook(this, RESURFACE_PHRASES))
    }

    /**
     * Pick the substantive kept note whose vocabulary is FARTHEST from the loop's — the one
     * that least overlaps the words the mind is stuck on, so what comes back pulls AWAY from
     * the rut rather than feeding it. Recency breaks ties (prefer the newer), and the last
     * note surfaced is avoided. Returns null when even the farthest note shares at least
     * `farThreshold` of the loop's vocabulary (an all-presence notebook on a presence loop),
     * so the caller stays silent and the floor takes the cut. Pure code — no model call.
     *
     * With an empty loop vocabulary (a content-free spam loop the detector named no themes
     * for), overlap is 0 for every note, so this degrades to "the freshest substantive note"
     * — exactly what a content-free trough wants pulled back.
     */
    _pickFarthest(notes, vocabulary, farThreshold) {
        const minNoteChars = Number(this.attr("minNoteChars") || 120)
        const vocabStems = contentStems((vocabulary || []).join(" "))

        const fresh = notes.filter(n => n.key !== this._lastKey)
        const pool = fresh.length ? fresh : notes
        const substantive = pool.filter(n => n.text.length >= minNoteChars)
        const candidates = substantive.length ? substantive : pool

        let best = null, bestOverlap = Infinity
        for (let i = 0; i < candidates.length; i++) {
            const n = candidates[i]
            const overlap = containment(contentStems(`${n.title || ""} ${n.text}`), vocabStems)
            // lowest overlap wins; <= lets a later (newer) note win an exact tie (recency)
            if (overlap <= bestOverlap) { bestOverlap = overlap; best = n }
        }
        // Even the farthest note is soaked in the loop's own vocabulary — do not feed it.
        if (!best || bestOverlap >= farThreshold) return null
        return best
    }
}

A.define('m-resurface', MResurface);
