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
import { offerFixtureHand } from './fixtureHand.js'
import { askComparator, COMPARE_REQUEST } from '../../../src/mindComponents/shared/comparators.js'
import { heardBid } from "./attentionProbe.js";

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
    // Asked as an owner asks (a compare request), so [] is the judge's answer, not silence.
    const ask = async v => {
        const reply = await act.request(COMPARE_REQUEST, { view: v, deadline: Date.now() + 2000 }, { deadline: 2000 })
        expect(reply.status).toBe('ok')
        expect(reply.from).toBe('judge')
        return reply.data.evaluations
    }
    expect(await ask(view)).toEqual([])
    expect(await ask({ ...view, actId: null, archivalText: '' })).toEqual([])
    expect(await ask({ ...view, progress: true, actId: 'x' })).toEqual([])
})

test('13. one complete call per evidence; a cancelled compare aborts the model call', async () => {
    await offerFixtureHand(act, {
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
        { const heard = heardBid(e); if (heard) bids.push(heard) }
    })
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'look' },
    )
    const start = Date.now()
    while (Date.now() - start < 400 && !bids.find(b => b.evidence?.reason === FIXTURE)) await delay(5)
    expect(calls).toBe(1)
    expect(bids[0].signals.predictionMatch).toBe(1)

    const pred = new Prediction({
        producer: 'hands', scopeId: 'hands', actId: 'act-abort',
        target: { eventType: 'Sense-probe' },
        representation: { kind: 'text', value: FIXTURE },
        basis: { kind: 'realize', text: FIXTURE },
        validUntil: horizon(),
    })
    firePrediction(act, pred)
    while (Date.now() - start < 800 && !judge._index.values().some(p => p.id === pred.id)) await delay(5)
    let started = false
    let sawAbort = false
    stubJudge(async ({ signal }) => {
        started = true
        await new Promise((_, reject) => {
            const fail = () => { sawAbort = true; reject(new Error('aborted')) }
            if (signal?.aborted) return fail()
            signal?.addEventListener('abort', fail)
        })
    })
    // The owner's side of the port: ask, then cancel (sleep, a disconnect).
    const controller = new AbortController()
    const pending = askComparator(act, 'judge', {
        id: 'e-abort', archivalText: FIXTURE, actId: 'act-abort', progress: false,
        sourceId: 'probe', eventType: 'Sense-probe',
    }, { deadline: Date.now() + 5000, signal: controller.signal })
    while (Date.now() - start < 1200 && !started) await delay(5)
    expect(started).toBe(true)
    controller.abort()
    expect(await pending).toEqual([])                  // no evaluation reaches the owner
    while (Date.now() - start < 1600 && !sawAbort) await delay(5)
    expect(sawAbort).toBe(true)                        // the cancel reached the judge's model call
})

test('14. with complete stubbed, m-judge matches exact fixture text on the act path', async () => {
    await offerFixtureHand(act, {
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
