// B2 — m-judge behind the comparator port; stubbed complete; progress/empty/unmatched.
import './setup.js'
import { test, expect, beforeEach, afterEach } from 'bun:test'
import A from 'amanita'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { delay } from './setup.js'
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js'
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js'
import { Percept } from '../../../src/infrastructure/percept.js'
import {
    Prediction, firePrediction, PREDICTION_SETTLED_EVENT, EVALUATION_COMMIT_EVENT,
} from '../../../src/infrastructure/predictionContracts.js'

const FIXTURE = 'the screen answers 42'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {})
}

let mind, act, judge, journalDir

function horizon(ms = 60_000) { return new Date(Date.now() + ms).toISOString() }

function stubJudge(fn) {
    judge._complete = fn
}

beforeEach(async () => {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-judge-'))
    document.body.innerHTML = `
      <m-mind name="b2-judge" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-judge name="judge"></m-judge>
        <m-act name="hands" prediction="on" compareDeadline="8s" every="1" cooldown="0s" intentCooldown="15m">
          <m-bid name="act-bid" expectedFloor="0.3" mismatchWeight="0.6"></m-bid>
        </m-act>
      </m-mind>`
    await loadMindComponents(document)
    await delay(40)
    mind = document.querySelector('m-mind')
    act = mind.querySelector('m-act')
    judge = mind.querySelector('m-judge')
    stubJudge(async ({ prompt }) => {
        const expected = /Expected:\n([\s\S]*?)\n\nPerceived:/.exec(prompt)?.[1]?.trim()
        const perceived = /Perceived:\n([\s\S]*)$/.exec(prompt)?.[1]?.trim()
        if (expected && perceived && expected === perceived) return { text: 'MATCH 0.9' }
        if (expected && perceived) return { text: 'MISMATCH 0.8' }
        return { text: 'INSUFFICIENT 0.1' }
    })
})

afterEach(async () => {
    act?._teardownPrediction?.('test-end')
    await document.querySelector('m-memory')?._journalQueue
    document.body.replaceChildren()
    await delay(20)
    fs.rmSync(journalDir, { recursive: true, force: true })
})

test('13. m-judge returns [] for progress, empty text, and unmatched actId', async () => {
    const view = {
        id: 'e1', sourceId: 'probe', modality: 'text', provenance: 'legacy-unspecified',
        archivalText: 'the screen answers 42', actId: 'missing', progress: false,
        requestId: null, occurredAt: new Date().toISOString(), eventType: 'Sense-probe',
    }
    expect(await judge.evaluate(view)).toEqual([])
    expect(await judge.evaluate({ ...view, actId: null, archivalText: '' })).toEqual([])
    expect(await judge.evaluate({ ...view, progress: true, actId: 'x' })).toEqual([])
})

test('13. one complete call per evidence; abort → insufficient', async () => {
    act._registerCapability({
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: FIXTURE }),
    })
    let calls = 0
    stubJudge(async () => { calls++; return { text: 'MATCH 1' } })
    const bids = []
    mind.addEventListener('interrupt-request', e => {
        if (e.detail instanceof AttentionBid) bids.push(e.detail)
    })
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'look' },
    )
    const start = Date.now()
    while (Date.now() - start < 400 && !bids.find(b => b.evidence?.reason === FIXTURE)) await delay(5)
    expect(calls).toBe(1)
    expect(bids[0].signals.predictionMatch).toBe(1)

    const controller = new AbortController()
    const pred = new Prediction({
        producer: 'hands', scopeId: 'hands', actId: 'act-abort',
        target: { eventType: 'Sense-probe' },
        representation: { kind: 'text', value: FIXTURE },
        basis: { kind: 'realize', text: FIXTURE },
        validUntil: horizon(),
    })
    firePrediction(act, pred)
    judge._index.onPrediction({ detail: pred })
    stubJudge(async ({ signal }) => {
        await new Promise((_, reject) => {
            const fail = () => reject(new Error('aborted'))
            if (signal?.aborted) return fail()
            signal?.addEventListener('abort', fail)
        })
    })
    const pending = judge.evaluate({
        id: 'e-abort', archivalText: FIXTURE, actId: 'act-abort', progress: false,
        sourceId: 'probe', eventType: 'Sense-probe',
    }, { signal: controller.signal })
    controller.abort()
    const aborted = await pending
    expect(aborted).toHaveLength(1)
    expect(aborted[0].verdict).toBe('insufficient')
})

test('14. with complete stubbed, m-judge matches exact fixture text on the act path', async () => {
    act._registerCapability({
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: FIXTURE }),
    })
    const settlements = []
    act.addEventListener(PREDICTION_SETTLED_EVENT, e => settlements.push(e.detail))
    const commits = []
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail))
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'look' },
    )
    const start = Date.now()
    while (Date.now() - start < 400 && !settlements.length) await delay(5)
    expect(settlements[0].status).toBe('matched')
    expect(commits[0].verdicts).toEqual(['match'])
    expect(JSON.stringify(commits[0])).not.toContain(FIXTURE)
})

test('15. two comparators of either class in one membrane fail at connect', async () => {
    let captured = null
    const onError = event => {
        captured = event.error || new Error(event.message)
        event.preventDefault?.()
    }
    window.addEventListener('error', onError)
    try {
        try {
            document.body.innerHTML = `
              <m-mind name="b2-dup" stage="experimental">
                <m-judge name="judge"></m-judge>
                <m-compare name="compare"></m-compare>
              </m-mind>`
            await loadMindComponents(document)
        } catch (error) {
            captured = error
        }
        await delay(10)
    } finally {
        window.removeEventListener('error', onError)
    }
    expect(captured?.message || String(captured)).toMatch(/only one comparator/)
})
