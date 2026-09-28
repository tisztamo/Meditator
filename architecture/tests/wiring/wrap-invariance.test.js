// Wrap invariance for the membrane refs (message-rule review §2.10). A faculty
// wrapped in another component must still hear its membrane: m-stream the mind's
// `prompt`, m-speech the mind's interrupt events, m-reason the agent's `turn`. The
// wrapper is a plain Amanita element, so a "../" ref would stop at it.
// unit/ref-hygiene.test.js keeps the source free of such refs; this pins the
// behaviour.
import "./setup.js";
import { test, expect, afterEach } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { stimulus } from "../../../src/infrastructure/interruptRecord.js";

for (const tag of ["m-mind", "m-agent", "x-wrap"]) {
    if (!customElements.get(tag)) customElements.define(tag, class extends A(HTMLElement) {});
}

afterEach(async () => {
    document.body.replaceChildren();
    await delay(20);
});

async function mount(html) {
    document.body.innerHTML = html;
    await loadMindComponents(document);
    await delay(50);
}

test("a wrapped m-stream hears the mind's prompt", async () => {
    await mount(`
      <m-mind name="wrapped-stream">
        <x-wrap name="wrap"><m-stream name="stream"></m-stream></x-wrap>
      </m-mind>`);
    const mind = document.querySelector("m-mind");
    const stream = document.querySelector("m-stream");
    const heard = [];
    stream._startBurst = async payload => { heard.push(payload); };
    mind.pub("prompt", "the frame");
    for (let i = 0; i < 40 && !heard.length; i++) await delay(5);
    expect(heard).toEqual(["the frame"]);
});

test("a wrapped m-speech hears the mind being addressed", async () => {
    await mount(`
      <m-mind name="wrapped-voice">
        <x-wrap name="wrap"><m-speech name="voice"></m-speech></x-wrap>
        <span name="door"></span>
      </m-mind>`);
    const speech = document.querySelector("m-speech");
    const door = document.querySelector('[name="door"]');
    // Sent beside the voice, not inside its wrapper: only the mind sees it bubble.
    door.dispatchEvent(new CustomEvent("interrupt-request", {
        bubbles: true,
        detail: stimulus({ type: "UserInput", source: "WebSocketClient", reason: "hello there", from: "Kris" }),
    }));
    for (let i = 0; i < 40 && !speech._addressed; i++) await delay(5);
    expect(speech._addressed).toEqual({ text: "hello there", from: "Kris" });
});

test("a wrapped m-reason hears the agent's turn", async () => {
    await mount(`
      <m-agent name="wrapped-reason">
        <x-wrap name="wrap"><m-reason name="reason"></m-reason></x-wrap>
      </m-agent>`);
    const agent = document.querySelector("m-agent");
    const reason = document.querySelector("m-reason");
    const turns = [];
    reason._onTurn = turn => turns.push(turn);
    agent.pub("turn", { messages: [] });
    for (let i = 0; i < 40 && !turns.length; i++) await delay(5);
    expect(turns).toEqual([{ messages: [] }]);
});
