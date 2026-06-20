import { MBaseComponent } from "./mBaseComponent.js"
import { readKept } from "./recallSources.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mRecall.js');

/**
 * m-recall — the read-back hand that closes m-note's loop (efference.md §6c): the mind
 * can turn back and find a thought it once set down, in its own words.
 *
 * It is read-only, and the gentler, more inward-facing of the pair — recalling one's
 * own kept notes is closer to interoception than looking at the weather is, so it
 * should never *lead*. But because the notes are real external residue (m-note wrote
 * them to a file; a person may have read or even added to them), coming upon one is a
 * genuine small encounter, not mere rumination — the return arc of reach → mark →
 * meet-again that anchors the mind in an outside.
 *
 * Registers with its parent <m-act> on connect. Pair it with m-note, sharing a `dir`:
 * <m-act ...><m-note name="note"/><m-recall name="recall"/></m-act>.
 *
 * @interface
 * Attributes:
 *   - name: the tool-call function name (default "recall")
 *   - dir: the notes directory (default: the mind's vault home `notes/`, matching m-note)
 *   - kb: the scribe's knowledge directory, folded into the same candidate pool so the
 *     mind can find again a conclusion it once filed — not only a hand-written note
 *     (default: the mind's vault home `knowledge/`, matching m-kb; "off" for notes only)
 *   - salience: salience of the "I find again…" consequence (default 0.8 — coming upon
 *     a thing the mind deliberately chose to look up should land reliably even in a
 *     crowded queue; higher than m-note's write because a recall arrives in a more
 *     contended window than a write does — see `urgent` below)
 *   - urgent: re-enter the recalled note as an URGENT stimulus ("true", the default),
 *     so it bypasses the arbiter's threshold + rate-limit instead of losing the slot to
 *     a co-firing watchdog/associate as a non-urgent 0.6 consequence did (lemma-7: the
 *     hand fired, but the recalled note never came back). "false" makes it ambient like
 *     a write — it then waits for a free boundary and may be dropped.
 */
export class MRecall extends MBaseComponent {
    _seen = new Set()

    onConnect() {
        this._register()
    }

    async _register() {
        const name = this.attr("name") || "recall"
        const spec = {
            name,
            description: "Bring back something the mind set down before — read one of its own kept notes. "
                + "Use when a past thought stirs and the mind wants to find again what it had written, in its own words.",
            felt: this.attr("felt") || ("And nothing you set down is lost: when one of those thoughts stirs "
                + "in you again, you can turn back and find it, just as you left it."),
            parameters: {
                type: "object",
                properties: {
                    about: { type: "string", description: "a few words about which kept thought is stirring, if any in particular" },
                },
            },
            readonly: true,
            execute: async args => this._recall(args),
        }

        for (let i = 0; i < 100; i++) {
            const act = this.closest("m-act")
            if (act && typeof act.registerCapability === "function") {
                act.registerCapability(spec)
                return
            }
            await new Promise(resolve => setTimeout(resolve, 50))
        }
        log.warn(`[${name}] found no parent <m-act> to register with; this hand is inert.`)
    }

    /**
     * Bring one kept note back as a SELF-CAUSED encounter ("I find again something I
     * set down…"). With an `about` hint, prefer a note that touches it; otherwise the
     * freshest one not recently surfaced. Throws when nothing has been set down yet, or
     * on a read failure; m-act swallows it.
     */
    async _recall({ about } = {}) {
        const notesDir = this.attr("dir") || mindHome(this, "notes")
        const kb = this.attr("kb")
        const kbDir = kb === "off" ? null : (kb || mindHome(this, "knowledge"))

        const kept = await readKept({ notesDir, kbDir })
        if (!kept.length) throw new Error("there is nothing set down yet")

        const note = this._pick(kept, about)
        this._seen.add(note.key)
        if (this._seen.size > 200) this._seen = new Set([...this._seen].slice(-100))

        const text = note.text.length > 400 ? note.text.slice(0, 400).trimEnd() + "…" : note.text
        // Felt by where it came from, never how it was stored: a note was deliberately
        // "set down"; filed knowledge is something the mind "had worked out".
        const found = note.source === "knowledge"
            ? "I find again something I had worked out"
            : "I find again something I set down before"
        return {
            experience: `${found}${note.title ? `, about ${note.title.toLowerCase()}` : ""}: “${text}”`,
            salience: Number(this.attr("salience") || 0.8),
            // Re-enter URGENT (unless told otherwise): a recalled note answers a reach
            // the mind just made, but its consequence lands some bursts later in a
            // contended window — right after the note-write, amid the watchdog and
            // associate. As a non-urgent 0.6 stimulus it was silently rate-limited away
            // (lemma-7: recall fired, the note never came back). Urgent bypasses the
            // arbiter's threshold + rate-limit so the answer to "find what I wrote" is
            // not a coin flip; the high salience keeps it from being crowded out among
            // co-firing urgents.
            urgent: this.attr("urgent") !== "false",
            data: { title: note.title, stamp: note.stamp, source: note.source },
        }
    }

    /** Choose which kept note to surface: one matching the hint if given, else the
     *  freshest not surfaced recently, else simply the freshest. */
    _pick(notes, about) {
        const hint = (about || "").toLowerCase().match(/\p{L}{4,}/gu) || []
        if (hint.length) {
            // Newest-first, the first note whose text or title mentions a hint word.
            for (let i = notes.length - 1; i >= 0; i--) {
                const hay = `${notes[i].title || ""} ${notes[i].text}`.toLowerCase()
                if (hint.some(w => hay.includes(w))) return notes[i]
            }
        }
        for (let i = notes.length - 1; i >= 0; i--) {
            if (!this._seen.has(notes[i].key)) return notes[i]
        }
        return notes[notes.length - 1]
    }
}

if (!customElements.get('m-recall')) customElements.define('m-recall', MRecall);
