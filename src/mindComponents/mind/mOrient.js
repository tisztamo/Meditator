import { MBaseComponent } from "../shared/mBaseComponent.js"
import { part, providesOf } from "../shared/enclosure.js"
import {
    OrientationRequest, SearchTarget, MAX_SEARCH_LIFETIME_MS,
} from '../../infrastructure/predictionContracts.js'
import { parseTime } from '../../config/timeParser.js'
import { logger } from '../../infrastructure/logger.js'

const log = logger('mOrient.js')

const FELT = "When the world grows loud or far, you can let a channel recede, turn toward it, or follow one voice in it."

/**
 * Ordinary capability under m-act: voluntary orientation of a named aperture.
 * Closed enums are derived from live aperture providers, not authored. Orienting
 * is not a sensation — no experience, consequenceType null. A `template` on the
 * REALIZE envelope asks the wired search controller to start; search owns stopping.
 *
 * The felt line names world-facing affordances and never exposes modality ids,
 * aperture states, thresholds, or control mechanics.
 */
export class MOrient extends MBaseComponent {
    _host = null

    onConnect() {
        this._register()
        const mind = this.membrane()
        this._host = mind
        // Capture phase sees every aperture-register before the nearest aperture stops it.
        mind?.addEventListener('aperture-register', this._onApertureRegister, true)
    }

    onDisconnect() {
        if (this._host) {
            this._host.removeEventListener('aperture-register', this._onApertureRegister, true)
        }
        this._host = null
    }

    _onApertureRegister = event => {
        if (!providesOf(event.target, 'aperture')) return
        this._refreshSchema()
    }

    async _register() {
        const name = this.attr('name') || 'orient'
        const cooldown = this.attr('cooldown') || '30s'
        const intentThreshold = Number(this.attr('intentThreshold') || 0.75)
        const spec = {
            name,
            description: "Change how open a named channel of the outside is, or follow one voice in it.",
            felt: this.attr('felt') || FELT,
            parameters: this._schema(),
            readonly: false,
            lane: 'control',
            cooldown,
            intentThreshold: Number.isFinite(intentThreshold) ? intentThreshold : 0.75,
            acceptsTemplate: true,
            consequenceType: null,
            execute: async (args, ctx) => this._orient(args, ctx),
        }
        this.offerCapability(spec)
        // Apertures may already be connected; pick up their names on the next tick.
        queueMicrotask(() => this._refreshSchema())
    }

    _refreshSchema() {
        const parent = this.parentElement
        if (typeof parent?._updateCapability !== 'function') return
        parent._updateCapability(this.attr('name') || 'orient', { parameters: this._schema() })
    }

    _schema() {
        const apertures = this._apertureNames()
        const sources = this._sourceNames()
        const apertureProp = { type: 'string', description: 'which channel of the outside' }
        if (apertures.length) apertureProp.enum = apertures
        const sourceProp = { type: 'string', description: 'one voice in that channel, when following just one' }
        if (sources.length) sourceProp.enum = sources
        return {
            type: 'object',
            properties: {
                aperture: apertureProp,
                state: {
                    type: 'string',
                    enum: ['open', 'soft', 'narrow', 'closed'],
                    description: 'how open that channel should be',
                },
                source: sourceProp,
                reason: { type: 'string', description: 'why, in a short phrase' },
            },
            required: ['aperture', 'state'],
        }
    }

    _apertureNames() {
        const mind = this.membrane()
        if (!mind) return []
        const names = []
        const walk = node => {
            for (const el of part(node, 'aperture')) {
                names.push(el.getAttribute('name') || el.localName)
                walk(el)
            }
        }
        walk(mind)
        return names
    }

    _sourceNames() {
        const mind = this.membrane()
        if (!mind) return []
        const names = []
        const walk = node => {
            for (const el of part(node, 'aperture')) {
                if (typeof el.sourceNames === 'function') {
                    for (const n of el.sourceNames()) if (n) names.push(n)
                }
                walk(el)
            }
        }
        walk(mind)
        return [...new Set(names)]
    }

    _apertureNamed(name) {
        const mind = this.membrane()
        if (!mind || !name) return null
        let found = null
        const walk = node => {
            for (const el of part(node, 'aperture')) {
                const n = el.getAttribute('name') || el.localName
                if (n === name) { found = el; return }
                walk(el)
                if (found) return
            }
        }
        walk(mind)
        return found
    }

    async _orient({ aperture, state, source, reason } = {}, ctx = {}) {
        const src = typeof source === 'string' && source.trim() ? source.trim() : null
        const request = new OrientationRequest({
            issuedBy: this.attr('name') || 'orient',
            actId: ctx.actId ?? null,
            aperture,
            state,
            source: src,
            reason: (typeof reason === 'string' && reason.trim()) ? reason.trim() : 'look',
        })
        const mind = this.membrane()
        let accepted = false
        for (const el of part(mind, 'aperture')) {
            if (typeof el.requestOrientation !== 'function') continue
            if (el.requestOrientation(request)) {
                accepted = true
                break
            }
        }
        if (!accepted) log.debug(`orientation refused: ${aperture} ${state}`)

        const template = typeof ctx.template === 'string' ? ctx.template.trim() : ''
        if (template) {
            const search = part(mind, 'search')[0]
            if (search && typeof search.start === 'function') {
                const routes = this._routesFor(aperture, src)
                if (routes.length) {
                    const budget = Number(search.attr?.('sampleBudget') || search.getAttribute?.('sampleBudget') || 6)
                    const horizon = parseTime(search.attr?.('deadline') || search.getAttribute?.('deadline') || '2m')
                    const ms = Math.min(
                        Number.isFinite(horizon) && horizon > 0 ? horizon : 120000,
                        MAX_SEARCH_LIFETIME_MS,
                    )
                    search.start(new SearchTarget({
                        owner: search.attr?.('name') || search.getAttribute?.('name') || 'search',
                        scopeId: mind.getAttribute('name') || mind.localName || 'mind',
                        actId: ctx.actId ?? null,
                        template,
                        routes,
                        sampleBudget: Number.isFinite(budget) && budget > 0 ? budget : 6,
                        deadline: new Date(Date.now() + ms).toISOString(),
                    }))
                }
            }
        }
        // No experience: orienting is not a sensation.
        return {}
    }

    _routesFor(aperture, source) {
        const el = this._apertureNamed(aperture)
        const names = typeof el?.sourceNames === 'function' ? el.sourceNames() : []
        if (source) {
            if (names.length && !names.includes(source)) return []
            return [{ aperture, source }]
        }
        return names.map(n => ({ aperture, source: n }))
    }
}
