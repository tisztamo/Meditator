import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mNote.js');

/**
 * m-note — the first WORLD-CHANGING hand (efference.md §6c): the mind can set a
 * thought down somewhere outside itself, to be found again later.
 *
 * This is the other half of a closed sensorimotor loop, and the deepest answer to the
 * interoception worry: the mind doesn't only *look* at a world it cannot touch — it
 * leaves a mark on one. It writes; later it (via m-recall) or a person comes upon the
 * note; the act has an external residue the mind can meet again. Reaching out and
 * being met back is what anchors a mind in an outside rather than in its own substrate.
 *
 * Because it changes the world, it is `readonly:false` and carries its own guardrail
 * (efference.md §6c). The guardrail is structural and tight: **the realizer never
 * names a path.** It supplies only the note's text (and an optional title); m-note
 * chooses the file itself, always a single `notebook.md` inside the mind's own notes
 * directory. There is therefore no path-traversal vector, no arbitrary write, and the
 * blast radius is one append-only file in one allow-listed dir — auditable by reading
 * the architecture, exactly as a body plan should be.
 *
 * Registers itself with its parent <m-act> on connect. Wire it as:
 * <m-act ...><m-note name="note"/></m-act>.
 *
 * @interface
 * Attributes:
 *   - name: the tool-call function name (default "note")
 *   - dir: the notes directory (default: the mind's vault home `notes/`)
 *   - maxChars: cap on a single note's length (default 1200)
 *   - salience: salience of the "I set this down" consequence (default 0.6 — a thing
 *     the mind deliberately DID should be felt a touch more than ambient weather, so
 *     its return arc reliably lands even while a conversation is in flight; it clears
 *     a tired mind's arousal-raised bar too)
 */
export class MNote extends MBaseComponent {
    onConnect() {
        this._register()
    }

    async _register() {
        const name = this.attr("name") || "note"
        const spec = {
            name,
            description: "Set down a thought to keep — write it somewhere outside the mind so it is not lost "
                + "as the monologue scrolls on, and can be found again later. Use only when a thought genuinely "
                + "matters enough that the mind wants to hold onto it.",
            felt: this.attr("felt") || ("When a thought matters enough to keep, you can set it down where "
                + "it will keep, and come back to find it later, in your own words."),
            parameters: {
                type: "object",
                properties: {
                    text: { type: "string", description: "the thought to set down, in the mind's own first-person words" },
                    title: { type: "string", description: "a few words naming what this note is about" },
                },
                required: ["text"],
            },
            readonly: false,                  // WORLD-CHANGING — opt-in, guardrailed below
            execute: async args => this._note(args),
        }

        // Same retry-register as m-look: component upgrade order is not guaranteed.
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
     * Set a thought down. Returns a SELF-CAUSED experience ("I set this down…") so the
     * mind feels itself having kept the note — the efference copy that lets it learn it
     * can do this, and find the note again later. Throws on an empty note or a write
     * failure; m-act swallows it (a slip is silent, never self-blame).
     */
    async _note({ text, title } = {}) {
        const body = (text || "").trim()
        if (!body) throw new Error("there was nothing to set down")

        const dir = this.attr("dir") || mindHome(this, "notes")
        const kept = body.slice(0, Number(this.attr("maxChars") || 1200))
        const heading = (title || "").trim().slice(0, 120)
        const stamp = new Date().toISOString()

        // GUARDRAIL: the path is ours, never the realizer's — one notebook, one dir.
        await fs.mkdir(dir, { recursive: true })
        await fs.appendFile(path.join(dir, "notebook.md"), `\n\n## ${stamp}${heading ? ` — ${heading}` : ""}\n${kept}\n`)
        log.info(`note kept (${kept.length} chars)${heading ? `: ${heading}` : ""}`)

        const echo = kept.length > 140 ? kept.slice(0, 140).trimEnd() + "…" : kept
        return {
            experience: `I set this down to keep, somewhere I can find it again${heading ? `, under "${heading}"` : ""}: “${echo}”`,
            salience: Number(this.attr("salience") || 0.6),
            data: { title: heading || null, chars: kept.length },
        }
    }
}

/**
 * Parse a notebook written by m-note into entries, newest last (document order).
 * Pure and exported so m-recall can read notes back without duplicating the format,
 * and so it is testable without the filesystem.
 *
 * @param {string} md
 * @returns {{stamp: string, title: string|null, text: string}[]}
 */
export function parseNotebook(md) {
    if (!md) return []
    const entries = []
    const blocks = md.split(/^## /m).slice(1)   // each entry begins with "## <stamp>[ — <title>]"
    for (const block of blocks) {
        const nl = block.indexOf("\n")
        const header = (nl === -1 ? block : block.slice(0, nl)).trim()
        const text = (nl === -1 ? "" : block.slice(nl + 1)).trim()
        if (!text) continue
        const dash = header.indexOf(" — ")
        const stamp = (dash === -1 ? header : header.slice(0, dash)).trim()
        const title = dash === -1 ? null : header.slice(dash + 3).trim() || null
        entries.push({ stamp, title, text })
    }
    return entries
}

if (!customElements.get('m-note')) customElements.define('m-note', MNote);
