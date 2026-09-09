/** Private frozen projection of the fields that form one eventual Percept.
 * No independent identity, authority, publication, or retention contract.
 * Owners and the comparator exchange this; it is not a public record type. */

function optionalId(name, value) {
    if (value == null) return null
    if (typeof value !== 'string' || !value) {
        throw new Error(`${name} is association, keyed by id`)
    }
    return value
}

function requireId(name, value) {
    if (typeof value !== 'string' || !value) {
        throw new Error(`${name} is keyed by id, never by object identity`)
    }
    return value
}

/** NFC, line endings, outer whitespace. Exact equality is on this form. */
export function normalizeCompareText(text) {
    if (typeof text !== 'string') return null
    return text.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

export function projectEvidenceView({
    id, sourceId, modality, provenance, tier = null,
    requestId = null, actId = null, occurredAt, archivalText, eventType = null,
} = {}) {
    const view = {
        id: requireId('evidenceView.id', id),
        sourceId: typeof sourceId === 'string' ? sourceId : null,
        modality: typeof modality === 'string' ? modality : null,
        provenance: typeof provenance === 'string' ? provenance : null,
        tier: tier ?? null,
        requestId: optionalId('requestId', requestId),
        actId: optionalId('actId', actId),
        occurredAt: occurredAt ?? null,
        eventType: typeof eventType === 'string' && eventType ? eventType : null,
        archivalText: typeof archivalText === 'string' ? archivalText : '',
    }
    Object.defineProperty(view, 'toJSON', {
        value() {
            return {
                id: this.id,
                sourceId: this.sourceId,
                modality: this.modality,
                provenance: this.provenance,
                tier: this.tier,
                requestId: this.requestId,
                actId: this.actId,
                occurredAt: this.occurredAt,
                eventType: this.eventType,
                archivalText: this.archivalText,
            }
        },
    })
    return Object.freeze(view)
}

/** Act path: the Percept already exists; the view is that same object's fields. */
export function projectEvidenceFromPercept(percept) {
    if (percept == null || typeof percept !== 'object') {
        throw new Error('evidence view is projected from a Percept')
    }
    return projectEvidenceView({
        id: percept.id,
        sourceId: percept.sourceId,
        modality: percept.modality,
        provenance: percept.provenance,
        tier: percept.tier,
        requestId: percept.requestId,
        actId: percept.actId,
        occurredAt: percept.dateTime ?? percept.occurredAt,
        archivalText: typeof percept.renderForFrame === 'function'
            ? percept.renderForFrame()
            : String(percept.reason ?? ''),
        eventType: percept.type ?? null,
    })
}

export function isEvidenceView(view) {
    return view != null && typeof view === 'object'
        && typeof view.id === 'string' && view.id
        && typeof view.archivalText === 'string'
}
