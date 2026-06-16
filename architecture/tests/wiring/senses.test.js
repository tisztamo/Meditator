// m-sense DOM wiring — feel() bids into the global arbiter.
import { test, expect, beforeAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let attention, daylight, weather, feed;

beforeAll(async () => {
    document.body.innerHTML = `
      <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
      <m-daylight name="daylight" salience="0.4" salienceShift="0.6"></m-daylight>
      <m-weather name="weather"></m-weather>
      <m-feed name="news"></m-feed>
    `;
    await loadMindComponents(document);
    await delay(50);

    attention = document.querySelector('m-interrupts[name="attention"]');
    daylight = document.querySelector("m-daylight");
    weather = document.querySelector("m-weather");
    feed = document.querySelector("m-feed");
});

test("sense components upgrade; unconfigured senses stay dormant", () => {
    expect(typeof daylight?.onSense).toBe("function");
    expect(typeof weather?.feel).toBe("function");
    expect(weather._timer).toBeNull();
    expect(feed._timer).toBeNull();
});

test("first daylight reading is a salient External band change", () => {
    daylight.onSense();
    const q = attention.takePending();
    const first = q[0] || {};
    expect(q.length).toBe(1);
    expect(first.source).toBe("External");
    expect(first.type).toBe("Sense-daylight");
    expect(Math.abs(first.salience - 0.6)).toBeLessThan(1e-9);
    expect(first.urgent).toBe(false);
    expect((first.reason || "").length).toBeGreaterThan(20);
    expect(/\d\d:\d\d/.test(first.reason || "")).toBe(false);
});

test("second daylight reading is ambient with fresh prose", () => {
    attention.takePending();
    daylight.onSense();
    const first = attention.takePending()[0] || {};
    daylight.onSense();
    const second = attention.takePending()[0] || {};
    expect(second.salience).toBeLessThan(0.6);
    expect(second.salience).toBeGreaterThanOrEqual(0.32 - 1e-9);
    expect(second.salience).toBeLessThanOrEqual(0.48 + 1e-9);
    expect(second.reason).not.toBe(first.reason);
});

test("feed-style ambient bid stays in the ambient band", () => {
    feed.feel("A scrap of the world drifts past.", {});
    const ambient = attention.takePending()[0] || {};
    expect(ambient.source).toBe("External");
    expect(ambient.urgent).toBe(false);
    expect(ambient.salience).toBeGreaterThanOrEqual(0.32 - 1e-9);
    expect(ambient.salience).toBeLessThanOrEqual(0.48 + 1e-9);
});
