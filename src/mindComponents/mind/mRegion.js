import { MBaseComponent } from "../shared/mBaseComponent.js"
import { Aperture } from '../../infrastructure/aperture.js'
import { Percept, PerceptCandidate } from '../../infrastructure/percept.js'
import { SourceContract } from '../../infrastructure/perceptionContracts.js'
import { InterruptRecord } from '../../infrastructure/interruptRecord.js'
import { parseTime } from '../../config/timeParser.js'

/**
 * A FACULTY boundary inside a mind: a structural grouping of observers (and an
 * optional region-local m-interrupts) so that attention can be arbitrated in
 * LAYERS rather than as one flat fan-in.
 *
 * Observers placed inside a region compete at the region's local arbiter; only
 * the survivors bubble up — re-weighted by the region's `gain` — to the mind's
 * global arbiter. This is Global-Workspace-Theory in miniature: parallel local
 * competition, a single global broadcast.
 *
 * Without `modality`, the region is a structural boundary. It is an Amanita component so
 * that it can serve as a clean DOM bubbling boundary: a child arbiter binds to
 * its enclosing region (via closest('m-region')) and promotes survivors to the
 * region's parent, so the very same arbiter code works at any depth.
 *
 * Observers inside a region still see the MIND's stream — their default source
 * is the mind-relative "..m-mind/stream/chunk", which skips the region. Only
 * attention (interrupt-request events) is scoped to the region.
 *
 * See doc/architecture/deep-structure.md → "Nested attention".
 *
 * @interface
 * Attributes:
 *   - name: optional label for the faculty (observability only)
 *   - (the re-weighting `gain` lives on the region's child m-interrupts)
 *   - modality: opt into the text-first perceptual membrane
 *   - aperture: initial open (default), soft, or closed; wake uses this declared default
 *   - dwell: minimum time between aperture changes (default 30s)
 *   - contactHorizon: weak time-only pressure reaches 1 after this awake interval (10m)
 * Methods: registerSource(element, sample) → offer(header, lazyText); orient(state, source).
 * A source may declare name, provenance, tier (default 0), and the three independent
 * bypass powers on the element. It may never assert those from a payload; the frozen
 * SourceContract is the only policy the offer path reads. tier 1 and 2 are refused
 * at registration.
 * Topics: contactPressure, apertureState (retained); events: aperture-change (backstage).
 * Only registered lazy sources pass through this aperture; legacy interrupts are unchanged.
 */
export class MRegion extends MBaseComponent {
    onConnect() {
        super.onConnect()
        if (!this.attr('modality')) return
        this.aperture = new Aperture({
            state: this.attr('aperture') || 'open',
            dwellMs: parseTime(this.attr('dwell') || '30s'),
            horizonMs: parseTime(this.attr('contactHorizon') || '10m'),
        })
        this._sources = new Map()
        this._issued = new WeakSet()
        this._arousal = 1
        const mind = this._mind()
        mind?.addEventListener('percepts-attended', this._onPerceptsAttended)
        // closest() is empty after removal; remember the connect-time host for unlisten.
        this._unlistenPercepts = () => mind?.removeEventListener('percepts-attended', this._onPerceptsAttended)
        if (mind?.querySelector('m-stream')) {
            this.sub('..m-mind/stream/@boundary', () => this.onBoundary()).catch(() => {})
        }
        if (mind?.querySelector('m-economy')) {
            this.sub('..m-mind/economy/arousal', value => { this._arousal = value }).catch(() => {})
        }
        this._publishAperture()
    }

    onDisconnect() {
        this._unlistenPercepts?.()
        if (this.aperture) this.aperture.version++
        this._sources?.clear()
    }

    _mind() { return this.closest('m-mind') }
    _modalityRegion(el) { return el.closest('m-region[modality]') }

    /** Architecture-owned adapter: payloads cannot choose identity or policy. */
    registerSource(element, sample) {
        if (!this.aperture || this._modalityRegion(element) !== this) throw new Error('Source needs its modality region')
        if (this._sources.has(element)) return this._sources.get(element).offer
        if (this._sources.size >= 32) throw new Error('Too many sources in one modality region')
        const contract = SourceContract.fromElement(element, { modality: this.attr('modality') })
        if ([...this._sources.values()].some(s => s.source === contract.name)) throw new Error('Sensory source names must be unique within a region')
        const entry = { source: contract.name, sample, busy: false, contract }
        entry.offer = async (header, materialize) => {
            const attached = () => this.isConnected && element.isConnected
                && this._modalityRegion(element) === this && this._sources.get(element) === entry
            if (!attached() || this._mind()?._sleeping) return null
            const candidate = new PerceptCandidate(header, materialize)
            const now = Date.now()
            this.aperture.observe(contract.name, candidate, now)
            this._publishAperture()
            if (!this.aperture.allows(contract.name, contract.powers) || entry.busy) return null
            entry.busy = true
            const version = this.aperture.version
            try {
                const text = await candidate.materialize()
                if (!attached() || this._mind()?._sleeping
                    || version !== this.aperture.version) return null
                const record = new Percept({
                    id: candidate.id, sourceId: contract.name, modality: contract.modality,
                    provenance: contract.provenance, tier: contract.tier, policy: contract.powers,
                    occurredAt: new Date(Math.min(now, candidate.occurredAt)).toISOString(),
                    record: new InterruptRecord({ source: 'External', type: `Sense-${contract.name}`, reason: text,
                        salience: candidate.changeMagnitude * (contract.powers.bypassAperture ? 1 : this.aperture.gain) }),
                })
                this._issued.add(record)
                element.dispatchEvent(new CustomEvent('interrupt-request', { bubbles: true, detail: record }))
                return record
            } catch {
                // A failed renderer is not a sensation; errors can themselves contain private payloads.
                this.pub('materializationFailure', { source: contract.name, candidateId: candidate.id })
                return null
            } finally { entry.busy = false }
        }
        this._sources.set(element, entry)
        return entry.offer
    }

    orient(state, source = null, now = Date.now()) {
        if (!this.aperture) return false
        if (state === 'narrow' && ![...this._sources.values()].some(s => s.source === source)) return false
        const before = this.aperture.state
        if (!this.aperture.orient(state, { source, now })) return false
        this._transition(before, 'orientation')
        return true
    }

    onBoundary(now = Date.now()) {
        if (!this.aperture) return
        const before = this.aperture.state
        const changed = this.aperture.advance(now, { awake: !this._mind()?._sleeping, arousal: this._arousal })
        if (changed) this._transition(before, 'contact-deficit')
        else this._publishAperture()
    }

    _transition(from, reason) {
        this._publishAperture()
        this.fire('aperture-change', { from, to: this.aperture.state, reason })
        // Ask the sources for the present. No candidate or suppressed content is queued.
        for (const [element, entry] of this._sources) {
            if (element.isConnected && this.aperture.allows(entry.source)) {
                Promise.resolve().then(() => entry.sample?.()).catch(() => {})
            }
        }
    }

    _onPerceptsAttended = e => {
        if (!Array.isArray(e.detail)) return
        for (const percept of e.detail) {
            if (!this._issued.delete(percept)) continue
            this.aperture.attended(Date.parse(percept.dateTime))
        }
        this._publishAperture()
    }

    _publishAperture() {
        this.pub('contactPressure', this.aperture.deficit)
        this.pub('apertureState', { state: this.aperture.state, focus: this.aperture.focus,
            contactPressure: this.aperture.deficit, gain: this.aperture.gain })
    }
}
