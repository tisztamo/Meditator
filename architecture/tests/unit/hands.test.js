// Hands as messages (src/mindComponents/shared/hands.js, message-rule.md): a hand
// offers plain data, the assembler calls it back with a `call` request, a re-offer
// under the same offerId replaces the entry, an assembler that comes up late asks
// for offers again, and every call has a deadline. The same holds when delivery is
// deferred through a JSON wire, as across a process.
import { test, expect, afterEach } from "bun:test";
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js";
import { HandRegistry, offerOf, OFFER_EVENT } from "../../../src/mindComponents/shared/hands.js";
import { configureDelivery, isolateDeliveryRegistry, deliveryViolations } from "../../../src/infrastructure/deliveryChaos.js";

let restore = null, restoreRegistry = null;
afterEach(() => {
    if (restore) configureDelivery(restore);
    if (restoreRegistry) restoreRegistry();
    restore = restoreRegistry = null;
    document.body.replaceChildren();
});

const delay = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(cond, timeout = 500) {
    const end = Date.now() + timeout;
    let v;
    while (!(v = cond()) && Date.now() < end) await delay(5);
    return v;
}

// An assembler: provides `hands`, keeps a registry, listens at connect.
class TAssembler extends MBaseComponent {
    static provides = { hands: true };
    static spaceParticipates = false;
    changes = 0;
    registry = new HandRegistry(this, { onChange: () => { this.changes += 1; } });
    onConnect() { this.registry.listen(); }
}
if (!customElements.get("t-hands-asm")) customElements.define("t-hands-asm", TAssembler);

// A hand: offers `spec` at connect (a property, set before it connects).
class THand extends MBaseComponent {
    static spaceParticipates = false;
    spec = null;
    onConnect() { if (this.spec) this.offerCapability(this.spec, this.to ? { to: this.to } : {}); }
}
if (!customElements.get("t-hands-hand")) customElements.define("t-hands-hand", THand);

function mount(spec) {
    const asm = document.createElement("t-hands-asm");
    document.body.appendChild(asm);
    const hand = document.createElement("t-hands-hand");
    hand.spec = spec;
    asm.appendChild(hand);
    return { asm, hand };
}

const echo = (overrides = {}) => ({
    name: "echo",
    description: "echoes",
    parameters: { type: "object", properties: { q: { type: "string" } } },
    felt: "you can hear yourself",
    readonly: false,
    execute: async (args, ctx) => ({ experience: `heard ${args.q}`, data: { intent: ctx.intent ?? null } }),
    ...overrides,
});

test("the offer is plain data: no execute crosses, an offerId does", async () => {
    const seen = [];
    document.body.addEventListener(OFFER_EVENT, e => seen.push(e.detail));
    const { asm } = mount(echo());
    const entry = await waitFor(() => asm.registry.find("echo"));
    expect(entry.readonly).toBe(false);
    expect(entry.felt).toBe("you can hear yourself");
    expect(offerOf(echo(), "x")).not.toHaveProperty("execute");
    // The assembler does not claim by default, so the offer is visible above it. Under
    // deferred delivery the assembler's solicit reaches the already-bound hand and it
    // offers again — idempotent, one entry either way.
    expect(seen.length).toBeGreaterThanOrEqual(1);
    for (const offer of seen) {
        expect(offer.execute).toBeUndefined();
        expect(typeof offer.offerId).toBe("string");
    }
    expect(asm.registry.entries.length).toBe(1);
});

test("a call is a request the hand answers with its execute's return", async () => {
    const { asm } = mount(echo());
    const entry = await waitFor(() => asm.registry.find("echo"));
    const out = await entry.execute({ q: "hi" }, { intent: "listen" });
    expect(out).toEqual({ experience: "heard hi", data: { intent: "listen" } });
});

test("a throw is a slip on the assembler side; returning nothing is still an answer", async () => {
    const { asm } = mount(echo({ execute: async () => { throw new Error("disk full"); } }));
    const entry = await waitFor(() => asm.registry.find("echo"));
    await expect(entry.execute({}, {})).rejects.toThrow(/disk full/);

    const quiet = document.createElement("t-hands-hand");
    quiet.spec = echo({ name: "quiet", execute: () => {} });
    asm.appendChild(quiet);
    const q = await waitFor(() => asm.registry.find("quiet"));
    expect(await q.execute({}, {})).toBeNull();
});

test("a hand that never answers misses the deadline, and the call throws", async () => {
    const { asm } = mount(echo({ deadline: 30, execute: () => new Promise(() => {}) }));
    const entry = await waitFor(() => asm.registry.find("echo"));
    const t0 = Date.now();
    await expect(entry.execute({}, {})).rejects.toThrow(/did not answer/);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
});

test("a re-offer under the same offerId replaces the entry; another hand's same name is a duplicate", async () => {
    const { asm, hand } = mount(echo());
    await waitFor(() => asm.registry.find("echo"));
    hand.offerCapability(echo({ description: "echoes louder" }));
    await waitFor(() => asm.registry.find("echo").description === "echoes louder");
    expect(asm.registry.entries.length).toBe(1);
    expect(asm.registry.find("echo").description).toBe("echoes louder");

    const impostor = document.createElement("t-hands-hand");
    impostor.spec = echo({ description: "not me", execute: async () => ({ experience: "impostor" }) });
    asm.appendChild(impostor);
    await delay(20);
    expect(asm.registry.entries.length).toBe(1);
    expect(await asm.registry.find("echo").execute({ q: "x" }, {})).toMatchObject({ experience: "heard x" });
});

test("an assembler that comes up after its hand asks for the offer again", async () => {
    // The hand sits BESIDE the assembler and connects first: its offer lands on an
    // element that is not listening yet, and the assembler's solicit recovers it.
    const host = document.createElement("div");
    document.body.appendChild(host);
    const asm = document.createElement("t-hands-asm-late");
    host.appendChild(asm);                     // not yet defined: no listener
    const hand = document.createElement("t-hands-hand");
    hand.spec = echo();
    hand.to = asm;
    host.appendChild(hand);                    // offers to a deaf element
    class TLateAssembler extends TAssembler {}
    customElements.define("t-hands-asm-late", TLateAssembler);   // upgrades now: listen + solicit
    const entry = await waitFor(() => asm.registry?.find("echo"));
    expect(entry).toBeTruthy();
    expect(await entry.execute({ q: "late" }, {})).toMatchObject({ experience: "heard late" });
});

test("a disconnected hand stops answering", async () => {
    const { asm, hand } = mount(echo({ deadline: 30 }));
    const entry = await waitFor(() => asm.registry.find("echo"));
    hand.remove();
    await expect(entry.execute({}, {})).rejects.toThrow(/did not answer/);
});

test("a claiming assembler owns the tools inside it; its own offer passes up", async () => {
    class TClaimer extends TAssembler {
        registry = new HandRegistry(this, { claim: true });
    }
    if (!customElements.get("t-hands-claimer")) customElements.define("t-hands-claimer", TClaimer);
    const outer = document.createElement("t-hands-asm");
    document.body.appendChild(outer);
    const inner = document.createElement("t-hands-claimer");
    outer.appendChild(inner);
    const tool = document.createElement("t-hands-hand");
    tool.spec = echo({ name: "inner-tool" });
    inner.appendChild(tool);
    inner.offerCapability(echo({ name: "inner-as-hand" }));
    await waitFor(() => inner.registry.find("inner-tool") && outer.registry.find("inner-as-hand"));
    expect(inner.registry.find("inner-tool")).toBeTruthy();
    expect(outer.registry.find("inner-tool")).toBeUndefined();
    expect(outer.registry.find("inner-as-hand")).toBeTruthy();
    expect(inner.registry.find("inner-as-hand")).toBeUndefined();
});

test("under macrotask delivery over a JSON wire: offer, call and reply all survive, no M2 report", async () => {
    restore = configureDelivery({ mode: "macrotask", wire: "json", check: "report" });
    restoreRegistry = isolateDeliveryRegistry();
    const { asm } = mount(echo());
    const entry = await waitFor(() => asm.registry.find("echo"));
    expect(entry).toBeTruthy();
    expect(await entry.execute({ q: "far" }, { intent: "across" })).toEqual({ experience: "heard far", data: { intent: "across" } });
    const kinds = deliveryViolations().map(v => v.key).filter(k => /capability|call|request-reply/.test(k));
    expect(kinds).toEqual([]);
});
