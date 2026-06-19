import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { parseNotebook } from "./mNote.js"
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
 *   - salience: salience of the "I find again…" consequence (default 0.6 — coming upon
 *     a thing the mind deliberately chose to look up should clear the attention bar as
 *     reliably as setting one down does, even on a tired mind; matches m-note)
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
        const dir = this.attr("dir") || mindHome(this, "notes")
        let raw
        try {
            raw = await fs.readFile(path.join(dir, "notebook.md"), "utf8")
        } catch (error) {
            if (error.code === "ENOENT") throw new Error("there is nothing set down yet")
            throw error
        }
        const notes = parseNotebook(raw)
        if (!notes.length) throw new Error("there is nothing set down yet")

        const note = this._pick(notes, about)
        this._seen.add(note.stamp)
        if (this._seen.size > 200) this._seen = new Set([...this._seen].slice(-100))

        const text = note.text.length > 400 ? note.text.slice(0, 400).trimEnd() + "…" : note.text
        return {
            experience: `I find again something I set down before${note.title ? `, about ${note.title.toLowerCase()}` : ""}: “${text}”`,
            salience: Number(this.attr("salience") || 0.6),
            data: { title: note.title, stamp: note.stamp },
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
            if (!this._seen.has(notes[i].stamp)) return notes[i]
        }
        return notes[notes.length - 1]
    }
}

if (!customElements.get('m-recall')) customElements.define('m-recall', MRecall);
