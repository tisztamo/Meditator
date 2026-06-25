import A from "amanita"
import { MSense } from "./mSense.js"
import { logger } from '../infrastructure/logger.js';

const log = logger('mWeather.js');

/**
 * m-weather — a sense of the real weather outside (lifecycle.md §Phase 5): the
 * canonical "one real external feed". Every `timeout` (± `sigma`) it reads the
 * current conditions for a configured place from the open-meteo API (free, no
 * key) and raises a first-person felt-weather sensation. A genuinely changing
 * outside that is neither the mind nor the human.
 *
 * It senses the WEATHER, never the substrate — see m-sense. The `key` is the
 * kind of sky, so a turn in the weather (clear → rain) is reliably noticed while
 * a steady sky drifting a degree warmer is ambient.
 *
 * Dormant unless given a location — a weather sense for nowhere is not honest.
 *
 * @interface  (plus MSense's timeout/sigma/salience/salienceShift)
 *   - latitude / longitude: the place to sense (required; dormant if absent)
 *   - name: labels the bid type as Sense-<name> (default "weather")
 */
export class MWeather extends MSense {
    get defaultTimeout() { return "30m" }
    get defaultSigma() { return "8m" }

    ready() {
        this.lat = this.attr("latitude") ?? this.attr("lat")
        this.lon = this.attr("longitude") ?? this.attr("lon")
        if (!this.lat || !this.lon) {
            log.warn(`[${this.attr("name") || "weather"}] no latitude/longitude — weather sense is dormant.`)
            return false
        }
        return true
    }

    async onSense() {
        const url = `https://api.open-meteo.com/v1/forecast`
            + `?latitude=${encodeURIComponent(this.lat)}&longitude=${encodeURIComponent(this.lon)}`
            + `&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m`
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(`open-meteo ${res.status}`)
        const c = (await res.json()).current || {}

        const { key, line } = describeWeather({
            code: c.weather_code,
            temperature: c.apparent_temperature ?? c.temperature_2m,
            isDay: c.is_day !== 0,
            wind: c.wind_speed_10m,
        })
        this.feel(line, { key })
    }
}

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

A.define('m-weather', MWeather);
