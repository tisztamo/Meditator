// CROWDING — the scarcity price on an attention gate.
//
// `rateLimit` refuses by arrival order: the first bid inside the window wins and
// everything behind it is dropped however loud. The refusal used to teach the gate
// nothing. Now each refusal made FOR LACK OF BUDGET raises that arbiter's own bar,
// and the raise decays on a half-life, so a busy channel admits only better bids
// and a quiet one relaxes back to base by itself.
//
// It is the dual of contactSensitivity: contact pressure says the world is not
// reaching me and LOWERS the bar; crowding says more is reaching me than I can
// pass and RAISES it. These tests pin both the raising and the falling, and the
// two things that must never feed it: a salience drop, and anything urgent.
import "./setup.js";
import { test, expect, beforeAll, beforeEach } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { InterruptRecord } from "../../../src/infrastructure/interruptRecord.js";

let mind, priced, plain;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.innerHTML = `
      <m-mind name="crowding">
        <m-stream name="stream"></m-stream>
        <m-interrupts name="priced" threshold="0.35" rateLimit="15s"
                      crowdSensitivity="0.2" crowdStep="0.25" crowdRelax="90s"></m-interrupts>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(120);
    mind = document.querySelector("m-mind");
    priced = mind.querySelector('[name="priced"]');
});

beforeEach(() => {
    priced.pending.length = 0;
    priced.lastAcceptedAt = 0;
    priced._crowd = 0;
    priced._crowdAt = Date.now();
});

const fire = (salience, extra = {}) => mind.dispatchEvent(new CustomEvent("interrupt-request", {
    bubbles: true,
    detail: new InterruptRecord({
        source: "External", type: "Sense-test", reason: "something out there", salience, ...extra,
    }),
}));

/** Refuse `n` bids for lack of budget: accept one, then bid again inside the window. */
const crowd = (n, salience = 0.5) => {
    fire(salience);                       // accepted, opens the rate-limit window
    for (let i = 0; i < n; i++) fire(salience);   // refused: budget, not merit
};

test("off by default: a gate with no crowdSensitivity never raises its bar", async () => {
    document.body.insertAdjacentHTML("beforeend", `
      <m-mind name="unpriced">
        <m-stream name="s2"></m-stream>
        <m-interrupts name="plain" threshold="0.35" rateLimit="15s"></m-interrupts>
      </m-mind>`);
    await loadMindComponents(document);
    await delay(60);
    const other = document.querySelector('m-mind[name="unpriced"]');
    plain = other.querySelector('[name="plain"]');

    const shout = s => other.dispatchEvent(new CustomEvent("interrupt-request", {
        bubbles: true,
        detail: new InterruptRecord({ source: "External", type: "T", reason: "r", salience: s }),
    }));
    shout(0.5);
    for (let i = 0; i < 6; i++) shout(0.5);
    await delay(10);
    expect(plain._crowd).toBe(0);
    expect(plain.crowdPressure).toBe(0);
    other.remove();
});

test("refusals for lack of budget raise the price; each one by crowdStep", async () => {
    crowd(3);
    await delay(10);
    // Three refusals × 0.25, decayed by ~nothing across a few milliseconds.
    expect(priced._crowd).toBeGreaterThan(0.7);
    expect(priced._crowd).toBeLessThanOrEqual(0.76);
});

test("the price is capped at full pressure however long the rush lasts", async () => {
    crowd(20);
    await delay(10);
    // Not exactly 1: the price decays continuously, so a few milliseconds of test
    // time shave a hair off it. Saturation is the claim, not a magic number.
    expect(priced._crowd).toBeGreaterThan(0.999);
    expect(priced._crowd).toBeLessThanOrEqual(1);
});

test("under load the gate selects by loudness, not by arrival order", async () => {
    crowd(4);                                   // price at ~1 → bar 0.35 + 0.2 ≈ 0.55
    priced.lastAcceptedAt = 0;                  // the budget window has passed
    priced.pending.length = 0;

    fire(0.5);                                  // would have cleared the base bar
    await delay(10);
    expect(priced.pending.length).toBe(0);      // refused: not worth it while busy

    fire(0.7);                                  // worth interrupting a busy mind for
    await delay(10);
    expect(priced.pending.length).toBe(1);
    expect(priced.pending[0].salience).toBeCloseTo(0.7, 5);
});

test("a quiet channel relaxes back to base on the half-life, with no timer", async () => {
    crowd(4);
    expect(priced._crowd).toBeGreaterThan(0.999);

    priced._crowdAt = Date.now() - 90_000;      // one half-life of silence
    priced.lastAcceptedAt = 0;
    fire(0.9);                                  // any bid re-reads (and so decays) the price
    await delay(10);
    expect(priced._crowd).toBeCloseTo(0.5, 2);

    priced._crowdAt = Date.now() - 6 * 90_000;  // six half-lives: effectively home
    priced.lastAcceptedAt = 0;
    priced.pending.length = 0;
    fire(0.4);                                  // under the raised bar, over the base one
    await delay(10);
    expect(priced._crowd).toBeLessThan(0.02);
    expect(priced.pending.length).toBe(1);      // audible again, unaided
});

test("a salience drop does NOT feed the price — the bar must not raise itself", async () => {
    priced._crowd = 0;
    for (let i = 0; i < 6; i++) fire(0.1);      // all refused on merit, none on budget
    await delay(10);
    expect(priced._crowd).toBe(0);
});

test("urgent bids bypass admission, so crowding can never muzzle one", async () => {
    crowd(4);
    expect(priced._crowd).toBeGreaterThan(0.999);   // bar raised to ~0.55
    priced.pending.length = 0;

    fire(0.2, { urgent: true });                // far under even the base bar
    await delay(10);
    expect(priced.pending.length).toBe(1);
    expect(priced.pending[0].urgent).toBe(true);
});

test("a garbage crowdStep falls back instead of NaN-ing the threshold", async () => {
    // A NaN threshold is the dangerous failure here: `salience < NaN` is false, so
    // EVERY bid would pass and the gate would silently stop being a gate.
    // (crowdRelax is a time expression and throws on garbage, exactly as rateLimit
    // does two lines above it — a malformed duration is a config bug that never
    // heals by waiting, and the house convention is to say so loudly.)
    priced.setAttribute("crowdStep", "banana");
    crowd(2);
    await delay(10);
    expect(Number.isFinite(priced._crowd)).toBe(true);
    expect(priced._crowd).toBeGreaterThan(0);
    expect(priced._crowd).toBeLessThanOrEqual(1);
    priced.setAttribute("crowdStep", "0.25");
});
