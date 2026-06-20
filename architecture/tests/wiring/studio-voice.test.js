// Voice Mode (studio-voice): the large-button conversation overlay. We drive it
// through the fake hub (real StudioConn topic fan-out, socket stubbed) and assert
// it reveals its launch button only when voice is usable, opens/closes, builds the
// conversation from your messages and the mind's spoken passages, seals a passage
// on a type-switch, reads aloud only when asked, and shows a thinking-vs-speaking
// cue. Audio/network are never touched (read-aloud is verified with a stub queue).
import "./setup.js";
import { test, expect } from "bun:test";
import { delay } from "./setup.js";
import { mountHub } from "./studioHarness.js";

// Make the mic look available so onVoiceInfo() enables the launch button.
globalThis.window.MediaRecorder = class { static isTypeSupported() { return true; } };
try {
  Object.defineProperty(globalThis.navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [] }) }, configurable: true });
} catch { /* already defined */ }
await import("../../../src/studio/ui/studioVoice.js");

const settle = () => delay(14);
const VOICE = { enabled: true, voices: ["marin", "coral"], defaultVoice: "marin" };

function mount() {
  const { hub } = mountHub(`<button id="voicebtn" hidden></button><studio-voice></studio-voice>`);
  return { hub, btn: document.getElementById("voicebtn"), el: document.querySelector("studio-voice") };
}

test("launch button stays hidden until the supervisor reports voice is usable", async () => {
  const { hub, btn } = mount();
  await settle();
  expect(btn.hidden).toBe(true);
  hub.pub("voice", VOICE);
  await settle();
  expect(btn.hidden).toBe(false);
});

test("the launch button opens the overlay; Escape closes it", async () => {
  const { hub, btn, el } = mount();
  hub.pub("voice", VOICE);
  await settle();
  btn.click();
  expect(el.classList.contains("show")).toBe(true);
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  expect(el.classList.contains("show")).toBe(false);
});

test("your spoken words appear as a 'you' bubble (from /conn/youSaid)", async () => {
  const { hub, el } = mount();
  hub.pub("voice", VOICE);
  await settle();
  el.open();
  hub.pub("youSaid", "how are you feeling");
  await settle();
  const you = el.querySelector(".voice-row.you .voice-bubble");
  expect(you).toBeTruthy();
  expect(you.textContent).toContain("how are you feeling");
});

test("spoken-aloud fragments accumulate and seal into one mind bubble", async () => {
  const { hub, el } = mount();
  hub.pub("voice", VOICE);
  await settle();
  el.open();
  el.aloudBox.checked = false;                 // no TTS during a structure test
  hub.pub("streamFragment", { kind: "speech", content: "the silence here " });
  hub.pub("streamFragment", { kind: "speech", content: "is not empty" });
  hub.pub("event", { process: "speech", kind: "speaking", speaking: false });
  await settle();
  expect(el.liveMind).toBe(null);
  expect(el.querySelector(".voice-row.mind .voice-said").textContent).toBe("the silence here is not empty");
});

test("a thought fragment seals the open spoken passage (type switch)", async () => {
  const { hub, el } = mount();
  hub.pub("voice", VOICE);
  await settle();
  el.open();
  el.aloudBox.checked = false;
  hub.pub("streamFragment", { kind: "speech", content: "I am here" });
  hub.pub("streamFragment", { kind: "thought", content: "...back to thinking" });
  await settle();
  expect(el.liveMind).toBe(null);
  expect(el.querySelector(".voice-row.mind .voice-said").textContent).toBe("I am here");
});

test("read-aloud enqueues the sealed passage only when the toggle is on", async () => {
  const { hub, el } = mount();
  hub.pub("voice", VOICE);
  await settle();
  el.open();
  const spoken = [];
  el.queue = { enqueue: t => spoken.push(t), stop() {}, voice: null };
  el.aloudBox.checked = true;
  hub.pub("streamFragment", { kind: "speech", content: "hello world" });
  hub.pub("event", { process: "speech", kind: "speaking", speaking: false });
  await settle();
  expect(spoken).toEqual(["hello world"]);
});

test("the status line shows thinking, then speaking when a passage opens", async () => {
  const { hub, el } = mount();
  hub.pub("voice", VOICE);
  await settle();
  el.open();
  el.aloudBox.checked = false;
  hub.pub("streamState", "streaming");
  await settle();
  expect(el.statusEl.hidden).toBe(false);
  expect(el.statusEl.textContent.toLowerCase()).toContain("thinking");
  hub.pub("streamFragment", { kind: "speech", content: "out loud now" });
  await settle();
  expect(el.statusEl.textContent.toLowerCase()).toContain("speaking");
});
