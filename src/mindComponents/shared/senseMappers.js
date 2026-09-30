// What a world reading feels like, in words: the pure mappers behind the senses
// and m-look's hand. m-weather, m-daylight and m-feed raise these lines on their
// own clocks; m-look says the same lines when the mind looks on purpose. They
// live here, not in the senses' modules, so a hand does not import a sense
// (message-rule review §2.11). Each faces the WORLD, never the substrate.

// ------------------------------------------------------------------ weather

/** WMO weather_code → a coarse kind-of-sky we have words for. */
function skyKey(code) {
    if (code == null) return 'unknown'
    if (code === 0) return 'clear'
    if (code <= 2) return 'fair'
    if (code === 3) return 'overcast'
    if (code <= 48) return 'fog'
    if (code <= 57) return 'drizzle'
    if (code <= 67) return 'rain'
    if (code <= 77) return 'snow'
    if (code <= 82) return 'rain'        // rain showers
    if (code <= 86) return 'snow'        // snow showers
    return 'thunder'                     // 95, 96, 99
}

const SKY = {
    clear:    { day: "a clear sky and the sun out", night: "a clear night with the stars out" },
    fair:     { day: "a few clouds drifting across the sun", night: "a few clouds across the dark" },
    overcast: { day: "a flat grey overcast", night: "a low, starless overcast" },
    fog:      { day: "fog, the world gone soft and close", night: "fog, the dark thick and close" },
    drizzle:  { day: "a fine drizzle hanging in the air", night: "a fine drizzle in the dark" },
    rain:     { day: "rain coming down and the streets shining", night: "rain in the dark, steady on the glass" },
    snow:     { day: "snow falling, the world going white and quiet", night: "snow in the dark, silent and settling" },
    thunder:  { day: "a thunderstorm rolling through", night: "thunder in the dark, the sky cracking open" },
    unknown:  { day: "weather I can't quite read", night: "weather I can't quite read in the dark" },
}

function tempFeel(t) {
    if (t == null || Number.isNaN(t)) return null
    if (t < 0) return "a hard, freezing cold"
    if (t < 8) return "a real cold in it"
    if (t < 15) return "a cool edge to the air"
    if (t < 22) return "a mild, easy air"
    if (t < 28) return "a warmth to the air"
    return "a heavy heat"
}

function windFeel(w) {
    if (w == null || Number.isNaN(w)) return null
    if (w >= 35) return "a strong wind up"
    if (w >= 18) return "a wind moving through"
    return null
}

/**
 * Renders current conditions as a first-person felt-weather line. Pure and
 * exported so it can be tested without the network. Faces the WORLD, never the
 * substrate.
 *
 * @param {{code?: number, temperature?: number, isDay?: boolean, wind?: number}} c
 * @returns {{key: string, line: string}} key = kind of sky (for shift detection)
 */
export function describeWeather({ code, temperature, isDay = true, wind } = {}) {
    const key = skyKey(code)
    const sky = (SKY[key] || SKY.unknown)[isDay ? 'day' : 'night']
    const clauses = [tempFeel(temperature), windFeel(wind)].filter(Boolean)
    const tail = clauses.length ? `, with ${clauses.join(" and ")}` : ""
    return { key, line: `Out there it is ${sky}${tail}.` }
}

// ------------------------------------------------------------------ daylight

/**
 * Maps a local hour (0–23) to a part of the day and a couple of first-person,
 * outward-facing sensations of its light. Pure and exported so the band mapping
 * can be tested without a clock. Lines point attention OUT at the world — light,
 * sky, street, the hour — and never at the runtime.
 *
 * @param {number} hour - local hour, 0–23
 * @returns {{key: string, lines: string[]}}
 */
export function bandFor(hour) {
    if (hour < 4) return { key: 'deep-night', lines: [
        "It is the dead middle of the night out in the world — everything gone still, the dark deep and unhurried, the streets empty under it.",
        "Deep night now: whatever lies beyond the walls is black and quiet, the small hours keeping their own slow time.",
    ] }
    if (hour < 6) return { key: 'predawn', lines: [
        "Not morning yet, but the dark is beginning to thin — that grey hour before dawn when the world is still asleep and the sky is only thinking about light.",
        "The very edge of dawn: somewhere out east the black is loosening toward grey, the birds not quite started.",
    ] }
    if (hour < 8) return { key: 'dawn', lines: [
        "First light is coming up out there — grey going pale, then a thin gold at the rim of things. The day is opening.",
        "Early light now, low and clean, the colour just returning to the world as the sun clears the horizon.",
    ] }
    if (hour < 11) return { key: 'morning', lines: [
        "Full morning light, the kind that makes ordinary things look freshly rinsed; the day stands wide open ahead.",
        "Bright clear morning out there, the sun well up, the world busy with its early business.",
    ] }
    if (hour < 14) return { key: 'midday', lines: [
        "The light is high and flat overhead — midday, plain and bright, the shadows pulled in small underfoot.",
        "Around noon: the sun at its height, the day at its widest, a flat strong light laid over everything.",
    ] }
    if (hour < 17) return { key: 'afternoon', lines: [
        "The afternoon light has gone warm and slantwise, the shadows beginning to lean and lengthen across the ground.",
        "Mid-afternoon out there, the light thickening to gold at the edges, the day starting its long lean westward.",
    ] }
    if (hour < 19) return { key: 'golden', lines: [
        "Low golden light now — long and amber, the hour that gilds whatever it touches just before it lets go.",
        "Late-day sun, slanting and warm, everything edged in gold and a little wistful as the light slides down.",
    ] }
    if (hour < 21) return { key: 'dusk', lines: [
        "The light is failing into dusk, a blue settling over the world, the day quietly handing itself over.",
        "Dusk now: the colour draining westward, the first lamps coming on, the sky going that deep used blue.",
    ] }
    if (hour < 23) return { key: 'evening', lines: [
        "Dark outside now, the warm indoor hour — lamps lit somewhere, the world shrunk to small bright rooms.",
        "Evening proper: the day is done out there, the night settling in, everything turned inward and lit from within.",
    ] }
    return { key: 'night', lines: [
        "Late evening tipping into night; the day fully closed, the dark full and settled over everything outside.",
        "Near midnight now, the world gone quiet and dim, the day a closed door behind it.",
    ] }
}

// ------------------------------------------------------------------ feed

function decodeText(s) {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")   // unwrap CDATA
        .replace(/<[^>]+>/g, "")                          // strip any stray markup
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Extracts item/entry titles from an RSS or Atom feed, in document order. Pure
 * and exported so it can be tested without the network. The channel/feed-level
 * <title> is naturally skipped: we only read titles found *inside* an <item>
 * (RSS) or <entry> (Atom).
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function parseFeedTitles(xml) {
    if (!xml) return []
    const titles = []
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []
    for (const block of blocks) {
        const m = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
        if (!m) continue
        const text = decodeText(m[1])
        if (text) titles.push(text)
    }
    return titles
}
