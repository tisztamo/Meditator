#!/usr/bin/env bun
/** Offline B2 judge over B1 ledgers. Pairs each prediction with its outcome
 * consequence and writes verdicts beside the pairs.
 *
 *   bun judge-offline.mjs <mind-home> [--engine llm|jev] [--state narrated|raw|both]
 *                                     [--repeats N] [--suffix TAG]
 *
 * Two engines:
 *
 *   --engine llm   (default) complete() with judgePrompt/parseJudgeReply, the
 *                  B2 comparator as shipped. Needs a model (local-voice).
 *                  Writes predictions/judge-offline.jsonl, unchanged.
 *
 *   --engine jev   decide() against a System-One provider: one fan-out call per
 *                  pair carrying all three Phase-2 questions (jev-system-one-
 *                  integration.md §1 Phase 2). Writes one file per arm,
 *                  predictions/judge-offline-jev-<state>[-rN].jsonl.
 *
 * The Jev arms cross two things:
 *
 *   state shape    `narrated` is the evidence as the perception layer wrote it
 *                  ("Checking <intent> — the screen comes back with: …"), which
 *                  restates the expectation inside the evidence; `raw` is the
 *                  payload after the narration, expect-study §2.5's open point.
 *   question set   `verdict` is the three-way choice with the judge's own
 *                  glosses as criteria; `decomp` derives the verdict from two
 *                  nouls (has_result ∧ contradicts → mismatch, has_result ∧
 *                  ¬contradicts → match, ¬has_result → insufficient). Both come
 *                  out of the same call, so the two arms cost one request.
 *
 * Analysis: jev-metrics.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { complete } from '../../../../src/modelAccess/llm.js'
import { loadModelConfig, resolveModelRef } from '../../../../src/modelAccess/modelConfig.js'
import { judgePrompt, parseJudgeReply, JUDGE_MAX_TOKENS, VERDICT_GLOSSES } from '../../../../src/infrastructure/judgeCompare.js'
import { decide, verdictChoice, readChoice, getDecideBackoff } from '../../../../src/modelAccess/decide.js'
import { readPairs } from './pairs.mjs'
import { loadEnvKey } from './secrets.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const argv = process.argv.slice(2)
function flag(name, fallback = null) {
    const at = argv.indexOf(`--${name}`)
    return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : fallback
}

function positional() {
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i].startsWith('--')) { i += 1; continue }   // flag, and its value
        return argv[i]
    }
    return null
}
const home = positional()
if (!home) {
    console.error('usage: bun judge-offline.mjs <mind-home> [--engine llm|jev] [--state narrated|raw|both] [--repeats N] [--suffix TAG]')
    process.exit(2)
}

const engine = flag('engine', 'llm')
if (engine !== 'llm' && engine !== 'jev') {
    console.error(`unknown --engine "${engine}" (llm | jev)`)
    process.exit(2)
}

// The decision key is not in this process's environment; put it there before
// the model config interpolates ${TYPESAFE_API_KEY}.
if (engine === 'jev' && !loadEnvKey('TYPESAFE_API_KEY', { repoRoot })) {
    console.error('TYPESAFE_API_KEY is not set (environment, repo .env, or ~/.env). Nothing to judge with.')
    process.exit(2)
}

await loadModelConfig()

const pairs = readPairs(home)
if (!pairs.length) {
    console.error(`no prediction/consequence pairs under ${path.join(home, 'predictions')}`)
    process.exit(1)
}

const outDir = path.join(home, 'predictions')
fs.mkdirSync(outDir, { recursive: true })

if (engine === 'llm') await runLlm()
else await runJev()

// ---------------------------------------------------------------------------
// The LLM comparator (B2 as shipped)
// ---------------------------------------------------------------------------

async function runLlm() {
    const model = resolveModelRef(process.env.MEDITATOR_JUDGE_MODEL || 'utility', 'utility')
    const rows = []
    for (const pair of pairs) {
        const prompt = judgePrompt({ expectText: pair.expectText, evidenceText: pair.evidenceText })
        let reply = ''
        try {
            const result = await complete({
                model,
                maxTokens: JUDGE_MAX_TOKENS,
                temperature: 0,
                prompt,
                debugTag: 'judge-offline',
            })
            reply = result?.text || ''
        } catch (error) {
            reply = `ERROR ${error.message}`
        }
        const parsed = parseJudgeReply(reply)
        rows.push({
            predictionId: pair.predictionId,
            actId: pair.actId,
            expectText: pair.expectText,
            evidenceText: pair.evidenceText,
            reply,
            ...parsed,
        })
    }

    const out = path.join(outDir, `judge-offline${flag('suffix') ? `-${flag('suffix')}` : ''}.jsonl`)
    write(out, rows)
    const counts = tally(rows, r => r.verdict)
    console.log(JSON.stringify({ engine: 'llm', n: rows.length, counts, out }, null, 2))
    console.error('Label a sample of at least thirty pairs blind (rubric in analysis/rubric.md); report confusion vs this file.')
}

// ---------------------------------------------------------------------------
// The decision engine (Phase 2)
// ---------------------------------------------------------------------------

/**
 * The three Phase-2 questions, asked together.
 *
 * `has_result`/`contradicts` mirror the two distinctions the text judge kept
 * losing: whether there is anything to compare at all, and, if there is,
 * whether it goes the other way. A noul carries no confidence, so its strength
 * is derived as |p − 0.5|·2 downstream and labelled as derived.
 */
function questions() {
    return {
        verdict: verdictChoice(),
        has_result: {
            type: 'noul',
            instructions: 'The perception carries a result that can be compared against the expectation.',
            criteria: {
                true: 'the perception carries a result that can be compared against the expectation',
                false: VERDICT_GLOSSES.insufficient,
            },
        },
        contradicts: {
            type: 'noul',
            instructions: 'The perception conflicts with what was expected.',
            criteria: {
                true: VERDICT_GLOSSES.mismatch,
                false: 'the perception agrees with the expectation, or says nothing either way. An expectation that was only to see which way something would come out is agreed with by a clear result either way, and news that is unwelcome still agrees.',
            },
        },
    }
}

function stateFor(pair, shape) {
    return { expected: pair.expectText, perceived: shape === 'raw' ? pair.rawText : pair.evidenceText }
}

function readNoul(answer) {
    const p = Number(answer?.noul)
    if (!Number.isFinite(p)) return { p: null, strength: 0 }
    const clamped = Math.max(0, Math.min(1, p))
    return { p: clamped, strength: Math.abs(clamped - 0.5) * 2 }
}

/**
 * 2 ∧ 3 → mismatch, 2 ∧ ¬3 → match, ¬2 → insufficient.
 *
 * Strength is the weaker of the two nouls that the branch actually used: the
 * decomposition is only as sure as its least sure step. It is `|p − 0.5|·2`,
 * derived, not a reported confidence — the endpoint gives none for a noul.
 */
function decompose(hasResult, contradicts) {
    if (hasResult.p == null) return { verdict: null, strength: 0 }
    if (hasResult.p < 0.5) return { verdict: 'insufficient', strength: hasResult.strength }
    if (contradicts.p == null) return { verdict: null, strength: 0 }
    const verdict = contradicts.p >= 0.5 ? 'mismatch' : 'match'
    return { verdict, strength: Math.min(hasResult.strength, contradicts.strength) }
}

async function runJev() {
    const shapes = flag('state', 'both') === 'both' ? ['narrated', 'raw'] : [flag('state', 'both')]
    for (const shape of shapes) {
        if (shape !== 'narrated' && shape !== 'raw') {
            console.error(`unknown --state "${shape}" (narrated | raw | both)`)
            process.exit(2)
        }
    }
    const repeats = Math.max(1, Number(flag('repeats', 1)) || 1)
    const suffix = flag('suffix') ? `-${flag('suffix')}` : ''
    const model = resolveModelRef(process.env.MEDITATOR_DECIDE_MODEL || 'jev', 'judge')
    const summary = []

    for (const shape of shapes) {
        for (let run = 1; run <= repeats; run += 1) {
            const rows = []
            let softFails = 0
            for (const pair of pairs) {
                const state = stateFor(pair, shape)
                // No deadline: this is an offline benchmark, so a 429 may be
                // waited out once rather than dropped the way a live compare
                // would drop it.
                const result = await decide({ model, state, questions: questions(), debugTag: 'judge-offline-jev' })
                if (!result) {
                    softFails += 1
                    rows.push({
                        predictionId: pair.predictionId, actId: pair.actId, state: shape, run,
                        expectText: pair.expectText, perceivedText: state.perceived,
                        softFail: true, verdict: null, confidence: 0,
                        decompVerdict: null, decompStrength: 0,
                    })
                    continue
                }
                const choice = readChoice(result.answers?.verdict)
                const hasResult = readNoul(result.answers?.has_result)
                const contradicts = readNoul(result.answers?.contradicts)
                const decomp = decompose(hasResult, contradicts)
                rows.push({
                    predictionId: pair.predictionId,
                    actId: pair.actId,
                    type: pair.type,
                    state: shape,
                    run,
                    stripped: shape === 'raw' ? pair.narrated : false,
                    expectText: pair.expectText,
                    perceivedText: state.perceived,
                    model: result.model,
                    latencyMs: result.latencyMs,
                    promptTokens: result.usage?.prompt_tokens ?? null,
                    cost: result.usage?.cost ?? null,
                    // arm: verdict (choice)
                    verdict: choice.value,
                    confidence: choice.confidence,
                    probabilities: choice.probabilities,
                    // arm: decomposition (two nouls)
                    hasResult: hasResult.p,
                    contradicts: contradicts.p,
                    decompVerdict: decomp.verdict,
                    decompStrength: decomp.strength,
                    strengthIsDerived: true,
                })
            }
            const tag = repeats > 1 ? `-r${run}` : ''
            const out = path.join(outDir, `judge-offline-jev-${shape}${tag}${suffix}.jsonl`)
            write(out, rows)
            const line = {
                arm: `${shape}${tag}`,
                n: rows.length,
                softFails,
                verdict: tally(rows, r => r.verdict),
                decomp: tally(rows, r => r.decompVerdict),
                model: rows.find(r => r.model)?.model || null,
                cost: round(rows.reduce((a, r) => a + (r.cost || 0), 0), 6),
                out,
            }
            summary.push(line)
            console.error(JSON.stringify(line))
        }
    }
    const backoff = getDecideBackoff()
    console.log(JSON.stringify({ engine: 'jev', arms: summary, backoffStreak: backoff.streak }, null, 2))
}

// ---------------------------------------------------------------------------

function write(file, rows) {
    fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
}

function tally(rows, pick) {
    const counts = { match: 0, mismatch: 0, insufficient: 0, none: 0 }
    for (const row of rows) {
        const key = pick(row)
        if (counts[key] != null) counts[key] += 1
        else counts.none += 1
    }
    return counts
}

function round(n, places) {
    const f = 10 ** places
    return Math.round(n * f) / f
}
