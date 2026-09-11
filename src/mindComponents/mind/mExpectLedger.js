import fs from 'node:fs'
import path from 'node:path'
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { AttentionBid } from '../../infrastructure/attentionBid.js'
import { InterruptRecord } from '../../infrastructure/interruptRecord.js'
import { Prediction } from '../../infrastructure/predictionContracts.js'
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT, EVALUATION_COMMIT_EVENT,
} from '../../infrastructure/predictionContracts.js'
import { PerceptReceipt } from '../../infrastructure/perceptionContracts.js'
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
        const detail = event.detail
        if (detail instanceof AttentionBid) {
            const evidence = detail.evidence
            if (!evidence?.actId) return
            this._append({
                kind: 'consequence',
                perceptId: evidence.id ?? null,
                actId: evidence.actId,
                type: evidence.type ?? null,
                occurredAt: evidence.dateTime ?? null,
                progress: evidence.progress === true ? true : undefined,
                text: typeof evidence.renderForFrame === 'function'
                    ? evidence.renderForFrame()
                    : String(evidence.reason ?? ''),
                salience: evidence.salience ?? null,
            })
            return
        }
        if (!(detail instanceof InterruptRecord) || !detail.actId) return
        this._append({
            kind: 'consequence',
            perceptId: detail.id ?? null,
            actId: detail.actId,
            type: detail.type ?? null,
            occurredAt: detail.dateTime ?? null,
            progress: detail.progress === true ? true : undefined,
            text: typeof detail.renderForFrame === 'function'
                ? detail.renderForFrame()
                : String(detail.reason ?? ''),
            salience: detail.salience ?? null,
        })
    }

    _onAttended = event => {
        const list = event.detail
        if (!Array.isArray(list)) return
        for (const item of list) {
            if (!(item instanceof PerceptReceipt)) continue
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
