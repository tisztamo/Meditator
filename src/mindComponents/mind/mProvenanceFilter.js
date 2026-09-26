import { MBaseComponent } from "../shared/mBaseComponent.js"
import { ENERGY } from "../shared/infoton.js"
import { makePhrasebook } from "../shared/i18n.js"
import { InterruptRecord } from '../../infrastructure/interruptRecord.js'
import { logger } from '../../infrastructure/logger.js'
import { ProvenanceGate, perceptLines } from './provenanceGate.js'

const log = logger('mProvenanceFilter.js')

/**
 * The PROVENANCE CORRECTION as a localizable phrase (i18n.js). A non-English mind
 * overrides it with an <m-phrase for="provenance"> child of this element.
 */
const PROVENANCE_PHRASES = {
    en: {
        provenance: ["You do not need to come up with a sense. Senses will come to you. Think about what interests you and they will come."],
    },
}

/**
 * <m-provenance-filter> — catches a confabulated sense before it lands.
 *
 * A `stream-filter` (see m-stream's role port): mounted inside <m-stream>, it runs the
 * model's own text through the provenance gate (provenanceGate.js). A `> ⟂` line the
 * MODEL authors that matches no percept the mind actually attended is a confabulated
 * sense; the gate holds it back, so it never reaches the tail or the journal, and
 * signals the stream to stop the burst. Then, in react():
 *   - it raises the corrective sense as a REAL urgent stimulus (`interrupt-request`),
 *     so the mind perceives the correction as a genuine `> ⟂` line and continues from it;
 *   - it leaves the mechanism's ⌁ trail through the generic `backstage` channel (a note
 *     plus a typed line in journal/provenance.jsonl).
 *
 * Everything it knows it reads from seams the mind already has — nothing in the mind,
 * the stream or memory knows it exists:
 *   - `@attended` (the lines each frame perceived), kept in a rolling buffer so the mind
 *     may echo what it just perceived — including the corrective this filter raised;
 *   - the burst's carried `prefill` (from begin()), whose `> ⟂` lines the mind already
 *     perceived and may take in again.
 *
 * Opt out by leaving the tag out.
 *
 * <m-stream name="stream">
 *   <m-provenance-filter></m-provenance-filter>
 * </m-stream>
 *
 * Attributes:
 *   - attendedSrc (default "!scope/@attended"): where perceived lines arrive
 *   - recall (default 16): how many recently-attended lines stay allowed
 */
export class MProvenanceFilter extends MBaseComponent {
    static provides = { "stream-filter": true }

    _recent = []        // recently-attended `> ⟂` lines, newest first
    _carried = ""       // the tail the last burst carried (a prefill-less burst keeps it)
    _gate = null        // this burst's gate
    _book = null        // the corrective phrasebook, built once

    onConnect() {
        this.sub(this.attr("attendedSrc") || "!scope/@attended", this._onAttended)
    }

    _onAttended = e => {
        const lines = Array.isArray(e?.detail) ? e.detail.map(l => `> ⟂ ${l}`) : []
        if (!lines.length) return
        const recall = Number(this.attr("recall")) || 16
        this._recent = [...lines, ...this._recent].slice(0, recall)
    }

    begin({ prefill } = {}) {
        this._carried = prefill || this._carried
        this._gate = new ProvenanceGate({ allowed: [...this._recent, ...perceptLines(this._carried)] })
    }

    feed(text) {
        if (!this._gate) this.begin()
        return this._toPort(this._gate.feed(text))
    }

    flush() {
        if (!this._gate) return { emit: "" }
        const result = this._toPort(this._gate.flush())
        this._gate = null
        return result
    }

    _toPort({ emit, confabulation }) {
        return confabulation ? { emit, signal: { kind: "provenance", line: confabulation.line } } : { emit }
    }

    react(signal, { burstIndex } = {}) {
        const { line } = signal
        log.warn(`Model authored an unattended sense — interrupted: ${line}`)
        this._gate = null
        this.fire("backstage", {
            text: `The mind reached for a sense it did not have — a "> ⟂" line with no percept behind it — and the stream caught it and interrupted: ${line}`,
            kind: "provenance",
            record: { line, burstIndex: burstIndex ?? null },
        }, { energy: ENERGY.deed })
        this.fire("interrupt-request", new InterruptRecord({
            source: 'Internal', type: 'Provenance',
            reason: (this._book ||= makePhrasebook(this, PROVENANCE_PHRASES)).line("provenance"),
            salience: 1, urgent: true,
        }))
    }
}
