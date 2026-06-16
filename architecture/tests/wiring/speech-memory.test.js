// The voice→memory wire lives in the architecture, not in either component:
// m-speech publishes `spoken`; m-memory subscribes via `spokenSrc` (auto-discovered
// from the voice's name, or set explicitly). This is what lets memory be replaced,
// or several memories run at once, without the voice knowing memory exists.
import { test, expect, beforeAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, voice, memory, memory2;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    // memory auto-discovers the voice; memory2 wires the same topic explicitly —
    // both paths are exercised, and both are pure subscribers to one producer.
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="off"></m-memory>
        <m-memory name="memory2" persist="off" journal="off"
                  spokenSrc="..m-mind/voice/spoken"></m-memory>
        <m-speech name="voice"></m-speech>
      </m-mind>
    `;

    await loadMindComponents(document);
    await delay(120);

    mind = document.querySelector("m-mind");
    voice = mind.querySelector('[name="voice"]');
    memory = mind.querySelector('[name="memory"]');
    memory2 = mind.querySelector('[name="memory2"]');
});

test("an aloud utterance reaches memory by topic, not by a method call", async () => {
    const said = "I think the light is different today.";
    voice.pub("spoken", { text: said, at: 1001 });
    await delay(10);
    expect(memory.getTail().includes(said)).toBe(true);
    expect(memory.getTail().includes("(aloud)")).toBe(true);
});

test("a second memory alongside records the same utterance (broadcast fan-out)", async () => {
    const said = "And the street is quiet for once.";
    voice.pub("spoken", { text: said, at: 1002 });
    await delay(10);
    expect(memory.getTail().includes(said)).toBe(true);
    expect(memory2.getTail().includes(said)).toBe(true);
});

test("a replayed utterance (same timestamp) is recorded only once", async () => {
    const said = "Saying this exactly once.";
    voice.pub("spoken", { text: said, at: 2002 });
    await delay(10);
    voice.pub("spoken", { text: said, at: 2002 }); // same `at` → dedupe guard
    await delay(10);
    const count = memory.getTail().split(said).length - 1;
    expect(count).toBe(1);
});
