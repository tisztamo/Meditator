import { MBaseComponent } from "./mBaseComponent.js"
import { describeWeather } from "./mWeather.js"
import { bandFor } from "./mDaylight.js"
import { parseFeedTitles } from "./mFeed.js"
import { isDryRun } from "../modelAccess/llm.js"
import { logger } from '../infrastructure/logger.js';

const log = logger('mLook.js');

/**
 * m-look — the first HAND (efference.md §3): read-only, on-demand exteroception.
 *
 * Where the senses (Phase 5) PUSH the world at the mind on their own clocks, m-look
 * lets the mind PULL — look at the weather, the day's light, or a headline drifting
 * by BECAUSE IT WONDERED, not because a timer fired. It is the complement of the
 * senses' push, and it is deliberately the doc's own canonical example ("the mind
 * wondered about the rain, and some bursts later it sees the shining street"): the
 * cleanest thing to prove the whole efferent loop on.
 *
 * It reuses the EXACT fetchers the senses already use — open-meteo for weather
 * (describeWeather), the local clock for daylight (bandFor), an RSS pull for news
 * (parseFeedTitles) — so it adds a hand with near-zero new surface, no new external
 * dependency, and no new safety question. It changes nothing in the world: read-only.
 *
 * Like a sense, it faces the WORLD, never the substrate: every experience it returns
 * is a first-person, outward sensation. And like a sense, a slip is silent — execute
 * throws on a network blip or missing config, and m-act swallows it: the mind feels
 * nothing rather than a failure-of-self (efference.md §5.5).
 *
 * Registers itself with its parent <m-act> on connect (the closed-menu contract,
 * §3). Wire it as: <m-act ...><m-look latitude=… longitude=… newsUrl=…/></m-act>.
 *
 * @interface
 * Attributes:
 *   - name: the tool-call function name (default "look")
 *   - latitude / longitude: place for the weather subject (that subject is
 *     unavailable if absent — a weather look for nowhere is not honest)
 *   - newsUrl: RSS/Atom feed for the news subject (that subject is unavailable if absent)
 *   - salience: salience of the returned consequence (default 0.55 — a touch above
 *     the arbiter's ambient bar, since the mind reached for it)
 */
export class MLook extends MBaseComponent {
    _seenHeadlines = new Set()
    _lineIdx = 0

    onConnect() {
        this._register()
    }

    async _register() {
        const name = this.attr("name") || "look"
        const subjects = this._availableSubjects()
        if (!subjects.length) {
            log.warn(`[${name}] no subject is configured (need latitude/longitude for weather or newsUrl for news; daylight is always available) — but daylight should always be present.`)
        }

        const spec = {
            name,
            description: "Look at some part of the real world right now — the weather where the mind is, "
                + "the day's light outside, or a headline drifting by — when the mind genuinely wonders about it. "
                + "Read-only: it observes the world, it does not change anything.",
            parameters: {
                type: "object",
                properties: {
                    subject: {
                        type: "string",
                        enum: subjects,
                        description: "which part of the world to look at",
                    },
                    about: {
                        type: "string",
                        description: "what, in a few words, the mind is wondering about",
                    },
                },
                required: ["subject"],
            },
            readonly: true,
            execute: async args => this._look(args),
        }

        // The capability announces itself to its parent m-act. Component upgrade
        // order is not guaranteed (m-speech hit the same race binding to the mind),
        // so retry briefly until the parent m-act has upgraded and exposes
        // registerCapability — rather than silently never registering the hand.
        for (let i = 0; i < 100; i++) {
            const act = this.closest("m-act")
            if (act && typeof act.registerCapability === "function") {
                act.registerCapability(spec)
                return
            }
            await new Promise(resolve => setTimeout(resolve, 50))
        }
        log.warn(`[${name}] found no parent <m-act> to register with; this hand is inert.`)
    }

    /** The subjects this hand can actually fulfil, given its configuration. */
    _availableSubjects() {
        const subjects = ["daylight"]                 // local clock — always available, zero cost
        if (this.attr("latitude") && this.attr("longitude")) subjects.push("weather")
        if (this.attr("newsUrl")) subjects.push("news")
        return subjects
    }

    /**
     * Realize one look. Returns { experience, salience, data } — an EXPERIENCE, never
     * data; the optional `data` is for the backstage note/Studio only. Throws on a
     * network blip or an unsupported/unconfigured subject; m-act swallows it.
     */
    async _look({ subject } = {}) {
        const salience = Number(this.attr("salience") || 0.55)
        switch (subject) {
            case "daylight": return { ...await this._lookDaylight(), salience }
            case "weather":  return { ...await this._lookWeather(), salience }
            case "news":     return { ...await this._lookNews(), salience }
            default: throw new Error(`unknown subject "${subject}"`)
        }
    }

    async _lookDaylight() {
        // The real local clock — offline and deterministic, so it needs no dry-run path.
        const band = bandFor(new Date().getHours())
        this._lineIdx = (this._lineIdx + 1) % band.lines.length
        return { experience: band.lines[this._lineIdx], data: { band: band.key } }
    }

    async _lookWeather() {
        const lat = this.attr("latitude") ?? this.attr("lat")
        const lon = this.attr("longitude") ?? this.attr("lon")
        if (!lat || !lon) throw new Error("no latitude/longitude for a weather look")
        if (isDryRun()) {
            return { experience: "Out there it is a flat grey overcast, with a cool edge to the air.", data: { dry: true } }
        }
        const url = `https://api.open-meteo.com/v1/forecast`
            + `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`
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
        return { experience: line, data: { sky: key, tempC: c.apparent_temperature ?? c.temperature_2m } }
    }

    async _lookNews() {
        const url = this.attr("newsUrl")
        if (!url) throw new Error("no newsUrl for a news look")
        if (isDryRun()) {
            return { experience: `A scrap of the outside world drifts past — “a quiet study of how rivers find their oldest paths”.`, data: { dry: true } }
        }
        const res = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            headers: { 'user-agent': 'Meditator/0 (+efferent look)' },
        })
        if (!res.ok) throw new Error(`feed ${res.status}`)
        const titles = parseFeedTitles(await res.text())
        if (!titles.length) throw new Error("the feed had no items")

        // Prefer a headline the mind has not looked at before; fall back to the freshest.
        const fresh = titles.find(t => !this._seenHeadlines.has(t)) || titles[0]
        this._seenHeadlines.add(fresh)
        if (this._seenHeadlines.size > 200) this._seenHeadlines = new Set([...this._seenHeadlines].slice(-100))

        return { experience: `A scrap of the outside world drifts past — “${fresh}”.`, data: { headline: fresh } }
    }
}

if (!customElements.get('m-look')) customElements.define('m-look', MLook);
