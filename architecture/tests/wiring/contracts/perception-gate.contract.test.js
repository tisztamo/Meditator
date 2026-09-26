// CONTRACT — sensory acquisition gate + aperture-register
// (doc/improvements/message-rule-async-review.md §3.1 row "Sensory acquisition gate",
//  §3.2 `sample`/`materialize`/`origin`, §5 corollary "percept-candidate with verdicts
//  pushed into detail").
//
// The contract (observable outcome that must survive the move to plain-data
// `candidate {requestId}` → `verdict {requestId, gateId, permitted}` replies):
//   - PERMIT: when every aperture on the source's path permits, the percept is
//     materialized once and exactly one bid reaches the mind's arbiter.
//   - VETO: an enclosing aperture that refuses keeps the percept out — nothing is
//     rendered, no bid, nothing reaches the arbiter — and the published decision
//     carries the vetoing gate's own reason (a heard veto, not a lost reply).
//   - MISSING GATE = DENY: an aperture on the path that never answers keeps the
//     percept out even though the issuing aperture permits (monotone authority).
//   - aperture-register: a source connected at runtime registers with its nearest
//     aperture by event alone, and that aperture samples it on its next reopening
//     (the sample request's id rides the resulting decision as lineage).
//
// Why it breaks under async delivery today: m-region dispatches `percept-candidate`
// and reads `detail.verdicts`, `detail.versions`, `detail.gainTrail` and
// `defaultPrevented` back as soon as dispatchEvent returns (mRegion.js 208-228,
// 322-333, 622-639). Deferred, the gates write into a copy after the issuer has
// already composed an empty verdict list — every candidate becomes `gate-missing`.
// Fail-closed keeps the negative outcomes (veto, missing gate) but loses PERMIT, and
// a veto can no longer be told apart from a lost reply. aperture-register is a
// one-way announcement (nothing is read back) and is expected to survive.
import { test, expect, beforeAll, afterEach } from "bun:test"
import { waitFor, quiet, delay } from "./helpers.js"
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js"
import { MBaseComponent } from "../../../../src/mindComponents/shared/mBaseComponent.js"
import { MSense } from "../../../../src/mindComponents/mind/mSense.js"

// The identity root. A real MBaseComponent providing `mind`, so the membrane stops
// (mBaseComponent.connectedCallback) are live; no prompt topic, nothing thinks.
class PerceptionHost extends MBaseComponent {
    static provides = { mind: true }
    onConnect() {}
}

// A real lazy source (MSense → candidate() → the region's offer path). It senses once
// on its own clock after `senseAfter` ms, and otherwise only when an aperture samples it.
class PerceptionSense extends MSense {
    sampled = []
    renders = 0
    _nextDelay() {
        const after = this.getAttribute("senseAfter")
        if (after != null && !this._sensedOnce) { this._sensedOnce = true; return Number(after) }
        return 3_600_000
    }
    async onSense(request) {
        if (request) this.sampled.push(request)
        const line = this.getAttribute("line") || "a bell rings somewhere below"
        return this.candidate(
            { changeMagnitude: 0.9, changeKey: line, occurredAt: Date.now() },
            () => { this.renders++; return line },
        )
    }
}

if (!customElements.get("m-perception-host")) customElements.define("m-perception-host", PerceptionHost)
if (!customElements.get("m-perception-sense")) customElements.define("m-perception-sense", PerceptionSense)

const LINE = "a gate contract bell rings in the courtyard"
let seq = 0

beforeAll(async () => {
    // Define the real tags once; each test then builds its tree from upgraded elements.
    document.body.innerHTML = `<m-perception-host><m-stream></m-stream><m-interrupts></m-interrupts><m-region></m-region></m-perception-host>`
    await loadMindComponents(document)
    await delay(20)
    document.body.replaceChildren()
})

afterEach(async () => {
    document.body.replaceChildren()
    await delay(20)
})

/** Build a mind, attach observers at the membrane and on published topics. */
function mount(interior, { stream = false } = {}) {
    document.body.innerHTML = `
      <m-perception-host name="gate-${++seq}">
        ${stream ? '<m-stream name="stream"></m-stream>' : ""}
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        ${interior}
      </m-perception-host>`
    const host = document.querySelector("m-perception-host")
    const arbiter = host.querySelector('m-interrupts[name="attention"]')
    const obs = { host, arbiter, requests: [], decisions: [] }
    host.addEventListener("interrupt-request", e => obs.requests.push(e.detail))
    arbiter.on("decision", d => obs.decisions.push(d))
    return obs
}

function watchDecisions(region) {
    const seen = []
    region.on("perceptDecision", d => seen.push(d))
    return seen
}

const forLine = list => list.filter(x => x && x.reason === LINE)

test("permit: every gate answers yes → rendered once, exactly one bid reaches the mind's arbiter", async () => {
    const obs = mount(`
        <m-region name="outer" modality="text" aperture="open" dwell="1s">
          <m-region name="inner" modality="text" aperture="open" dwell="1s">
            <m-perception-sense name="probe" senseAfter="40" line="${LINE}"></m-perception-sense>
          </m-region>
        </m-region>`)
    const inner = obs.host.querySelector('m-region[name="inner"]')
    const sense = obs.host.querySelector("m-perception-sense")
    const gate = watchDecisions(inner)

    expect(await waitFor(() => forLine(obs.decisions).length > 0, 1500)).toBe(true)
    await quiet()
    const accepted = forLine(obs.decisions)
    expect(accepted).toHaveLength(1)
    expect(accepted[0].accepted).toBe(true)
    expect(forLine(obs.requests)).toHaveLength(1)
    expect(sense.renders).toBe(1)
    expect(gate.map(d => [d.stage, d.permitted])).toEqual([["acquisition", true], ["awareness", true]])
})

test("veto: an enclosing gate that refuses keeps the percept out, and the refusal is its own", async () => {
    const obs = mount(`
        <m-region name="outer" modality="text" aperture="closed" dwell="1s">
          <m-region name="inner" modality="text" aperture="open" dwell="1s">
            <m-perception-sense name="probe" senseAfter="40" line="${LINE}"></m-perception-sense>
          </m-region>
        </m-region>`)
    const inner = obs.host.querySelector('m-region[name="inner"]')
    const sense = obs.host.querySelector("m-perception-sense")
    const gate = watchDecisions(inner)

    await waitFor(() => gate.length > 0, 1500)
    await quiet(150)
    // Kept out: never rendered, no bid, nothing at the arbiter.
    expect(gate).toHaveLength(1)
    expect(gate[0].stage).toBe("acquisition")
    expect(gate[0].permitted).toBe(false)
    expect(sense.renders).toBe(0)
    expect(forLine(obs.requests)).toHaveLength(0)
    expect(forLine(obs.decisions)).toHaveLength(0)
    // The outer gate's veto was heard: the decision says "closed", not "gate-missing".
    expect(gate[0].reason).toBe("closed")
})

test("missing gate = deny: an aperture on the path that never answers keeps the percept out", async () => {
    const obs = mount("")
    // An enclosing aperture whose regulator tag is never defined: it is on the path
    // (role from `modality`) but never binds, so it never answers a candidate.
    const pending = `x-pending-regulator-${Date.now()}-${seq}`
    obs.host.insertAdjacentHTML("beforeend", `
        <m-region name="outer" modality="text" aperture="open" dwell="1s">
          <${pending} provides="regulator"></${pending}>
          <m-region name="inner" modality="text" aperture="open" dwell="1s">
            <m-perception-sense name="probe" senseAfter="40" line="${LINE}"></m-perception-sense>
          </m-region>
        </m-region>`)
    const inner = obs.host.querySelector('m-region[name="inner"]')
    const sense = obs.host.querySelector("m-perception-sense")
    const gate = watchDecisions(inner)

    await waitFor(() => gate.length > 0, 1500)
    await quiet(150)
    expect(gate).toHaveLength(1)
    expect(gate[0].permitted).toBe(false)
    expect(gate[0].reason).toBe("gate-missing")
    expect(sense.renders).toBe(0)
    expect(forLine(obs.requests)).toHaveLength(0)
    expect(forLine(obs.decisions)).toHaveLength(0)
})

test("aperture-register: a runtime source registers with its aperture by event and is sampled on reopening", async () => {
    const obs = mount(`
        <m-region name="outside" modality="text" aperture="closed" dwell="1ms" contactHorizon="30ms"></m-region>`,
        { stream: true })
    const region = obs.host.querySelector('m-region[name="outside"]')
    const stream = obs.host.querySelector("m-stream")
    const gate = watchDecisions(region)
    await delay(10)

    // Connected after the aperture bound: no interior scan will ever see it, and it
    // never senses on its own — only a registration can make it sampled.
    const sense = document.createElement("m-perception-sense")
    sense.setAttribute("name", "late")
    sense.setAttribute("line", LINE)
    region.appendChild(sense)

    // Contact debt passes the reflex threshold; the next burst boundary reopens the
    // aperture, which asks every registered source for the present.
    await delay(50)
    stream.fire("boundary", { reason: "completed", burstIndex: 1, burstChars: 0 })

    expect(await waitFor(() => sense.sampled.length > 0, 1500)).toBe(true)
    const request = sense.sampled[0]
    expect(request.kind).toBe("sample")
    expect(request.reason).toBe("reopening")
    expect(request.issuedBy).toBe("outside")
    // The sample's lineage rides the gate decision it produced.
    expect(await waitFor(() => gate.some(d => d.requestId === request.id), 1500)).toBe(true)
    await quiet()
    expect(sense.sampled).toHaveLength(1)
})
