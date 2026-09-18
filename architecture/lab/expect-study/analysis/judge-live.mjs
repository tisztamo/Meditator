#!/usr/bin/env bun
/**
 * Score a LIVE judge run (Phase 3 of the Jev plan).
 *
 * `summarize.mjs` already gives the B1 metrics M1–M7 from the ledger; this adds
 * the two things a live-judge arm is actually about:
 *
 *   - the judgement trace — verdict distribution, calibration bands, latency,
 *     cost, soft failures and the 429/529 backoff path — read out of the process
 *     log, where `m-judge` writes one provenance line per decision judgement and
 *     `decide.js` (at `--debug=decide.js`) writes one per backoff;
 *   - the bid trace — the salience the evidence carried after the bidder saw the
 *     verdict, and whether it was attended, grouped by verdict. That is the whole
 *     point of a calibrated confidence: `bidderPolicy` multiplies by it.
 *
 * Usage: bun judge-live.mjs <mind-home> [<mind-home>...]
 */
import fs from 'node:fs'
import path from 'node:path'

const homes = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!homes.length) {
    console.error('usage: bun judge-live.mjs <mind-home> [<mind-home>...]')
    process.exit(2)
}

const VERDICTS = ['match', 'mismatch', 'insufficient']

function readLedger(home) {
    const file = path.join(home, 'predictions', 'ledger.jsonl')
    if (!fs.existsSync(file)) return []
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line)] } catch { return [] }
    })
}

/** One line per decision judgement, written by m-judge#_noteJudgement. */
const JUDGEMENT = /judge\[(\w+)\] model=(\S+) verdict=(\w+) confidence=([\d.]+) latencyMs=(\S+)(?: cost=([\d.]+))?(?: (softFail=1))?/
/** decide.js at debug: the only place a 429/529 is named. */
const BACKOFF = /decide (?:soft-failed|skipped).*?(429|529|backing off|backoff)/i

function readLog(home) {
    const file = path.join(home, 'run.log')
    const out = { judgements: [], backoffs: 0, rateLimited: 0, clientErrors: 0, hasLog: false }
    if (!fs.existsSync(file)) return out
    out.hasLog = true
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = JUDGEMENT.exec(line)
        if (m) {
            out.judgements.push({
                engine: m[1],
                model: m[2],
                verdict: m[3],
                confidence: Number(m[4]),
                latencyMs: m[5] === 'n/a' ? null : Number(m[5]),
                cost: m[6] ? Number(m[6]) : 0,
                softFail: Boolean(m[7]),
            })
            continue
        }
        if (!line.includes('[decide.js]')) continue
        if (/status=(429|529)/.test(line)) out.rateLimited += 1
        if (BACKOFF.test(line)) out.backoffs += 1
        if (/client error, not retried/.test(line)) out.clientErrors += 1
    }
    return out
}

function percentile(sorted, p) {
    if (!sorted.length) return null
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
    return sorted[i]
}

function mean(list) {
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null
}

/** Join the ledger into one row per judged act: verdict, the salience the
 * evidence carried once the bidder had seen it, and whether it was attended. */
function bidTrace(rows) {
    const verdictByAct = new Map()
    for (const r of rows) {
        if (r.kind !== 'commit' || !r.actId) continue
        const v = (r.verdicts || []).find(x => VERDICTS.includes(x))
        if (v && !verdictByAct.has(r.actId)) verdictByAct.set(r.actId, v)
    }
    const attended = new Set(rows.filter(r => r.kind === 'attended').map(r => r.perceptId))
    const trace = []
    const seen = new Set()
    for (const r of rows) {
        if (r.kind !== 'consequence' || r.progress === true || !r.actId) continue
        if (seen.has(r.actId)) continue
        seen.add(r.actId)
        const verdict = verdictByAct.get(r.actId)
        if (!verdict) continue
        trace.push({
            verdict,
            salience: typeof r.salience === 'number' ? r.salience : null,
            attended: attended.has(r.perceptId),
        })
    }
    return trace
}

function bands(judgements) {
    const out = { '<0.5': [], '0.5-0.9': [], '>0.9': [] }
    for (const j of judgements) {
        const key = j.confidence < 0.5 ? '<0.5' : j.confidence <= 0.9 ? '0.5-0.9' : '>0.9'
        out[key].push(j)
    }
    return out
}

const report = {}
for (const home of homes) {
    const rows = readLedger(home)
    const log = readLog(home)
    const times = rows.map(r => Date.parse(r.at)).filter(Number.isFinite)
    const hours = times.length ? (Math.max(...times) - Math.min(...times)) / 3_600_000 : 0

    const judgements = log.judgements
    const latencies = judgements.map(j => j.latencyMs).filter(Number.isFinite).sort((a, b) => a - b)
    const dist = Object.fromEntries(VERDICTS.map(v => [v, judgements.filter(j => j.verdict === v).length]))
    const trace = bidTrace(rows)
    const byVerdict = {}
    for (const v of VERDICTS) {
        const group = trace.filter(t => t.verdict === v)
        byVerdict[v] = {
            n: group.length,
            meanSalience: mean(group.map(t => t.salience).filter(Number.isFinite)),
            attendedFraction: group.length ? group.filter(t => t.attended).length / group.length : null,
        }
    }

    report[home] = {
        hours,
        engine: judgements[0]?.engine ?? (log.hasLog ? 'completion (no decision line)' : 'unknown'),
        model: judgements[0]?.model ?? null,
        judgements: judgements.length,
        judgementsPerHour: hours ? judgements.length / hours : null,
        verdicts: dist,
        softFails: judgements.filter(j => j.softFail).length,
        rateLimited: log.rateLimited,
        backoffs: log.backoffs,
        clientErrors: log.clientErrors,
        latencyMs: {
            p50: percentile(latencies, 50), p95: percentile(latencies, 95),
            p99: percentile(latencies, 99), max: latencies.at(-1) ?? null,
        },
        confidence: {
            mean: mean(judgements.map(j => j.confidence)),
            bands: Object.fromEntries(Object.entries(bands(judgements)).map(([k, v]) => [k, v.length])),
        },
        costUsd: judgements.reduce((a, j) => a + (j.cost || 0), 0),
        // The ledger's own verdict tally, which must agree with the log's when
        // every judgement reached a commit.
        ledgerVerdicts: Object.fromEntries(VERDICTS.map(v => [
            v, rows.filter(r => r.kind === 'commit').flatMap(r => r.verdicts || []).filter(x => x === v).length,
        ])),
        bidTrace: byVerdict,
    }
}

console.log(JSON.stringify(report, null, 2))
