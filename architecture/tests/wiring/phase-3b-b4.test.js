// B4 — orientation: requestOrientation, lanes, m-orient, claim-at-execute (roadmap 17–24).
import './setup.js'
import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import A from 'amanita'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { delay } from './setup.js'
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js'
import { OrientationRequest } from '../../../src/infrastructure/predictionContracts.js'
import { PerceptReceipt } from '../../../src/infrastructure/perceptionContracts.js'
import { normalizeIntent } from '../../../src/mindComponents/shared/mAct.js'

const COMPONENTS_DIR = fileURLToPath(new URL('./components', import.meta.url))

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {})
}

let savedComponentsPath, journalDir, mind, region, inner, act, orient

beforeAll(() => {
    savedComponentsPath = process.env.MIND_COMPONENTS_PATH
    process.env.MIND_COMPONENTS_PATH = pathToFileURL(COMPONENTS_DIR).href
})

afterAll(() => {
    if (savedComponentsPath === undefined) delete process.env.MIND_COMPONENTS_PATH
    else process.env.MIND_COMPONENTS_PATH = savedComponentsPath
})

beforeEach(async () => {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-b4-'))
    document.body.innerHTML = `
      <m-mind name="b4-orient" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="outer" modality="text" aperture="open" dwell="80ms" contactHorizon="10s">
          <m-test-aperture name="inner" modality="text" aperture="open" dwell="80ms" contactHorizon="10s">
            <m-interrupts name="local" threshold="0" rateLimit="0s" gain="1"></m-interrupts>
            <m-fixture-sense name="earth"></m-fixture-sense>
            <m-fixture-sense name="alarm" bypassAperture="true"></m-fixture-sense>
          </m-test-aperture>
        </m-region>
        <m-act name="hands" prediction="on" every="1" cooldown="3s" readCooldown="5s" intentCooldown="15m">
          <m-orient name="orient" cooldown="30s" intentThreshold="0.75"></m-orient>
        </m-act>
      </m-mind>`
    await loadMindComponents(document)
    await delay(40)
    mind = document.querySelector('m-mind')
    region = mind.querySelector('[name="outer"]')
    inner = mind.querySelector('[name="inner"]')
    act = mind.querySelector('m-act')
    orient = mind.querySelector('m-orient')
    if (inner?.aperture) inner.aperture.changedAt = Date.now() - 1000
    if (region?.aperture) region.aperture.changedAt = Date.now() - 1000
})

afterEach(async () => {
    await document.querySelector('m-memory')?._journalQueue
    document.body.replaceChildren()
    await delay(20)
    fs.rmSync(journalDir, { recursive: true, force: true })
})

function req(over = {}) {
    return new OrientationRequest({
        issuedBy: 'test',
        aperture: 'inner',
        state: 'closed',
        reason: 'look',
        ...over,
    })
}

test('17. a named request reaches a nested substitute aperture once; another membrane cannot satisfy it', () => {
    const hits = []
    const orig = inner.orient.bind(inner)
    inner.orient = (...args) => { hits.push(args); return orig(...args) }
    expect(region.requestOrientation(req({ state: 'soft' }))).toBe(true)
    expect(hits).toHaveLength(1)
    expect(inner.aperture.state).toBe('soft')

    document.body.insertAdjacentHTML('beforeend', `<m-mind name="other"><m-region name="inner" modality="text" aperture="open"></m-region></m-mind>`)
    const sibling = document.querySelector('[name="other"]')
    const otherRegion = sibling.querySelector('m-region')
    const before = otherRegion.aperture?.state ?? null
    inner.aperture.changedAt = Date.now() - 1000
    region.requestOrientation(req({ aperture: 'inner', state: 'closed' }))
    expect(otherRegion.aperture?.state ?? null).toBe(before)
})

test('18. orientation cannot carry bypass powers, exceed configured states, or address an undeclared provider', () => {
    expect(() => new OrientationRequest({
        issuedBy: 'test', aperture: 'inner', state: 'ajar', reason: 'x',
    })).toThrow()
    expect(region.requestOrientation(req({ aperture: 'no-such', state: 'open' }))).toBe(false)
    expect(inner.requestOrientation(req({ state: 'narrow', source: 'missing' }))).toBe(false)
    expect(inner.aperture.state).not.toBe('narrow')
})

test('19. the control lane does not consume read/world cooldowns and vice versa', () => {
    const look = { name: 'look', readonly: true, execute: async () => ({}) }
    const note = { name: 'note', readonly: false, execute: async () => ({}) }
    const capOrient = act._capabilities.find(c => c.name === 'orient')
    act._registerCapability({ ...look, description: 'd' })
    act._registerCapability({ ...note, description: 'd' })
    const lookCap = act._capabilities.find(c => c.name === 'look')
    const noteCap = act._capabilities.find(c => c.name === 'note')
    expect(act._laneOpen(lookCap)).toBe(true)
    expect(act._laneOpen(noteCap)).toBe(true)
    expect(act._laneOpen(capOrient)).toBe(true)
    act._claimLane(lookCap)
    expect(act._laneOpen(lookCap)).toBe(false)
    expect(act._laneOpen(noteCap)).toBe(true)
    expect(act._laneOpen(capOrient)).toBe(true)
    act._claimLane(capOrient)
    expect(act._laneOpen(noteCap)).toBe(true)
    expect(act._laneOpen(capOrient)).toBe(false)
})

test('20. overlapping orientation requests are first-observed/first-accepted under dwell', () => {
    expect(inner.requestOrientation(req({ state: 'closed' }))).toBe(true)
    expect(inner.aperture.state).toBe('closed')
    expect(inner.requestOrientation(req({ state: 'open' }))).toBe(false)
    expect(inner.aperture.state).toBe('closed')
})

test('21. opening changes state and requests the present but does not clear debt; a receipt does', async () => {
    inner.orient('closed')
    inner.aperture.changedAt = Date.now() - 1000
    inner.aperture.deficit = 0.4
    const before = inner.aperture.deficit
    const samples = []
    const earth = inner.querySelector('[name="earth"]')
    const orig = earth.onSense.bind(earth)
    earth.onSense = async request => { samples.push(request); return orig(request) }
    expect(inner.orient('open')).toBe(true)
    expect(inner.aperture.state).toBe('open')
    expect(inner.aperture.deficit).toBe(before)
    await delay(20)
    expect(samples.length).toBeGreaterThan(0)
    expect(samples[0].actId).toBeNull()

    const bid = await earth.perceive('A scrap of the outside world drifts past — “Hello”.', {
        salience: 0.5, changeKey: 'Hello',
    })
    const receipt = new PerceptReceipt({
        perceptId: bid.evidence.id,
        frameId: 'frame-1',
        sourceId: 'earth',
        modality: 'text',
        provenance: 'unspecified',
        tier: 0,
        occurredAt: Date.now(),
        attendedAt: Date.now(),
        receivedKind: 'text',
        renditionText: bid.evidence.renderForFrame(),
        policy: { privacy: 'resident-private' },
    })
    mind.dispatchEvent(new CustomEvent('percepts-attended', { detail: [receipt] }))
    await delay(10)
    expect(inner.aperture.deficit).toBeLessThan(before)
})

test('22. voluntary closure cannot outlast the reflex', () => {
    inner.orient('closed')
    inner.aperture.deficit = 0.7
    inner.aperture.changedAt = Date.now() - 60_000
    inner.aperture.updatedAt = Date.now()
    inner.onBoundary()
    expect(inner.aperture.state).toBe('soft')
})

test('23. a bypassAperture source still crosses an aperture the mind closed itself', async () => {
    inner.requestOrientation(req({ state: 'closed' }))
    expect(inner.aperture.state).toBe('closed')
    const alarm = inner.querySelector('[name="alarm"]')
    const bid = await alarm.perceive('alarm tone', { salience: 0.8, changeKey: 'alarm tone' })
    expect(bid).not.toBeNull()
    expect(bid.evidence.renderForFrame()).toBe('alarm tone')
    const earth = inner.querySelector('[name="earth"]')
    const refused = await earth.perceive('hidden', { salience: 0.8, changeKey: 'hidden' })
    expect(refused).toBeNull()
})

test('24. the orient felt line reaches embodiment without mechanism language', () => {
    expect(act.embodiment).toMatch(/channel|world|voice/i)
    expect(act.embodiment.toLowerCase()).not.toMatch(/modality|threshold|aperture|gain|dwell|closed|narrow|soft/)
})

test('derived provider enum comes from live apertures and refreshes', async () => {
    const cap = act._capabilities.find(c => c.name === 'orient')
    expect(cap.parameters.properties.aperture.enum).toEqual(expect.arrayContaining(['outer', 'inner']))
    expect(cap.acceptsTemplate).toBe(true)
    expect(cap.lane).toBe('control')
    expect(cap.consequenceType).toBeNull()
    document.querySelector('[name="outer"]').insertAdjacentHTML(
        'beforeend',
        `<m-region name="later" modality="text" aperture="open"></m-region>`,
    )
    await loadMindComponents(document)
    await delay(30)
    const updated = act._capabilities.find(c => c.name === 'orient')
    expect(updated.parameters.properties.aperture.enum).toEqual(expect.arrayContaining(['outer', 'inner', 'later']))
})

test('claim-at-execute: a declined reach does not burn the intent ledger; execute does', async () => {
    const gist = 'let the world recede a little'
    const key = normalizeIntent(gist)
    expect(act._ledger.has(key)).toBe(false)
    act._registerCapability({
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } } },
        felt: 'reach',
        execute: async () => ({ experience: 'x' }),
    })
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky' }) } },
        { gist, salience: 0.8 },
    )
    expect(act._ledger.has(key)).toBe(true)
})

test('an orient expect requires one declared source; the sample carries the actId', async () => {
    inner.aperture.changedAt = Date.now() - 1000
    const samples = []
    const earth = inner.querySelector('[name="earth"]')
    const orig = earth.onSense.bind(earth)
    earth.onSense = async request => { samples.push(request); return orig(request) }
    const predictions = []
    act.addEventListener('prediction', e => predictions.push(e.detail))
    await act._execute(
        { function: { name: 'orient', arguments: JSON.stringify({
            aperture: 'inner', state: 'closed', expect: 'hello item',
        }) } },
        { gist: 'look', salience: 0.9 },
    )
    expect(predictions).toHaveLength(0)
    inner.aperture.changedAt = Date.now() - 1000
    await act._execute(
        { function: { name: 'orient', arguments: JSON.stringify({
            aperture: 'inner', state: 'open', source: 'earth', expect: 'hello item',
        }) } },
        { gist: 'look outward', salience: 0.9 },
    )
    await delay(30)
    expect(predictions.length).toBeGreaterThan(0)
    expect(predictions[0].target.sourceId).toBe('earth')
    expect(samples.some(s => s.actId && s.actId === predictions[0].actId)).toBe(true)
})
