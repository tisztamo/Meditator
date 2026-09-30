import A from "amanita"
import { MSense } from "./mSense.js"
import { describeWeather } from "../shared/senseMappers.js"
import { logger } from '../../infrastructure/logger.js';

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

A.define('m-weather', MWeather);
