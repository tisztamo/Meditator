// Browser-side voice helpers for the Studio — pure and framework-free, like
// helpers.js. They are the client half of Voice Mode (doc/studio.md): recording a
// microphone and playing synthesized speech. The OpenAI key never reaches the
// browser; these call the supervisor's gated /studio/voice/* proxy (server.js →
// voice.js), so they speak only to same-origin endpoints.

/** POST recorded audio to the supervisor; resolve the transcript text. */
export async function transcribe(blob) {
  const res = await fetch("/studio/voice/stt", {
    method: "POST",
    headers: { "Content-Type": blob.type || "audio/webm" },
    body: blob,
  });
  if (!res.ok) throw new Error((await errOf(res)) || `transcription failed (${res.status})`);
  const data = await res.json();
  return ((data && data.text) || "").trim();
}

/** POST text; resolve an object-URL for the synthesized mp3 (caller revokes it). */
export async function synthesize(text, voice) {
  const res = await fetch("/studio/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voice || undefined }),
  });
  if (!res.ok) throw new Error((await errOf(res)) || `text-to-speech failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

async function errOf(res) {
  try { const j = await res.json(); return j && j.error; } catch { return null; }
}

/** Is microphone capture usable here? Needs a secure context (https or localhost)
 *  and MediaRecorder — false on older or insecure setups, so the UI can hide the mic. */
export function micSupported() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
    && typeof window !== "undefined" && typeof window.MediaRecorder === "function";
}

function pickMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  return cands.find(c => MediaRecorder.isTypeSupported(c)) || "";
}

/**
 * A one-shot microphone recorder. start() opens the mic and begins capturing;
 * stop() resolves the recorded Blob and releases the mic; cancel() discards. It
 * picks a container the browser can actually record (webm/opus on Chrome and
 * Android, mp4/aac on Safari/iOS) — all of which the transcription API accepts.
 */
export class Recorder {
  constructor() { this.rec = null; this.chunks = []; this.stream = null; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    this.rec = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start();
  }

  recording() { return !!this.rec && this.rec.state === "recording"; }

  stop() {
    return new Promise(resolve => {
      if (!this.rec) return resolve(null);
      const rec = this.rec;
      rec.onstop = () => {
        const type = rec.mimeType || (this.chunks[0] && this.chunks[0].type) || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        this._release();
        resolve(blob);
      };
      try { rec.stop(); } catch { this._release(); resolve(null); }
    });
  }

  cancel() { try { this.rec && this.rec.state !== "inactive" && this.rec.stop(); } catch { /* gone */ } this._release(); }

  _release() {
    try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch { /* gone */ }
    this.stream = null; this.rec = null;
  }
}

/**
 * A sequential text-to-speech queue. enqueue() adds a passage; the queue
 * synthesizes and plays each in order so two utterances never overlap. onState
 * reports whether audio is currently playing (so the UI can show a speaking
 * indicator); onError surfaces a failed synth/play without stalling the queue.
 */
export class SpeechQueue {
  constructor({ voice = null, onState = () => {}, onError = () => {} } = {}) {
    this.voice = voice; this.onState = onState; this.onError = onError;
    this.q = []; this.busy = false; this.audio = null; this.stopped = false;
  }

  enqueue(text) {
    const t = (text || "").trim();
    if (!t) return;
    this.stopped = false;
    this.q.push(t);
    this._pump();
  }

  async _pump() {
    if (this.busy) return;
    if (!this.q.length) { this.onState(false); return; }
    this.busy = true; this.onState(true);
    const text = this.q.shift();
    let url = null;
    try {
      url = await synthesize(text, this.voice);
      if (!this.stopped) await this._play(url);
    } catch (e) { this.onError(e); }
    if (url) URL.revokeObjectURL(url);
    this.audio = null; this.busy = false;
    if (!this.stopped && this.q.length) this._pump();
    else this.onState(false);
  }

  _play(url) {
    return new Promise(resolve => {
      const a = new Audio(url);
      this.audio = a;
      a.onended = resolve;
      a.onerror = resolve;
      const p = a.play();
      if (p && p.catch) p.catch(resolve);
    });
  }

  /** Silence everything: clear the queue and stop the current playback. */
  stop() {
    this.stopped = true; this.q = [];
    if (this.audio) { try { this.audio.pause(); } catch { /* gone */ } this.audio = null; }
    this.busy = false;
    this.onState(false);
  }
}

// iOS/Safari (and some mobile browsers) block audio that isn't started from a user
// gesture. The mind speaks on its own schedule, so its first reply could be muted.
// We sidestep that by playing a single, near-silent clip during a real gesture
// (entering Voice Mode, tapping the mic) — after which the page is allowed to play
// audio it initiates. A tiny in-memory WAV avoids any network round-trip.
let _silentUrl = null;
function silentUrl() {
  if (_silentUrl) return _silentUrl;
  // 8 kHz, mono, 8-bit, one sample of silence (0x80) — a complete 45-byte WAV.
  const b = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 37, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,           // RIFF....WAVE
    0x66, 0x6d, 0x74, 0x20, 16, 0, 0, 0, 1, 0, 1, 0,                        // fmt  / PCM / mono
    0x40, 0x1f, 0, 0, 0x40, 0x1f, 0, 0, 1, 0, 8, 0,                         // 8000 Hz, 8-bit
    0x64, 0x61, 0x74, 0x61, 1, 0, 0, 0, 0x80,                               // data / one sample
  ]);
  _silentUrl = URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
  return _silentUrl;
}

/** Best-effort: unlock audio playback from within a user gesture. Never throws. */
export function primeAudio() {
  try {
    if (typeof Audio === "undefined") return;
    const a = new Audio(silentUrl());
    a.volume = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  } catch { /* unsupported or blocked — fall back to best-effort playback */ }
}
