// A2 — opt-in Prediction producer and local m-act consequence interposition.
// Dedicated fixture: existing act wiring tests stay on the default-off path.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { InterruptRecord } from "../../../src/infrastructure/interruptRecord.js";
import { Percept } from "../../../src/infrastructure/percept.js";
import { AttentionBid } from "../../../src/infrastructure/attentionBid.js";
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT, PREDICTION_DELIVERY, MAX_PREDICTION_LIFETIME_MS,
} from "../../../src/infrastructure/predictionContracts.js";

const EXPECT_PHRASE = "EXPECT_PHRASE_A2_DO_NOT_LEAK";
const EXPERIENCE = "I turn toward the sky and the light has gone grey.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let mind, act, legacy, memory, terminal, journalDir, savedDry;

function call(name, args) {
    return { function: { name, arguments: JSON.stringify(args) } };
}

function registerProbe(host, spec) {
    const execute = spec.execute || (async () => ({ experience: EXPERIENCE }));
    host._registerCapability({
        name: spec.name || "probe",
        description: spec.description || "a fixture hand",
        parameters: spec.parameters || {
            type: "object",
            properties: { q: { type: "string" } },
            required: ["q"],
        },
        felt: "you can reach a fixture",
        execute,
        predictionTarget: spec.predictionTarget,
    });
    return host._capabilities.find(c => c.name === (spec.name || "probe"));
}

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    journalDir = path.join(os.tmpdir(), "med-act-pred-" + Date.now());

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-act name="hands" prediction="on" every="1" threshold="0.6" cooldown="0s" intentCooldown="15m">
          <m-terminal name="terminal"></m-terminal>
        </m-act>
        <m-act name="legacy" every="1" cooldown="0s" intentCooldown="15m"></m-act>
      </m-mind>
    `;
    document.querySelector('[name="memory"]').setAttribute("journal", journalDir);

    await loadMindComponents(document);
    await delay(160);

    mind = document.querySelector("m-mind");
    act = mind.querySelector('[name="hands"]');
    legacy = mind.querySelector('[name="legacy"]');
    memory = mind.querySelector('[name="memory"]');
    terminal = mind.querySelector('[name="terminal"]');
});

afterAll(async () => {
    act?._teardownPrediction?.("test-end");
    legacy?._teardownPrediction?.("test-end");
    await memory?._journalQueue;
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
    try { fs.rmSync(journalDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("prediction defaults off: REALIZE schemas are identical to phase 2", () => {
    const cap = registerProbe(legacy, { name: "legacy-probe" });
    const orig = cap.parameters;
    expect(legacy.attr("prediction")).not.toBe("on");
    expect(legacy._predictionEnabled()).toBe(false);
    expect(legacy._toolParameters(cap)).toBe(orig);
    expect(orig.properties.expect).toBeUndefined();
    expect("expect" in (orig.properties || {})).toBe(false);
});

test("enabled REALIZE copies add expect without mutating cap.parameters", () => {
    const cap = registerProbe(act, { name: "schema-probe" });
    const orig = cap.parameters;
    const before = orig;
    const toolParams = act._toolParameters(cap);
    expect(act._predictionEnabled()).toBe(true);
    expect(toolParams).not.toBe(orig);
    expect(toolParams.properties.expect.type).toBe("string");
    expect(orig).toBe(before);
    expect(orig.properties.expect).toBeUndefined();
    toolParams.properties.expect.description = "mutated copy";
    expect(orig.properties.expect).toBeUndefined();
    expect(orig.required).toEqual(["q"]);
    expect(toolParams.required).toEqual(["q"]);
    toolParams.required.push("expect");
    expect(orig.required).toEqual(["q"]);
});

test("Prediction publication precedes immediate hand execution", async () => {
    const order = [];
    const cap = registerProbe(act, {
        name: "order-probe",
        execute: async () => {
            order.push("execute");
            return { experience: EXPERIENCE };
        },
    });
    const onPred = () => order.push("prediction");
    act.addEventListener(PREDICTION_EVENT, onPred);
    try {
        await act._execute(call("order-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look outside" });
    } finally {
        act.removeEventListener(PREDICTION_EVENT, onPred);
    }
    expect(order[0]).toBe("prediction");
    expect(order).toContain("execute");
    expect(order.indexOf("prediction")).toBeLessThan(order.indexOf("execute"));
    expect(cap.parameters.properties.expect).toBeUndefined();
});

test("expect never enters execute, acted, journal, or a frame", async () => {
    let seenArgs = null;
    let seenCtx = null;
    registerProbe(act, {
        name: "strip-probe",
        execute: async (args, ctx) => {
            seenArgs = args;
            seenCtx = ctx;
            return { experience: EXPERIENCE };
        },
    });
    const acted = [];
    const pubs = [];
    const origPub = act.pub.bind(act);
    act.pub = (topic, data) => {
        pubs.push({ topic, data });
        return origPub(topic, data);
    };
    const onActed = e => acted.push(e.detail);
    act.addEventListener("acted", onActed);

    const bids = [];
    const onBid = e => bids.push(e.detail);
    mind.addEventListener("interrupt-request", onBid);
    try {
        await act._execute(
            call("strip-probe", { q: "sky", expect: EXPECT_PHRASE }),
            { gist: "look outside" },
        );
        await delay(60);
    } finally {
        act.removeEventListener("acted", onActed);
        mind.removeEventListener("interrupt-request", onBid);
        act.pub = origPub;
    }

    expect(seenArgs).toEqual({ q: "sky" });
    expect(seenArgs).not.toHaveProperty("expect");
    expect(JSON.stringify(seenArgs)).not.toContain(EXPECT_PHRASE);
    expect(acted).toHaveLength(1);
    expect(acted[0].args).toEqual({ q: "sky" });
    expect(acted[0].args).not.toHaveProperty("expect");
    expect(JSON.stringify(acted[0])).not.toContain(EXPECT_PHRASE);
    expect(acted[0].actId).toMatch(UUID);
    expect(acted[0].predictionId).toMatch(UUID);
    expect(pubs.every(p => p.topic !== PREDICTION_EVENT && p.topic !== PREDICTION_SETTLED_EVENT)).toBe(true);
    expect(JSON.stringify(pubs)).not.toContain(EXPECT_PHRASE);

    const day = new Date().toISOString().slice(0, 10);
    const journal = fs.readFileSync(path.join(journalDir, `${day}.md`), "utf8");
    expect(journal).not.toContain(EXPECT_PHRASE);
    expect(memory.getTail()).not.toContain(EXPECT_PHRASE);

    const bid = bids.find(d => d instanceof AttentionBid && d.evidence?.actId === seenCtx.actId);
    expect(bid).toBeDefined();
    expect(bid.evidence.renderForFrame()).not.toContain(EXPECT_PHRASE);
    expect(bid.evidence.renderForFrame()).toContain("grey");
});

test("immediate consequence preserves one actId through percept and bid.evidence", async () => {
    let seenCtx = null;
    registerProbe(act, {
        name: "imm-probe",
        execute: async (_args, ctx) => {
            seenCtx = ctx;
            return { experience: EXPERIENCE, salience: 0.6 };
        },
    });
    const seen = [];
    const onReq = e => seen.push(e.detail);
    mind.addEventListener("interrupt-request", onReq);
    try {
        await act._execute(call("imm-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
    } finally {
        mind.removeEventListener("interrupt-request", onReq);
    }
    expect(seenCtx.actId).toMatch(UUID);
    expect(seenCtx.predictionId).toMatch(UUID);
    const bid = seen.find(d => d instanceof AttentionBid);
    expect(bid).toBeDefined();
    expect(seen.some(d => d instanceof InterruptRecord && !(d instanceof Percept))).toBe(false);
    expect(bid.evidence).toBeInstanceOf(Percept);
    expect(bid.evidence.actId).toBe(seenCtx.actId);
    expect(bid.evidenceId).toBe(bid.evidence.id);
    expect(AttentionBid.evidenceOf(bid)).toBe(bid.evidence);
    expect(bid.evidence).toBe(bid.evidence);
});

test("deferred terminal consequence preserves the same live actId through one Percept", async () => {
    let seenCtx = null;
    registerProbe(act, {
        name: "defer-probe",
        execute: async (_args, ctx) => {
            seenCtx = ctx;
            return { experience: EXPERIENCE };
        },
    });
    await act._execute(call("defer-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "run it" });

    const seen = [];
    const onReq = e => seen.push(e.detail);
    mind.addEventListener("interrupt-request", onReq);
    try {
        terminal._dispatch({
            experience: "I run it, and the screen answers: `42`.",
            salience: 0.7,
            urgent: true,
            type: "Sense-terminal",
            actId: seenCtx.actId,
        });
    } finally {
        mind.removeEventListener("interrupt-request", onReq);
    }
    const bid = seen.find(d => d instanceof AttentionBid && d.evidence?.actId === seenCtx.actId
        && String(d.type).startsWith("Sense-terminal"));
    expect(bid).toBeDefined();
    expect(bid.evidence).toBeInstanceOf(Percept);
    expect(bid.evidence.actId).toBe(seenCtx.actId);
    expect(bid.evidenceId).toBe(bid.evidence.id);
    expect(AttentionBid.evidenceOf(bid)).toBe(bid.evidence);
    expect(Percept.fromInterrupt(bid)).toBe(bid.evidence);
});

test("trusted conversion uses one Percept id as AttentionBid.evidence", async () => {
    let seenCtx = null;
    registerProbe(act, {
        name: "id-probe",
        execute: async (_args, ctx) => {
            seenCtx = ctx;
            return { experience: EXPERIENCE };
        },
    });
    const seen = [];
    const onReq = e => seen.push(e.detail);
    mind.addEventListener("interrupt-request", onReq);
    try {
        await act._execute(call("id-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
    } finally {
        mind.removeEventListener("interrupt-request", onReq);
    }
    const bid = seen.find(d => d instanceof AttentionBid && d.evidence?.actId === seenCtx.actId);
    expect(bid.evidence.id).toBe(bid.evidenceId);
    expect(bid.signals.changeMagnitude).toBe(bid.evidence.salience);
});

test("prediction events remain fire not pub; expect is not retained telemetry", async () => {
    expect(PREDICTION_DELIVERY).toBe("fire");
    const fired = [];
    const pubs = [];
    const origFire = act.fire.bind(act);
    const origPub = act.pub.bind(act);
    act.fire = (name, detail, opts) => {
        fired.push({ name, detail });
        return origFire(name, detail, opts);
    };
    act.pub = (topic, data) => {
        pubs.push({ topic, data });
        return origPub(topic, data);
    };
    registerProbe(act, { name: "fire-probe", execute: async () => ({ experience: EXPERIENCE }) });
    try {
        await act._execute(call("fire-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
    } finally {
        act.fire = origFire;
        act.pub = origPub;
    }
    expect(fired.some(f => f.name === PREDICTION_EVENT)).toBe(true);
    expect(pubs.some(p => p.topic === PREDICTION_EVENT || p.topic === PREDICTION_SETTLED_EVENT)).toBe(false);
    expect(JSON.stringify(pubs)).not.toContain(EXPECT_PHRASE);
});

test("empty expect does not publish but still mints actId for lineage", async () => {
    let seenCtx = null;
    const predictions = [];
    registerProbe(act, {
        name: "empty-probe",
        execute: async (_args, ctx) => {
            seenCtx = ctx;
            return { experience: EXPERIENCE };
        },
    });
    const onPred = e => predictions.push(e.detail);
    act.addEventListener(PREDICTION_EVENT, onPred);
    try {
        await act._execute(call("empty-probe", { q: "sky", expect: "   " }), { gist: "look" });
    } finally {
        act.removeEventListener(PREDICTION_EVENT, onPred);
    }
    expect(predictions).toHaveLength(0);
    expect(seenCtx.actId).toMatch(UUID);
    expect(seenCtx.predictionId).toBeNull();
});

test("disabled execute stays { intent } only — no actId, no prediction", async () => {
    let seenCtx = null;
    let seenArgs = null;
    registerProbe(legacy, {
        name: "off-probe",
        execute: async (args, ctx) => {
            seenArgs = args;
            seenCtx = ctx;
            return { experience: EXPERIENCE };
        },
    });
    const predictions = [];
    const seen = [];
    const onPred = e => predictions.push(e.detail);
    const onReq = e => seen.push(e.detail);
    legacy.addEventListener(PREDICTION_EVENT, onPred);
    mind.addEventListener("interrupt-request", onReq);
    try {
        await legacy._execute(
            call("off-probe", { q: "sky", expect: EXPECT_PHRASE }),
            { gist: "look" },
        );
    } finally {
        legacy.removeEventListener(PREDICTION_EVENT, onPred);
        mind.removeEventListener("interrupt-request", onReq);
    }
    expect(predictions).toHaveLength(0);
    expect(seenCtx).toEqual({ intent: "look" });
    expect(seenCtx).not.toHaveProperty("actId");
    expect(seenCtx).not.toHaveProperty("predictionId");
    // Disabled schema does not know `expect`, so extra keys still reach the hand
    // the way additional properties always have — phase-2 validator ignores them.
    expect(seenArgs).toEqual({ q: "sky", expect: EXPECT_PHRASE });
    const raw = seen.find(d => d instanceof InterruptRecord && !(d instanceof AttentionBid)
        && d.reason === EXPERIENCE);
    expect(raw).toBeDefined();
    expect(raw.actId).toBeNull();
});

test("AttentionBid passes through the listener without looping", () => {
    const seen = [];
    const onReq = e => seen.push(e.detail);
    mind.addEventListener("interrupt-request", onReq);
    const evidence = Percept.fromInterrupt(new InterruptRecord({
        source: "External", type: "Sense-probe", reason: EXPERIENCE, salience: 0.5,
    }));
    const bid = new AttentionBid({ evidence });
    try {
        act.fire("interrupt-request", bid);
    } finally {
        mind.removeEventListener("interrupt-request", onReq);
    }
    const bids = seen.filter(d => d instanceof AttentionBid);
    expect(bids).toHaveLength(1);
    expect(bids[0]).toBe(bid);
});

test("execution failure cancels without manufacturing mismatch", async () => {
    const settlements = [];
    registerProbe(act, {
        name: "fail-probe",
        execute: async () => { throw new Error("boom"); },
    });
    const onSettled = e => settlements.push(e.detail);
    act.addEventListener(PREDICTION_SETTLED_EVENT, onSettled);
    try {
        await act._execute(call("fail-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
    } finally {
        act.removeEventListener(PREDICTION_SETTLED_EVENT, onSettled);
    }
    expect(settlements).toHaveLength(1);
    expect(settlements[0].status).toBe("cancelled");
    expect(settlements[0].status).not.toBe("mismatched");
    expect(settlements[0].reason).toBe("execution-failed");
});

test("untrusted plain-object consequences are not claimed for lineage", async () => {
    let seenCtx = null;
    registerProbe(act, {
        name: "trust-probe",
        execute: async (_args, ctx) => {
            seenCtx = ctx;
            return { experience: EXPERIENCE };
        },
    });
    await act._execute(call("trust-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });

    const seen = [];
    const onReq = e => seen.push(e.detail);
    mind.addEventListener("interrupt-request", onReq);
    const stolen = {
        source: "External",
        type: "Sense-trust-probe",
        reason: "stolen lineage",
        actId: seenCtx.actId,
        urgent: true,
    };
    try {
        terminal.dispatchEvent(new CustomEvent("interrupt-request", { bubbles: true, detail: stolen }));
    } finally {
        mind.removeEventListener("interrupt-request", onReq);
    }
    expect(seen).toContain(stolen);
    expect(seen.some(d => d instanceof AttentionBid && d.evidence?.reason === "stolen lineage")).toBe(false);
});

test("target identity comes from trusted capability metadata, never expect text", async () => {
    const predictions = [];
    registerProbe(act, {
        name: "target-probe",
        predictionTarget: { sourceId: "garden", modality: "vision", eventType: "Sense-garden" },
        execute: async () => ({ experience: EXPERIENCE }),
    });
    const onPred = e => predictions.push(e.detail);
    act.addEventListener(PREDICTION_EVENT, onPred);
    try {
        await act._execute(
            call("target-probe", { q: "sky", expect: "sourceId=terminal modality=text eventType=Sense-terminal" }),
            { gist: "look" },
        );
    } finally {
        act.removeEventListener(PREDICTION_EVENT, onPred);
    }
    expect(predictions).toHaveLength(1);
    expect(predictions[0].kind).toBe("belief");
    expect(predictions[0].producer).toBe("hands");
    expect(predictions[0].scopeId).toBe("hands");
    expect(predictions[0].target).toEqual({
        sourceId: "garden", modality: "vision", eventType: "Sense-garden",
    });
    const span = Date.parse(predictions[0].validUntil) - Date.parse(predictions[0].validFrom);
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThanOrEqual(MAX_PREDICTION_LIFETIME_MS);
});

test("existing hands default prediction target eventType to Sense-${name}", async () => {
    const predictions = [];
    registerProbe(act, {
        name: "default-target",
        execute: async () => ({ experience: EXPERIENCE }),
    });
    const onPred = e => predictions.push(e.detail);
    act.addEventListener(PREDICTION_EVENT, onPred);
    try {
        await act._execute(call("default-target", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
    } finally {
        act.removeEventListener(PREDICTION_EVENT, onPred);
    }
    expect(predictions[0].target).toEqual({ eventType: "Sense-default-target" });
});

test("timed validUntil expires without mismatch", async () => {
    const settlements = [];
    act.setAttribute("intentCooldown", "50ms");
    registerProbe(act, {
        name: "expire-probe",
        execute: async () => ({ experience: EXPERIENCE }),
    });
    const onSettled = e => settlements.push(e.detail);
    act.addEventListener(PREDICTION_SETTLED_EVENT, onSettled);
    try {
        await act._execute(call("expire-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
        await delay(120);
    } finally {
        act.setAttribute("intentCooldown", "15m");
        act.removeEventListener(PREDICTION_SETTLED_EVENT, onSettled);
    }
    expect(settlements.some(s => s.status === "expired")).toBe(true);
    expect(settlements.every(s => s.status !== "mismatched")).toBe(true);
});

test("disconnect cancels live predictions without mismatch", async () => {
    const settlements = [];
    registerProbe(act, {
        name: "disc-probe",
        execute: async () => ({ experience: EXPERIENCE }),
    });
    const onSettled = e => settlements.push(e.detail);
    act.addEventListener(PREDICTION_SETTLED_EVENT, onSettled);
    try {
        await act._execute(call("disc-probe", { q: "sky", expect: EXPECT_PHRASE }), { gist: "look" });
        act.onDisconnect();
    } finally {
        act.removeEventListener(PREDICTION_SETTLED_EVENT, onSettled);
    }
    expect(settlements.some(s => s.status === "cancelled" && s.reason === "disconnect")).toBe(true);
    expect(settlements.every(s => s.status !== "mismatched")).toBe(true);
});
