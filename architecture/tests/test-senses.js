// Wiring + content check for the afferent SENSES (lifecycle.md §5):
//   bun architecture/tests/test-senses.js
//
// No LLM and no NETWORK — this exercises the pure mappers and the DOM/event
// mechanics only:
//   - bandFor (daylight), describeWeather (weather), parseFeedTitles (feed) are
//     pure and deterministic;
//   - no sensation ever mentions the SUBSTRATE (the §1 attractor's fuel);
//   - m-sense's feel() bids into the global arbiter as an External, non-urgent
//     stimulus — a keyed CHANGE reliably salient, an unchanged reading ambient.
import "../../src/startup/jsdom.js"
import { loadMindComponents } from "../../src/startup/loadMindComponents.js"
import { bandFor } from "../../src/mindComponents/mDaylight.js"
import { describeWeather } from "../../src/mindComponents/mWeather.js"
import { parseFeedTitles } from "../../src/mindComponents/mFeed.js"

const delay = ms => new Promise(r => setTimeout(r, ms))
const SUBSTRATE = /cursor|token|latency|\bprocess\b|runtime|\bprompt\b|\bmodel\b|gpu|cpu|\bmemory\b|buffer|\bbyte|\bthread\b|socket|interrupt/i

let failures = 0
function check(name, cond, detail = "") {
    console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`)
    if (!cond) failures++
}

// ── m-daylight: band mapping ────────────────────────────────────────────────
const dayExpect = [
    [0, "deep-night"], [3, "deep-night"], [4, "predawn"], [6, "dawn"], [9, "morning"],
    [12, "midday"], [15, "afternoon"], [18, "golden"], [20, "dusk"], [22, "evening"], [23, "night"],
]
for (const [hour, key] of dayExpect) check(`daylight hour ${hour} -> ${key}`, bandFor(hour).key === key, bandFor(hour).key)
for (let h = 0; h < 24; h++) {
    const lines = bandFor(h).lines
    check(`daylight hour ${h}: >=2 distinct lines`, lines.length >= 2 && new Set(lines).size === lines.length)
    check(`daylight hour ${h}: faces the world`, !lines.some(l => SUBSTRATE.test(l)), lines.find(l => SUBSTRATE.test(l)) || "")
}

// ── m-weather: condition → felt line ────────────────────────────────────────
const wExpect = [
    [{ code: 0, temperature: 24, isDay: true }, "clear"],
    [{ code: 2, temperature: 12, isDay: true }, "fair"],
    [{ code: 3, temperature: 5, isDay: false }, "overcast"],
    [{ code: 45, temperature: 2, isDay: true }, "fog"],
    [{ code: 53, temperature: 9, isDay: true }, "drizzle"],
    [{ code: 65, temperature: 4, isDay: false }, "rain"],
    [{ code: 81, temperature: 7, isDay: true }, "rain"],   // showers map to rain
    [{ code: 73, temperature: -3, isDay: true }, "snow"],
    [{ code: 95, temperature: 18, isDay: false }, "thunder"],
]
for (const [input, key] of wExpect) {
    const out = describeWeather(input)
    check(`weather code ${input.code} -> ${key}`, out.key === key, out.key)
    check(`weather code ${input.code}: line is world-facing prose`, out.line.length > 15 && !SUBSTRATE.test(out.line), out.line)
}
check("weather: a cold rain reads cold", /cold/.test(describeWeather({ code: 65, temperature: 3 }).line))
check("weather: high wind is felt", /wind/.test(describeWeather({ code: 0, temperature: 20, wind: 40 }).line))
check("weather: missing data still yields a line", describeWeather({}).line.length > 10)
check("weather: a changed sky is a different key (drives a shift)",
    describeWeather({ code: 0 }).key !== describeWeather({ code: 65 }).key)

// ── m-feed: RSS/Atom title extraction ───────────────────────────────────────
const rss = `<?xml version="1.0"?><rss><channel>
  <title>The Channel Itself</title>
  <item><title>Quiet news from the reef</title><link>x</link></item>
  <item><title><![CDATA[Bees & the long summer]]></title></item>
  <item><title>A storm named &#39;Otto&#39; passes</title></item>
</channel></rss>`
const atom = `<feed><title>Feed Level</title>
  <entry><title>On this day, a bridge opened</title></entry>
  <entry><title>A new moon over the coast</title></entry>
</feed>`
const rssTitles = parseFeedTitles(rss)
check("feed: RSS skips the channel title", !rssTitles.includes("The Channel Itself"))
check("feed: RSS reads all three items", rssTitles.length === 3, JSON.stringify(rssTitles))
check("feed: CDATA unwrapped", rssTitles[1] === "Bees & the long summer", rssTitles[1])
check("feed: numeric entity decoded", rssTitles[2] === "A storm named 'Otto' passes", rssTitles[2])
const atomTitles = parseFeedTitles(atom)
check("feed: Atom skips the feed title and reads entries", atomTitles.length === 2 && !atomTitles.includes("Feed Level"), JSON.stringify(atomTitles))
check("feed: empty/garbage input is safe", parseFeedTitles("").length === 0 && parseFeedTitles("<x/>").length === 0)

// ── m-sense (base) mechanics, via m-daylight in a live DOM ──────────────────
// threshold="0" so every bid is delivered and we can read its salience here; the
// peripheral "ambient sometimes drops under the bar" behaviour is by design and
// is covered by test-nested-attention.js, not asserted here.
document.body.innerHTML = `
  <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
  <m-daylight name="daylight" salience="0.4" salienceShift="0.6"></m-daylight>
  <m-weather name="weather"></m-weather>
  <m-feed name="news"></m-feed>
`
await loadMindComponents(document)
await delay(50)

const attention = document.querySelector('m-interrupts[name="attention"]')
const daylight = document.querySelector('m-daylight')
const weather = document.querySelector('m-weather')
const feed = document.querySelector('m-feed')
check("senses upgraded", typeof daylight?.onSense === "function" && typeof weather?.feel === "function")
check("unconfigured weather is dormant (no timer)", weather._timer == null)
check("unconfigured feed is dormant (no timer)", feed._timer == null)

// First reading: no prior band -> a band CHANGE, reliably salient.
daylight.onSense()
let q = attention.takePending()
const first = q[0] || {}
check("first daylight sensation reaches the arbiter", q.length === 1, `count=${q.length}`)
check("sensation is the world reaching in (External)", first.source === "External", first.source)
check("sensation type tags the sense", first.type === "Sense-daylight", first.type)
check("a band-change is reliably salient (0.6)", Math.abs(first.salience - 0.6) < 1e-9, `salience=${first.salience}`)
check("a sense never commandeers a burst (non-urgent)", first.urgent === false)
check("reason is first-person prose, not a clock readout", (first.reason || "").length > 20 && !/\d\d:\d\d/.test(first.reason))

// Second reading: same wall-clock hour -> AMBIENT, lower & jittered, fresh line.
daylight.onSense()
const second = attention.takePending()[0] || {}
check("an in-band reading is ambient (below the shift level)", second.salience < 0.6, `salience=${second.salience}`)
check("ambient salience stays in the jitter band [0.32,0.48]",
    second.salience >= 0.32 - 1e-9 && second.salience <= 0.48 + 1e-9, `salience=${second.salience}`)
check("consecutive readings don't repeat the same sentence", second.reason !== first.reason)

// feel() with an explicit ambient salience (the feed path) is never a shift.
feed.feel("A scrap of the world drifts past.", {})
const ambient = attention.takePending()[0] || {}
check("feed-style ambient bid is non-urgent External", ambient.source === "External" && ambient.urgent === false)
check("feed-style ambient bid is in the ambient band", ambient.salience >= 0.32 - 1e-9 && ambient.salience <= 0.48 + 1e-9, `salience=${ambient.salience}`)

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
