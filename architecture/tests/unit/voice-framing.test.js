// An external human voice is framed for the attention frame in the mind's own
// language — "<name> says: …" in English, "Margit azt mondja: …" in Hungarian — so a
// localized mind doesn't hear an English "says" intruding on its thinking. The speaker
// is named from the interlocutor (`from`) and the language is stamped from the mind's
// lang="…" (`lang`) where the voice enters (mWs/mConsole). See
// InterruptRecord.renderForFrame + VOICE_FRAMING, and langOf (the shared ambient-language
// read, src/mindComponents/i18n.js).
import { test, expect } from "bun:test";
import { InterruptRecord, voiceFraming } from "../../../src/infrastructure/interruptRecord.js";
import { langOf } from "../../../src/mindComponents/i18n.js";

const frame = (o) => new InterruptRecord({ source: "X", salience: 1, ...o }).renderForFrame();

test("a named voice is framed '<name> says:' in English by default (no lang)", () => {
  expect(frame({ type: "UserInput", reason: "hi", from: "Kris" })).toBe('Kris says: "hi"');
});

test("English is unchanged — named and anonymous (backward compatible)", () => {
  expect(frame({ type: "UserInput", reason: "hi", from: "Kris", lang: "en" })).toBe('Kris says: "hi"');
  expect(frame({ type: "ConsoleInput", reason: "hi", from: null, lang: "en" })).toBe('Someone says: "hi"');
});

test("Hungarian frames the voice in Hungarian (named and anonymous)", () => {
  expect(frame({ type: "UserInput", reason: "Jó reggelt!", from: "Margit", lang: "hu" }))
    .toBe('Margit azt mondja: "Jó reggelt!"');
  expect(frame({ type: "ConsoleInput", reason: "Helló", from: null, lang: "hu" }))
    .toBe('Valaki azt mondja: "Helló"');
});

test("other common languages localize the verb", () => {
  expect(frame({ type: "UserInput", reason: "x", from: "A", lang: "de" })).toBe('A sagt: "x"');
  expect(frame({ type: "UserInput", reason: "x", from: "A", lang: "fr" })).toBe('A dit: "x"');
  expect(frame({ type: "UserInput", reason: "x", from: "A", lang: "ru" })).toBe('A говорит: "x"');
});

test("a lang tag matches on its primary subtag; unknown/empty falls back to English", () => {
  expect(voiceFraming("hu-HU")).toBe(voiceFraming("hu"));
  expect(voiceFraming("HU")).toBe(voiceFraming("hu"));
  expect(voiceFraming("xx")).toBe(voiceFraming("en"));
  expect(voiceFraming(null)).toBe(voiceFraming("en"));
});

test("non-voice stimuli are returned verbatim, never framed as a voice", () => {
  expect(frame({ type: "Time-Based", reason: "the hour turns", lang: "hu" })).toBe("the hour turns");
});

test("langOf reads the nearest ancestor's lang, defaulting to English", () => {
  document.body.innerHTML = `<div lang="hu"><span id="inner">x</span></div><span id="bare">y</span>`;
  expect(langOf(document.getElementById("inner"))).toBe("hu");
  expect(langOf(document.getElementById("bare"))).toBe("en");
});
