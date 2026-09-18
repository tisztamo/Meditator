/**
 * Prediction/outcome pairing for the B1 ledgers, shared by the offline judge
 * harness and the B2/§2.7 metrics script so both see exactly the same 123 pairs
 * in exactly the same order.
 *
 * Extracted from judge-offline.mjs unchanged: first non-progress consequence per
 * actId is the outcome, predictions without an outcome are dropped.
 */
import fs from 'node:fs'
import path from 'node:path'

export function ledgerPath(home) {
    return path.join(home, 'predictions', 'ledger.jsonl')
}

export function readLedger(home) {
    const file = ledgerPath(home)
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
}

/**
 * @returns {Array<{predictionId, actId, expectText, evidenceText, rawText, narrated, type}>}
 */
export function readPairs(home) {
    const rows = readLedger(home)
    if (!rows) return []
    const byAct = new Map()
    for (const row of rows) {
        if (row.kind !== 'consequence' || row.progress || !row.actId) continue
        if (!byAct.has(row.actId)) byAct.set(row.actId, row)
    }
    const pairs = []
    for (const p of rows) {
        if (p.kind !== 'prediction' || !p.expectText) continue
        const outcome = byAct.get(p.actId)
        if (!outcome) continue
        const evidenceText = outcome.text || ''
        const raw = rawConsequence(evidenceText)
        pairs.push({
            predictionId: p.id,
            actId: p.actId,
            type: outcome.type || null,
            expectText: p.expectText,
            evidenceText,
            rawText: raw.text,
            narrated: raw.stripped,
        })
    }
    return pairs
}

/**
 * Strip the narration the perception layer wraps a consequence in.
 *
 * `evidenceText` reads `Checking <intent> — <the screen comes back with>:\n\n<payload>`,
 * which restates the expectation inside the evidence (expect-study §2.5's open
 * point: "perceived" is topically identical to "expected" by construction). The
 * payload after the first `:\n\n` is what the world actually said.
 *
 * Perceptions with no payload — a kept note, a recall, a run that never settled —
 * are narration all the way down; those come back unstripped, which is itself the
 * honest raw form: there is no screen output to quote.
 *
 * @returns {{text: string, stripped: boolean}}
 */
export function rawConsequence(evidenceText) {
    const text = String(evidenceText || '')
    const at = text.indexOf(':\n\n')
    if (at < 0) return { text, stripped: false }
    const payload = text.slice(at + 3).trim()
    if (!payload) return { text, stripped: false }
    return { text: payload, stripped: true }
}

/**
 * The pre-registered 50-pair blind subset: the 50 pairs whose predictionId hashes
 * lowest. Deterministic, independent of ledger order, and fixed before any label
 * or verdict was looked at.
 */
export function blindSubset(pairs, size = 50) {
    const scored = pairs.map(p => ({ p, h: hash(p.predictionId) }))
    scored.sort((a, b) => (a.h - b.h) || a.p.predictionId.localeCompare(b.p.predictionId))
    return new Set(scored.slice(0, size).map(s => s.p.predictionId))
}

function hash(s) {
    // FNV-1a, 32-bit. Stable across runs and machines; that is all it needs to be.
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h
}
