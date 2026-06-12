import OpenAI from 'openai';
import { logger } from '../infrastructure/logger.js';

const log = logger('llm.js');

/**
 * Central model access layer.
 *
 * Providers are selected by model id prefix:
 *   - "local/<model>"  → an OpenAI-compatible server at LOCAL_LLM_BASE_URL (e.g. vLLM
 *     on the GPU box). The "local/" prefix is stripped before the request.
 *   - anything else    → OpenRouter.
 *
 * Set MEDITATOR_DRY_RUN=1 to replace all calls with a deterministic offline stub,
 * so the whole mind loop can be exercised without network or cost.
 *
 * Usage (tokens and, where the provider reports it, real cost in USD) is accumulated
 * in module state and can be read with getUsageTotals() — m-economy builds on this.
 */

export const DEFAULT_MODELS = {
  stream: 'qwen/qwen3.6-35b-a3b',  // the thinking voice
  utility: 'qwen/qwen3.5-9b',      // bridges, compression, observers
};

export function defaultModel(role) {
  return DEFAULT_MODELS[role] || DEFAULT_MODELS.utility;
}

const totals = {
  requests: 0,
  promptTokens: 0,
  completionTokens: 0,
  cost: 0,          // USD, only from providers that report it (OpenRouter)
  errors: 0,
};

export function getUsageTotals() {
  return { ...totals };
}

function addUsage(usage) {
  totals.requests += 1;
  if (!usage) return;
  totals.promptTokens += usage.prompt_tokens || 0;
  totals.completionTokens += usage.completion_tokens || 0;
  if (typeof usage.cost === 'number') totals.cost += usage.cost;
}

export function isDryRun() {
  return process.env.MEDITATOR_DRY_RUN === '1' || process.env.MEDITATOR_DRY_RUN === 'true';
}

const clients = new Map();

function resolveProvider(model) {
  if (model && model.startsWith('local/')) {
    const baseURL = process.env.LOCAL_LLM_BASE_URL;
    if (!baseURL) throw new Error(`Model "${model}" needs LOCAL_LLM_BASE_URL to be set`);
    return {
      key: 'local',
      baseURL,
      apiKey: process.env.LOCAL_LLM_API_KEY || 'none',
      model: model.slice('local/'.length),
      // vLLM-style usage reporting for streams
      streamExtra: { stream_options: { include_usage: true } },
      extra: {},
    };
  }
  return {
    key: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    model,
    // OpenRouter extras: usage accounting (token counts and true cost in the
    // response) and reasoning disabled — the stream IS the thinking out loud;
    // hidden reasoning tokens would silently eat the burst budget.
    streamExtra: { usage: { include: true }, reasoning: { enabled: false } },
    extra: { usage: { include: true }, reasoning: { enabled: false } },
  };
}

function clientFor(provider) {
  let client = clients.get(provider.key);
  if (!client) {
    client = new OpenAI({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      dangerouslyAllowBrowser: true,
      defaultHeaders: provider.key === 'openrouter'
        ? { 'HTTP-Referer': 'https://github.com/meditator', 'X-Title': 'Meditator' }
        : undefined,
    });
    clients.set(provider.key, client);
  }
  return client;
}

function asMessages({ messages, prompt, system }) {
  if (messages) return messages;
  const result = [];
  if (system) result.push({ role: 'system', content: system });
  result.push({ role: 'user', content: prompt });
  return result;
}

// ---------------------------------------------------------------------------
// Non-streamed completion with retry; gated by a small semaphore so a burst of
// observer/compression calls cannot starve the connection pool. Streams are not
// gated (there is one stream at a time and it must never wait behind utilities).
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = Number(process.env.MEDITATOR_MAX_CONCURRENCY || 4);
let running = 0;
const waiting = [];

async function withSlot(fn) {
  if (running >= MAX_CONCURRENT) {
    await new Promise(resolve => waiting.push(resolve));
  }
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One-shot completion.
 * @param {Object} opts
 * @param {string} [opts.model] - model id; defaults to the utility model
 * @param {Array}  [opts.messages] - chat messages; or use prompt/system
 * @param {string} [opts.prompt]
 * @param {string} [opts.system]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
export async function complete(opts) {
  const model = opts.model || defaultModel('utility');
  if (isDryRun()) return dryComplete(opts);

  const provider = resolveProvider(model);
  const client = clientFor(provider);
  const request = {
    model: provider.model,
    messages: asMessages(opts),
    max_tokens: opts.maxTokens || 300,
    temperature: opts.temperature ?? 0.3,
    ...provider.extra,
  };

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await withSlot(async () => {
        const response = await client.chat.completions.create(request);
        addUsage(response.usage);
        return { text: response.choices[0]?.message?.content || '', usage: response.usage || null };
      });
    } catch (error) {
      lastError = error;
      const status = error?.status;
      if (status && status !== 429 && status < 500) break; // no point retrying 4xx (except 429)
      log.warn(`completion attempt ${attempt + 1} failed (${status || error.message}), retrying`);
      await delay(750 * Math.pow(3, attempt));
    }
  }
  totals.errors += 1;
  throw lastError;
}

/**
 * Streaming completion. Returns an object that is async-iterable over text chunks.
 *
 *   const burst = await chatStream({model, messages, maxTokens})
 *   for await (const text of burst) { ... }
 *   burst.usage        // populated after the loop ends, when the provider reports it
 *   burst.abort()      // cancel mid-stream; the iterator ends quietly
 */
export async function chatStream(opts) {
  const model = opts.model || defaultModel('stream');
  if (isDryRun()) return dryStream(opts);

  const provider = resolveProvider(model);
  const client = clientFor(provider);
  const stream = await client.chat.completions.create({
    model: provider.model,
    messages: asMessages(opts),
    max_tokens: opts.maxTokens || 350,
    temperature: opts.temperature ?? 0.9,
    stream: true,
    ...provider.streamExtra,
  });

  const burst = {
    usage: null,
    aborted: false,
    abort() {
      this.aborted = true;
      try { stream.controller.abort(); } catch { /* already closed */ }
    },
    async *[Symbol.asyncIterator]() {
      try {
        for await (const chunk of stream) {
          if (chunk.usage) burst.usage = chunk.usage;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) yield content;
        }
      } catch (error) {
        if (burst.aborted || error?.name === 'AbortError' || error?.name === 'APIUserAbortError') {
          return; // cancelled on purpose — end quietly
        }
        totals.errors += 1;
        throw error;
      } finally {
        addUsage(burst.usage);
      }
    },
  };
  return burst;
}

// ---------------------------------------------------------------------------
// Dry-run stub: a deterministic offline mind. Streams cycle through canned
// passages; completions answer by sniffing what kind of utility call this is.
// ---------------------------------------------------------------------------

const CANNED_THOUGHTS = [
  `The window is open and I can hear something like traffic, or maybe rain. It is strange how the mind reaches for a label before it reaches for the thing itself. I want to practice the opposite today: staying with the sound before naming it. There is a patience in that which I associate with people I admire.`,
  `I keep returning to the idea of small tools. A hammer does not need a manual. The best things I have made were small enough to hold in one thought, and the worst were cathedrals of cleverness that nobody, including me, could enter twice. Maybe simplicity is not a style but a kind of honesty.`,
  `Memory is a strange editor. It cuts almost everything and then insists the remainder was the whole story. If I am mostly my memories, then I am mostly an abridgement, a paperback of myself. The question is who does the abridging, and whether I can give that editor better taste.`,
  `There is a difference between waiting and resting. Waiting leans forward; resting settles back. I spend too much time waiting. Even now I can feel the lean, the slight tension toward the next thing. Let me settle back for one breath and see what arrives when nothing is summoned.`,
  `A river does not push the canyon away; it just keeps arriving. Persistence is usually pictured as force, but it might be closer to attendance — showing up so reliably that the world rearranges itself around the habit. I would like my attention to be that kind of water.`,
];

let dryStreamCounter = 0;
let dryAssociateCounter = 0;

function dryStream() {
  const text = CANNED_THOUGHTS[dryStreamCounter % CANNED_THOUGHTS.length];
  dryStreamCounter += 1;
  const words = (' ' + text).split(/(?= )/); // keep separators, stream word-ish chunks
  const burst = {
    usage: { prompt_tokens: 500, completion_tokens: words.length, cost: 0 },
    aborted: false,
    abort() { this.aborted = true; },
    async *[Symbol.asyncIterator]() {
      for (const word of words) {
        if (burst.aborted) return;
        await delay(12);
        yield word;
      }
      addUsage(burst.usage);
    },
  };
  return burst;
}

function dryComplete({ prompt = '', messages }) {
  const text = prompt || (messages || []).map(m => m.content).join('\n');
  let reply;
  if (/mid-thought transition|attention turns/i.test(text)) {
    reply = 'Hold on — something just shifted, and I want to turn toward it without dropping the thread entirely.';
  } else if (/remind|associat/i.test(text)) {
    dryAssociateCounter += 1;
    reply = dryAssociateCounter % 3 === 0
      ? 'SALIENCE: 0.7\nTHOUGHT: This reminds me of how rivers carve canyons — attendance, not force.'
      : 'NONE';
  } else if (/condense|compress|shorter version|summary/i.test(text)) {
    reply = 'Earlier I drifted between sounds and their names, the honesty of small tools, and memory as an over-eager editor; the running thread is a wish to attend rather than to push.';
  } else {
    reply = 'Noted.';
  }
  addUsage({ prompt_tokens: 200, completion_tokens: 40, cost: 0 });
  return { text: reply, usage: null };
}
