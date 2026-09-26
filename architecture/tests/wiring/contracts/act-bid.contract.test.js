// CONTRACT — self-interception of `interrupt-request` in m-act
// (doc/improvements/message-rule-async-review.md §3.1 row "Self-interception of
//  interrupt-request", mAct.js 577 / 696-702; §3.2 InterruptRecord/AttentionBid payloads;
//  §5 corollary "interrupt-request carries an AttentionBid instance").
//
// The contract (observable outcome that must survive the move to m-act EMITTING the
// bid form directly, review §7): when prediction is on, an act's consequence reaches
// the mind's arbiter as exactly ONE bid carrying the act's lineage (actId) — never the
// raw consequence record as well — and the arbiter admits it for the mind. With
// prediction off there is no interception and the raw consequence arrives once.
//
// The whole efferent loop is real and offline (MEDITATOR_DRY_RUN): the stream's
// chunk/boundary → m-act DECIDE → REALIZE → the real m-look hand → the consequence.
// Observed only at the membrane (`acted`, `interrupt-request`) and on the arbiter's
// published `decision` topic.
//
// Why it might break under async delivery: m-act's own synchronous listener
// stopPropagation()s the raw record and re-dispatches a bid inside the same dispatch
// (mAct.js 577 + _onLiveConsequence). If that listener ran anywhere but inside the
// record's own dispatch, the host would bubble the raw record to the arbiter AND the
// bid would follow — two admissions for one consequence.
import { test, expect, beforeAll, afterAll, afterEach } from "bun:test"
import { waitFor, quiet, delay } from "./helpers.js"
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js"
import { MBaseComponent } from "../../../../src/mindComponents/shared/mBaseComponent.js"

// The identity root: a real MBaseComponent providing `mind` (membrane stops live),
// without a prompt topic, so nothing streams on its own.
class ActBidHost extends MBaseComponent {
    static provides = { mind: true }
    onConnect() {}
}
if (!customElements.get("m-actbid-host")) customElements.define("m-actbid-host", ActBidHost)

// Enough recent thought for m-act to judge a reach (it needs >= 200 chars).
const THOUGHT = "I keep wondering what the day is doing outside — whether the light has shifted, "
    + "whether it has turned toward evening yet while I have been in here thinking. The room "
    + "gives no clue, and the not-knowing has become a small itch I would like to scratch by "
    + "simply looking out at the actual sky for once. "

let savedDry, seq = 0

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN
    process.env.MEDITATOR_DRY_RUN = "1"
    document.body.innerHTML = `<m-actbid-host><m-stream></m-stream><m-interrupts></m-interrupts><m-act tailSrc="off" compressedSrc="off"><m-look></m-look></m-act></m-actbid-host>`
    await loadMindComponents(document)
    await delay(40)
    document.body.replaceChildren()
    await delay(20)
})

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN
    else process.env.MEDITATOR_DRY_RUN = savedDry
})

afterEach(async () => {
    document.body.replaceChildren()
    await delay(20)
})

async function mount({ prediction }) {
    document.body.innerHTML = `
      <m-actbid-host name="act-bid-${++seq}">
        <m-stream name="stream"></m-stream>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-act name="hands" ${prediction ? 'prediction="on"' : ""} every="1" threshold="0.6"
               cooldown="0s" intentCooldown="15m" tailSrc="off" compressedSrc="off" recallForRealize="off">
          <m-look name="look"></m-look>
        </m-act>
      </m-actbid-host>`
    const host = document.querySelector("m-actbid-host")
    const obs = {
        host,
        stream: host.querySelector("m-stream"),
        arbiter: host.querySelector('m-interrupts[name="attention"]'),
        acted: [], requests: [], decisions: [],
    }
    host.addEventListener("acted", e => obs.acted.push(e.detail))
    host.addEventListener("interrupt-request", e => obs.requests.push(e.detail))
    obs.arbiter.on("decision", d => obs.decisions.push(d))
    await delay(60)   // let the look hand offer itself up to m-act
    return obs
}

/** Speak like the stream: a chunk of thought, then burst boundaries until a hand acts
 *  (the dry DECIDE alternates NONE / reach). Returns the deed. */
async function reachOnce(obs) {
    obs.stream.pub("chunk", THOUGHT)
    await delay(20)
    for (let i = 0; i < 6 && !obs.acted.length; i++) {
        obs.stream.fire("boundary", { reason: "completed", burstIndex: i + 1, burstChars: THOUGHT.length })
        await waitFor(() => obs.acted.length > 0, 300)
    }
    expect(obs.acted).toHaveLength(1)
    const deed = obs.acted[0]
    expect(deed.ok).toBe(true)
    expect(typeof deed.experience).toBe("string")
    expect(deed.experience.length).toBeGreaterThan(10)
    return deed
}

const about = (list, deed) => list.filter(x => x && x.reason === deed.experience)
const actIdOf = x => x?.actId ?? x?.evidence?.actId ?? null

test("prediction on: the consequence reaches the arbiter as exactly one bid with the act's lineage, never the raw record too", async () => {
    const obs = await mount({ prediction: true })
    const deed = await reachOnce(obs)
    expect(typeof deed.actId).toBe("string")

    expect(await waitFor(() => about(obs.decisions, deed).length > 0, 1500)).toBe(true)
    await quiet(150)

    // One message about this consequence crossed the membrane-level bus…
    const heard = about(obs.requests, deed)
    expect(heard).toHaveLength(1)
    // …and it is the act's own bid: it carries the act lineage the deed announced.
    expect(actIdOf(heard[0])).toBe(deed.actId)
    // The arbiter decided on it once, and admitted it for the mind.
    const decided = about(obs.decisions, deed)
    expect(decided).toHaveLength(1)
    expect(decided[0].accepted).toBe(true)
})

test("prediction off: no interception — the raw consequence reaches the arbiter once, without lineage", async () => {
    const obs = await mount({ prediction: false })
    const deed = await reachOnce(obs)
    expect(deed.actId).toBeNull()

    expect(await waitFor(() => about(obs.decisions, deed).length > 0, 1500)).toBe(true)
    await quiet(150)

    const heard = about(obs.requests, deed)
    expect(heard).toHaveLength(1)
    expect(actIdOf(heard[0])).toBeNull()
    const decided = about(obs.decisions, deed)
    expect(decided).toHaveLength(1)
    expect(decided[0].accepted).toBe(true)
})
