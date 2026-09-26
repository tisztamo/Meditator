// The delivery-chaos instrument itself (infrastructure/deliveryChaos.js): deferred
// modes really defer, the sender cannot read anything back, the plain-data walk
// names what it finds, and a sender mutating its payload after send is caught.
// Each test restores the settings it changed, so this file is inert in a chaos run.
import { test, expect, afterEach } from "bun:test";
import {
    configureDelivery, deliverySettings, checkPayload,
    deliveryViolations, isolateDeliveryRegistry,
} from "../../../src/infrastructure/deliveryChaos.js";

let restore = null, restoreRegistry = null;
function use(settings) { restore ??= configureDelivery(settings); restoreRegistry ??= isolateDeliveryRegistry(); }
afterEach(() => {
    if (restore) configureDelivery(restore);
    if (restoreRegistry) restoreRegistry();
    restore = restoreRegistry = null;
});

function fireOn(el, name, detail, cancelable = false) {
    const ev = new CustomEvent(name, { detail, bubbles: true, cancelable });
    const ret = el.dispatchEvent(ev);
    return { ev, ret };
}

test("sync mode dispatches inside the call (today's jsdom behaviour)", () => {
    use({ mode: "sync", check: "off" });
    const el = document.createElement("div");
    const seen = [];
    el.addEventListener("ping", e => seen.push(e.detail.n));
    fireOn(el, "ping", { n: 1 });
    expect(seen).toEqual([1]);
});

test("microtask mode delivers after the call returns, in send order", async () => {
    use({ mode: "microtask", check: "off" });
    const el = document.createElement("div");
    const seen = [];
    el.addEventListener("ping", e => seen.push(e.detail.n));
    fireOn(el, "ping", { n: 1 });
    fireOn(el, "ping", { n: 2 });
    expect(seen).toEqual([]);
    await Promise.resolve();
    expect(seen).toEqual([1, 2]);
});

test("a deferred sender reads back nothing: no veto, no filled array", async () => {
    use({ mode: "macrotask", check: "off" });
    const el = document.createElement("div");
    el.addEventListener("ask", e => { e.detail.verdicts.push("deny"); e.preventDefault(); });
    const { ev, ret } = fireOn(el, "ask", { verdicts: [] }, true);
    expect(ret).toBe(true);
    expect(ev.defaultPrevented).toBe(false);
    await new Promise(r => setTimeout(r, 5));
    expect(ev.detail.verdicts).toEqual([]);          // the listener filled a copy
});

test("jitter mode is seeded and eventually delivers everything", async () => {
    use({ mode: "jitter", check: "off", seed: 7 });
    const el = document.createElement("div");
    const seen = [];
    el.addEventListener("ping", e => seen.push(e.detail.n));
    for (let n = 0; n < 10; n++) fireOn(el, "ping", { n });
    await new Promise(r => setTimeout(r, 40));
    expect(seen.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("the plain-data walk names functions, elements, instances, promises, cycles", () => {
    use({ check: "report" });
    class Bid { constructor() { this.salience = 1; } }
    const cyc = { a: 1 }; cyc.self = cyc;
    const found = checkPayload("fire", "probe", {
        ok: { n: 1, s: "x", list: [1, { b: true }], nil: null },
        execute: () => {},
        origin: document.createElement("div"),
        bid: new Bid(),
        later: Promise.resolve(),
        cyc,
    }, document.createElement("m-test"));
    const kinds = Object.fromEntries(found.map(f => [f.path, f.kind]));
    expect(kinds).toEqual({
        execute: "function",
        origin: "element",
        bid: "instance:Bid",
        later: "promise",
        "cyc.self": "cycle",
    });
    const keys = deliveryViolations().map(v => v.key);
    expect(keys).toContain("fire|probe|function");
    expect(deliveryViolations().find(v => v.key === "fire|probe|element").senders).toEqual(["m-test"]);
});

test("plain data passes clean", () => {
    use({ check: "report" });
    expect(checkPayload("pub", "stats", { a: [1, 2, { b: "c" }], d: null, e: 3.5 }, null)).toEqual([]);
});

test("throw mode refuses a non-plain payload at the dispatch", () => {
    use({ mode: "sync", check: "throw" });
    const el = document.createElement("div");
    expect(() => fireOn(el, "capability", { execute() {} })).toThrow(/M2/);
});

test("a sender mutating its payload after send is caught", async () => {
    use({ mode: "microtask", check: "report" });
    const el = document.createElement("div");
    const detail = { n: 1 };
    fireOn(el, "tick", detail);
    detail.n = 2;
    await Promise.resolve();
    await Promise.resolve();
    expect(deliveryViolations().map(v => v.key)).toContain("fire|tick|mutated-after-send");
});

test("json wire delivers what a process boundary would: data only", async () => {
    use({ mode: "microtask", check: "off", wire: "json" });
    class Bid { constructor() { this.salience = 0.5; } bump() { this.salience = 1; } }
    const el = document.createElement("div");
    let got = null;
    el.addEventListener("bid", e => { got = e.detail; });
    fireOn(el, "bid", { bid: new Bid(), execute() {}, origin: el, list: [1, 2] });
    await Promise.resolve();
    expect(got).toEqual({ bid: { salience: 0.5 }, list: [1, 2] });
    expect(got.bid instanceof Bid).toBe(false);
});

test("settings round-trip", () => {
    const before = deliverySettings();
    use({ mode: "jitter", check: "report" });
    expect(deliverySettings().mode).toBe("jitter");
    configureDelivery(restore); restore = null;
    restoreRegistry(); restoreRegistry = null;
    expect(deliverySettings().mode).toBe(before.mode);
});
