// CONTRACT — nested gating: nearest-only handling of attention and registration
// (doc/improvements/message-rule-async-review.md §3.1 row "Nested gating":
//  mInterrupts.js 196, mRegion.js 456, mBaseComponent.js 47-48; §3.6 "interrupt-request
//  as a channel is already fine").
//
// The contract (observable outcome that must survive migration to plain-data
// messages with nearest-owner addressing instead of stopPropagation ordering):
//   - An interrupt-request raised inside nested faculties is decided by the NEAREST
//     arbiter first, then once per enclosing level: each arbiter decides it exactly
//     once, each level's gain is applied exactly once, and exactly one request
//     reaches the mind — never the raw record alongside the promoted bid.
//   - A request the nearest arbiter drops never reaches an outer arbiter or the mind.
//   - aperture-register is nearest-only: a region connected at runtime registers with
//     its nearest enclosing aperture, its source with that region; the outer
//     aperture's sample then reaches the source exactly once through the tree.
//   - The membrane is the backstop: percept-candidate and aperture-register raised in
//     a mind are heard at its membrane and never outside it.
//
// Why it might break under async delivery: nearest-only is implemented as "the first
// listener on the path stops propagation" inside ONE synchronous dispatch; the nested
// arbiter mutates the same AttentionBid instance (gainTrail, recomputeSalience,
// decisions) that the next level then receives by reference.
import { test, expect, beforeAll, afterEach } from "bun:test"
import { waitFor, quiet, delay } from "./helpers.js"
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js"
import { MBaseComponent } from "../../../../src/mindComponents/shared/mBaseComponent.js"
import { MSense } from "../../../../src/mindComponents/mind/mSense.js"

class NestedHost extends MBaseComponent {
    static provides = { mind: true }
    onConnect() {}
}

// A real MSense: eager `feel()` (an InterruptRecord) outside any aperture, the lazy
// candidate path inside one. Senses once after `senseAfter` ms, else only when sampled.
class NestedSense extends MSense {
    sampled = []
    _nextDelay() {
        const after = this.getAttribute("senseAfter")
        if (after != null && !this._sensedOnce) { this._sensedOnce = true; return Number(after) }
        return 3_600_000
    }
    async onSense(request) {
        if (request) this.sampled.push(request)
        const line = this.getAttribute("line") || "a shutter bangs twice"
        const salience = Number(this.getAttribute("salience") || 0.9)
        if (!this.enclosing("aperture")) return this.feel(line, { salience })
        return this.candidate({ changeMagnitude: salience, changeKey: line, occurredAt: Date.now() }, () => line)
    }
}

if (!customElements.get("m-nested-host")) customElements.define("m-nested-host", NestedHost)
if (!customElements.get("m-nested-sense")) customElements.define("m-nested-sense", NestedSense)

const LINE = "a nested-gating shutter bangs twice in the wind"
let seq = 0

beforeAll(async () => {
    document.body.innerHTML = `<m-nested-host><m-stream></m-stream><m-interrupts></m-interrupts><m-region></m-region></m-nested-host>`
    await loadMindComponents(document)
    await delay(20)
    document.body.replaceChildren()
})

afterEach(async () => {
    document.body.replaceChildren()
    await delay(20)
})

function mount(interior, { stream = false } = {}) {
    document.body.innerHTML = `
      <m-nested-host name="nested-${++seq}">
        ${stream ? '<m-stream name="stream"></m-stream>' : ""}
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        ${interior}
      </m-nested-host>`
    const host = document.querySelector("m-nested-host")
    const obs = { host, requests: [] }
    host.addEventListener("interrupt-request", e => obs.requests.push(e.detail))
    return obs
}

/** Every `decision` an arbiter publishes, by arbiter name. */
function decisionsOf(host, names) {
    const out = {}
    for (const name of names) {
        out[name] = []
        host.querySelector(`m-interrupts[name="${name}"]`).on("decision", d => out[name].push(d))
    }
    return out
}

const forLine = list => list.filter(x => x && x.reason === LINE)
const FACULTIES = sal => `
    <m-region name="outer">
      <m-interrupts name="outer-arbiter" gain="0.5" threshold="0.1" rateLimit="0s"></m-interrupts>
      <m-region name="inner">
        <m-interrupts name="inner-arbiter" gain="0.8" threshold="0.5" rateLimit="0s"></m-interrupts>
        <m-nested-sense name="probe" senseAfter="40" salience="${sal}" line="${LINE}"></m-nested-sense>
      </m-region>
    </m-region>`

test("interrupt-request: each arbiter on the path decides once, gains apply once, one request reaches the mind", async () => {
    const obs = mount(FACULTIES(0.9))
    const d = decisionsOf(obs.host, ["inner-arbiter", "outer-arbiter", "attention"])

    expect(await waitFor(() => forLine(d.attention).length > 0, 1500)).toBe(true)
    await quiet(150)
    expect(forLine(d["inner-arbiter"]).map(x => [x.accepted, x.why])).toEqual([[true, "promoted ×0.8"]])
    expect(forLine(d["outer-arbiter"]).map(x => [x.accepted, x.why])).toEqual([[true, "promoted ×0.5"]])
    const global = forLine(d.attention)
    expect(global).toHaveLength(1)
    expect(global[0].accepted).toBe(true)
    expect(global[0].salience).toBeCloseTo(0.9 * 0.8 * 0.5, 9)
    const heard = forLine(obs.requests)
    expect(heard).toHaveLength(1)
    expect(heard[0].salience).toBeCloseTo(0.36, 9)
})

test("interrupt-request: a bid the nearest arbiter drops never reaches an outer arbiter or the mind", async () => {
    const obs = mount(FACULTIES(0.3))
    const d = decisionsOf(obs.host, ["inner-arbiter", "outer-arbiter", "attention"])

    expect(await waitFor(() => forLine(d["inner-arbiter"]).length > 0, 1500)).toBe(true)
    await quiet(150)
    expect(forLine(d["inner-arbiter"]).map(x => x.accepted)).toEqual([false])
    expect(forLine(d["outer-arbiter"])).toHaveLength(0)
    expect(forLine(d.attention)).toHaveLength(0)
    expect(forLine(obs.requests)).toHaveLength(0)
})

test("aperture-register: a runtime region links to its nearest aperture; the outer sample reaches its source once", async () => {
    const obs = mount(`
        <m-region name="outer" modality="text" aperture="closed" dwell="1ms" contactHorizon="30ms"></m-region>`,
        { stream: true })
    const outer = obs.host.querySelector('m-region[name="outer"]')
    const stream = obs.host.querySelector("m-stream")
    await delay(10)

    // Connected at runtime, after the outer aperture bound and scanned its interior:
    // only the two aperture-register announcements can build this branch of the tree.
    outer.insertAdjacentHTML("beforeend", `
        <m-region name="inner" modality="text" aperture="open" dwell="1s" contactHorizon="10m">
          <m-nested-sense name="late" line="${LINE}"></m-nested-sense>
        </m-region>`)
    const sense = outer.querySelector("m-nested-sense")

    // The outer aperture's contact reflex reopens it at the next boundary; its sample
    // fans out to registered children. The inner aperture is open and does not move.
    await delay(50)
    stream.fire("boundary", { reason: "completed", burstIndex: 1, burstChars: 0 })

    expect(await waitFor(() => sense.sampled.length > 0, 1500)).toBe(true)
    await quiet(150)
    expect(sense.sampled).toHaveLength(1)
    expect(sense.sampled[0].issuedBy).toBe("outer")
    expect(sense.sampled[0].reason).toBe("reopening")
})

test("membrane backstop: percept-candidate and aperture-register are heard at the mind, never outside it", async () => {
    const outside = { "percept-candidate": 0, "aperture-register": 0 }
    const atMind = { "percept-candidate": 0, "aperture-register": 0 }
    const listeners = Object.keys(outside).map(type => [type, () => outside[type]++])
    for (const [type, fn] of listeners) document.body.addEventListener(type, fn)
    try {
        const obs = mount("")
        for (const type of Object.keys(atMind)) obs.host.addEventListener(type, () => atMind[type]++)
        // A top-level aperture announces itself (no aperture above it stops that — the
        // membrane must), then a source inside it offers a candidate.
        obs.host.insertAdjacentHTML("beforeend", `
            <m-region name="edge" modality="text" aperture="open" dwell="1s">
              <m-nested-sense name="probe" senseAfter="40" line="${LINE}"></m-nested-sense>
            </m-region>`)

        expect(await waitFor(() => atMind["percept-candidate"] > 0 && atMind["aperture-register"] > 0, 1500)).toBe(true)
        await quiet(150)
        expect(outside["percept-candidate"]).toBe(0)
        expect(outside["aperture-register"]).toBe(0)
    } finally {
        for (const [type, fn] of listeners) document.body.removeEventListener(type, fn)
    }
})
