// The request/reply seam (infrastructure/requestReply.js, message-rule.md): a request
// is a fired event carrying a requestId, the reply is a non-bubbling event on the
// requester, every wait has a deadline (M6) and resolves — never rejects — and the
// same holds when delivery is deferred through a JSON wire, as across a process.
import { test, expect, afterEach } from "bun:test";
import A from "amanita";
import { request, requestAll, respond, REPLY_EVENT } from "../../../src/infrastructure/requestReply.js";
import { configureDelivery, isolateDeliveryRegistry } from "../../../src/infrastructure/deliveryChaos.js";

let restore = null, restoreRegistry = null;
afterEach(() => {
    if (restore) configureDelivery(restore);
    if (restoreRegistry) restoreRegistry();
    restore = restoreRegistry = null;
    document.body.replaceChildren();
});

class TRrHost extends A(HTMLElement) {}
if (!customElements.get("t-rr-host")) customElements.define("t-rr-host", TRrHost);
class TRrPart extends A(HTMLElement) {}
if (!customElements.get("t-rr-part")) customElements.define("t-rr-part", TRrPart);

// parent > child, both plain elements in the document.
function tree() {
    const parent = document.createElement("div");
    parent.setAttribute("name", "gate");
    const child = document.createElement("div");
    parent.appendChild(child);
    document.body.appendChild(parent);
    return { parent, child };
}

test("an ancestor answers a bubbling request; the reply names the responder", async () => {
    const { parent, child } = tree();
    respond(parent, "ask", d => ({ echo: d.q }));
    const reply = await request(child, "ask", { q: 7 });
    expect(reply).toMatchObject({ status: "ok", data: { echo: 7 }, from: "gate" });
    expect(typeof reply.requestId).toBe("string");
});

test("a missing reply is a timeout at the deadline, never a rejection or a hang", async () => {
    const { child } = tree();
    const t0 = Date.now();
    const reply = await request(child, "nobody-home", {}, { deadline: 30 });
    expect(reply.status).toBe("timeout");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
});

test("a late reply after the deadline is dropped", async () => {
    const { parent, child } = tree();
    respond(parent, "slow", () => new Promise(r => setTimeout(() => r({ late: true }), 60)));
    const reply = await request(child, "slow", {}, { deadline: 20 });
    expect(reply.status).toBe("timeout");
    await new Promise(r => setTimeout(r, 80));        // the late reply lands on nothing
});

test("undefined abstains (no reply); a throw is an error reply", async () => {
    const { parent, child } = tree();
    respond(parent, "maybe", () => undefined);
    respond(parent, "boom", () => { throw new Error("disk full"); });
    expect((await request(child, "maybe", {}, { deadline: 20 })).status).toBe("timeout");
    expect(await request(child, "boom", {})).toMatchObject({ status: "error", error: "disk full", from: "gate" });
});

test("requestAll collects to quorum, or reports what arrived at the deadline", async () => {
    const outer = document.createElement("div");
    const { parent, child } = tree();
    outer.appendChild(parent);
    document.body.appendChild(outer);
    respond(parent, "vote", () => ({ yes: true }));
    respond(outer, "vote", () => ({ yes: false }));
    const two = await requestAll(child, "vote", {}, { expect: 2, deadline: 200 });
    expect(two.status).toBe("ok");
    expect(two.replies.map(r => r.data.yes).sort()).toEqual([false, true]);
    const three = await requestAll(child, "vote", {}, { expect: 3, deadline: 30 });
    expect(three.status).toBe("timeout");
    expect(three.replies).toHaveLength(2);           // a missing voter is visible, not assumed
});

test("an event of the same name without a requestId is not a request", async () => {
    const { parent, child } = tree();
    let answered = 0;
    respond(parent, "attended", () => { answered++; return {}; });
    child.dispatchEvent(new CustomEvent("attended", { detail: { lines: ["x"] }, bubbles: true }));
    await new Promise(r => setTimeout(r, 5));
    expect(answered).toBe(0);
});

test("a reply never bubbles: an ancestor asking the same thing is not answered by it", async () => {
    const { parent, child } = tree();
    const grand = document.createElement("div");
    grand.appendChild(parent);
    document.body.appendChild(grand);
    let seenAtParent = 0;
    parent.addEventListener(REPLY_EVENT, () => seenAtParent++);
    respond(grand, "ask", () => ({ ok: 1 }));
    await request(child, "ask", {});
    expect(seenAtParent).toBe(0);
});

test("request data must be a plain object", () => {
    const { child } = tree();
    expect(() => requestAll(child, "attended", ["a"])).toThrow(TypeError);
});

test("a part answers its membrane's own (non-bubbling) request through an @event ref", async () => {
    document.body.innerHTML = `<t-rr-host name="host"><t-rr-part name="memory"></t-rr-part></t-rr-host>`;
    const host = document.querySelector("t-rr-host");
    const part = document.querySelector("t-rr-part");
    await respond(part, "sleep", d => ({ committed: d.reason === "sleep" }), { src: "../@sleep" });
    let heardAbove = 0;
    document.body.addEventListener("sleep", () => heardAbove++);
    const reply = await request(host, "sleep", { reason: "sleep" }, { bubbles: false });
    expect(reply).toMatchObject({ status: "ok", data: { committed: true }, from: "memory" });
    expect(heardAbove).toBe(0);                       // nothing above the membrane was asked
});

test("the round trip survives deferred delivery through a JSON wire", async () => {
    restore = configureDelivery({ mode: "macrotask", wire: "json", check: "report" });
    restoreRegistry = isolateDeliveryRegistry();
    const { parent, child } = tree();
    respond(parent, "ask", d => ({ echo: d.q, at: "parent" }));
    const reply = await request(child, "ask", { q: "x" });
    expect(reply).toMatchObject({ status: "ok", data: { echo: "x", at: "parent" } });
});
