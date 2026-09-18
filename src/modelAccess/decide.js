import { logger } from '../infrastructure/logger.js';
import { dumpPrompt } from '../infrastructure/promptDebug.js';
import { VERDICT_GLOSSES } from '../infrastructure/judgeCompare.js';
import { modelForRole, resolveModelRef } from './modelConfig.js';
import { isDryRun, recordUsage } from './llm.js';

const log = logger('decide.js');

/**
 * The decision transport — sibling of complete() in llm.js.
 *
 * A System-One model (TypeSafe's Jev) answers questions about a state and
 * generates nothing: one POST carries a `state` (text) and a named map of
 * questions, and the answers come back under the same keys. It is the tier-1
 * primitive the perceptual membrane asks for — structured, non-linguistic
 * evidence — so it cannot hide behind complete(): no messages, no tokens out,
 * no OpenAI shape. See doc/plans/jev-system-one-integration.md.
 *
 * Failure discipline mirrors complete(): a soft failure returns null rather than
 * throwing, usage lands in getUsageTotals(), MEDITATOR_DRY_RUN=1 answers offline.
 * The one thing that throws is a config bug — a model that is not on a decision
 * provider — because that never heals by waiting.
 */

const ENDPOINT_PATH = '/systemone';
const DEFAULT_BASE_URL = 'https://api.typesafe.ai/v1';

/** Published price: $0.042 per million input tokens; output is free. */
export const DECISION_INPUT_PRICE_PER_TOKEN = 0.042 / 1_000_000;

/** Overall wall-clock cap for one call when no deadline is given. */
const DEFAULT_TIMEOUT_MS = Number(process.env.MEDITATOR_DECIDE_TIMEOUT_MS || 10000);

/** Statuses the vendor tells us to back off on (429 rate limit, 529 overload). */
const BACKOFF_STATUSES = new Set([429, 529]);
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

// Module state: a shared cooldown, so a rate-limited endpoint is not hammered by
// every component in the mind at once. A call inside the cooldown soft-fails
// immediately instead of spending its deadline on a request that will 429.
let backoffUntil = 0;
let backoffStreak = 0;

function noteBackoff() {
  backoffStreak += 1;
  const wait = Math.min(BACKOFF_BASE_MS * 2 ** (backoffStreak - 1), BACKOFF_MAX_MS);
  backoffUntil = Date.now() + wait;
  return wait;
}

function clearBackoff() {
  backoffStreak = 0;
  backoffUntil = 0;
}

/** For tests and for a mind that wants to report the cooldown. */
export function getDecideBackoff() {
  return { until: backoffUntil, streak: backoffStreak, activeFor: Math.max(0, backoffUntil - Date.now()) };
}

export function resetDecideBackoff() {
  clearBackoff();
}

function specFor(model, role) {
  let spec;
  if (!model) spec = modelForRole(role);
  else if (typeof model === 'object' && model.provider) spec = model;
  else if (typeof model === 'string') spec = resolveModelRef(model, role);
  else spec = modelForRole(role);
  if (spec?.kind !== 'decision') {
    throw new Error(
      `Model "${spec?.model}" is on provider "${spec?.provider}" (kind: ${spec?.kind || 'completion'}), `
      + `which generates text rather than answering questions. Use complete() from src/modelAccess/llm.js, not decide().`
    );
  }
  return spec;
}

function errorDetail(error) {
  const status = error?.status ?? error?.code;
  return [status != null ? `status=${status}` : '', error?.message || '', error?.body ? `body=${String(error.body).slice(0, 400)}` : '']
    .filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The tier-2 comparator's verdict as a `choice` question. The three criteria
 * descriptions are the very glosses the text judge is given (judgeCompare.js),
 * so the two engines are asked the same question and their verdicts are
 * comparable — the shared-rubric caveat from expect-study §2.5 applies to both.
 *
 * `instructions`, not `question`: the probe found that an unknown key is silently
 * ignored, and a `noul` carrying only a `question` is rejected outright with
 * "must have criteria or instructions".
 *
 * @returns {{type: 'choice', instructions: string, criteria: Record<string,string>}}
 */
export function verdictChoice() {
  return {
    type: 'choice',
    instructions: 'Given what was expected and what was then perceived, does the perception confirm the expectation, contradict it, or leave it undecided?',
    criteria: {
      match: VERDICT_GLOSSES.match,
      mismatch: VERDICT_GLOSSES.mismatch,
      insufficient: VERDICT_GLOSSES.insufficient,
    },
  };
}

/**
 * Read one `choice` answer defensively: a missing or malformed answer reads as
 * no choice at zero confidence, which every caller can treat as "no evidence".
 *
 * @param {Object|null} answer
 * @returns {{value: string|null, confidence: number, probabilities: Record<string, number>}}
 */
export function readChoice(answer) {
  const empty = { value: null, confidence: 0, probabilities: {} };
  if (!answer || typeof answer !== 'object') return empty;
  const value = typeof answer.choice === 'string' && answer.choice ? answer.choice : null;
  const raw = Number(answer.confidence);
  const confidence = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  const probs = answer.probabilities;
  const probabilities = {};
  if (probs && typeof probs === 'object') {
    for (const [k, v] of Object.entries(probs)) {
      const n = Number(v);
      if (Number.isFinite(n)) probabilities[k] = n;
    }
  }
  return { value, confidence, probabilities };
}

// ---------------------------------------------------------------------------
// decide()
// ---------------------------------------------------------------------------

/**
 * Ask a decision model a named map of questions about a state.
 *
 * @param {Object} opts
 * @param {string|Object} [opts.model] - model ref, role name, or a resolved spec; defaults to the judge role
 * @param {string|Object|Array} opts.state - the text the questions are about
 * @param {Object} opts.questions - { key: { type: 'noul'|'choice'|'score', instructions?, criteria? } };
 *   every question needs `criteria` or `instructions` (the endpoint rejects a bare one)
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.deadline] - epoch ms; the call never outlives it and never retries inside it
 * @param {string} [opts.debugTag]
 * @param {*} [opts.debugEl]
 * @returns {Promise<{answers: Object, usage: Object|null, latencyMs: number, model: string}|null>}
 *   null on soft failure. `model` is the version the endpoint resolved (e.g. "jev-1.13.0").
 */
export async function decide(opts = {}) {
  const spec = specFor(opts.model, 'judge');
  const questions = opts.questions;
  if (!questions || typeof questions !== 'object' || Object.keys(questions).length === 0) {
    throw new Error('decide() needs at least one question');
  }
  const state = opts.state ?? '';

  dumpPrompt({
    kind: 'decide', tag: opts.debugTag || 'decide', el: opts.debugEl,
    prompt: JSON.stringify({ state, questions }, null, 2),
    model: spec.model, provider: spec.provider, dryRun: isDryRun(),
    params: { questions: Object.keys(questions).join(', ') },
  });

  if (isDryRun()) return dryDecide({ spec, state, questions });

  const started = Date.now();
  if (opts.signal?.aborted) return null;
  if (opts.deadline != null && started >= opts.deadline) {
    log.debug('decide skipped: deadline already passed');
    return null;
  }
  if (started < backoffUntil) {
    log.debug(`decide skipped: backing off for another ${backoffUntil - started}ms after a 429/529`);
    return null;
  }

  const body = { state, model: spec.model, questions };
  // A 429/529 is retried ONCE, and only when the caller gave no deadline: inside
  // a compare deadline the mind would rather have no verdict than a late one.
  const mayRetry = opts.deadline == null;

  for (let attempt = 0; ; attempt += 1) {
    const result = await attempt_(spec, body, opts, started);
    if (result.ok) {
      clearBackoff();
      return result.value;
    }
    if (result.backoff) {
      const wait = noteBackoff();
      if (mayRetry && attempt === 0 && !opts.signal?.aborted) {
        log.debug(`decide soft-failed (${result.detail}) — waiting ${wait}ms and retrying once`);
        await sleep(wait, opts.signal);
        if (opts.signal?.aborted) return null;
        continue;
      }
      log.debug(`decide soft-failed (${result.detail}) — backing off ${wait}ms, not retried${mayRetry ? '' : ' (inside a deadline)'}`);
    }
    return null;
  }
}

function sleep(ms, signal) {
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', done);
      resolve();
    }
    signal?.addEventListener?.('abort', done, { once: true });
  });
}

async function attempt_(spec, body, opts, started) {
  const baseURL = (spec.baseURL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${baseURL}${ENDPOINT_PATH}`;
  const budget = opts.deadline != null
    ? Math.min(DEFAULT_TIMEOUT_MS, opts.deadline - Date.now())
    : DEFAULT_TIMEOUT_MS;
  if (budget <= 0) return { ok: false, backoff: false, detail: 'deadline passed' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, budget);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener?.('abort', onAbort, { once: true });

  const t0 = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${spec.apiKey || ''}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;

    if (!response.ok) {
      const status = response.status;
      let text = '';
      try { text = await response.text(); } catch { /* body already gone */ }
      const detail = `status=${status} ${String(text).slice(0, 400)}`;
      if (BACKOFF_STATUSES.has(status)) return { ok: false, backoff: true, detail };
      // 401/422 and friends are ours to fix; they will not heal by waiting.
      log.warn(`decide failed (${spec.provider} model="${spec.model}"): ${detail} — client error, not retried`);
      return { ok: false, backoff: false, detail };
    }

    // Observed envelope (Phase-0 probe, jev-1.13.0):
    //   { model, answers: { <key>: { type, … } }, usage: { input_tokens, output_tokens } }
    const payload = await response.json();
    const answers = payload?.answers && typeof payload.answers === 'object'
      ? payload.answers
      // Tolerate a flat shape (answers at the top level under the question keys).
      : pickAnswers(payload, Object.keys(body.questions));
    const usage = accountUsage(payload, body);
    log.debug(`decide ← ${Object.keys(answers || {}).length} answer(s) from "${payload?.model || spec.model}" in ${latencyMs}ms`
      + `, usage=${usage ? JSON.stringify(usage) : 'none'}`);
    return {
      ok: true,
      value: {
        answers: answers || {},
        usage,
        latencyMs: Date.now() - started,
        // The endpoint resolves "jev-latest" to a pinned version; carrying it
        // back lets a study record which model produced a verdict.
        model: payload?.model || spec.model,
      },
    };
  } catch (error) {
    if (timedOut) {
      log.debug(`decide timed out after ${budget}ms (${spec.provider} model="${spec.model}") — soft-failed, not counted`);
      return { ok: false, backoff: false, detail: `timeout after ${budget}ms` };
    }
    if (opts.signal?.aborted) return { ok: false, backoff: false, detail: 'aborted' };
    log.debug(`decide soft-failed (${spec.provider} model="${spec.model}"): ${errorDetail(error)} — transient, not counted`);
    return { ok: false, backoff: false, detail: errorDetail(error) };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener?.('abort', onAbort);
  }
}

function pickAnswers(payload, keys) {
  if (!payload || typeof payload !== 'object') return {};
  const out = {};
  for (const key of keys) if (payload[key] != null) out[key] = payload[key];
  return out;
}

/**
 * Input tokens as the endpoint reports them (`usage.input_tokens`), or an
 * estimate if it ever stops. Output tokens are reported but free, so they are
 * carried for the record and priced at zero — the whole cost is the input side.
 */
function accountUsage(payload, body) {
  const reported = payload?.usage || {};
  const input = Number(
    reported.input_tokens ?? reported.prompt_tokens ?? reported.inputTokens ?? reported.tokens ?? NaN
  );
  const estimated = !Number.isFinite(input);
  const promptTokens = estimated ? Math.ceil(JSON.stringify(body).length / 4) : input;
  const output = Number(reported.output_tokens ?? reported.completion_tokens ?? 0);
  const usage = {
    prompt_tokens: promptTokens,
    completion_tokens: Number.isFinite(output) ? output : 0,
    cost: promptTokens * DECISION_INPUT_PRICE_PER_TOKEN,
  };
  if (estimated) usage.estimated = true;
  recordUsage(usage);
  return usage;
}

// ---------------------------------------------------------------------------
// Dry run: a uniform distribution per question, so an architecture that decides
// still wakes offline. Uniform is the honest offline answer — maximum entropy,
// zero confidence — and never accidentally reads as evidence.
// ---------------------------------------------------------------------------

function dryDecide({ spec, state, questions }) {
  const answers = {};
  for (const [key, q] of Object.entries(questions)) {
    answers[key] = dryAnswer(q);
  }
  const promptTokens = Math.ceil(JSON.stringify({ state, questions }).length / 4);
  const usage = { prompt_tokens: promptTokens, completion_tokens: 0, cost: 0 };
  recordUsage(usage);
  return { answers, usage, latencyMs: 0, model: spec?.model || 'dry-decide' };
}

function dryAnswer(q) {
  const type = q?.type;
  // A noul is a probability of yes and carries no confidence — offline it is the
  // coin flip, which is also what a uniform distribution means here.
  if (type === 'noul') return { type: 'noul', noul: 0.5 };
  if (type === 'score') {
    // The real answer keys `legend` and `probabilities` by level INDEX, not by
    // the level's text; the dry answer keeps that shape so a caller written
    // against dry-run still parses a live reply.
    const levels = Array.isArray(q.criteria) ? q.criteria : [];
    const n = levels.length || 2;
    const p = 1 / n;
    const probabilities = {};
    const legend = {};
    for (let i = 0; i < n; i += 1) {
      probabilities[String(i)] = p;
      legend[String(i)] = levels[i] ?? String(i);
    }
    return { type: 'score', score: (n - 1) / 2, confidence: 0, legend, probabilities };
  }
  // choice (and anything unrecognised, read as a choice over its criteria)
  const options = q?.criteria && typeof q.criteria === 'object' ? Object.keys(q.criteria) : [];
  const n = options.length || 1;
  const p = 1 / n;
  const probabilities = {};
  options.forEach(option => { probabilities[option] = p; });
  return { type: 'choice', choice: options[0] ?? null, confidence: 0, probabilities };
}
