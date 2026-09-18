#!/usr/bin/env bun
/**
 * Phase-0 probe for TypeSafe's Jev (System One) — doc/plans/jev-system-one-integration.md §0.
 *
 * Throwaway by design: it talks to the endpoint directly with fetch, prints the
 * raw response JSON, and times ten calls, so Phase 1 can be written against the
 * shape that actually comes back rather than the documented one. It asks all
 * three question types over one arm-P ledger pair as `state: {expected, perceived}`:
 * the verdict as a `choice` (the three judge glosses as criteria), one `noul`
 * (does it report a confidence?), and one `score`.
 *
 *   bun architecture/lab/expect-study/analysis/jev-probe.mjs [<mind-home>] [--pair N]
 *
 * The key comes from TYPESAFE_API_KEY: the environment first, then ~/.env or a
 * repo-root .env. It is never printed and never committed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERDICT_GLOSSES } from '../../../../src/infrastructure/judgeCompare.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

const ENDPOINT = process.env.TYPESAFE_BASE_URL
    ? `${process.env.TYPESAFE_BASE_URL.replace(/\/+$/, '')}/systemone`
    : 'https://api.typesafe.ai/v1/systemone'
const MODEL = process.env.TYPESAFE_MODEL || 'jev-latest'

function apiKey() {
    if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY
    // This box keeps its secrets in ~/.env (sourced by the shell profile), with
    // a repo-root .env as the Bun-native alternative. Try both; print neither.
    for (const file of [path.join(repoRoot, '.env'), path.join(process.env.HOME || '', '.env')]) {
        try {
            const env = fs.readFileSync(file, 'utf8')
            const line = env.split('\n').find(l => /^\s*(export\s+)?TYPESAFE_API_KEY\s*=/.test(l))
            if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
        } catch { /* no such file — try the next */ }
    }
    return null
}

const key = apiKey()
if (!key) {
    console.error('TYPESAFE_API_KEY is not set (env or .env). Nothing to probe.')
    process.exit(2)
}

// --- one arm-P pair -------------------------------------------------------

const args = process.argv.slice(2)
const pairIndex = Number(args.includes('--pair') ? args[args.indexOf('--pair') + 1] : 0) || 0
const home = args.find(a => !a.startsWith('--') && a !== String(pairIndex))
    || path.join(repoRoot, 'memory', 'lemma-lab-expect-p-20260912t164444z')

const ledger = path.join(home, 'predictions', 'ledger.jsonl')
if (!fs.existsSync(ledger)) {
    console.error(`no ledger at ${ledger}`)
    process.exit(1)
}
const rows = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const seen = new Set()
const byAct = new Map()
for (const row of rows) {
    if (row.kind !== 'consequence' || row.progress || !row.actId || seen.has(row.actId)) continue
    seen.add(row.actId)
    byAct.set(row.actId, row)
}
const pairs = []
for (const p of rows) {
    if (p.kind !== 'prediction' || !p.expectText) continue
    const outcome = byAct.get(p.actId)
    if (outcome) pairs.push({ expected: p.expectText, perceived: outcome.text || '' })
}
if (!pairs.length) {
    console.error(`no prediction/consequence pairs in ${ledger}`)
    process.exit(1)
}
const pair = pairs[Math.min(pairIndex, pairs.length - 1)]

// --- questions ------------------------------------------------------------

// NB (probe finding): `question` is NOT a field the API reads — it is silently
// ignored, and a noul carrying only `question` is rejected with "must have
// criteria or instructions". The prose goes in `instructions`.
const questions = {
    verdict: {
        type: 'choice',
        instructions: 'Given what was expected and what was then perceived, does the perception confirm the expectation, contradict it, or leave it undecided?',
        criteria: {
            match: VERDICT_GLOSSES.match,
            mismatch: VERDICT_GLOSSES.mismatch,
            insufficient: VERDICT_GLOSSES.insufficient,
        },
    },
    has_result: {
        type: 'noul',
        instructions: 'The perception carries a result that can be compared against the expectation.',
        criteria: {
            true: 'the perception carries a result that can be compared against the expectation',
            false: 'the perception carries no comparable result — an error, a crash, an empty output',
        },
    },
    informativeness: {
        type: 'score',
        instructions: 'How much does the perception tell us about the expectation?',
        criteria: ['nothing at all', 'a hint', 'a partial answer', 'a clear answer'],
    },
}

async function ask(body) {
    const t0 = performance.now()
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    })
    const text = await response.text()
    const ms = performance.now() - t0
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON — keep the text */ }
    return { status: response.status, ms, json, text, headers: Object.fromEntries(response.headers) }
}

const state = { expected: pair.expected, perceived: pair.perceived }
const body = { state, model: MODEL, questions }

console.log('endpoint:', ENDPOINT)
console.log('state:', JSON.stringify(state, null, 2))
console.log('questions:', JSON.stringify(questions, null, 2))
console.log('='.repeat(72))

const first = await ask(body)
console.log(`HTTP ${first.status} in ${first.ms.toFixed(0)}ms`)
console.log('response headers:', JSON.stringify(first.headers, null, 2))
console.log('raw response:', first.json ? JSON.stringify(first.json, null, 2) : first.text)
console.log('='.repeat(72))

if (first.status !== 200) {
    console.error('non-200 on the first call — stopping before the timing loop')
    process.exit(1)
}

// --- wall clock x10 -------------------------------------------------------

const times = []
for (let i = 0; i < 10; i += 1) {
    const r = await ask(body)
    times.push(r.ms)
    console.log(`  #${i + 1}: HTTP ${r.status} ${r.ms.toFixed(0)}ms`)
}
times.sort((a, b) => a - b)
const pct = p => times[Math.min(times.length - 1, Math.floor(p * times.length))]
console.log('='.repeat(72))
console.log(JSON.stringify({
    n: times.length,
    minMs: Math.round(times[0]),
    p50Ms: Math.round(pct(0.5)),
    p95Ms: Math.round(pct(0.95)),
    maxMs: Math.round(times[times.length - 1]),
    meanMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
}, null, 2))
