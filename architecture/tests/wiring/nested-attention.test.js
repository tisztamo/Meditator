// Nested attention arbitration — m-region + nested m-interrupts DOM wiring.
import { test, expect, beforeAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { InterruptRecord } from "../../../src/infrastructure/interruptRecord.js";

let global, local, regionSrc, topSrc;

function bid(el, salience, reason) {
    el.dispatchEvent(new CustomEvent("interrupt-request", {
        bubbles: true,
        detail: new InterruptRecord({ source: "Observer", type: "Test", reason, salience }),
    }));
}

beforeAll(async () => {
    document.body.innerHTML = `
      <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="9"></m-interrupts>
      <span name="top-src"></span>
      <m-region name="drift">
        <m-interrupts gain="0.5" threshold="0.4" rateLimit="0s"></m-interrupts>
        <span name="src"></span>
      </m-region>
    `;
    await loadMindComponents(document);
    await delay(50);

    global = document.querySelector('m-interrupts[name="attention"]');
    local = document.querySelector("m-region m-interrupts");
    regionSrc = document.querySelector('m-region [name="src"]');
    topSrc = document.querySelector('[name="top-src"]');
});

test("components upgrade and nest correctly", () => {
    expect(global?.on).toBeTruthy();
    expect(local?.on).toBeTruthy();
    expect(regionSrc).toBeTruthy();
    expect(topSrc).toBeTruthy();
    expect(local._region?.localName).toBe("m-region");
    expect(global._region).toBeFalsy();
});

test("region bid is re-weighted and promoted to global arbiter", () => {
    bid(regionSrc, 0.8, "a strong drift");
    expect(local.pending.length).toBe(0);
    const promoted = global.takePending();
    expect(promoted.length).toBe(1);
    expect(Math.abs(promoted[0].salience - 0.4)).toBeLessThan(1e-9);
});

test("locally dropped bid does not leak upward", () => {
    bid(regionSrc, 0.3, "a faint drift below the faculty's bar");
    expect(global.takePending().length).toBe(0);
});

test("top-level bid reaches global unchanged", () => {
    bid(topSrc, 0.7, "a direct stimulus");
    const top = global.takePending();
    expect(top.length).toBe(1);
    expect(Math.abs(top[0].salience - 0.7)).toBeLessThan(1e-9);
});
