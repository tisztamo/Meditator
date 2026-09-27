// A source and its aperture as messages (shared/sources.js, message-rule.md):
// registration is plain data, a sample and a materialization are asked by message,
// lineage comes only from a control the aperture armed, and a silent source is a
// defined outcome, not a hang.
import "./setup.js"
import { test, expect, beforeAll, afterEach } from "bun:test"
import { delay } from "./setup.js"
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js"
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js"
import { MSense } from "../../../src/mindComponents/mind/mSense.js"
import { ControlRequest } from "../../../src/infrastructure/perceptionContracts.js"
import { askControl } from "../../../src/mindComponents/shared/apertureRequests.js"

class SourceHost extends MBaseComponent {
    static provides = { mind: true }
    onConnect() {}
}

// A controller: asks the aperture by name, as m-search does.
class TestController extends MBaseComponent {
    onConnect() {}
}

// Senses only when sampled (the timer is an hour away). `hang` keeps the
// materializer pending forever: a source that never renders.
class MessageSense extends MSense {
    sampled = []
    _nextDelay() { return 3_600_000 }
    async onSense(request) {
        if (request) this.sampled.push(request)
        const line = this.getAttribute("line") || "a gull calls over the harbour"
        const text = this.hasAttribute("hang") ? () => new Promise(() => {}) : () => line
        return this.candidate({ changeMagnitude: 0.8, changeKey: line, occurredAt: Date.now() }, text)
    }
}

if (!customElements.get("m-source-host")) customElements.define("m-source-host", SourceHost)
if (!customElements.get("m-test-controller")) customElements.define("m-test-controller", TestController)
if (!customElements.get("m-message-sense")) customElements.define("m-message-sense", MessageSense)

let seq = 0

beforeAll(async () => {
    document.body.innerHTML = `<m-source-host><m-region></m-region></m-source-host>`
    await loadMindComponents(document)
    await delay(20)
    document.body.replaceChildren()
})

afterEach(async () => {
    document.body.replaceChildren()
    await delay(20)
})

async function mount(senseAttrs = "", regionAttrs = "") {
    const registrations = []
    const escaped = []
    const onRegister = e => registrations.push(e.detail)
    const onEscape = e => escaped.push(e.type)
    document.addEventListener("aperture-register", onRegister, true)
    document.addEventListener("offer", onEscape)
    document.body.innerHTML = `
      <m-source-host name="src-host-${++seq}">
        <m-region name="gate" modality="text" aperture="open" ${regionAttrs}>
          <m-message-sense name="gull" ${senseAttrs}></m-message-sense>
        </m-region>
        <m-test-controller name="looker"></m-test-controller>
      </m-source-host>`
    await delay(30)
    document.removeEventListener("aperture-register", onRegister, true)
    const region = document.querySelector("m-region")
    const sense = document.querySelector("m-message-sense")
    const controller = document.querySelector("m-test-controller")
    const decisions = []
    region.on("perceptDecision", d => decisions.push(d))
    return { region, sense, controller, decisions, registrations, escaped, unlisten: () => document.removeEventListener("offer", onEscape) }
}

const until = async (cond, ms = 1000) => {
    const end = Date.now() + ms
    while (!cond() && Date.now() < end) await delay(5)
    return cond()
}

test("registration is plain data, and the source is registered by the aperture", async () => {
    const { region, registrations, unlisten } = await mount()
    unlisten()
    const own = registrations.filter(d => d && Object.keys(d).length === 0)
    expect(own.length).toBeGreaterThan(0)
    for (const detail of registrations) {
        expect(Object.values(detail || {}).some(v => typeof v === "function")).toBe(false)
    }
    expect(region.sourceNames()).toEqual(["gull"])
})

test("a sample is asked by message and its offer carries the armed control's lineage", async () => {
    const { sense, controller, decisions, escaped, unlisten } = await mount()
    const request = new ControlRequest({ kind: "sample", issuedBy: "test", reason: "look", target: "gull", actId: "act-look-1" })
    expect(await askControl(controller, "gate", request)).toBe(true)
    expect(await until(() => decisions.some(d => d.stage === "awareness"))).toBe(true)
    unlisten()
    expect(sense.sampled.map(r => [r instanceof ControlRequest, r.id])).toEqual([[true, request.id]])
    const acquisition = decisions.find(d => d.stage === "acquisition")
    expect(acquisition.permitted).toBe(true)
    expect(acquisition.requestId).toBe(request.id)
    // The membrane (here, the nearest aperture) stopped every offer.
    expect(escaped).toEqual([])
})

test("an offer naming a control the aperture never armed gets no lineage", async () => {
    const { sense, decisions, unlisten } = await mount()
    unlisten()
    // A sample in flight on the source's own stack that the aperture never sent.
    sense._sourcePort()._controls.push({ id: "forged-control", offers: 0 })
    const bid = await sense.onSense()
    expect(bid).not.toBeNull()
    expect(bid.evidence.requestId).toBeNull()
    expect(bid.evidence.actId).toBeNull()
    expect(decisions.find(d => d.stage === "acquisition").requestId ?? null).toBeNull()
})

test("the offer resolves to the issued bid, rebuilt from data", async () => {
    const { sense, unlisten } = await mount('line="the tide turns"')
    unlisten()
    const bid = await sense.onSense()
    expect(bid.evidence.renderForFrame()).toBe("the tide turns")
    expect(bid.evidence.sourceId).toBe("gull")
})

test("a source silent on materialize is a materialization failure at the deadline", async () => {
    const { region, sense, decisions, unlisten } = await mount("hang", 'materializeDeadline="60ms"')
    unlisten()
    const failures = []
    region.on("materializationFailure", f => failures.push(f))
    const started = Date.now()
    const bid = await sense.onSense()
    expect(bid).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
    expect(await until(() => failures.length > 0)).toBe(true)
    expect(failures[0].source).toBe("gull")
    expect(decisions.some(d => d.stage === "awareness")).toBe(false)
})
