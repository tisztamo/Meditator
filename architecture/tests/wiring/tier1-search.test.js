// Phase 4 — the first live tier-1 sense: search `targetMatch` over a CLOSED
// aperture. The source scores its private candidates with a decision model and
// only the score crosses; the controller reports `found` on that score.
// doc/plans/jev-system-one-integration.md §1 Phase 4.
import './setup.js'
import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import A from 'amanita'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { delay } from './setup.js'
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js'
import { SearchTarget, SEARCH_OUTCOME_EVENT } from '../../../src/infrastructure/predictionContracts.js'
import { EDGE_EVIDENCE_EVENT } from '../../../src/infrastructure/perceptionContracts.js'

const COMPONENTS_DIR = fileURLToPath(new URL('./components', import.meta.url))
const SECRET = 'SECRET_TEMPLATE a bell heard through fog'

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {})
}

let savedComponentsPath, journalDir, mind, world, search, grounded, plain

beforeAll(() => {
    savedComponentsPath = process.env.MIND_COMPONENTS_PATH
    process.env.MIND_COMPONENTS_PATH = pathToFileURL(COMPONENTS_DIR).href
})

afterAll(() => {
    if (savedComponentsPath === undefined) delete process.env.MIND_COMPONENTS_PATH
    else process.env.MIND_COMPONENTS_PATH = savedComponentsPath
})

beforeEach(async () => {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-tier1-'))
    document.body.innerHTML = `
      <m-mind name="tier1-search" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-search name="search" sampleBudget="4" deadline="2m" attemptTimeout="600ms" matchThreshold="0.7"></m-search>
        <m-region name="world" modality="text" aperture="closed" dwell="1ms" contactHorizon="10s">
          <m-interrupts name="w-local" threshold="0" rateLimit="0s" gain="1"></m-interrupts>
          <m-grounded-sense name="earth" tier="1" decider="jev" groundBatch="4"></m-grounded-sense>
          <m-fixture-sense name="plain"></m-fixture-sense>
        </m-region>
      </m-mind>`
    await loadMindComponents(document)
    await delay(40)
    mind = document.querySelector('m-mind')
    world = mind.querySelector('[name="world"]')
    search = mind.querySelector('m-search')
    grounded = world.querySelector('[name="earth"]')
    plain = world.querySelector('[name="plain"]')
    if (world.aperture) world.aperture.changedAt = Date.now() - 1000
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
        scopeId: 'tier1-search',
        template: SECRET,
        routes: [{ aperture: 'world', source: 'earth' }],
        sampleBudget: 2,
        deadline: new Date(Date.now() + 8000).toISOString(),
        ...over,
    })
}

async function waitFor(fn, ms = 1200) {
    const start = Date.now()
    while (Date.now() - start < ms) {
        const value = fn()
        if (value) return value
        await delay(10)
    }
    return fn()
}

test('a tier-1 source registers with its decider; tier 1 without one, and tier 2, are still refused', () => {
    const contract = world.contractFor('earth')
    expect(contract.tier).toBe(1)
    expect(contract.decider).toBe('jev')
    expect(world.contractFor('plain').tier).toBe(0)
    expect(world.contractFor('plain').decider).toBeNull()

    const naked = document.createElement('m-grounded-sense')
    naked.setAttribute('name', 'naked')
    naked.setAttribute('tier', '1')
    world.appendChild(naked)
    expect(() => world.registerSource(naked, async () => {})).toThrow(/decider/)

    const two = document.createElement('m-grounded-sense')
    two.setAttribute('name', 'two')
    two.setAttribute('tier', '2')
    two.setAttribute('decider', 'jev')
    world.appendChild(two)
    expect(() => world.registerSource(two, async () => {})).toThrow(/not implemented/)
})

test('a CLOSED aperture search reports found on a tier-1 score, and no candidate text crosses', async () => {
    grounded.items = ['a quiet thing', 'the bell in the fog', 'a third thing']
    grounded.scores = { 'the bell in the fog': 0.93 }

    const scores = []
    const outcomes = []
    const published = []
    mind.addEventListener(EDGE_EVIDENCE_EVENT, e => scores.push(e.detail))
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    const origPub = world.pub.bind(world)
    world.pub = (topic, data) => {
        published.push(JSON.stringify({ topic, data }))
        return origPub(topic, data)
    }

    search.start(target())
    await waitFor(() => outcomes.length)

    expect(world.aperture.state).toBe('closed')
    expect(outcomes[0].status).toBe('found')
    expect(outcomes[0].reason).toBe('edge-match')
    expect(outcomes[0].coverage).toBe(1)

    // The score crossed; the candidate that produced it did not.
    expect(scores).toHaveLength(1)
    expect(scores[0].score).toBeCloseTo(0.93, 5)
    expect(scores[0].tier).toBe(1)
    expect(scores[0].sourceName).toBe('earth')
    expect(scores[0].provenance.questions).toEqual(['targetMatch'])
    expect(scores[0].provenance.model).toBe('jev-1.13.0-test')
    expect(scores[0].provenance.strength).toBeCloseTo(0.86, 5)
    expect(scores[0].provenance.strengthFrom).toContain('|p-0.5|*2')
    expect(scores[0].provenance.apertureState).toBe('closed')
    const crossed = JSON.stringify(scores) + JSON.stringify(outcomes) + published.join('')
    expect(crossed).not.toContain('bell in the fog')
    expect(crossed).not.toContain('SECRET_TEMPLATE')

    // The template reached the grounded source and the model, and nothing else.
    expect(grounded.calls.length).toBeGreaterThan(0)
    expect(grounded.calls[0].state.target).toBe(SECRET)
    expect(grounded.calls.map(c => c.state.candidate)).toContain('the bell in the fog')
})

test('a tier-0 route in the same search is still told nothing about the target', async () => {
    const templates = []
    const orig = world.requestControl.bind(world)
    world.requestControl = req => {
        templates.push({ target: req.target, template: req.template, targetId: req.targetId })
        return orig(req)
    }
    grounded.scores = {}          // nothing matches; the search walks both routes
    search.start(target({
        sampleBudget: 4,
        routes: [
            { aperture: 'world', source: 'plain' },
            { aperture: 'world', source: 'earth' },
        ],
    }))
    await waitFor(() => templates.some(t => t.target === 'earth'))
    const toPlain = templates.filter(t => t.target === 'plain')
    const toEarth = templates.filter(t => t.target === 'earth')
    expect(toPlain.length).toBeGreaterThan(0)
    expect(toPlain.every(t => t.template === null && t.targetId === null)).toBe(true)
    expect(toEarth.every(t => t.template === SECRET)).toBe(true)
})

test('a score below the threshold is a comparable non-match, not absence and not a match', async () => {
    grounded.items = ['a quiet thing']
    grounded.scores = { 'a quiet thing': 0.2 }
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({ sampleBudget: 2 }))
    await waitFor(() => outcomes.length)
    expect(outcomes[0].status).toBe('not-detected-in-inspected-area')
    expect(outcomes[0].coverage).toBe(1)
})

test('a decision model that soft-fails leaves the attempt to time out, never a silent match', async () => {
    grounded.failDecide = true
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target({ sampleBudget: 1 }))
    await waitFor(() => outcomes.length, 2000)
    expect(outcomes[0].status).not.toBe('found')
    expect(outcomes[0].coverage).toBe(0)
})

test('the tier-1 score never reaches the contact regulator as a change header', async () => {
    grounded.items = ['the bell in the fog']
    grounded.scores = { 'the bell in the fog': 0.95 }
    const observed = []
    const origObserve = world.aperture.observe.bind(world.aperture)
    world.aperture.observe = (source, candidate, now) => {
        observed.push(candidate?.changeMagnitude)
        return origObserve(source, candidate, now)
    }
    const outcomes = []
    mind.addEventListener(SEARCH_OUTCOME_EVENT, e => outcomes.push(e.detail))
    search.start(target())
    await waitFor(() => outcomes.length)
    expect(outcomes[0].status).toBe('found')
    // Only the ordinary candidate header (salience 0.55) was ever observed —
    // the 0.95 score was not offered as contact.
    expect(observed.every(m => m !== 0.95)).toBe(true)
})
