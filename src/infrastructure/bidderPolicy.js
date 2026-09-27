import { Evaluation } from './perceptionContracts.js';
import { AttentionBid, independentSignals } from './attentionBid.js';
import { evaluationIdsOf } from './compareContinuation.js';

function sameIdList(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((id, i) => actual[i] === id);
}

function sameSignals(actual, expected) {
    if (actual == null || expected == null) return false;
    const keys = Object.keys(expected);
    if (Object.keys(actual).length !== keys.length) return false;
    return keys.every(key => Object.is(actual[key], expected[key]));
}

function samePowers(actual, expected) {
    if (!actual || !expected) return false;
    return actual.bypassAperture === expected.bypassAperture
        && actual.bypassAdmission === expected.bypassAdmission
        && actual.preempt === expected.preempt;
}

function finiteUnit(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Match/mismatch from committed Evaluation verdicts. Missing evaluation is
 * null, not 0-as-match. Both slots may be set if both verdicts exist.
 * `insufficient` fills neither. Strength is confidence when finite in [0, 1],
 * otherwise 1. */
export function predictionSignalsFromEvaluations(evaluations) {
    let predictionMatch = null;
    let predictionMismatch = null;
    const list = Array.isArray(evaluations) ? evaluations : [];
    for (const evaluation of list) {
        if (!(evaluation instanceof Evaluation)) continue;
        if (evaluation.subject?.kind !== 'prediction') continue;
        const strength = finiteUnit(evaluation.confidence) ? evaluation.confidence : 1;
        if (evaluation.verdict === 'match') predictionMatch = strength;
        else if (evaluation.verdict === 'mismatch') predictionMismatch = strength;
    }
    return { predictionMatch, predictionMismatch };
}

/** Target-match from committed Evaluation verdicts of kind `target`. Missing is null. */
export function targetSignalFromEvaluations(evaluations) {
    let targetMatch = null;
    const list = Array.isArray(evaluations) ? evaluations : [];
    for (const evaluation of list) {
        if (!(evaluation instanceof Evaluation)) continue;
        if (evaluation.subject?.kind !== 'target') continue;
        if (evaluation.verdict !== 'match') continue;
        targetMatch = finiteUnit(evaluation.confidence) ? evaluation.confidence : 1;
    }
    return targetMatch;
}

export function expectedBidSignals({ evidence, evaluations = [], populatePrediction = false } = {}) {
    const prediction = populatePrediction
        ? predictionSignalsFromEvaluations(evaluations)
        : { predictionMatch: null, predictionMismatch: null };
    const targetMatch = populatePrediction ? targetSignalFromEvaluations(evaluations) : null;
    return independentSignals({
        changeMagnitude: evidence.salience,
        requested: evidence.requestId != null,
        ...prediction,
        targetMatch,
    });
}

/** Accept a bidder result only when it is an AttentionBid over the supplied
 * Percept (by id: a bidder's answer crosses as data, so it is never the same
 * object), preserves powers / evaluation ids / the committed signal set, has
 * finite salience in [0, 1], and recomputes under nested gain without changing
 * those invariants. Mutates the trail only for the check, then restores. */
export function acceptIssuedBid(bid, { evidence, expectedSignals, evaluationIds } = {}) {
    if (!(bid instanceof AttentionBid)) return false;
    if (bid.evidence?.id !== evidence.id) return false;
    if (bid.evidenceId !== evidence.id) return false;
    if (!samePowers(bid.evidence.policy, evidence.policy)) return false;
    if (!sameIdList(bid.evaluationIds, evaluationIds)) return false;
    if (!sameSignals(bid.signals, expectedSignals)) return false;
    if (!finiteUnit(bid.salience)) return false;

    const trail = bid.gainTrail;
    const saved = trail.slice();
    const savedSalience = bid.salience;
    try {
        trail.push(Object.freeze({ gate: 'accept-check', factor: 0.5 }));
        bid.recomputeSalience();
        if (bid.evidence?.id !== evidence.id || bid.evidenceId !== evidence.id) return false;
        if (!samePowers(bid.evidence.policy, evidence.policy)) return false;
        if (!sameIdList(bid.evaluationIds, evaluationIds)) return false;
        if (!sameSignals(bid.signals, expectedSignals)) return false;
        if (!finiteUnit(bid.salience)) return false;
    } catch {
        return false;
    } finally {
        trail.length = 0;
        for (const entry of saved) trail.push(entry);
        bid.salience = savedSalience;
    }
    return true;
}

/** A bound bidder's bid, admitted: accepted (acceptIssuedBid) and issued again over
 * the owner's own Percept, so what the bidder chose — trail, signals, floors — is
 * kept and the evidence is the owner's, whatever the bidder sent back. Invalid
 * output returns null: do not substitute a default bid. */
export function admitBidderBid(bid, { evidence, evaluations = [] } = {}) {
    const expectedSignals = expectedBidSignals({ evidence, evaluations, populatePrediction: true });
    const evaluationIds = evaluationIdsOf(evaluations);
    if (!acceptIssuedBid(bid, { evidence, expectedSignals, evaluationIds })) return null;
    try {
        return new AttentionBid({
            evidence,
            gainTrail: bid.gainTrail,
            signals: bid.signals,
            requestedFloor: bid.requestedFloor,
            expectedFloor: bid.expectedFloor,
            mismatchWeight: bid.mismatchWeight,
            evaluationIds: bid.evaluationIds,
        });
    } catch {
        return null;
    }
}

/** Absent a bidder, emit the phase-2/A3 default (prediction slots null, floors 0).
 * With an in-process bidder object (a policy under test), ask it and admit the
 * result. A component bidder is asked by message instead (shared/bidders.js). */
export function issueOwnerBid({
    bidder = null, evidence, evaluations = [], gainTrail = [], requestedFloor = 0,
} = {}) {
    if (!bidder) {
        return new AttentionBid({
            evidence,
            gainTrail,
            signals: expectedBidSignals({ evidence, evaluations, populatePrediction: false }),
            requestedFloor,
            evaluationIds: evaluationIdsOf(evaluations),
        });
    }
    let bid;
    try {
        bid = bidder.createBid({ evidence, evaluations, gainTrail, requestedFloor });
    } catch {
        return null;
    }
    return admitBidderBid(bid, { evidence, evaluations });
}
