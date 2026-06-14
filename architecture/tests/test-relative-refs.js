// Wiring check for mind-relative stream refs (rec #1):
//   bun architecture/tests/test-relative-refs.js
//
// Proves that the new defaults ("..m-mind/stream/chunk" etc.) resolve to THIS
// mind's stream in a flat mind — identical to the old global "/stream/chunk" —
// and that m-economy publishes a retained `arousal` value on the bus. No LLM:
// m-mind is replaced by an inert container so the thinking loop never runs, and
// we drive the stream by publishing chunks/boundaries directly.
import "../../src/startup/jsdom.js"
import A from "amanita"
import { loadMindComponents } from "../../src/startup/loadMindComponents.js"

const delay = ms => new Promise(r => setTimeout(r, ms))

// Inert m-mind: defined up front so loadMindComponents skips it and its real
// thinking loop never starts. closest('m-mind') still resolves structurally.
customElements.define('m-mind', class extends A(HTMLElement) {})

document.body.innerHTML = `
  <m-mind name="t">
    <m-stream name="stream"></m-stream>
    <m-memory name="memory" persist="off" journal="off"></m-memory>
    <m-loop-guard name="lg"></m-loop-guard>
    <m-economy name="economy" budget="1.00"></m-economy>
  </m-mind>
`

await loadMindComponents(document)
await delay(80) // upgrades + async sub() resolution

const mind = document.querySelector('m-mind')
const stream = mind.querySelector('m-stream')
const memory = mind.querySelector('m-memory')
const lg = mind.querySelector('m-loop-guard')
const economy = mind.querySelector('m-economy')

let failures = 0
const check = (name, cond, d = "") => { console.log(`${cond ? "PASS" : "FAIL"}: ${name}${d ? ` — ${d}` : ""}`); if (!cond) failures++ }

// Subscribe to the economy's retained arousal the way another faculty would.
let arousalSeen = null
await mind.sub('economy/arousal', v => { arousalSeen = v })

const text = "the quick brown fox jumps over the lazy dog"
stream.pub('chunk', text)
await delay(10)

check("m-memory bound to its mind's stream/chunk", memory.getTail().includes(text), `tail="${memory.getTail().slice(0, 30)}…"`)
check("MObserver bound to its mind's stream/chunk", lg.window.includes(text))

stream.pub('boundary', { reason: 'completed', burstIndex: 1, burstChars: text.length })
await delay(10)
check("m-economy bound to its mind's stream/boundary", typeof economy.arousal === 'number', `arousal=${economy.arousal}`)
check("economy publishes retained arousal on the bus", arousalSeen !== null, `arousalSeen=${arousalSeen}`)

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
