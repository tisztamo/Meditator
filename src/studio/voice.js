// The Studio's voice layer — a thin, server-side proxy to OpenAI's speech APIs.
//
// Voice Mode (see doc/studio.md) gives the focused mind an audible voice and lets
// you talk to it instead of typing. The browser must never hold the OpenAI key, so
// the two operations are proxied through the supervisor (which already holds
// OPENAI_API_KEY for image generation) behind the same auth gate as the rest of
// the Studio:
//
//   POST /studio/voice/tts   { text, voice?, instructions? }  -> audio/mpeg bytes
//   POST /studio/voice/stt   <raw audio bytes>                -> { text }
//
// Models (chosen from the current OpenAI docs, June 2026):
//   - TTS: gpt-4o-mini-tts — the newest, most reliable speech model, and the only
//     one that takes an `instructions` parameter, which we use to steer an
//     unhurried, warm, clearly-articulated voice well suited to elderly listeners.
//   - STT: gpt-4o-transcribe — recommended for accuracy, which matters most for
//     slower or less-crisp speech (again, the elderly case we are designing for).
// Both are overridable by env so a deployment can trade cost for quality.

import OpenAI, { toFile } from "openai";

const TTS_MODEL = process.env.STUDIO_TTS_MODEL || "gpt-4o-mini-tts";
const STT_MODEL = process.env.STUDIO_STT_MODEL || "gpt-4o-transcribe";

// gpt-4o-mini-tts voices; the docs recommend `marin`/`cedar` for best quality.
const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"];
const DEFAULT_VOICE = VOICES.includes(process.env.STUDIO_VOICE_NAME) ? process.env.STUDIO_VOICE_NAME : "marin";

// How the mind's voice should sound. Tuned for the interface's audience: an elder
// listening on a phone wants unhurried, warm, plainly-articulated speech.
const DEFAULT_INSTRUCTIONS = process.env.STUDIO_TTS_INSTRUCTIONS ||
  "Speak slowly and clearly in a calm, warm, gentle voice, as if talking with an elder. " +
  "Leave a little space between sentences and articulate each word.";

const MAX_TTS_CHARS = 4000;     // gpt-4o-mini-tts caps input at ~2000 tokens
const MAX_STT_BYTES = 25 * 1024 * 1024;   // OpenAI's transcription file-size limit

/** Voice is available only when there is a key to spend and it isn't switched off.
 *  Read live (not cached) so a test or a restart can toggle it via env. */
export function voiceEnabled() {
  return !!process.env.OPENAI_API_KEY && process.env.STUDIO_VOICE !== "0";
}

/** What the browser is told on connect: whether voice works, and the choices it
 *  may offer. The key and instructions stay server-side. */
export function voiceInfo() {
  return { enabled: voiceEnabled(), voices: VOICES, defaultVoice: DEFAULT_VOICE, ttsModel: TTS_MODEL, sttModel: STT_MODEL };
}

let _client = null;
function client() {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  _client = new OpenAI({ apiKey });
  return _client;
}

/** Map a recorded blob's content-type to a filename extension the API accepts.
 *  Browsers record webm/opus (Chrome, Android) or mp4/aac (Safari, iOS). */
function extFor(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("wav")) return "wav";
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac") || ct.includes("x-m4a")) return "m4a";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("ogg")) return "ogg";
  return "webm";
}

/** POST /studio/voice/tts — synthesize the mind's words. JSON in, mp3 out. */
export async function ttsHandler(req, res) {
  if (!voiceEnabled()) return res.status(503).json({ error: "voice is off — set OPENAI_API_KEY (and don't set STUDIO_VOICE=0)" });
  const body = req.body || {};
  let text = (body.text == null ? "" : String(body.text)).trim();
  if (!text) return res.status(400).json({ error: "no text to speak" });
  if (text.length > MAX_TTS_CHARS) text = text.slice(0, MAX_TTS_CHARS);
  const voice = VOICES.includes(body.voice) ? body.voice : DEFAULT_VOICE;
  const instructions = (typeof body.instructions === "string" && body.instructions.trim())
    ? body.instructions.trim() : DEFAULT_INSTRUCTIONS;
  try {
    const speech = await client().audio.speech.create({ model: TTS_MODEL, voice, input: text, instructions, response_format: "mp3" });
    const buf = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buf);
  } catch (e) {
    return res.status(502).json({ error: `text-to-speech failed: ${e.message}` });
  }
}

/** POST /studio/voice/stt — transcribe what you said. Raw audio in, text out. */
export async function sttHandler(req, res) {
  if (!voiceEnabled()) return res.status(503).json({ error: "voice is off — set OPENAI_API_KEY (and don't set STUDIO_VOICE=0)" });
  const buf = req.body;
  if (!buf || !buf.length) return res.status(400).json({ error: "no audio received" });
  if (buf.length > MAX_STT_BYTES) return res.status(413).json({ error: "recording too large (25 MB limit)" });
  const ct = (req.headers["content-type"] || "audio/webm").split(";")[0].trim();
  try {
    const file = await toFile(buf, `speech.${extFor(ct)}`, { type: ct });
    const tr = await client().audio.transcriptions.create({ file, model: STT_MODEL });
    return res.json({ text: ((tr && tr.text) || "").trim() });
  } catch (e) {
    return res.status(502).json({ error: `transcription failed: ${e.message}` });
  }
}
