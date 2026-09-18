#!/usr/bin/env bun
/**
 * The pre-registered Phase-2 table for the Jev (System One) judge —
 * doc/plans/jev-system-one-integration.md §1 Phase 2, reported in
 * doc/research/expect-study.md §2.7.
 *
 *   bun jev-metrics.mjs <mind-home> [--labels <file>] [--markdown]
 *
 * Reads the reader's blind labels, every `judge-offline-jev-*.jsonl` arm in the
 * home, and the two existing LLM-judge ledgers, and prints:
 *
 *   - blind agreement on the pre-registered 50, and on all 123 for context
 *   - `match` the reader did not call `match`      (gate: 0)
 *   - `mismatch` where the reader said insufficient (gate: 0)
 *   - calibration: agreement per confidence bucket  (monotone; >0.9 ≥ 0.95)
 *   - latency p50/p95 and cost per pair
 *   - agreement with the two LLM judges, and run-to-run stability across repeats
 *
 * Each Jev file carries two arms in one call: `verdict` (the three-way choice)
 * and `decomp` (the two nouls). They are scored separately.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
function flag(name, fallback = null) {
    const at = argv.indexOf(`--${name}`)
    return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : fallback
}
const home = argv.find(a => !a.startsWith('--'))
if (!home) {
    console.error('usage: bun jev-metrics.mjs <mind-home> [--labels <file>] [--markdown]')
    process.exit(2)
}

const labelsFile = flag('labels', path.join(here, 'reader-labels-2.jsonl'))
const labels = readJsonl(labelsFile)
if (!labels.length) {
    console.error(`no reader labels at ${labelsFile}`)
    process.exit(1)
}
const readerBy = new Map(labels.map(l => [l.predictionId, l]))
const subset50 = new Set(labels.filter(l => l.subset50).map(l => l.predictionId))

const dir = path.join(home, 'predictions')
const jevFiles = fs.readdirSync(dir).filter(f => /^judge-offline-jev-.*\.jsonl$/.test(f)).sort()
if (!jevFiles.length) {
    console.error(`no judge-offline-jev-*.jsonl under ${dir}`)
    process.exit(1)
}

// --- scoring ---------------------------------------------------------------

/** One arm: rows carrying a verdict and a strength, scored against the reader. */
function score(rows, { verdictKey, strengthKey }) {
    const scored = []
    for (const row of rows) {
        const reader = readerBy.get(row.predictionId)
        if (!reader) continue
        scored.push({
            predictionId: row.predictionId,
            reader: reader.verdict,
            judge: row[verdictKey] ?? null,
            strength: Number(row[strengthKey]) || 0,
            inSubset: subset50.has(row.predictionId),
            latencyMs: Number(row.latencyMs) || null,
            cost: Number(row.cost) || 0,
        })
    }

    const on = list => {
        const n = list.length
        const agree = list.filter(s => s.judge === s.reader).length
        return { n, agree, agreement: n ? agree / n : null }
    }
    const fifty = scored.filter(s => s.inSubset)

    // The two directional clauses, on the same 50 the gate is stated over.
    const falseMatch = fifty.filter(s => s.judge === 'match' && s.reader !== 'match').length
    const falseMismatch = fifty.filter(s => s.judge === 'mismatch' && s.reader === 'insufficient').length
    // The same two clauses over the whole ledger — not the gate, but the gate on
    // 50 pairs cannot see a rare failure, so the full count is reported beside it.
    const falseMatchAll = scored.filter(s => s.judge === 'match' && s.reader !== 'match').length
    const falseMismatchAll = scored.filter(s => s.judge === 'mismatch' && s.reader === 'insufficient').length

    const buckets = [
        { label: '<0.5', test: c => c < 0.5 },
        { label: '0.5-0.9', test: c => c >= 0.5 && c <= 0.9 },
        { label: '>0.9', test: c => c > 0.9 },
    ].map(b => {
        const list = scored.filter(s => b.test(s.strength))
        return { bucket: b.label, ...on(list) }
    })

    const lat = scored.map(s => s.latencyMs).filter(Number.isFinite).sort((a, b) => a - b)
    const pct = p => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null)

    return {
        all: on(scored),
        fifty: on(fifty),
        falseMatch,
        falseMismatch,
        falseMatchAll,
        falseMismatchAll,
        buckets,
        latencyP50: pct(0.5),
        latencyP95: pct(0.95),
        costPerPair: scored.length ? scored.reduce((a, s) => a + s.cost, 0) / scored.length : 0,
        counts: tally(scored.map(s => s.judge)),
        byId: new Map(scored.map(s => [s.predictionId, s.judge])),
    }
}

function gates(s) {
    const peak = s.buckets.find(b => b.bucket === '>0.9')
    const present = s.buckets.filter(b => b.n > 0)
    const monotone = present.every((b, i) => i === 0 || b.agreement >= present[i - 1].agreement - 1e-9)
    return {
        agreement50: s.fifty.agreement != null && s.fifty.agreement >= 0.90,
        noFalseMatch: s.falseMatch === 0,
        noFalseMismatch: s.falseMismatch === 0,
        calibration: monotone && peak != null && peak.n > 0 && peak.agreement >= 0.95,
        monotone,
    }
}

// --- arms ------------------------------------------------------------------

const arms = []
for (const file of jevFiles) {
    const rows = readJsonl(path.join(dir, file))
    if (!rows.length) continue
    const stem = file.replace(/^judge-offline-jev-/, '').replace(/\.jsonl$/, '')
    arms.push({
        name: `verdict/${stem}`, kind: 'verdict', stem, file,
        model: rows.find(r => r.model)?.model || null,
        softFails: rows.filter(r => r.softFail).length,
        ...score(rows, { verdictKey: 'verdict', strengthKey: 'confidence' }),
    })
    arms.push({
        name: `decomp/${stem}`, kind: 'decomp', stem, file,
        model: rows.find(r => r.model)?.model || null,
        softFails: rows.filter(r => r.softFail).length,
        ...score(rows, { verdictKey: 'decompVerdict', strengthKey: 'decompStrength' }),
    })
}

// --- the LLM judges, scored against the same labels ------------------------

const llmArms = []
for (const [label, file] of [['llm/cloud', 'judge-offline.jsonl'], ['llm/local', 'judge-offline-local.jsonl']]) {
    const full = path.join(dir, file)
    if (!fs.existsSync(full)) continue
    const rows = readJsonl(full)
    llmArms.push({ name: label, file, ...score(rows, { verdictKey: 'verdict', strengthKey: 'confidence' }) })
}

// --- cross-arm agreement ---------------------------------------------------

function pairAgreement(a, b) {
    let n = 0, agree = 0
    for (const [id, verdict] of a.byId) {
        if (!b.byId.has(id)) continue
        n += 1
        if (verdict === b.byId.get(id)) agree += 1
    }
    return n ? agree / n : null
}

const report = {
    labels: { file: labelsFile, n: labels.length, subset50: subset50.size, counts: tally(labels.map(l => l.verdict)) },
    arms: arms.map(a => summarize(a)),
    llm: llmArms.map(a => summarize(a)),
    vsLlm: {},
    stability: {},
}
for (const a of arms) {
    report.vsLlm[a.name] = Object.fromEntries(llmArms.map(l => [l.name, round(pairAgreement(a, l))]))
}
for (const l of llmArms) {
    report.vsLlm[l.name] = Object.fromEntries(llmArms.filter(o => o !== l).map(o => [o.name, round(pairAgreement(l, o))]))
}
// Run-to-run stability: arms whose stem differs only by the -rN repeat tag.
const families = new Map()
for (const a of arms) {
    const key = `${a.kind}/${a.stem.replace(/-r\d+$/, '')}`
    if (!families.has(key)) families.set(key, [])
    families.get(key).push(a)
}
for (const [key, family] of families) {
    if (family.length < 2) continue
    const ids = [...family[0].byId.keys()].filter(id => family.every(a => a.byId.has(id)))
    const identical = ids.filter(id => family.every(a => a.byId.get(id) === family[0].byId.get(id))).length
    report.stability[key] = { runs: family.length, n: ids.length, identical, fraction: round(ids.length ? identical / ids.length : null) }
}

function summarize(a) {
    const g = gates(a)
    return {
        arm: a.name,
        model: a.model ?? null,
        softFails: a.softFails ?? 0,
        counts: a.counts,
        agreement50: round(a.fifty.agreement), n50: a.fifty.n,
        agreementAll: round(a.all.agreement), nAll: a.all.n,
        falseMatch: a.falseMatch,
        falseMismatch: a.falseMismatch,
        falseMatchAll: a.falseMatchAll,
        falseMismatchAll: a.falseMismatchAll,
        buckets: a.buckets.map(b => ({ bucket: b.bucket, n: b.n, agreement: round(b.agreement) })),
        latencyP50: a.latencyP50, latencyP95: a.latencyP95,
        costPerPair: a.costPerPair ? Number(a.costPerPair.toPrecision(3)) : 0,
        gates: g,
        passes: Object.values(g).every(Boolean),
    }
}

if (argv.includes('--markdown')) console.log(markdown(report))
else console.log(JSON.stringify(report, null, 2))

function markdown(r) {
    const out = []
    out.push(`Reader labels: ${r.labels.n} (${r.labels.subset50} in the pre-registered 50) — ${JSON.stringify(r.labels.counts)}`, '')
    out.push('| arm | model | agree/50 | agree/123 | false match (50 / 123) | mismatch-on-insuff (50 / 123) | <0.5 | 0.5–0.9 | >0.9 | p50 ms | p95 ms | $/pair |')
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const a of [...r.arms, ...r.llm]) {
        const b = Object.fromEntries(a.buckets.map(x => [x.bucket, x.n ? `${fmt(x.agreement)} (${x.n})` : '—']))
        out.push(`| \`${a.arm}\` | ${a.model || '—'} | ${fmt(a.agreement50)} | ${fmt(a.agreementAll)} | ${a.falseMatch} / ${a.falseMatchAll} | ${a.falseMismatch} / ${a.falseMismatchAll} `
            + `| ${b['<0.5']} | ${b['0.5-0.9']} | ${b['>0.9']} | ${a.latencyP50 ?? '—'} | ${a.latencyP95 ?? '—'} | ${a.costPerPair || '—'} |`)
    }
    out.push('', '| arm | vs llm/cloud | vs llm/local |', '|---|---|---|')
    for (const [arm, vs] of Object.entries(r.vsLlm)) {
        out.push(`| \`${arm}\` | ${fmt(vs['llm/cloud'])} | ${fmt(vs['llm/local'])} |`)
    }
    out.push('', '| family | runs | identical verdicts |', '|---|---|---|')
    for (const [key, s] of Object.entries(r.stability)) {
        out.push(`| \`${key}\` | ${s.runs} | ${s.identical}/${s.n} (${fmt(s.fraction)}) |`)
    }
    return out.join('\n')
}

function fmt(n) { return n == null ? '—' : n.toFixed(3) }
function round(n) { return n == null ? null : Math.round(n * 1000) / 1000 }
function tally(values) {
    const counts = {}
    for (const v of values) counts[v ?? 'none'] = (counts[v ?? 'none'] || 0) + 1
    return counts
}
function readJsonl(file) {
    if (!fs.existsSync(file)) return []
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
}
