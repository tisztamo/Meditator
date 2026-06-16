// Fixed-tick burst scheduling math — pure unit.
import { test, expect } from "bun:test";
import { tickDelay } from "../../../src/mindComponents/mMind.js";

test("a burst faster than the tick waits out the remainder", () => {
    // 5s burst on an 8s tick -> 3s of slack before the next one.
    expect(tickDelay(8000, 5000)).toBe(3000);
});

test("a burst that exactly fills the tick fires the next immediately", () => {
    expect(tickDelay(8000, 8000)).toBe(0);
});

test("a burst slower than the tick never queues — next fires now (0), no negative wait", () => {
    // The model overran the tick; the delay clamps to 0 so the boundary that
    // drives scheduling fires exactly one next burst, with nothing stacked up.
    expect(tickDelay(8000, 11000)).toBe(0);
    expect(tickDelay(8000, 11000)).toBeGreaterThanOrEqual(0);
});
