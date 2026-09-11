#!/usr/bin/env bun
/** Offline B2 judge over B1 ledgers. Pairs each prediction with its outcome
 * consequence, calls complete() with judgePrompt/parseJudgeReply, writes
 * verdicts beside the pairs. Needs a model (local-voice). */
import fs from 'node:fs'
import path from 'node:path'
import { complete } from '../../../../src/modelAccess/llm.js'
import { resolveModelRef } from '../../../../src/modelAccess/modelConfig.js'
import { judgePrompt, parseJudgeReply } from '../../../../src/infrastructure/judgeCompare.js'

const home = process.argv[2]
if (!home) {
    console.error('usage: bun judge-offline.mjs <mind-home>')
    process.exit(2)
}

const file = path.join(home, 'predictions', 'ledger.jsonl')
if (!fs.existsSync(file)) {
    console.error(`no ledger at ${file}`)
    process.exit(1)
}

const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const predictions = rows.filter(r => r.kind === 'prediction' && r.expectText)
const outcomes = []
const seen = new Set()
for (const row of rows) {
    if (row.kind !== 'consequence' || row.progress || !row.actId || seen.has(row.actId)) continue
    seen.add(row.actId)
    outcomes.push(row)
}
const byAct = new Map(outcomes.map(o => [o.actId, o]))

const model = resolveModelRef(process.env.MEDITATOR_JUDGE_MODEL || 'utility', 'utility')
const pairs = []
for (const p of predictions) {
    const outcome = byAct.get(p.actId)
    if (!outcome) continue
    const prompt = judgePrompt({ expectText: p.expectText, evidenceText: outcome.text || '' })
    let reply = ''
    try {
        const result = await complete({
            model,
            maxTokens: 60,
            temperature: 0,
            prompt,
            debugTag: 'judge-offline',
        })
        reply = result?.text || ''
    } catch (error) {
        reply = `ERROR ${error.message}`
    }
    const parsed = parseJudgeReply(reply)
    pairs.push({
        predictionId: p.id,
        actId: p.actId,
        expectText: p.expectText,
        evidenceText: outcome.text,
        reply,
        ...parsed,
    })
}

const out = path.join(home, 'predictions', 'judge-offline.jsonl')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, pairs.map(p => JSON.stringify(p)).join('\n') + (pairs.length ? '\n' : ''))

const counts = { match: 0, mismatch: 0, insufficient: 0 }
for (const p of pairs) counts[p.verdict]++
console.log(JSON.stringify({ n: pairs.length, counts, out }, null, 2))
console.error('Label a sample of at least thirty pairs blind (rubric in analysis/rubric.md); report confusion vs this file.')
