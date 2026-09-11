// B1 — m-expect-ledger lab gate and private JSONL.
import './setup.js'
import { test, expect, afterEach } from 'bun:test'
import A from 'amanita'
import fs from 'node:fs'
import path from 'node:path'
import { delay } from './setup.js'
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js'
import { PREDICTION_EVENT } from '../../../src/infrastructure/predictionContracts.js'
import { mindHome } from '../../../src/infrastructure/memoryVault.js'

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {})
}

const originalDryRun = process.env.MEDITATOR_DRY_RUN

function restoreDryRun() {
    if (originalDryRun === undefined) delete process.env.MEDITATOR_DRY_RUN
    else process.env.MEDITATOR_DRY_RUN = originalDryRun
}

afterEach(async () => {
    const memory = document.querySelector('m-memory')
    await memory?._journalQueue
    document.body.replaceChildren()
    restoreDryRun()
    await delay(20)
})

test('9. m-expect-ledger throws on connect in a mind without stage=experimental', async () => {
    let captured = null
    const onError = event => {
        captured = event.error || new Error(event.message)
        event.preventDefault?.()
    }
    window.addEventListener('error', onError)
    try {
        try {
            document.body.innerHTML = `
              <m-mind name="b1-resident">
                <m-expect-ledger name="ledger"></m-expect-ledger>
              </m-mind>`
            await loadMindComponents(document)
        } catch (error) {
            captured = error
        }
        await delay(10)
    } finally {
        window.removeEventListener('error', onError)
    }
    expect(captured?.message || String(captured)).toMatch(/stage="experimental"/)
})

test('10. it writes to mindHome predictions/ledger.jsonl only', async () => {
    process.env.MEDITATOR_DRY_RUN = '1'
    try {
    document.body.innerHTML = `
      <m-mind name="b1-ledger" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-compare name="compare"></m-compare>
        <m-expect-ledger name="ledger"></m-expect-ledger>
        <m-act name="hands" prediction="on" every="1" cooldown="0s" intentCooldown="15m"></m-act>
      </m-mind>`
    await loadMindComponents(document)
    await delay(40)
    const mind = document.querySelector('m-mind')
    const act = mind.querySelector('m-act')
    const pubs = []
    const origPub = act.pub.bind(act)
    act.pub = (topic, data) => {
        pubs.push({ topic, data })
        return origPub(topic, data)
    }
    act._registerCapability({
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: 'the screen answers 42' }),
    })
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: 'the screen answers 42' }) } },
        { gist: 'look' },
    )
    const ledger = mind.querySelector('m-expect-ledger')
    await ledger?._queue
    await delay(20)
    const file = path.join(mindHome(act, 'predictions'), 'ledger.jsonl')
    expect(fs.existsSync(file)).toBe(true)
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    expect(lines.some(r => r.kind === 'prediction' && r.expectText === 'the screen answers 42')).toBe(true)
    expect(pubs.every(p => p.topic !== PREDICTION_EVENT)).toBe(true)
    expect(JSON.stringify(pubs)).not.toContain('the screen answers 42')
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
    } finally {
        restoreDryRun()
    }
})

test('11. both arms produce identical REALIZE schemas except for the expect property', async () => {
    document.body.innerHTML = `
      <m-mind name="b1-schema" stage="experimental">
        <m-act name="on" prediction="on"></m-act>
        <m-act name="off"></m-act>
      </m-mind>`
    await loadMindComponents(document)
    await delay(20)
    const on = document.querySelector('[name="on"]')
    const off = document.querySelector('[name="off"]')
    const spec = {
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: 'x' }),
    }
    on._registerCapability({ ...spec })
    off._registerCapability({ ...spec, name: 'probe-off' })
    const capOn = on._capabilities[0]
    const capOff = off._capabilities[0]
    const toolOn = on._toolParameters(capOn)
    const toolOff = off._toolParameters(capOff)
    expect(toolOff.properties.expect).toBeUndefined()
    expect(toolOn.properties.expect.type).toBe('string')
    const { expect: _e, ...restOn } = toolOn.properties
    expect(Object.keys(restOn).sort()).toEqual(Object.keys(toolOff.properties).sort())
})
