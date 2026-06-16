// Mind-relative stream refs and economy bus wiring.
import { test, expect, beforeAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, stream, memory, lg, economy, arousalSeen;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="off"></m-memory>
        <m-loop-guard name="lg"></m-loop-guard>
        <m-economy name="economy" budget="1.00"></m-economy>
      </m-mind>
    `;

    await loadMindComponents(document);
    await delay(80);

    mind = document.querySelector("m-mind");
    stream = mind.querySelector("m-stream");
    memory = mind.querySelector("m-memory");
    lg = mind.querySelector("m-loop-guard");
    economy = mind.querySelector("m-economy");
    arousalSeen = null;
    await mind.sub("economy/arousal", v => { arousalSeen = v; });
});

test("m-memory and m-loop-guard bind to the mind stream", async () => {
    const text = "the quick brown fox jumps over the lazy dog";
    stream.pub("chunk", text);
    await delay(10);
    expect(memory.getTail().includes(text)).toBe(true);
    expect(lg.window.includes(text)).toBe(true);
});

test("m-economy binds to stream boundaries and publishes arousal", async () => {
    const text = "the quick brown fox jumps over the lazy dog";
    stream.pub("boundary", { reason: "completed", burstIndex: 1, burstChars: text.length });
    await delay(10);
    expect(typeof economy.arousal).toBe("number");
    expect(arousalSeen).not.toBeNull();
});
