#!/usr/bin/env bun
/** Summarize expect-study ledgers into the pre-registered B1 metrics. */
import fs from 'node:fs'
import path from 'node:path'

const homes = process.argv.slice(2)
if (!homes.length) {
    console.error('usage: bun summarize.mjs <mind-home> [<mind-home>...]')
    process.exit(2)
}

function readLedger(home) {
    const file = path.join(home, 'predictions', 'ledger.jsonl')
    if (!fs.existsSync(file)) return []
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function metrics(rows) {
    const predictions = rows.filter(r => r.kind === 'prediction')
    const acted = rows.filter(r => r.kind === 'acted')
    const consequences = rows.filter(r => r.kind === 'consequence')
    const commits = rows.filter(r => r.kind === 'commit')
    const settled = rows.filter(r => r.kind === 'settled')
    const attended = rows.filter(r => r.kind === 'attended')
    const intents = rows.filter(r => r.kind === 'intent')

    const withExpect = predictions.filter(p => typeof p.expectText === 'string' && p.expectText.trim())
    const acts = acted.length
    const fillRate = acts ? withExpect.length / acts : 0
    const tokenLengths = withExpect.map(p => p.expectText.trim().split(/\s+/).filter(Boolean).length)
    const meanTokens = tokenLengths.length
        ? tokenLengths.reduce((a, b) => a + b, 0) / tokenLengths.length
        : 0

    const outcomeByAct = new Map()
    for (const c of consequences) {
        if (c.progress) continue
        if (c.actId && !outcomeByAct.has(c.actId)) outcomeByAct.set(c.actId, c)
    }
    let insideHorizon = 0
    const latencies = []
    for (const p of predictions) {
        const outcome = outcomeByAct.get(p.actId)
        if (!outcome) continue
        const t0 = Date.parse(p.basisAt)
        const t1 = Date.parse(outcome.occurredAt)
        if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue
        latencies.push(t1 - t0)
        const until = Date.parse(p.validUntil)
        if (Number.isFinite(until) && t1 <= until) insideHorizon++
    }
    const settleRate = predictions.length ? insideHorizon / predictions.length : 0

    const capabilities = {}
    for (const a of acted) capabilities[a.capability || '?'] = (capabilities[a.capability || '?'] || 0) + 1
    const accepted = intents.filter(i => i.accepted).length
    const intentRate = intents.length ? accepted / intents.length : 0
    const declines = intents.filter(i => i.accepted && !acted.length)
    void declines

    const verdicts = { match: 0, mismatch: 0, insufficient: 0 }
    for (const c of commits) {
        for (const v of c.verdicts || []) {
            if (verdicts[v] != null) verdicts[v]++
        }
    }

    const times = rows.map(r => Date.parse(r.at)).filter(Number.isFinite)
    const spanMs = times.length ? Math.max(...times) - Math.min(...times) : 0
    const hours = spanMs > 0 ? spanMs / 3_600_000 : 0
    const actsPerHour = hours ? acted.length / hours : acted.length
    const senseInterrupts = rows.filter(r => r.kind === 'consequence' && !r.actId).length

    const outcomeIds = new Set([...outcomeByAct.values()].map(c => c.perceptId).filter(Boolean))
    const attendedOutcomes = attended.filter(a => outcomeIds.has(a.perceptId)).length
    const attendedFraction = outcomeIds.size ? attendedOutcomes / outcomeIds.size : 0

    return {
        nPrediction: predictions.length,
        nActed: acted.length,
        fillRate,
        meanExpectTokens: meanTokens,
        settleRate,
        meanOutcomeLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
        capabilities,
        intentAcceptanceRate: intentRate,
        verdicts,
        actsPerHour,
        senseInterrupts,
        attendedFraction,
        hours,
    }
}

const report = {}
for (const home of homes) {
    report[home] = metrics(readLedger(home))
}
const json = JSON.stringify(report, null, 2)
console.log(json)

const md = ['# Expect-study summary', '']
for (const [home, m] of Object.entries(report)) {
    md.push(`## ${home}`, '')
    md.push(`- M1 fill rate: ${m.fillRate.toFixed(3)} (${m.nPrediction} predictions / ${m.nActed} acts)`)
    md.push(`- M2 mean expect tokens: ${m.meanExpectTokens.toFixed(1)}`)
    md.push(`- M3 settle rate (outcome inside horizon): ${m.settleRate.toFixed(3)}; mean latency ${m.meanOutcomeLatencyMs ?? 'n/a'} ms`)
    md.push(`- M4 capabilities: ${JSON.stringify(m.capabilities)}; intent accept ${m.intentAcceptanceRate.toFixed(3)}`)
    md.push(`- M5 verdicts: ${JSON.stringify(m.verdicts)}`)
    md.push(`- M6 acts/hour: ${m.actsPerHour.toFixed(2)} over ${m.hours.toFixed(2)} h`)
    md.push(`- M7 attended fraction of outcome consequences: ${m.attendedFraction.toFixed(3)}`)
    md.push('')
}
const mdPath = path.join(homes[0], 'expect-study-summary.md')
try {
    fs.writeFileSync(mdPath, md.join('\n'))
    console.error(`wrote ${mdPath}`)
} catch {
    /* home may be read-only in tests */
}
