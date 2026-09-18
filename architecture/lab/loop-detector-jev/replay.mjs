#!/usr/bin/env bun
/**
 * Phase-5 replay: the loop detector's two engines over the SAME tails.
 *
 * doc/plans/jev-system-one-integration.md §1 Phase 5 asks whether a calibrated,
 * sub-second sensor changes the "effector beats sensor" finding of
 * doc/research/loop-detector-scoring.md. Before scoring a fourth arm we need to
 * know what the Jev engine actually does, so this replays a corpus of real
 * loop-detector prompts — every one of them a tail a live mind was checked on,
 * dumped under experiments/**\/loop-detector/*.txt — through both engines:
 *
 *   llm  — m-loop-detector's five-field format prompt, on the local model
 *   jev  — m-loop-detector's three questions (noul/score/choice) via decide()
 *
 * It calls the component's OWN pure pieces (`_prompt`, `parseLoopReply`,
 * `loopQuestions`, `readLoopDecision`), so what is measured is the shipped code
 * rather than a lab copy of it.
 *
 *   bun architecture/lab/loop-detector-jev/replay.mjs [--n 80] [--engines jev,llm]
 *                                                     [--llm-model gpu-local] [--out DIR]
 *
 * TYPESAFE_API_KEY comes from the environment, then ~/.env or a repo-root .env.
 * It is never printed and never written to the output.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

// --- args ------------------------------------------------------------------

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const N = Number(arg('n', 80))
const ENGINES = arg('engines', 'jev,llm').split(',').map(s => s.trim()).filter(Boolean)
const LLM_MODEL = arg('llm-model', 'gpu-local')
const JEV_MODEL = arg('jev-model', 'jev')
const OUT = path.resolve(arg('out', path.join(here, 'runs', new Date().toISOString().replace(/[:.]/g, '-'))))

// --- the key, from the environment or a dotenv (never printed) --------------

function loadKey() {
    if (process.env.TYPESAFE_API_KEY) return true
    for (const file of [path.join(repoRoot, '.env'), path.join(process.env.HOME || '', '.env')]) {
        try {
            const line = fs.readFileSync(file, 'utf8').split('\n')
                .find(l => /^\s*(export\s+)?TYPESAFE_API_KEY\s*=/.test(l))
            if (line) {
                process.env.TYPESAFE_API_KEY = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
                return true
            }
        } catch { /* try the next */ }
    }
    return false
}
if (ENGINES.includes('jev') && !loadKey()) {
    console.error('TYPESAFE_API_KEY is not set (env or .env). Run with --engines llm, or set the key.')
    process.exit(2)
}
// The local server accepts any bearer token, but the OpenAI client insists on one.
process.env.LOCAL_LLM_API_KEY ||= 'lab'

// The component module graph reaches HTMLElement, so the DOM globals the mind
// boots with have to exist before it is imported — the same shim the test preload uses.
await import(path.join(repoRoot, 'src/startup/jsdom.js'))

const { loadModelConfig, resolveModelRef } = await import(path.join(repoRoot, 'src/modelAccess/modelConfig.js'))
const { complete, getUsageTotals } = await import(path.join(repoRoot, 'src/modelAccess/llm.js'))
const { decide } = await import(path.join(repoRoot, 'src/modelAccess/decide.js'))
const {
    MLoopDetector, parseLoopReply, loopQuestions, readLoopDecision,
} = await import(path.join(repoRoot, 'src/mindComponents/shared/mLoopDetector.js'))

await loadModelConfig()

// --- the corpus -------------------------------------------------------------

/** Every dumped loop-detector prompt under experiments/, newest run first. */
function corpusFiles() {
    const out = []
    const walk = dir => {
        let entries
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
            const p = path.join(dir, e.name)
            if (e.isDirectory()) walk(p)
            else if (e.isFile() && e.name.endsWith('.txt') && dir.endsWith(`${path.sep}loop-detector`)) out.push(p)
        }
    }
    walk(path.join(repoRoot, 'experiments'))
    return out
}

function tailOf(file) {
    const text = fs.readFileSync(file, 'utf8')
    const m = text.match(/<tail>\n([\s\S]*?)\n<\/tail>/)
    if (!m) return null
    const tail = m[1].replace(/^…/, '').trim()
    return tail.length >= 400 ? tail : null
}

/**
 * A stratified sample: round-robin across the runs that produced the dumps, so
 * one very long run cannot dominate, and de-duplicated by tail text (a detector
 * checked every N boundaries often sees a tail it has already seen).
 */
function sample(n) {
    const byDir = new Map()
    for (const f of corpusFiles()) {
        const d = path.dirname(f)
        if (!byDir.has(d)) byDir.set(d, [])
        byDir.get(d).push(f)
    }
    for (const list of byDir.values()) list.sort()
    const dirs = [...byDir.keys()].sort()
    const picked = []
    const seen = new Set()
    for (let round = 0; picked.length < n; round += 1) {
        let any = false
        for (const d of dirs) {
            const list = byDir.get(d)
            // Spread within a run too: stride so a round-robin walks the whole run.
            const stride = Math.max(1, Math.floor(list.length / 12))
            const idx = round * stride
            if (idx >= list.length) continue
            any = true
            const file = list[idx]
            const tail = tailOf(file)
            if (!tail) continue
            const key = tail.slice(-600)
            if (seen.has(key)) continue
            seen.add(key)
            picked.push({ file: path.relative(repoRoot, file), mind: path.basename(path.dirname(path.dirname(file))), tail })
            if (picked.length >= n) break
        }
        if (!any) break
    }
    return picked
}

const items = sample(N)
if (!items.length) {
    console.error('no loop-detector prompt dumps found under experiments/')
    process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })
console.log(`replaying ${items.length} tails through [${ENGINES.join(', ')}] → ${path.relative(repoRoot, OUT)}\n`)

// --- the two engines, called exactly as the component calls them ------------

const promptFor = text => MLoopDetector.prototype._prompt.call(null, text)

async function runLlm(tail) {
    const t0 = Date.now()
    try {
        const result = await complete({
            model: resolveModelRef(LLM_MODEL, 'utility'),
            maxTokens: 120, temperature: 0.2,
            prompt: promptFor(tail),
        })
        const parsed = parseLoopReply(result?.text || '')
        return { ...parsed, ms: Date.now() - t0, raw: (result?.text || '').slice(0, 300), ok: true }
    } catch (error) {
        return { ok: false, ms: Date.now() - t0, error: String(error?.message || error) }
    }
}

async function runJev(tail) {
    const t0 = Date.now()
    const result = await decide({
        model: JEV_MODEL,
        state: `…${tail.slice(-1800)}`,
        questions: loopQuestions(),
    })
    if (!result) return { ok: false, ms: Date.now() - t0, error: 'soft failure (see log)' }
    return { ...readLoopDecision(result.answers), ms: result.latencyMs, model: result.model, tokens: result.usage?.prompt_tokens ?? null, ok: true }
}

// --- replay -----------------------------------------------------------------

const MIN_SCORE = 0.5   // the component's default gate
const rows = []
const usageBefore = getUsageTotals()

for (const [i, item] of items.entries()) {
    const row = { i, mind: item.mind, file: item.file, chars: item.tail.length }
    if (ENGINES.includes('jev')) row.jev = await runJev(item.tail.slice(-1800))
    if (ENGINES.includes('llm')) row.llm = await runLlm(item.tail)
    for (const e of ENGINES) {
        const r = row[e]
        if (r?.ok) r.active = r.looping && r.score >= MIN_SCORE
    }
    rows.push(row)
    const s = ENGINES.map(e => {
        const r = row[e]
        if (!r?.ok) return `${e}:FAIL`
        return `${e}:${r.active ? 'LOOP' : '—'} ${r.score.toFixed(2)} ${r.kind}${r.confidence != null ? ` c${r.confidence.toFixed(2)}` : ''} ${r.ms}ms`
    }).join('  |  ')
    console.log(`${String(i + 1).padStart(3)}/${items.length} ${item.mind.padEnd(22).slice(0, 22)} ${s}`)
}

fs.writeFileSync(path.join(OUT, 'rows.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')

// --- summary ----------------------------------------------------------------

const pct = x => `${(x * 100).toFixed(1)}%`
const quantile = (xs, q) => {
    if (!xs.length) return NaN
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

const summary = { at: new Date().toISOString(), n: rows.length, engines: ENGINES, minScore: MIN_SCORE, perEngine: {} }
for (const e of ENGINES) {
    const ok = rows.filter(r => r[e]?.ok)
    const lat = ok.map(r => r[e].ms)
    summary.perEngine[e] = {
        answered: ok.length,
        softFailed: rows.length - ok.length,
        loopRate: ok.length ? ok.filter(r => r[e].active).length / ok.length : null,
        meanScore: ok.length ? ok.reduce((a, r) => a + r[e].score, 0) / ok.length : null,
        latencyP50: quantile(lat, 0.5),
        latencyP95: quantile(lat, 0.95),
        kinds: ok.reduce((acc, r) => { acc[r[e].kind] = (acc[r[e].kind] || 0) + 1; return acc }, {}),
        model: ok[0]?.[e]?.model ?? (e === 'llm' ? LLM_MODEL : null),
    }
}

if (ENGINES.includes('jev') && ENGINES.includes('llm')) {
    const both = rows.filter(r => r.jev?.ok && r.llm?.ok)
    const agree = both.filter(r => r.jev.active === r.llm.active)
    const kindAgree = both.filter(r => r.jev.active && r.llm.active && r.jev.kind === r.llm.kind)
    const bothActive = both.filter(r => r.jev.active && r.llm.active)
    const meanAbsScoreDiff = both.length ? both.reduce((a, r) => a + Math.abs(r.jev.score - r.llm.score), 0) / both.length : null
    // Calibration: does agreement with the LLM sensor rise with Jev's own confidence?
    const buckets = { '<0.5': [], '0.5–0.9': [], '>0.9': [] }
    for (const r of both) {
        const c = r.jev.confidence
        const k = c > 0.9 ? '>0.9' : c >= 0.5 ? '0.5–0.9' : '<0.5'
        buckets[k].push(r.jev.active === r.llm.active ? 1 : 0)
    }
    summary.crossEngine = {
        compared: both.length,
        binaryAgreement: both.length ? agree.length / both.length : null,
        jevOnly: both.filter(r => r.jev.active && !r.llm.active).length,
        llmOnly: both.filter(r => !r.jev.active && r.llm.active).length,
        kindAgreementWhenBothActive: bothActive.length ? kindAgree.length / bothActive.length : null,
        meanAbsScoreDiff,
        calibration: Object.fromEntries(Object.entries(buckets).map(([k, v]) =>
            [k, { n: v.length, agreement: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }])),
        // The same split by the DERIVED noul strength (|p−0.5|·2), since noul has
        // no confidence of its own — plan §3.
        byStrength: (() => {
            const b = { 'weak <0.5': [], 'firm ≥0.5': [] }
            for (const r of both) b[r.jev.strength >= 0.5 ? 'firm ≥0.5' : 'weak <0.5'].push(r.jev.active === r.llm.active ? 1 : 0)
            return Object.fromEntries(Object.entries(b).map(([k, v]) =>
                [k, { n: v.length, agreement: v.length ? v.reduce((a, x) => a + x, 0) / v.length : null }]))
        })(),
    }
}

const usageAfter = getUsageTotals()
summary.spend = {
    promptTokens: usageAfter.promptTokens - usageBefore.promptTokens,
    costUsd: usageAfter.cost - usageBefore.cost,
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')

console.log('\n' + '='.repeat(78))
for (const e of ENGINES) {
    const s = summary.perEngine[e]
    console.log(`${e.padEnd(4)} model=${s.model}  answered ${s.answered}/${rows.length}  loop-rate ${s.loopRate == null ? 'n/a' : pct(s.loopRate)}`
        + `  latency p50 ${s.latencyP50}ms p95 ${s.latencyP95}ms`)
    console.log(`     kinds: ${Object.entries(s.kinds).map(([k, v]) => `${k} ${v}`).join(', ')}`)
}
if (summary.crossEngine) {
    const c = summary.crossEngine
    console.log('-'.repeat(78))
    console.log(`binary agreement (active/not) ${pct(c.binaryAgreement)} over ${c.compared}`
        + `   jev-only ${c.jevOnly}   llm-only ${c.llmOnly}`)
    console.log(`kind agreement when both active ${c.kindAgreementWhenBothActive == null ? 'n/a' : pct(c.kindAgreementWhenBothActive)}`
        + `   mean |Δscore| ${c.meanAbsScoreDiff.toFixed(3)}`)
    for (const [k, v] of Object.entries(c.calibration)) {
        console.log(`  confidence ${k.padEnd(8)} n=${String(v.n).padStart(3)}  agreement ${v.agreement == null ? 'n/a' : pct(v.agreement)}`)
    }
    for (const [k, v] of Object.entries(c.byStrength)) {
        console.log(`  strength  ${k.padEnd(9)} n=${String(v.n).padStart(3)}  agreement ${v.agreement == null ? 'n/a' : pct(v.agreement)}`)
    }
}
console.log(`\nspend this run: ${summary.spend.promptTokens} prompt tokens, $${summary.spend.costUsd.toFixed(5)}`)
console.log(`wrote ${path.relative(repoRoot, OUT)}/{rows.jsonl,summary.json}`)
