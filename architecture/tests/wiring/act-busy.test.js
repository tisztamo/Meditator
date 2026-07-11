// A reach the mind FORMS but that m-act HOLDS — because it is already reaching for this
// (per-intent dedup) or every hand's cooldown lane is closed — used to pass in pure silence,
// the documented trigger for the stream to confabulate an outcome (terminal-hand-live-validation.md;
// philosophical-review-2026-07-02 finding 7). It now hands the mind a low-salience felt sense that
// a reach is already in motion — the faculty-level twin of m-terminal's "the desk is still busy…".
// Perceived (⟂), never a deed (nothing reached the world), and throttled so a standing wish is
// felt once, not every cadence.
import "./setup.js";
import { test, expect, beforeAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, act, seen;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1" intentCooldown="15m"></m-act>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(120);
    mind = document.querySelector("m-mind");
    act = mind.querySelector('[name="hands"]');
    seen = [];
    mind.addEventListener("interrupt-request", e => seen.push(e.detail));
});

test("a held reach is felt as in-motion — low-salience, External, no mechanism (One Rule)", () => {
    seen.length = 0;
    act._feelReachInMotion("run the search for balanced numbers");
    expect(seen.length).toBe(1);
    const r = seen[0];
    expect(r.source).toBe("External");                 // reaches the mind as a sensation
    expect(r.salience).toBeLessThanOrEqual(0.25);       // barely registers, like the terminal busy line
    expect(r.urgent).toBe(false);                       // ambient — waits for the next boundary
    expect(r.reason).toMatch(/still busy|already set going|in motion|leave this reach/i);
    // The felt line names no mechanism: no cooldown/dedup/lane/tool.
    expect(r.reason.toLowerCase()).not.toMatch(/cooldown|dedup|lane|tool|ledger|throttle/);
});

test("the same reach within the window is felt once, not every cadence (throttle)", () => {
    seen.length = 0;
    act._feelReachInMotion("count the three-digit cases");
    act._feelReachInMotion("count the three-digit cases");
    act._feelReachInMotion("Count the three-digit cases!");   // normalizes to the same intent
    expect(seen.length).toBe(1);
});

test("a genuinely different reach is felt on its own", () => {
    seen.length = 0;
    act._feelReachInMotion("look up today's weather");
    act._feelReachInMotion("set down the palindrome result");
    expect(seen.length).toBe(2);
});

test("an empty gist produces no phantom sensation", () => {
    seen.length = 0;
    act._feelReachInMotion("");
    act._feelReachInMotion(null);
    expect(seen.length).toBe(0);
});
