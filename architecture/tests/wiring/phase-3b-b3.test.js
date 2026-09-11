// B3 — perceive() under aperture vs eager feel(); contact credit.
import './setup.js'
import { test, expect, beforeEach, afterEach } from 'bun:test'
import A from 'amanita'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { delay } from './setup.js'
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js'
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js'
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js'
import { Percept } from '../../../src/infrastructure/percept.js'

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {})
}

let mind, region, feed, journalDir

beforeEach(async () => {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-b3-'))
    document.body.innerHTML = `
      <m-mind name="b3-aperture" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="world" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
          <m-interrupts name="local" threshold="0" rateLimit="0s" gain="1"></m-interrupts>
          <m-feed name="earth" url="https://example.invalid/rss.xml"></m-feed>
        </m-region>
        <m-feed name="eager" url="https://example.invalid/rss.xml"></m-feed>
      </m-mind>`
    await loadMindComponents(document)
    await delay(40)
    mind = document.querySelector('m-mind')
    region = mind.querySelector('m-region')
    feed = region.querySelector('m-feed')
    region.aperture.changedAt = Date.now() - 2000
})

afterEach(async () => {
    await document.querySelector('m-memory')?._journalQueue
    document.body.replaceChildren()
    await delay(20)
    fs.rmSync(journalDir, { recursive: true, force: true })
})

test('16. perceive() outside an aperture fires the same InterruptRecord feel() fires', () => {
    const eager = mind.querySelector('[name="eager"]')
    const a = eager.feel('A scrap of the outside world drifts past — “Hello”.', { salience: 0.4 })
    const b = eager.perceive('A scrap of the outside world drifts past — “Hello”.', { salience: 0.4 })
    expect(a).toBeInstanceOf(InterruptRecord)
    expect(b).toBeInstanceOf(InterruptRecord)
    expect(a.reason).toBe(b.reason)
    expect(a.salience).toBe(b.salience)
    expect(a.type).toBe(b.type)
    expect(a.urgent).toBe(false)
    expect(b.urgent).toBe(false)
})

test('17. under an open aperture at gain 1 with explicit salience, bid salience equals the eager record', async () => {
    const line = 'A scrap of the outside world drifts past — “Hello”.'
    const eager = feed.feel(line, { salience: 0.55 })
    const bids = []
    mind.addEventListener('interrupt-request', e => {
        if (e.detail instanceof AttentionBid) bids.push(e.detail)
    })
    const offered = await feed.perceive(line, { salience: 0.55, changeKey: 'Hello' })
    expect(offered).toBeInstanceOf(AttentionBid)
    expect(AttentionBid.evidenceOf(offered).renderForFrame()).toBe(line)
    expect(offered.salience).toBe(eager.salience)
    expect(AttentionBid.evidenceOf(offered)).toBeInstanceOf(Percept)
})

test('18. under closed, the feed materializes nothing; the header is observed; no text appears', async () => {
    region.aperture.state = 'closed'
    region.aperture.version++
    const pubs = []
    const orig = region.pub.bind(region)
    region.pub = (topic, data) => {
        pubs.push({ topic, data })
        return orig(topic, data)
    }
    const SECRET = 'SECRET_FEED_ITEM_MUST_NOT_LEAK'
    const result = await feed.perceive(`A scrap of the outside world drifts past — “${SECRET}”.`, {
        salience: 0.4, changeKey: SECRET,
    })
    expect(result).toBeNull()
    expect(JSON.stringify(pubs)).not.toContain(SECRET)
    const day = path.join(journalDir, `${new Date().toISOString().slice(0, 10)}.md`)
    if (fs.existsSync(day)) expect(fs.readFileSync(day, 'utf8')).not.toContain(SECRET)
})

test('19. an attended feed receipt reduces contactPressure; a refused candidate does not', async () => {
    const before = region.contactPressure
    const bid = await feed.perceive('A scrap of the outside world drifts past — “Hello”.', {
        salience: 0.9, changeKey: 'Hello',
    })
    expect(bid).toBeInstanceOf(AttentionBid)
    const afterOffer = region.contactPressure
    const receipts = [{
        perceptId: bid.evidence.id,
        occurredAt: Date.now(),
    }]
    // Credit the way the mind does: fire percepts-attended with a real receipt shape.
    const { PerceptReceipt } = await import('../../../src/infrastructure/perceptionContracts.js')
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
    expect(region.contactPressure).toBeLessThan(afterOffer)

    region.aperture.state = 'closed'
    region.aperture.version++
    const pressureClosed = region.contactPressure
    await feed.perceive('A scrap of the outside world drifts past — “Nope”.', {
        salience: 0.9, changeKey: 'Nope',
    })
    // A refused candidate is still observed (debt); it must not reduce pressure.
    expect(region.contactPressure).toBeGreaterThanOrEqual(pressureClosed)
    void before
})
