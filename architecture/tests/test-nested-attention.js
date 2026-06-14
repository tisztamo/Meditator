// Wiring check for nested attention arbitration (m-region + nested m-interrupts):
//   bun architecture/tests/test-nested-attention.js
//
// No LLM is involved — this exercises only the DOM/event mechanics:
//   - a bid raised inside a region is gated by the region's LOCAL arbiter,
//     re-weighted by its `gain`, and promoted to the GLOBAL arbiter (which is
//     the only one m-mind drains);
//   - a bid the local arbiter DROPS does not leak up to the global arbiter;
//   - a top-level bid reaches the global arbiter unchanged;
//   - the local (nested) arbiter never queues — it only promotes.
import "../../src/startup/jsdom.js"
import { loadMindComponents } from "../../src/startup/loadMindComponents.js"
import { InterruptRecord } from "../../src/infrastructure/interruptRecord.js"

const delay = ms => new Promise(r => setTimeout(r, ms))

document.body.innerHTML = `
  <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="9"></m-interrupts>
  <span name="top-src"></span>
  <m-region name="drift">
    <m-interrupts gain="0.5" threshold="0.4" rateLimit="0s"></m-interrupts>
    <span name="src"></span>
  </m-region>
`

await loadMindComponents(document)
await delay(50) // let upgrades + onConnect (addEventListener) settle

const global = document.querySelector('m-interrupts[name="attention"]')
const local = document.querySelector('m-region m-interrupts')
const regionSrc = document.querySelector('m-region [name="src"]')
const topSrc = document.querySelector('[name="top-src"]')

function bid(el, salience, reason) {
    el.dispatchEvent(new CustomEvent('interrupt-request', {
        bubbles: true,
        detail: new InterruptRecord({ source: 'Observer', type: 'Test', reason, salience }),
    }))
}

let failures = 0
function check(name, cond, detail = "") {
    console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`)
    if (!cond) failures++
}

check("components upgraded", !!(global?.on && local?.on && regionSrc && topSrc))
check("local arbiter is nested", !!local._region && local._region.localName === "m-region")
check("global arbiter is not nested", !global._region)

// 1) A strong bid inside the region survives locally and is promoted, re-weighted.
bid(regionSrc, 0.8, "a strong drift")
check("local arbiter does not queue", local.pending.length === 0, `pending=${local.pending.length}`)
const promoted = global.takePending()
check("promoted bid reached the global queue", promoted.length === 1, `count=${promoted.length}`)
check("salience re-weighted by gain 0.5", promoted.length === 1 && Math.abs(promoted[0].salience - 0.4) < 1e-9,
    promoted.length ? `salience=${promoted[0].salience}` : "")

// 2) A weak bid inside the region is dropped locally and must NOT leak upward.
bid(regionSrc, 0.3, "a faint drift below the faculty's bar")
check("locally-dropped bid does not leak up", global.takePending().length === 0)

// 3) A top-level bid bypasses the region and reaches the global arbiter unchanged.
bid(topSrc, 0.7, "a direct stimulus")
const top = global.takePending()
check("top-level bid reaches global unchanged", top.length === 1 && Math.abs(top[0].salience - 0.7) < 1e-9,
    top.length ? `salience=${top[0].salience}` : "")

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
