// The voice→memory wire lives in the architecture, not in either component:
// m-speech fires a transient `spoken` event; m-memory subscribes via `spokenSrc`
// (an `@spoken` event ref, auto-discovered from the voice's name, or set explicitly).
// This is what lets memory be replaced, or several memories run at once, without the
// voice knowing memory exists. An event is never replayed, so memory needs no dedupe.
import { test, expect, beforeAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, voice, memory, memory2;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    // memory auto-discovers the voice; memory2 wires the same event explicitly —
    // both paths are exercised, and both are pure subscribers to one producer.
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="off"></m-memory>
        <m-memory name="memory2" persist="off" journal="off"
                  spokenSrc="..m-mind/voice/@spoken"></m-memory>
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

test("an aloud utterance reaches memory by event, not by a method call", async () => {
    const said = "I think the light is different today.";
    voice.fire("spoken", { text: said });
    await delay(10);
    expect(memory.getTail().includes(said)).toBe(true);
    expect(memory.getTail().includes("(aloud)")).toBe(true);
});

test("a second memory alongside records the same utterance (broadcast fan-out)", async () => {
    const said = "And the street is quiet for once.";
    voice.fire("spoken", { text: said });
    await delay(10);
    expect(memory.getTail().includes(said)).toBe(true);
    expect(memory2.getTail().includes(said)).toBe(true);
});

test("a late subscriber is not replayed past utterances (the event is transient)", async () => {
    const earlier = "Said before the latecomer arrived.";
    voice.fire("spoken", { text: earlier });
    await delay(10);

    // A memory that subscribes only now: a *topic* would replay its last value here,
    // forcing a dedupe guard. An *event* has nothing retained to replay, so the
    // latecomer hears only what is said AFTER it begins listening.
    const late = document.createElement("m-memory");
    late.setAttribute("name", "late");
    late.setAttribute("persist", "off");
    late.setAttribute("journal", "off");
    mind.appendChild(late);
    await delay(80);

    const after = "Said after the latecomer arrived.";
    voice.fire("spoken", { text: after });
    await delay(10);

    expect(late.getTail().includes(earlier)).toBe(false);
    expect(late.getTail().includes(after)).toBe(true);
});
