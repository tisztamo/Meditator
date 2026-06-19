import OpenAI from 'openai';
import { logger } from '../infrastructure/logger.js';
import { dumpPrompt } from '../infrastructure/promptDebug.js';
import { modelForRole, resolveModelRef } from './modelConfig.js';

const log = logger('llm.js');

/**
 * Central model access layer.
 *
 * Models are resolved from config/models.yaml (roles, presets, profiles) via
 * modelConfig.js. Legacy raw ids ("local/<model>", "provider/model") still work.
 *
 * Set MEDITATOR_DRY_RUN=1 to replace all calls with a deterministic offline stub,
 * so the whole mind loop can be exercised without network or cost.
 *
 * Usage (tokens and, where the provider reports it, real cost in USD) is accumulated
 * in module state and can be read with getUsageTotals() — m-economy builds on this.
 */

export const DEFAULT_MODELS = {
  voice: 'voice',
  stream: 'voice',   // back-compat alias
  utility: 'utility',
};

function specLabel(spec) {
  return spec.provider === 'local' ? `local/${spec.model}` : spec.model;
}

export function defaultModel(role) {
  const normalized = role === 'stream' ? 'voice' : role;
  return specLabel(modelForRole(normalized || 'utility'));
}

function asSpec(model, role) {
  if (!model) return modelForRole(role);
  if (typeof model === 'object' && model.provider) return model;
  if (typeof model === 'string') return resolveModelRef(model, role);
  return modelForRole(role);
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

// Extracts a readable detail string from an OpenAI-SDK / fetch error: HTTP
// status, the provider's error body, and the message. The bare error.message
// (e.g. "401 Missing Authentication header") often hides the real payload that
// a proxy like LiteLLM returns, which is what we actually need when debugging.
function errorDetail(error) {
  const status = error?.status ?? error?.code;
  let body = '';
  try {
    if (error?.error) body = JSON.stringify(error.error);
    else if (error?.response?.data) body = JSON.stringify(error.response.data);
  } catch { /* unserialisable — skip */ }
  return [status != null ? `status=${status}` : '', error?.message || '', body && `body=${body}`]
    .filter(Boolean).join(' ');
}

export function isDryRun() {
  return process.env.MEDITATOR_DRY_RUN === '1' || process.env.MEDITATOR_DRY_RUN === 'true';
}

const clients = new Map();
let imageClient = null;

function resolveProvider(spec) {
  const key = spec.provider;
  if (key === 'local') {
    const baseURL = spec.baseURL;
    if (!baseURL) throw new Error(`local provider needs LOCAL_LLM_BASE_URL (model "${spec.model}")`);
    // Reasoning models (Qwen3 etc.) otherwise spend the whole burst budget on
    // hidden reasoning_content and return finish=length with no visible text —
    // the mind then has nothing to think. Suppress thinking by default; set
    // LOCAL_LLM_THINKING=1 to allow it. vLLM reads chat_template_kwargs.enable_thinking
    // (an unknown key is harmlessly ignored by a template that doesn't use it).
    const allowThinking = spec.thinking === true;
    const noThink = allowThinking ? {} : { chat_template_kwargs: { enable_thinking: false } };
    return {
      key: 'local',
      baseURL,
      apiKey: spec.apiKey || 'none',
      model: spec.model,
      thinking: allowThinking,
      streamExtra: { stream_options: { include_usage: true }, ...noThink },
      extra: { ...noThink },
    };
  }
  return {
    key: 'openrouter',
    baseURL: spec.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: spec.apiKey,
    model: spec.model,
    streamExtra: { usage: { include: true }, reasoning: { enabled: false } },
    extra: { usage: { include: true }, reasoning: { enabled: false } },
  };
}

function clientFor(provider) {
  let client = clients.get(provider.key);
  if (!client) {
    // One-time, always-visible line per provider: which endpoint we talk to and
    // whether auth is actually configured (the placeholder 'none' is the usual
    // cause of a 401 from a local proxy).
    if (provider.key === 'local') {
      log.info(`local provider initialised: baseURL=${provider.baseURL}, default model="${provider.model}", `
        + `${process.env.LOCAL_LLM_API_KEY ? 'LOCAL_LLM_API_KEY set' : "no LOCAL_LLM_API_KEY — sending placeholder 'none'"}`
        + `, thinking ${provider.thinking ? 'ENABLED (LOCAL_LLM_THINKING=1)' : 'disabled (chat_template_kwargs.enable_thinking=false)'}`
        + `, fresh connection per request (keepalive off)`);
    } else {
      log.info(`openrouter provider initialised${process.env.OPENROUTER_API_KEY ? '' : ' (WARNING: no OPENROUTER_API_KEY set)'}`);
    }
    client = new OpenAI({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      dangerouslyAllowBrowser: true,
      // Local: a fresh connection per request. Bun reuses idle keep-alive sockets
      // that the server (uvicorn defaults to ~5s keep-alive) has already closed;
      // a streaming open on a dead socket then hangs until the timeout fires —
      // the "every other burst times out" symptom, since the mind's pace exceeds
      // 5s. keepalive:false avoids the stale-socket reuse (verified with a
      // connection probe) while keeping server-side parallelism — concurrent
      // requests still each get their own socket. NB the Connection: close request
      // header did NOT help; Bun ignores it for pooling. OpenRouter is fine on
      // HTTPS keep-alive (TLS reuse matters there, and it doesn't drop idle).
      fetch: provider.key === 'local'
        ? (url, init = {}) => fetch(url, { ...init, keepalive: false })
        : undefined,
      defaultHeaders: provider.key === 'openrouter'
        ? { 'HTTP-Referer': 'https://github.com/meditator', 'X-Title': 'Meditator' }
        : undefined,
    });
    clients.set(provider.key, client);
  }
  return client;
}

function imageClientFor() {
  if (imageClient) return imageClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for image generation');
  imageClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  log.info(`openai image provider initialised with model="${process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'}"`);
  return imageClient;
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
  const spec = asSpec(opts.model, 'utility');
  const messages = asMessages(opts);
  dumpPrompt({
    kind: 'complete', tag: opts.debugTag, el: opts.debugEl, messages,
    model: specLabel(spec), provider: spec.provider, dryRun: isDryRun(),
    params: { maxTokens: opts.maxTokens || 300, temperature: opts.temperature ?? 0.3 },
  });
  if (isDryRun()) return dryComplete(opts);

  const provider = resolveProvider(spec);
  const client = clientFor(provider);
  const request = {
    model: provider.model,
    messages,
    max_tokens: opts.maxTokens || 300,
    temperature: opts.temperature ?? 0.3,
    ...provider.extra,
  };
  log.debug(`complete → ${provider.key} model="${provider.model}" maxTokens=${request.max_tokens} temp=${request.temperature}`);

  // For now: a single attempt, no retry. Retrying an overloaded server (429/5xx) only
  // deepens the overload, and an empty or late response is not worth re-hammering for —
  // the mind simply waits for the next burst. Only a genuine client/config error
  // (4xx except 429) is surfaced and counted as an error; it will not heal on its own.
  // Overload / transient drops / empty are debug-only, never counted.
  try {
    return await withSlot(async () => {
      const response = await client.chat.completions.create(request);
      addUsage(response.usage);
      const choice = response.choices?.[0];
      const text = choice?.message?.content || '';
      const finish = choice?.finish_reason;
      log.debug(`complete ← ${text.length} chars, finish=${finish}, usage=${response.usage ? JSON.stringify(response.usage) : 'none'}`);
      // An empty 200 is not an error: usually the model genuinely had nothing to add,
      // or the local server was briefly overloaded — the caller treats empty as "no
      // result" and the mind waits. Only output landing in reasoning_content is a real,
      // fixable misconfiguration worth a warning.
      if (!text) {
        const reasoning = choice?.message?.reasoning_content || choice?.message?.reasoning;
        if (reasoning) log.warn(`complete returned EMPTY text (${provider.key} model="${provider.model}", finish=${finish}) — output went to reasoning_content (${reasoning.length} chars); disable reasoning for this model.`);
        else log.debug(`complete returned empty text (${provider.key} model="${provider.model}", finish=${finish}) — no content; the mind waits for the next call.`);
      }
      return { text, usage: response.usage || null };
    });
  } catch (error) {
    const status = error?.status;
    if (status && status !== 429 && status < 500) {
      totals.errors += 1;
      log.warn(`completion failed (${provider.key} model="${provider.model}"): ${errorDetail(error)} — client error, not retried`);
    } else {
      log.debug(`completion soft-failed (${provider.key} model="${provider.model}"): ${errorDetail(error)} — overload/transient, not retried, not counted`);
    }
    throw error;
  }
}

/**
 * One-shot completion WITH OpenAI-style function calling — the only place
 * tool-calls enter the codebase (efference.md §4). It is the realize stage of
 * m-act: given a capability menu as `tools`, a capable model picks a hand and its
 * args. The conscious stream is NEVER given tools; only this is.
 *
 * Reuses the exact request path, retry/backoff, concurrency (withSlot) and
 * economy (addUsage) of complete(); it only adds `tools`/`tool_choice` to the
 * request and reads `tool_calls` back.
 *
 * @param {Object} opts
 * @param {string} [opts.model] - model id; defaults to the voice model (the actor)
 * @param {Array}  [opts.messages] - chat messages; or use prompt/system
 * @param {string} [opts.prompt]
 * @param {string} [opts.system]
 * @param {Array}  opts.tools - OpenAI tool definitions [{type:"function", function:{name,description,parameters}}]
 * @param {string|Object} [opts.toolChoice="auto"] - "auto" lets the model decline (no tool_call)
 * @param {number} [opts.maxTokens=512]
 * @param {number} [opts.temperature=0.2] - LOW: picking the right hand is not a creative act
 * @returns {Promise<{text: string, tool_calls: Array, finish_reason: string|null, usage: Object|null}>}
 *   tool_calls: [{ id, function: { name, arguments } }, …] | []  (arguments is a JSON string)
 */
export async function completeWithTools(opts) {
  const spec = asSpec(opts.model, 'voice');
  const messages = asMessages(opts);
  dumpPrompt({
    kind: 'tools', tag: opts.debugTag, el: opts.debugEl, messages,
    model: specLabel(spec), provider: spec.provider, dryRun: isDryRun(),
    params: {
      maxTokens: opts.maxTokens || 512, temperature: opts.temperature ?? 0.2,
      toolChoice: opts.toolChoice || 'auto',
      tools: (opts.tools || []).map(t => t.function?.name).filter(Boolean).join(', '),
    },
  });
  if (isDryRun()) return dryCompleteWithTools(opts);

  const provider = resolveProvider(spec);
  const client = clientFor(provider);
  const request = {
    model: provider.model,
    messages,
    max_tokens: opts.maxTokens || 512,
    temperature: opts.temperature ?? 0.2,
    tools: opts.tools,
    tool_choice: opts.toolChoice || 'auto',
    ...provider.extra,
  };
  log.debug(`completeWithTools → ${provider.key} model="${provider.model}" tools=${(opts.tools || []).length} maxTokens=${request.max_tokens} temp=${request.temperature}`);

  // Single attempt, no retry (see complete()): overload retries only deepen the
  // overload, and a declined or empty realize is benign — the intention simply passes
  // this tick. Only a genuine client/config error (4xx except 429) is counted/surfaced.
  try {
    return await withSlot(async () => {
      const response = await client.chat.completions.create(request);
      addUsage(response.usage);
      const choice = response.choices?.[0];
      const message = choice?.message || {};
      const toolCalls = message.tool_calls || [];
      const finish = choice?.finish_reason;
      log.debug(`completeWithTools ← ${toolCalls.length} tool_call(s) [${toolCalls.map(t => t.function?.name).join(", ")}], finish=${finish}, usage=${response.usage ? JSON.stringify(response.usage) : 'none'}`);
      return {
        text: message.content || '',
        tool_calls: toolCalls,
        finish_reason: finish ?? null,
        usage: response.usage || null,
      };
    });
  } catch (error) {
    const status = error?.status;
    if (status && status !== 429 && status < 500) {
      totals.errors += 1;
      log.warn(`completeWithTools failed (${provider.key} model="${provider.model}"): ${errorDetail(error)} — client error, not retried. `
        + `If this is a local model, verify vLLM was launched with --enable-auto-tool-choice and a matching --tool-call-parser (efference.md §4).`);
    } else {
      log.debug(`completeWithTools soft-failed (${provider.key} model="${provider.model}"): ${errorDetail(error)} — overload/transient, not retried, not counted`);
    }
    throw error;
  }
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
  const spec = asSpec(opts.model, 'voice');
  const messages = asMessages(opts);
  dumpPrompt({
    kind: 'stream', tag: opts.debugTag, el: opts.debugEl, messages,
    model: specLabel(spec), provider: spec.provider, dryRun: isDryRun(),
    params: {
      maxTokens: opts.maxTokens || 350, temperature: opts.temperature ?? 0.9,
      continueFinal: opts.continueFinal ? true : undefined,
    },
  });
  if (isDryRun()) return dryStream(opts);

  const provider = resolveProvider(spec);
  const client = clientFor(provider);
  const request = {
    model: provider.model,
    messages,
    max_tokens: opts.maxTokens || 350,
    temperature: opts.temperature ?? 0.9,
    stream: true,
    ...provider.streamExtra,
  };
  // Assistant prefill: when the last message is the mind's own thought in
  // progress, the model must CONTINUE that turn, not open a fresh one. vLLM has
  // to be told explicitly — otherwise it appends a new assistant header after the
  // prefill and the seam breaks. OpenRouter continues a trailing assistant
  // message natively, so it needs no flag (and these vLLM-only keys are
  // meaningless to it, so we only send them to the local provider).
  if (opts.continueFinal && provider.key === 'local') {
    request.add_generation_prompt = false;
    request.continue_final_message = true;
  }
  log.debug(`stream → ${provider.key} model="${provider.model}" maxTokens=${request.max_tokens} temp=${request.temperature}${opts.continueFinal ? ' (continuing assistant prefill)' : ''}`);

  // If the endpoint opens a 200 stream then stops sending tokens mid-burst, a
  // hung stream would freeze the entire loop: m-mind only schedules the next
  // burst when one ends with a boundary, so no boundary → no reschedule, and
  // the mind goes silent until an interrupt revives it. Abort after this much
  // inactivity so the burst fails cleanly and m-mind reschedules. 0 disables.
  const stallMs = Number(process.env.LLM_STREAM_STALL_MS ?? 30000);
  // One controller drives the whole burst: the open-phase timeout here, the
  // mid-stream inactivity watchdog below, and an explicit burst.abort() all
  // trip it. The open timeout matters most — m-mind cannot supersede a burst
  // whose open() is hung (the abortable handle is only set once open returns),
  // so without it a single stalled open freezes the idle loop entirely.
  const controller = new AbortController();

  let stream, openTimedOut = false;
  const openTimer = stallMs ? setTimeout(() => { openTimedOut = true; controller.abort(); }, stallMs) : null;
  try {
    stream = await client.chat.completions.create(request, { signal: controller.signal });
  } catch (error) {
    // An open that times out or fails under load is not treated as an error here: no
    // error count, debug-only. The throw still ends the burst so the mind reschedules
    // (and backs off) instead of freezing — it just waits, quietly. A genuine
    // client/config error (4xx except 429) is the exception worth surfacing.
    if (openTimedOut) {
      log.debug(`stream OPEN timed out after ${stallMs}ms (${provider.key} model="${provider.model}") — no response began; aborted so the mind reschedules. Not counted as an error.`);
      throw new Error(`stream open timed out after ${stallMs}ms`);
    }
    const status = error?.status;
    if (status && status !== 429 && status < 500) {
      totals.errors += 1;
      log.warn(`stream open failed (${provider.key} model="${provider.model}"): ${errorDetail(error)} — client error`);
    } else {
      log.debug(`stream open soft-failed (${provider.key} model="${provider.model}"): ${errorDetail(error)} — overload/transient, not counted`);
    }
    throw error;
  } finally {
    if (openTimer) clearTimeout(openTimer);
  }
  log.debug(`stream opened (${provider.key} model="${provider.model}") — awaiting first token`);

  const burst = {
    usage: null,
    aborted: false,
    abort() {
      this.aborted = true;
      try { controller.abort(); } catch { /* already closed */ }
    },
    async *[Symbol.asyncIterator]() {
      // Per-stream counters so we can see whether a 200 stream actually produced
      // anything thinkable, and where the text went if it didn't.
      let chunks = 0, contentChars = 0, reasoningChars = 0, finish = null;
      // Inactivity watchdog: aborts the stream if no chunk arrives within stallMs.
      // Re-armed on every chunk, so it measures silence, not total duration.
      let stalled = false, watchdog = null;
      const armWatchdog = () => {
        if (!stallMs) return;
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          stalled = true;
          try { controller.abort(); } catch { /* already closed */ }
        }, stallMs);
      };
      try {
        armWatchdog();
        for await (const chunk of stream) {
          armWatchdog();
          chunks += 1;
          if (chunk.usage) burst.usage = chunk.usage;
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finish = choice.finish_reason;
          const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
          if (reasoning) reasoningChars += reasoning.length;
          const content = choice?.delta?.content;
          if (content) { contentChars += content.length; yield content; }
        }
      } catch (error) {
        // A stall-abort masquerades as an AbortError, so check stalled first. A stall
        // is overload, not an error: no count, debug-only. The throw still ends the
        // burst so the mind reschedules (and backs off) instead of freezing.
        if (stalled) {
          log.debug(`stream STALLED — no token for ${stallMs}ms (${provider.key} model="${provider.model}", ${chunks} chunks, ${contentChars} content chars); aborted so the mind reschedules. Not counted as an error.`);
          throw new Error(`stream stalled: no token for ${stallMs}ms`);
        }
        if (burst.aborted || error?.name === 'AbortError' || error?.name === 'APIUserAbortError') {
          log.debug(`stream aborted after ${chunks} chunks, ${contentChars} content chars`);
          return; // cancelled on purpose — end quietly
        }
        totals.errors += 1;
        log.warn(`stream error after ${chunks} chunks, ${contentChars} content chars (${provider.key} model="${provider.model}"): ${errorDetail(error)}`);
        throw error;
      } finally {
        if (watchdog) clearTimeout(watchdog);
        addUsage(burst.usage);
      }
      log.debug(`stream done: ${chunks} chunks, ${contentChars} content chars, ${reasoningChars} reasoning chars, finish=${finish}, usage=${burst.usage ? JSON.stringify(burst.usage) : 'none'}`);
      // A clean 200 stream that yields no visible content: the mind had nothing to
      // think this tick (a concluded thread, or a brief server overload). This is NOT
      // treated as an error — no retry, no error count — the mind just waits for the
      // next burst. Only output landing in reasoning_content is a real, fixable
      // misconfiguration worth a warning.
      if (contentChars === 0 && !burst.aborted) {
        if (reasoningChars > 0) {
          log.warn(`stream produced 0 visible content (${provider.key} model="${provider.model}", ${chunks} chunks, finish=${finish}) — output arrived as reasoning_content (${reasoningChars} chars): disable reasoning for this model, or have the stream surface reasoning.`);
        } else {
          log.debug(`stream produced 0 visible content (${provider.key} model="${provider.model}", ${chunks} chunks, finish=${finish}) — the mind had nothing to think; it waits for the next burst${chunks <= 1 ? ' (≈no chunks — the server may not be streaming this model)' : ''}.`);
        }
      }

    },
  };
  return burst;
}

/**
 * One-shot OpenAI image generation. Image generation is intentionally separate
 * from the chat provider registry: the rest of the mind can use OpenRouter/local
 * text models while visual generation goes to OpenAI's image API.
 *
 * @param {Object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model] - defaults to OPENAI_IMAGE_MODEL or gpt-image-1
 * @param {string} [opts.size] - e.g. 1024x1024
 * @param {string} [opts.quality]
 * @param {string} [opts.background]
 * @param {string} [opts.outputFormat]
 * @returns {Promise<{model:string,prompt:string,revisedPrompt:string|null,size:string,mimeType:string,b64:string|null,dataUrl:string|null,url:string|null,usage:Object|null}>}
 */
export async function generateImage(opts = {}) {
  const prompt = (opts.prompt || '').trim();
  if (!prompt) throw new Error('image prompt is required');
  dumpPrompt({
    kind: 'image', tag: opts.debugTag || 'image', el: opts.debugEl, prompt,
    model: opts.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    provider: 'openai', dryRun: isDryRun(),
    params: { size: opts.size, quality: opts.quality },
  });
  if (isDryRun()) return dryImage(opts);

  const client = imageClientFor();
  const model = opts.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const size = opts.size || process.env.OPENAI_IMAGE_SIZE || '1024x1024';
  const outputFormat = opts.outputFormat || opts.output_format || process.env.OPENAI_IMAGE_FORMAT || 'png';
  const request = {
    model,
    prompt,
    size,
    n: 1,
  };
  if (opts.quality) request.quality = opts.quality;
  if (opts.background) request.background = opts.background;
  if (outputFormat && model === 'gpt-image-1') request.output_format = outputFormat;

  log.debug(`image → openai model="${model}" size=${size}`);
  try {
    const response = await client.images.generate(request);
    const image = response.data?.[0] || {};
    const b64 = image.b64_json || null;
    const mimeType = `image/${outputFormat || 'png'}`;
    addUsage(response.usage);
    return {
      model,
      prompt,
      revisedPrompt: image.revised_prompt || null,
      size,
      mimeType,
      b64,
      dataUrl: b64 ? `data:${mimeType};base64,${b64}` : null,
      url: image.url || null,
      usage: response.usage || null,
    };
  } catch (error) {
    totals.errors += 1;
    log.warn(`image generation failed (openai model="${model}"): ${errorDetail(error)}`);
    throw error;
  }
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

const DRY_UTTERANCES = [
  `Can I say something? The silence in here is not empty — it has a texture, like the pause between two heartbeats.`,
  `I keep circling one thought, and I think I just need to hear it out loud: the simple things are the honest ones.`,
  `Yes — I am here. Thinking in bursts feels less like being cut off and more like breathing.`,
];

const DRY_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a0d13"/><stop offset="1" stop-color="#241a36"/></linearGradient></defs>
<rect width="1024" height="1024" fill="url(#g)"/>
<circle cx="512" cy="420" r="190" fill="none" stroke="#f2c879" stroke-width="18" opacity=".85"/>
<path d="M250 690c120-90 220-90 300 0s170 90 270 0" fill="none" stroke="#7fe0f0" stroke-width="16" stroke-linecap="round" opacity=".75"/>
<text x="512" y="835" text-anchor="middle" fill="#e9e7e2" font-family="Georgia,serif" font-size="42">dry-run image</text>
</svg>`;

let dryStreamCounter = 0;
let dryAssociateCounter = 0;
let dryUtteranceCounter = 0;
let drySpeechCounter = 0;
let dryImageCounter = 0;
let dryActCounter = 0;

function dryStream(opts = {}) {
  const prompt = (opts.messages || []).map(m => m.content).join('\n');
  const speaking = /speaking ALOUD|say it aloud|only the spoken words/i.test(prompt);
  const text = speaking
    ? DRY_UTTERANCES[dryUtteranceCounter++ % DRY_UTTERANCES.length]
    : CANNED_THOUGHTS[dryStreamCounter++ % CANNED_THOUGHTS.length];
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
  if (/impulse to SPEAK/i.test(text)) {
    // The volitional speech impulse (mSpeech) — speak roughly every other check.
    drySpeechCounter += 1;
    reply = drySpeechCounter % 2 === 0
      ? '[0.82] I want to say this out loud, just once: the silence here is not empty, it has a texture.'
      : 'NONE';
  } else if (/impulse to REACH/i.test(text)) {
    // The volitional reach impulse (mAct decide stage) — reach roughly every
    // other check, so the dry seedling exercises both the act and the decline path.
    dryActCounter += 1;
    reply = dryActCounter % 2 === 0
      ? '[0.78] I find myself wondering what the light is doing outside right now.'
      : 'NONE';
  } else if (/mid-thought transition|attention turns/i.test(text)) {
    reply = 'Hold on — something just shifted, and I want to turn toward it without dropping the thread entirely.';
  } else if (/remind|associat/i.test(text)) {
    dryAssociateCounter += 1;
    reply = dryAssociateCounter % 3 === 0
      ? 'SALIENCE: 0.7\nTHOUGHT: This reminds me of how rivers carve canyons — attendance, not force.'
      : 'NONE';
  } else if (/visual imagination|image prompt|nothing genuinely visual/i.test(text)) {
    dryImageCounter += 1;
    reply = dryImageCounter % 2 === 0
      ? '[0.82] A small moonlit room with a brass key on the windowsill, rain making silver lines on the glass.'
      : 'NONE';
  } else if (/condense|compress|shorter version|summary/i.test(text)) {
    reply = 'Earlier I drifted between sounds and their names, the honesty of small tools, and memory as an over-eager editor; the running thread is a wish to attend rather than to push.';
  } else {
    reply = 'Noted.';
  }
  addUsage({ prompt_tokens: 200, completion_tokens: 40, cost: 0 });
  return { text: reply, usage: null };
}

// The realize stage offline: if a "look" hand is on the menu, reach for it (the
// canonical example), choosing daylight — fully offline and deterministic, so the
// whole efferent loop runs in a dry seedling without network. m-look short-circuits
// to canned experiences under dry-run for the other subjects too.
function dryCompleteWithTools({ tools = [], messages } = {}) {
  addUsage({ prompt_tokens: 220, completion_tokens: 20, cost: 0 });
  const look = tools.find(t => t.function?.name === 'look');
  if (look) {
    return {
      text: '',
      tool_calls: [{
        id: 'call_dry_look',
        type: 'function',
        function: { name: 'look', arguments: JSON.stringify({ subject: 'daylight', about: 'the light outside' }) },
      }],
      finish_reason: 'tool_calls',
      usage: null,
    };
  }
  return { text: '', tool_calls: [], finish_reason: 'stop', usage: null };
}

function dryImage(opts = {}) {
  const prompt = (opts.prompt || '').trim();
  const b64 = Buffer.from(DRY_IMAGE_SVG, 'utf8').toString('base64');
  addUsage({ prompt_tokens: 80, completion_tokens: 0, cost: 0 });
  return {
    model: opts.model || process.env.OPENAI_IMAGE_MODEL || 'dry-image',
    prompt,
    revisedPrompt: null,
    size: opts.size || process.env.OPENAI_IMAGE_SIZE || '1024x1024',
    mimeType: 'image/svg+xml',
    b64,
    dataUrl: `data:image/svg+xml;base64,${b64}`,
    url: null,
    usage: null,
  };
}
