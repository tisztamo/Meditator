import { MBaseComponent } from "../shared/mBaseComponent.js"
import { providesOf } from "../shared/enclosure.js"
import { OrientationRequest } from '../../infrastructure/predictionContracts.js'
import { apertureNames, askOrientation, askSearchStart, askSources } from "../shared/apertureRequests.js"
import { logger } from '../../infrastructure/logger.js'

const log = logger('mOrient.js')

const FELT = "When the world grows loud or far, you can let a channel recede, turn toward it, or follow one voice in it. And when something out there snags you — a name, a question, something half-seen — you can go looking for it there and keep looking until you find it, or know it is not in what you inspected."

/**
 * Ordinary capability under m-act: voluntary orientation of a named aperture.
 * Closed enums are derived from live aperture providers, not authored. Orienting
 * is not a sensation — no experience, consequenceType null. A `template` on the
 * REALIZE envelope asks the wired search controller to start; search owns stopping.
 *
 * The felt line names world-facing affordances and never exposes modality ids,
 * aperture states, thresholds, or control mechanics.
 *
 * Messages (message-rule.md, shared/apertureRequests.js): the apertures are asked
 * by name — `orient` to change one, `aperture-sources` for the voices the schema
 * offers — and the search controller with `search-start`. The aperture names come
 * from a walk at offer time (addresses); the source names are the last answer,
 * so the first offer may list none and a re-offer follows the answer.
 */
export class MOrient extends MBaseComponent {
    _host = null
    _sources = new Map()   // aperture name → its source names, as last answered

    onConnect() {
        this._register()
        this._askSources()
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
        this._askSources()
    }

    /** Ask every aperture for its sources; offer again if the answer changed the
     *  schema. The walk can race a later aperture, which asks again on its own
     *  aperture-register. */
    async _askSources() {
        const before = JSON.stringify([...this._sources])
        const answered = await askSources(this)
        if (!this.isConnected) return
        this._sources = answered
        if (JSON.stringify([...answered]) !== before) this._refreshSchema()
    }

    _register() {
        this.offerCapability(this._spec())
    }

    _spec() {
        const name = this.attr('name') || 'orient'
        const cooldown = this.attr('cooldown') || '30s'
        const intentThreshold = Number(this.attr('intentThreshold') || 0.75)
        return {
            name,
            description: "Change how open a named channel of the outside is, or follow one voice in it. "
                + "When the reach is a looking-for — the mind wants to find something specific out there — "
                + "follow the voice it would live in and set `template` to what to look for: a search then "
                + "keeps sampling that voice until it finds a match or honestly reports none.",
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
    }

    /** A late aperture changes the enum: offer again. The re-offer carries the same
     *  offerId, so the assembler replaces the entry (message-rule.md, idempotent offer). */
    _refreshSchema() {
        if (this.isConnected) this._register()
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
        return apertureNames(this.membrane())
    }

    _sourceNames() {
        return [...new Set([...this._sources.values()].flat())]
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
        const accepted = await askOrientation(this, request)
        if (!accepted) log.debug(`orientation refused: ${aperture} ${state}`)

        const template = typeof ctx.template === 'string' ? ctx.template.trim() : ''
        if (template) {
            const routes = await this._routesFor(aperture, src)
            if (routes.length) await askSearchStart(this, { template, routes, actId: ctx.actId ?? null })
        }
        // No experience: orienting is not a sensation.
        return {}
    }

    /** The routes a search may take: the named voice, or every voice of the
     *  aperture, from the aperture's own answer. */
    async _routesFor(aperture, source) {
        const names = (await askSources(this)).get(aperture) || []
        if (source) {
            if (names.length && !names.includes(source)) return []
            return [{ aperture, source }]
        }
        return names.map(n => ({ aperture, source: n }))
    }
}
