// arousalSensitivity honesty (philosophical-review-2026-07-02 finding 7). A tired mind raises
// its own interrupt threshold, so a stimulus a rested mind would have taken passes unfelt — and
// used to do so with no felt OR recorded cause. The global arbiter now announces each such drop
// as a bubbling backstage `muffled` event, and m-memory journals a ⌁ trail: the mind is told
// nothing (it never perceived the stimulus), but its growing isolation gains a recorded reason.
import "./setup.js";
import { test, expect, beforeAll, afterEach } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { InterruptRecord } from "../../../src/infrastructure/interruptRecord.js";

let mind, arbiter, memory, notes;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="off"></m-memory>
        <m-interrupts name="attention" threshold="0.35" arousalSensitivity="0.5" rateLimit="15s"></m-interrupts>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(150);
    mind = document.querySelector("m-mind");
    arbiter = mind.querySelector('[name="attention"]');
    memory = mind.querySelector('[name="memory"]');

    notes = [];
    const orig = memory.note.bind(memory);
    memory.note = (text, opts = {}) => { notes.push({ text, perceived: opts.perceived !== false }); return orig(text, opts); };
});

afterEach(() => { notes.length = 0; arbiter._lastMuffledAt = 0; });

// base threshold 0.35; arousal 0.2 → raised threshold = 0.35 + (1-0.2)*0.5 = 0.75.
const fireStim = salience => mind.dispatchEvent(new CustomEvent("interrupt-request", {
    bubbles: true,
    detail: new InterruptRecord({ source: "Observer", type: "Wander", reason: "an idle drift", salience }),
}));

test("a stimulus a rested mind would take, dropped by low arousal, leaves a ⌁ trail", async () => {
    arbiter._arousal = 0.2;
    fireStim(0.5);                         // >= base 0.35 but < raised 0.75 → muffled
    await delay(10);
    const backstage = notes.filter(n => !n.perceived);
    expect(backstage.length).toBe(1);
    expect(backstage[0].text).toMatch(/tired \(arousal 0\.20\)/i);
    expect(backstage[0].text).toMatch(/passed unfelt/i);
    // …and NOTHING perceived: the mind never saw the stimulus, so it feels nothing.
    expect(notes.filter(n => n.perceived).length).toBe(0);
});

test("a stimulus below the BASE bar is dropped without a muffled trail (arousal didn't cause it)", async () => {
    arbiter._arousal = 0.2;
    fireStim(0.1);                         // < base 0.35 → would be dropped even when rested
    await delay(10);
    expect(notes.filter(n => !n.perceived).length).toBe(0);
});

test("a RESTED mind muffles nothing (threshold never rose)", async () => {
    arbiter._arousal = 1;
    fireStim(0.5);                         // >= base, and rested threshold == base → accepted
    await delay(10);
    expect(notes.filter(n => !n.perceived).length).toBe(0);
});

test("mufflings are throttled — a burst of drops leaves one trail, not a flood", async () => {
    arbiter._arousal = 0.2;
    fireStim(0.5);
    fireStim(0.5);
    fireStim(0.6);
    await delay(10);
    expect(notes.filter(n => !n.perceived).length).toBe(1);   // rateLimit throttles the rest
});
