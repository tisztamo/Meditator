import fs from 'node:fs'
import path from 'node:path'
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { AttentionBid, isBidData } from '../../infrastructure/attentionBid.js'
import { renderStimulus } from '../../infrastructure/interruptRecord.js'
import { sentByComponent } from '../../infrastructure/messageOrigin.js'
import { Prediction } from '../../infrastructure/predictionContracts.js'
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT, EVALUATION_COMMIT_EVENT,
} from '../../infrastructure/predictionContracts.js'
import {
    SEARCH_TARGET_EVENT, SEARCH_OUTCOME_EVENT, SearchTarget, SearchOutcome,
} from '../../infrastructure/predictionContracts.js'
import { receiptsFrom, EdgeEvidence, EDGE_EVIDENCE_EVENT } from '../../infrastructure/perceptionContracts.js'
import { mindHome } from '../../infrastructure/memoryVault.js'

/**
 * Private expect/outcome ledger for the B1 live study. Lab-gated: refuses to
 * connect unless the enclosing mind is `stage="experimental"`. Writes JSON
 * lines to `mindHome(this, 'predictions')/ledger.jsonl` only — never to memory,
 * the frame, Studio, or the process log.
 */
export class MExpectLedger extends MBaseComponent {
    _file = null
    _queue = Promise.resolve()
    _host = null

    onConnect() {
        super.onConnect()
        const mind = this.membrane()
        if (mind?.getAttribute('stage') !== 'experimental') {
            throw new Error('m-expect-ledger connects only in a mind tagged stage="experimental"')
        }
        const dir = mindHome(this, 'predictions')
        fs.mkdirSync(dir, { recursive: true })
        this._file = path.join(dir, 'ledger.jsonl')
        this._host = mind
        mind.addEventListener(PREDICTION_EVENT, this._onPrediction)
        mind.addEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
        mind.addEventListener(EVALUATION_COMMIT_EVENT, this._onCommit)
        mind.addEventListener(SEARCH_TARGET_EVENT, this._onSearchTarget)
        mind.addEventListener(SEARCH_OUTCOME_EVENT, this._onSearchOutcome)
        mind.addEventListener(EDGE_EVIDENCE_EVENT, this._onEdgeEvidence)
        mind.addEventListener('acted', this._onActed)
        mind.addEventListener('interrupt-request', this._onInterrupt)
        mind.addEventListener('percepts-attended', this._onAttended)
        this.sub('!scope/hands/intent', this._onIntent).catch(() => {})
    }

    onDisconnect() {
        if (this._host) {
            this._host.removeEventListener(PREDICTION_EVENT, this._onPrediction)
            this._host.removeEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
            this._host.removeEventListener(EVALUATION_COMMIT_EVENT, this._onCommit)
            this._host.removeEventListener(SEARCH_TARGET_EVENT, this._onSearchTarget)
            this._host.removeEventListener(SEARCH_OUTCOME_EVENT, this._onSearchOutcome)
            this._host.removeEventListener(EDGE_EVIDENCE_EVENT, this._onEdgeEvidence)
            this._host.removeEventListener('acted', this._onActed)
            this._host.removeEventListener('interrupt-request', this._onInterrupt)
            this._host.removeEventListener('percepts-attended', this._onAttended)
        }
        this._host = null
        this._file = null
    }

    _append(row) {
        if (!this._file) return
        const line = JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n'
        this._queue = this._queue.then(() => fs.promises.appendFile(this._file, line)).catch(() => {})
    }

    _onPrediction = event => {
        const prediction = event.detail
        if (!(prediction instanceof Prediction)) return
        this._append({
            kind: 'prediction',
            id: prediction.id,
            actId: prediction.actId,
            capability: prediction.producer,
            basisAt: prediction.basisAt,
            validUntil: prediction.validUntil,
            target: prediction.target,
            expectText: prediction.representation?.value ?? null,
        })
    }

    _onSettled = event => {
        const s = event.detail
        if (!s || typeof s !== 'object') return
        this._append({
            kind: 'settled',
            predictionId: s.predictionId ?? null,
            status: s.status ?? null,
            reason: s.reason ?? null,
            settledAt: s.settledAt ?? null,
        })
    }

    _onCommit = event => {
        const c = event.detail
        if (!c || typeof c !== 'object') return
        this._append({
            kind: 'commit',
            evidenceId: c.evidenceId ?? null,
            actId: c.actId ?? null,
            predictionId: c.predictionId ?? null,
            verdicts: Array.isArray(c.verdicts) ? c.verdicts : [],
        })
    }

    /** Search and tier-1 rows, written the same way the expect rows are: one
     * JSON line each, in the run home, nowhere else. A tier-1 score is journaled
     * with its full provenance (model version, question keys, derived strength,
     * cost) and without the candidate text it was made from — the ledger sees
     * exactly what crossed the closed aperture, which is the point of recording it. */
    _onSearchTarget = event => {
        const target = event.detail
        if (!(target instanceof SearchTarget)) return
        this._append({
            kind: 'search-target',
            targetId: target.id,
            owner: target.owner,
            actId: target.actId,
            template: target.template,
            routes: target.routes.map(r => `${r.aperture}:${r.source}`),
            sampleBudget: target.sampleBudget,
            deadline: target.deadline,
        })
    }

    _onSearchOutcome = event => {
        const outcome = event.detail
        if (!(outcome instanceof SearchOutcome)) return
        this._append({
            kind: 'search-outcome',
            targetId: outcome.targetId,
            status: outcome.status,
            reason: outcome.reason,
            coverage: outcome.coverage,
            attemptedSamples: outcome.attemptedSamples,
            inspectedRoutes: outcome.inspectedRoutes.map(r => `${r.aperture}:${r.source}`),
        })
    }

    _onEdgeEvidence = event => {
        const evidence = event.detail
        if (!(evidence instanceof EdgeEvidence)) return
        this._append({
            kind: 'edge-score',
            targetId: evidence.targetId,
            requestId: evidence.requestId,
            source: evidence.sourceName,
            tier: evidence.tier,
            score: evidence.score,
            provenance: evidence.provenance,
        })
    }

    _onActed = event => {
        const d = event.detail
        if (!d || typeof d !== 'object') return
        const experience = typeof d.experience === 'string' ? d.experience : ''
        this._append({
            kind: 'acted',
            actId: d.actId ?? null,
            predictionId: d.predictionId ?? null,
            capability: d.capability ?? null,
            ok: d.ok === true,
            progress: d.progress === true ? true : undefined,
            experienceLength: experience.length,
        })
    }

    _onInterrupt = event => {
        // Act lineage is honoured only on a component's message (messageOrigin.js);
        // a bid carries it on its evidence, a plain stimulus on itself.
        if (!sentByComponent(event)) return
        const detail = event.detail
        if (!detail || typeof detail !== 'object') return
        const evidence = detail instanceof AttentionBid ? detail.evidence
            : isBidData(detail) ? detail.evidence : detail
        if (typeof evidence?.actId !== 'string' || !evidence.actId) return
        this._append({
            kind: 'consequence',
            perceptId: evidence.id ?? null,
            actId: evidence.actId,
            type: evidence.type ?? null,
            occurredAt: evidence.dateTime ?? null,
            progress: evidence.progress === true ? true : undefined,
            text: renderStimulus(evidence),
            salience: evidence.salience ?? null,
        })
    }

    _onAttended = event => {
        for (const item of receiptsFrom(event)) {
            this._append({
                kind: 'attended',
                perceptId: item.perceptId,
                at: item.attendedAt ?? null,
            })
        }
    }

    _onIntent = data => {
        if (!data || typeof data !== 'object') return
        this._append({
            kind: 'intent',
            gist: data.gist ?? null,
            accepted: data.accepted === true,
            reason: data.reason ?? null,
            salience: data.salience ?? null,
        })
    }
}
