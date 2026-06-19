// promptDebug.js
//
// Best-effort, env-gated dump of every prompt the mind actually sends to a
// model — the stream-of-thought bursts AND the small utility calls every other
// mechanism makes (speech impulse + voice, association, memory consolidation,
// the act decide/realize stages, the visual impulse, kb, the bridge). One file
// per call.
//
// OFF by default. Turn on with MEDITATOR_DEBUG_PROMPTS:
//   MEDITATOR_DEBUG_PROMPTS=1            → dump under <cwd>/debug/prompts
//   MEDITATOR_DEBUG_PROMPTS=/some/dir    → dump under that directory
// ('1' | 'true' | 'yes' | 'on' enable the default location; any other non-empty
//  value is taken as the root directory; '' | '0' | 'false' | 'off' disable.)
//
// Layout is chosen so the (many) files are easy to find and to prune:
//
//   <root>/<runId>/<mind>/<tag>/<seq>-<tag>.txt
//
//   runId  one directory per process run (YYYYMMDD-HHMMSS-<pid>) — prune a whole
//          run by deleting its directory; the newest is last alphabetically.
//   mind   the mind's slug, so concurrent minds (Studio) never interleave.
//   tag    the mechanism (stream, speech-voice, associate, memory, act-decide…).
//   seq    a global, zero-padded, monotonically increasing counter, so files
//          sort chronologically both within a tag and when grepped flat.
//
// This module imports nothing from the model layer, so llm.js can import it
// without a cycle. Every write is wrapped: a debug dump must never break a mind.

import fs from 'node:fs';
import path from 'node:path';

const RAW = (process.env.MEDITATOR_DEBUG_PROMPTS || '').trim();
const OFF = new Set(['', '0', 'false', 'off', 'no']);
const ON = new Set(['1', 'true', 'yes', 'on']);

const enabled = !OFF.has(RAW.toLowerCase());
const root = !enabled
  ? null
  : ON.has(RAW.toLowerCase())
    ? path.resolve(process.cwd(), 'debug', 'prompts')
    : path.resolve(RAW);

export function isPromptDebugEnabled() {
  return enabled;
}

// One run id per process, computed once. (new Date() is fine in normal code.)
let runId = null;
function getRunId() {
  if (runId) return runId;
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  runId = `${stamp}-${process.pid}`;
  return runId;
}

let seq = 0;

// Same slug rule as memoryVault.mindHome, so a mind's debug dir matches its
// vault home name. Reads from the nearest <m-mind>; falls back to "mind".
function mindSlug(el) {
  try {
    const mind = el?.closest?.('m-mind');
    const raw = mind?.getAttribute?.('memory') || mind?.getAttribute?.('name') || 'mind';
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mind';
  } catch {
    return 'mind';
  }
}

function safeTag(tag) {
  const t = String(tag || 'misc').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return t || 'misc';
}

function renderMessages(messages = []) {
  return messages.map(m => {
    const note = m.role === 'assistant' ? ' (prefill — continued, not a fresh turn)' : '';
    return `---------------------------------------- [${m.role}]${note}\n${m.content ?? ''}`;
  }).join('\n\n');
}

/**
 * Write one prompt to disk. No-op unless MEDITATOR_DEBUG_PROMPTS is set.
 *
 * @param {Object}  info
 * @param {string}  info.kind     - transport: 'stream' | 'complete' | 'tools' | 'image'
 * @param {string}  [info.tag]    - mechanism label (the directory); defaults to 'misc'
 * @param {*}       [info.el]     - the calling component element (for the mind slug)
 * @param {Array}   [info.messages] - the chat messages being sent
 * @param {string}  [info.prompt] - a bare prompt (image generation)
 * @param {string}  [info.model]  - resolved model label
 * @param {string}  [info.provider] - provider key ('openrouter' | 'local' | 'openai')
 * @param {Object}  [info.params] - extra header fields (maxTokens, temperature, tools…)
 * @param {boolean} [info.dryRun] - whether this run is offline
 */
export function dumpPrompt(info = {}) {
  if (!enabled) return;
  try {
    const tag = safeTag(info.tag);
    const mind = mindSlug(info.el);
    const n = String(++seq).padStart(6, '0');
    const dir = path.join(root, getRunId(), mind, tag);
    fs.mkdirSync(dir, { recursive: true });

    const header = [
      `seq:         ${n}`,
      `time:        ${new Date().toISOString()}`,
      `kind:        ${info.kind || '?'}`,
      `tag:         ${tag}`,
      `mind:        ${mind}`,
      info.model != null ? `model:       ${info.model}` : null,
      info.provider != null ? `provider:    ${info.provider}` : null,
      info.dryRun ? `dryRun:      true` : null,
      ...Object.entries(info.params || {})
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${(k + ':').padEnd(12)} ${v}`),
    ].filter(Boolean).join('\n');

    const body = info.messages
      ? renderMessages(info.messages)
      : `---------------------------------------- [prompt]\n${info.prompt ?? ''}`;

    const content = `${header}\n${'='.repeat(60)}\n${body}\n`;
    fs.writeFileSync(path.join(dir, `${n}-${tag}.txt`), content);
  } catch {
    // Debug logging must never disturb the mind. Swallow everything.
  }
}
