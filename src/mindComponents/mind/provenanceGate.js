/**
 * provenanceGate.js — the provenance check on the mind's own output.
 *
 * A line beginning `> ⟂` is the ONE rendering of perception in the stream record
 * (interruptRecord.js, withPerceivedEvents): it marks something that actually
 * reached the mind. Only the world writes those lines — the mechanism appends them
 * to the prefill from the frame's attended percepts, and the mind's voice continues
 * AFTER them. So a `> ⟂` line that appears in the MODEL'S OWN output is a claim of
 * perception. If no attended percept in the current frame accounts for it — and it
 * is not an echo of a `> ⟂` line already carried in the tail — the mind is
 * confabulating a sense: inventing a perception and letting it ride the tail as if
 * the world had delivered it. That is the hallucinated-input failure this gate
 * exists to catch.
 *
 * The gate is a small stateful filter that every model chunk runs through BEFORE it
 * is emitted (so a confabulated line never reaches the tail or the journal) — wired
 * into the stream by <m-provenance-filter>, a `stream-filter` role port. It returns
 * the clean prefix to emit and, when it sees a model-authored `> ⟂` line with no
 * provenance, the confabulation so the burst can be stopped and corrected.
 *
 * Pure and unit-testable without a mind or a stream.
 */

/**
 * Extract the rendered `> ⟂ …` lines from a stretch of stream text. The `> ⟂`
 * prefix is the perception marker (withPerceivedEvents), so a line is a perception
 * line iff, once left-trimmed, it begins with `> ⟂`. Used to seed the gate with the
 * `> ⟂` lines already carried in the tail — the mind may take in (echo) what it has
 * already perceived, but a `> ⟂` line that is nowhere in the frame or the tail is a
 * fresh, ungrounded perception: a confabulation.
 *
 * @param {string} text
 * @returns {string[]} the `> ⟂ …` lines, verbatim (leading whitespace stripped)
 */
export function perceptLines(text) {
    if (!text) return []
    const out = []
    for (const raw of String(text).split("\n")) {
        const line = raw.trimStart()
        if (line.startsWith("> ⟂")) out.push(line)
    }
    return out
}

/** Normalise a line for comparison: collapse inner whitespace, trim the ends. */
function normalize(line) {
    return String(line).replace(/\s+/g, " ").trim()
}

export class ProvenanceGate {
    /**
     * @param {string[]} [allowed] lines a model-authored `> ⟂` may legitimately
     *   match: the current frame's attended percepts (the `renderForFrame()` strings
     *   the prefill carried) plus the `> ⟂` lines already in the carried tail. A model
     *   line matching one of these is the mind taking in what reached it — legitimate,
     *   not confabulation. Any other `> ⟂` line is a confabulation.
     */
    constructor({ allowed = [] } = {}) {
        this._allowed = new Set(allowed.map(normalize).filter(Boolean))
        this._buf = ""
    }

    /**
     * Feed one model chunk. Returns `{ emit, confabulation }`:
     *   - `emit`: the clean prefix of this chunk (plus any held-over partial line) that
     *     is safe to emit now — everything BEFORE a caught confabulation. May be "".
     *   - `confabulation`: `{ line }` when the chunk completed a `> ⟂` line with no
     *     provenance, else null. Once set, the stream should stop emitting from this
     *     burst and interrupt; `emit` carries only the clean text before the bad line
     *     (text after it is discarded with the burst, so it is not emitted).
     */
    feed(chunk) {
        this._buf += String(chunk)
        let confabulation = null
        let emitEnd = this._buf.length
        // Walk every complete line (terminated by a newline). The final segment,
        // after the last newline, is incomplete: hold it for the next chunk. Stop at
        // the first confabulation — the stream interrupts there, so nothing after it
        // is emitted.
        let start = 0
        for (let i = 0; i < this._buf.length; i++) {
            if (this._buf[i] !== "\n") continue
            const line = this._buf.slice(start, i)
            if (this._isConfabulated(line)) {
                confabulation = { line: line.trim() }
                emitEnd = start
                break
            }
            start = i + 1
        }
        const lastNl = this._buf.lastIndexOf("\n")
        const holdFrom = lastNl === -1 ? 0 : lastNl + 1
        const end = Math.min(emitEnd, holdFrom)
        const emit = this._buf.slice(0, end)
        this._buf = this._buf.slice(end)
        return { emit, confabulation }
    }

    /**
     * Flush any held partial line (end of burst). The model's last line is not
     * newline-terminated, so a confabulation that ends the burst is only visible
     * here. Same shape as feed().
     */
    flush() {
        if (!this._buf) return { emit: "", confabulation: null }
        const text = this._buf
        this._buf = ""
        const confabulation = this._isConfabulated(text) ? { line: text.trim() } : null
        // A confabulated final line is held back (not emitted), matching feed() — the
        // stream interrupts on it, so it never reaches the tail or the journal.
        return { emit: confabulation ? "" : text, confabulation }
    }

    _isConfabulated(line) {
        const t = line.trim()
        if (!t.startsWith("> ⟂")) return false
        return !this._allowed.has(normalize(t))
    }
}

/** Convenience for tests and one-shot use: scan a whole string at once. */
export function scanProvenance(text, { allowed = [] } = {}) {
    const gate = new ProvenanceGate({ allowed })
    const { confabulation } = gate.feed(String(text))
    return confabulation
}
