// The Studio's server-side voice proxy (src/studio/voice.js): its availability
// gate and request validation, exercised without ever reaching OpenAI. The
// success paths are thin glue over the SDK; what matters here is that voice is
// off without a key, and that bad requests are rejected before any spend.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { voiceEnabled, voiceInfo, ttsHandler, sttHandler } from "../../../src/studio/voice.js";

let savedKey, savedOff;
beforeEach(() => { savedKey = process.env.OPENAI_API_KEY; savedOff = process.env.STUDIO_VOICE; });
afterEach(() => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  if (savedOff === undefined) delete process.env.STUDIO_VOICE; else process.env.STUDIO_VOICE = savedOff;
});

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, jsonBody: undefined,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.jsonBody = o; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    send(b) { this.body = b; return this; },
  };
}

test("voice is off without a key, on with one (unless STUDIO_VOICE=0)", () => {
  delete process.env.OPENAI_API_KEY; delete process.env.STUDIO_VOICE;
  expect(voiceEnabled()).toBe(false);
  process.env.OPENAI_API_KEY = "sk-test";
  expect(voiceEnabled()).toBe(true);
  process.env.STUDIO_VOICE = "0";
  expect(voiceEnabled()).toBe(false);
});

test("voiceInfo advertises the models and a default voice, never the key", () => {
  process.env.OPENAI_API_KEY = "sk-test"; delete process.env.STUDIO_VOICE;
  const info = voiceInfo();
  expect(info.enabled).toBe(true);
  expect(info.voices).toContain(info.defaultVoice);
  expect(info.ttsModel).toBeTruthy();
  expect(info.sttModel).toBeTruthy();
  expect(JSON.stringify(info)).not.toContain("sk-test");
});

test("both handlers refuse with 503 when voice is off", async () => {
  delete process.env.OPENAI_API_KEY;
  const r1 = fakeRes(); await ttsHandler({ body: { text: "hi" } }, r1);
  const r2 = fakeRes(); await sttHandler({ headers: {}, body: Buffer.from([1, 2, 3]) }, r2);
  expect(r1.statusCode).toBe(503);
  expect(r2.statusCode).toBe(503);
});

test("tts rejects empty text with 400 before any API call", async () => {
  process.env.OPENAI_API_KEY = "sk-test"; delete process.env.STUDIO_VOICE;
  const r = fakeRes();
  await ttsHandler({ body: { text: "   " } }, r);
  expect(r.statusCode).toBe(400);
});

test("stt rejects empty audio with 400 and oversize audio with 413", async () => {
  process.env.OPENAI_API_KEY = "sk-test"; delete process.env.STUDIO_VOICE;
  const empty = fakeRes();
  await sttHandler({ headers: {}, body: Buffer.alloc(0) }, empty);
  expect(empty.statusCode).toBe(400);

  const huge = fakeRes();
  await sttHandler({ headers: { "content-type": "audio/webm" }, body: { length: 26 * 1024 * 1024 } }, huge);
  expect(huge.statusCode).toBe(413);
});
