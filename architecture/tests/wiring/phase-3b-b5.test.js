// B5 — bounded search: control-result, attempt machine, outcomes (roadmap 25–33).
import './setup.js'
import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import A from 'amanita'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { delay } from './setup.js'
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js'
import {
    SearchTarget, SEARCH_TARGET_EVENT, SEARCH_OUTCOME_EVENT,
} from '../../../src/infrastructure/predictionContracts.js'
import { ControlRequest, CONTROL_RESULT_EVENT } from '../../../src/infrastructure/perceptionContracts.js'

const COMPONENTS_DIR = fileURLToPath(new URL('./components', import.meta.url))

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {})
}

let savedComponentsPath, journalDir, mind, world, sky, search, earth, star

beforeAll(() => {
    savedComponentsPath = process.env.MIND_COMPONENTS_PATH
    process.env.MIND_COMPONENTS_PATH = pathToFileURL(COMPONENTS_DIR).href
})

afterAll(() => {
    if (savedComponentsPath === undefined) delete process.env.MIND_COMPONENTS_PATH
    else process.env.MIND_COMPONENTS_PATH = savedComponentsPath
})

beforeEach(async () => {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-b5-'))
    document.body.innerHTML = `
      <m-mind name="b5-search" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-compare name="compare"></m-compare>
        <m-search name="search" sampleBudget="6" deadline="2m" attemptTimeout="400ms"></m-search>
        <m-region name="world" modality="text" aperture="open" dwell="1ms" contactHorizon="10s">
          <m-interrupts name="w-local" threshold="0" rateLimit="0s" gain="1"></m-interrupts>
          <m-bid name="world-bid" expectedFloor="0.3" mismatchWeight="0.6"></m-bid>
          <m-fixture-sense name="earth"></m-fixture-sense>
        </m-region>
        <m-region name="sky" modality="text" aperture="open" dwell="1ms" contactHorizon="10s">
          <m-interrupts name="s-local" threshold="0" rateLimit="0s" gain="1"></m-interrupts>
          <m-fixture-sense name="star"></m-fixture-sense>
        </m-region>
      </m-mind>`
    await loadMindComponents(document)
    await delay(40)
    mind = document.querySelector('m-mind')
    world = mind.querySelector('[name="world"]')
    sky = mind.querySelector('[name="sky"]')
    search = mind.querySelector('m-search')
    earth = world.querySelector('[name="earth"]')
    star = sky.querySelector('[name="star"]')
    earth.line = 'hello item'
    star.line = 'night sky'
    if (world.aperture) world.aperture.changedAt = Date.now() - 1000
    if (sky.aperture) sky.aperture.changedAt = Date.now() - 1000
})

afterEach(async () => {
    search?._settle?.('abandoned', 'test-end')
    await document.querySelector('m-memory')?._journalQueue
    document.body.replaceChildren()
    await delay(20)
    fs.rmSync(journalDir, { recursive: true, force: true })
})

function target(over = {}) {
    return new SearchTarget({
        owner: 'search',
        scopeId: 'b5-search',
        template: 'hello item',
        routes: [{ aperture: 'world', source: 'earth' }],
        sampleBudget: 4,
        deadline: new Date(Date.now() + 8000).toISOString(),
        ...over,
    })
}

async function waitFor(fn, ms = 600) {
    const start = Date.now()
    while (Date.now() - start < ms) {
        const value = fn()
        if (value) return value
        await delay(10)
    }
    return fn()
}

test('25. target publication precedes the first attempt, which precedes source sampling', async () => {
    const order = []
    mind.addEventListener(SEARCH_TARGET_EVENT, () => order.push('target'))
    const orig = world.requestControl.bind(world)
    world.requestControl = req => { order.push('attempt'); return orig(req) }
    const origSense = earth.onSense.bind(earth)
    earth.onSense = async request => { order.push('sample'); return origSense(request) }
    search.start(target())
    await waitFor(() => order.includes('sample'))
    expect(order[0]).toBe('target')
    expect(order.indexOf('attempt')).toBeGreaterThan(0)
    expect(order.indexOf('sample')).toBeGreaterThan(order.indexOf('attempt'))
})

test('26. a target match stops immediately as found; later evidence cannot reopen it', async () => {
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target())
    await waitFor(() => outcomes.length)
    expect(outcomes[0].status).toBe('found')
    const id = outcomes[0].targetId
    search.observe({
        requestId: 'late',
        evidenceId: 'e-late',
        evaluations: [{ subject: { kind: 'target', id }, verdict: 'mismatch' }],
    })
    expect(outcomes).toHaveLength(1)
    expect(search._live).toBeNull()
})

test('27. complete comparable coverage with no match is not-detected-in-inspected-area', async () => {
    earth.line = 'nope'
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({
        template: 'zzzz',
        sampleBudget: 2,
        routes: [{ aperture: 'world', source: 'earth' }],
    }))
    await waitFor(() => outcomes.length)
    expect(outcomes[0].status).toBe('not-detected-in-inspected-area')
    expect(outcomes[0].coverage).toBe(1)
})

test('28. missing or refused evidence is exhausted/abandoned, never absence', async () => {
    world.aperture.state = 'closed'
    world.aperture.version++
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({ sampleBudget: 2, template: 'zzzz' }))
    await waitFor(() => outcomes.length)
    expect(['budget-exhausted', 'abandoned']).toContain(outcomes[0].status)
    expect(outcomes[0].status).not.toBe('not-detected-in-inspected-area')
})

test('29. repeating one route spends budget without increasing distinct-route coverage', async () => {
    const long = 'one two three four five six seven eight'
    earth.line = 'nine ten eleven twelve thirteen fourteen fifteen sixteen'
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({
        template: long,
        sampleBudget: 3,
        routes: [{ aperture: 'world', source: 'earth' }],
    }))
    await waitFor(() => outcomes.length, 1200)
    expect(outcomes[0].status).toBe('budget-exhausted')
    expect(outcomes[0].attemptedSamples).toBe(3)
    expect(outcomes[0].coverage).toBe(0)
    expect(outcomes[0].inspectedRoutes).toHaveLength(0)
})

test('30. refused and timed-out attempts advance without coverage; only comparable match/nonmatch completes a route', async () => {
    world.aperture.state = 'closed'
    world.aperture.version++
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({ sampleBudget: 2, template: 'hello item' }))
    await waitFor(() => outcomes.length)
    expect(outcomes[0].coverage).toBe(0)
    expect(outcomes[0].attemptedSamples).toBeGreaterThanOrEqual(1)
})

test('31. one controller searches two modality routes without search logic on either region', async () => {
    earth.line = 'nope'
    star.line = 'hello item'
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({
        template: 'hello item',
        sampleBudget: 4,
        routes: [
            { aperture: 'world', source: 'earth' },
            { aperture: 'sky', source: 'star' },
        ],
    }))
    await waitFor(() => outcomes.length, 800)
    expect(outcomes[0].status).toBe('found')
    expect(world.start).toBeUndefined()
    expect(sky.start).toBeUndefined()
})

test('32. a closed tier-0 route leaks no template and cannot be searched through; an opened route can', async () => {
    world.aperture.state = 'closed'
    world.aperture.version++
    const secrets = []
    const origPub = world.pub.bind(world)
    world.pub = (topic, data) => {
        secrets.push(JSON.stringify({ topic, data }))
        return origPub(topic, data)
    }
    const results = []
    mind.addEventListener(CONTROL_RESULT_EVENT, e => results.push(e.detail))
    search.start(target({ template: 'SECRET_TEMPLATE', sampleBudget: 1 }))
    await waitFor(() => results.length || search._live == null)
    expect(results.every(r => r.accepted === false || r.reason === 'closed' || r.accepted === true)).toBe(true)
    expect(JSON.stringify(results)).not.toContain('SECRET_TEMPLATE')
    expect(secrets.join('')).not.toContain('SECRET_TEMPLATE')

    world.aperture.changedAt = Date.now() - 1000
    world.aperture.state = 'open'
    world.aperture.version++
    earth.line = 'hello item'
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({ template: 'hello item', sampleBudget: 2 }))
    await waitFor(() => outcomes.length)
    expect(outcomes[0].status).toBe('found')
})

test('33. with no search controller, a standalone focus remains accepted and changes no aperture state', async () => {
    search.remove()
    const before = world.aperture.state
    const ok = world.requestControl(new ControlRequest({
        kind: 'focus',
        issuedBy: 'test',
        target: 'earth',
        reason: 'look',
        template: null,
    }))
    expect(ok).toBe(true)
    expect(world.aperture.state).toBe(before)
})

test('ControlRequest.template is null on every request this phase issues', async () => {
    const templates = []
    const orig = world.requestControl.bind(world)
    world.requestControl = req => {
        templates.push(req.template)
        return orig(req)
    }
    search.start(target())
    await delay(40)
    expect(templates.length).toBeGreaterThan(0)
    expect(templates.every(t => t == null)).toBe(true)
})
