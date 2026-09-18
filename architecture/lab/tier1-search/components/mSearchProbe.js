import { MBaseComponent } from '../../../../src/mindComponents/shared/mBaseComponent.js'
import { part } from '../../../../src/mindComponents/shared/enclosure.js'
import {
    SearchTarget, MAX_SEARCH_LIFETIME_MS, SEARCH_OUTCOME_EVENT,
} from '../../../../src/infrastructure/predictionContracts.js'
import { parseTime } from '../../../../src/config/timeParser.js'
import { logger } from '../../../../src/infrastructure/logger.js'

const log = logger('mSearchProbe.js')

/**
 * LAB ONLY — a hand on the outside of the mind that starts one search.
 *
 * Two live runs of `eddy-world-orient` (doc/research/first-live-orientation.md
 * §B5) produced zero searches in 8.5 hours: a search starts only when the mind's
 * own `orient` hand carries a template, and this world gives it almost nothing
 * it wants to look for. That is a finding about the mind, not about the search
 * machinery, and it must not block measuring the machinery. This probe supplies
 * the template the way an experimenter would — deliberately, on a clock, from
 * outside the stream — so the tier-1 question ("does a closed-aperture search
 * report `found` on a decision-model score, and what does it cost and leak?")
 * can be answered without waiting on an organic trigger.
 *
 * It is not a faculty, it offers no capability, the mind cannot feel it, and it
 * belongs to no profile. It refuses to connect outside stage="experimental".
 *
 * Attributes: template (required), aperture, source, after (30s), every (off),
 *   sampleBudget / deadline (inherited from m-search when absent).
 */
export class MSearchProbe extends MBaseComponent {
    _timer = null
    _host = null
    _runs = 0

    onConnect() {
        super.onConnect()
        const mind = this.membrane()
        if (mind?.getAttribute('stage') !== 'experimental') {
            throw new Error('m-search-probe connects only in a mind tagged stage="experimental"')
        }
        this._host = mind
        mind.addEventListener(SEARCH_OUTCOME_EVENT, this._onOutcome)
        const after = parseTime(this.attr('after') || '30s')
        this._timer = setTimeout(this._fire, Number.isFinite(after) && after > 0 ? after : 30000)
    }

    onDisconnect() {
        if (this._timer) clearTimeout(this._timer)
        this._timer = null
        this._host?.removeEventListener(SEARCH_OUTCOME_EVENT, this._onOutcome)
        this._host = null
    }

    _fire = () => {
        this._timer = null
        try { this._start() } catch (error) { log.warn(`probe search refused: ${error?.message || error}`) }
        const every = parseTime(this.attr('every') || '')
        if (Number.isFinite(every) && every > 0) this._timer = setTimeout(this._fire, every)
    }

    _start() {
        const mind = this.membrane()
        const search = part(mind, 'search')[0]
        if (!search?.start) {
            log.warn('no search controller wired — nothing to probe')
            return
        }
        const template = (this.attr('template') || '').trim()
        if (!template) {
            log.warn('m-search-probe needs a template')
            return
        }
        const apertureName = this.attr('aperture') || 'world'
        const source = (this.attr('source') || '').trim()
        const aperture = this._apertureNamed(apertureName)
        const names = typeof aperture?.sourceNames === 'function' ? aperture.sourceNames() : []
        const routes = (source ? [source] : names).map(n => ({ aperture: apertureName, source: n }))
        if (!routes.length) {
            log.warn(`aperture "${apertureName}" has no registered source yet — probe skipped`)
            return
        }
        const budget = Number(this.attr('sampleBudget') || search.getAttribute?.('sampleBudget') || 4)
        const horizon = parseTime(this.attr('deadline') || search.getAttribute?.('deadline') || '2m')
        const ms = Math.min(Number.isFinite(horizon) && horizon > 0 ? horizon : 120000, MAX_SEARCH_LIFETIME_MS)
        this._runs += 1
        this._targetIds = this._targetIds || new Set()
        log.info(`probe search #${this._runs}: ${routes.map(r => `${r.aperture}:${r.source}`).join(', ')}`)
        const target = new SearchTarget({
            owner: search.getAttribute?.('name') || 'search',
            scopeId: mind.getAttribute('name') || 'mind',
            template,
            routes,
            sampleBudget: Number.isFinite(budget) && budget > 0 ? budget : 4,
            deadline: new Date(Date.now() + ms).toISOString(),
        })
        this._targetIds.add(target.id)
        search.start(target)
    }

    _onOutcome = event => {
        const outcome = event.detail
        // Only this probe's own searches: two probes share the one controller.
        if (!outcome || !this._targetIds?.has(outcome.targetId)) return
        log.info(`probe search outcome: ${outcome.status} (${outcome.reason}) `
            + `coverage=${Number(outcome.coverage).toFixed(2)} samples=${outcome.attemptedSamples}`)
    }

    _apertureNamed(name) {
        const mind = this.membrane()
        let found = null
        const walk = node => {
            for (const el of part(node, 'aperture')) {
                if ((el.getAttribute('name') || el.localName) === name) { found = el; return }
                walk(el)
                if (found) return
            }
        }
        walk(mind)
        return found
    }
}
