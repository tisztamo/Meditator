// Contract: capability offer (review §3.1 row "Capability offer", mBaseComponent.js
// offerCapability, mAct.js capability listener, mOrient.js _register/_refreshSchema,
// mFacts.js _registerHandsSoon/_offerTo, mAgent.js capability listener; target shape
// in §5: the offer carries `{name, schema, description, felt, readonly}` and is
// idempotent — "re-fire the offer with the new schema" replaces the
// `_updateCapability` / `_registerCapability` reach-ins).
//
// Parties: REAL hands (m-terminal, m-facts, m-note, m-orient, m-read-file,
// m-write-file, an m-agent offering itself as a hand) and REAL assemblers (m-act,
// m-agent). The mind shell is the usual A(HTMLElement) stub; m-region is a real
// aperture; the model is the dry stub.
//
// Observation: m-act publishes `embodiment` (every registered hand's felt line) and
// fires `acted` (a deed: which hand ran); m-agent publishes `tools` (its schema set). A
// probe component subscribes to those topics through ordinary refs. The one exception
// is m-orient's schema refresh: m-act publishes no projection of a hand's SCHEMA (only
// felt lines), so that test reads m-act's `_capabilities` entry — the least invasive
// observation available; it drives nothing.
//
// Pinned outcomes (must survive the migration to plain-data offers):
//   - a hand under m-act becomes part of the mind's body schema AND can actually be
//     reached: a reach arriving through the stream's own chunk/boundary is realized
//     by that hand
//   - hands offered from outside m-act's subtree (m-facts' direct offer) and hands
//     appended at runtime join the body schema too
//   - a runtime change to a hand's schema (m-orient's aperture enum after a late
//     aperture connects) takes effect in the assembler's menu
//   - the NEAREST assembler claims a tool: a tool inside an agent nested in m-act is
//     the agent's (in its `tools`), never also the mind's; the agent itself is the
//     mind's hand; a tool added to the agent at runtime joins its `tools`
//
// Why it could break under async delivery: registration is assumed complete when
// `fire` returns — m-orient refreshes its schema on the next microtask via
// parent._updateCapability, which silently no-ops if the offer has not landed; m-agent
// sizes its first turn by polling its tool count. Measured result: every outcome here
// SURVIVES microtask, macrotask and jitter (seeds 1–6) delivery. Nothing reads a
// registration back inside the dispatch: the offer is one-way, m-orient's early
// refresh is redundant (the offer already carries a schema computed at the same
// moment, and a later aperture-register is delivered after the offer), and the
// tool-settle window absorbs a deferred offer. What still has to change for a process
// boundary is the payload, not the timing: `execute` is a function (review §3.2) and
// m-orient's refresh is a reach-in — §5's idempotent re-offer replaces both. These
// tests pin the outcomes that migration must keep.
import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import A from "amanita";
import { waitFor, quiet } from "./helpers.js";
import { MBaseComponent } from "../../../../src/mindComponents/shared/mBaseComponent.js";
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;

// A passive observer: subscribes to each ref in `src` (space-separated) and keeps
// every value (topic) or event detail ("@" ref) delivered, keyed by ref. It publishes
// and fires nothing.
class CapProbe extends MBaseComponent {
    seen = {};
    onConnect() {
        for (const ref of (this.attr("src") || "").split(/\s+/).filter(Boolean)) {
            this.seen[ref] = [];
            // An "@" ref is an event: keep its detail. Otherwise a topic value.
            const isEvent = ref.includes("@");
            this.sub(ref, v => this.seen[ref].push(isEvent ? v?.detail : v)).catch(() => {});
        }
    }
    last(ref) { return (this.seen[ref] || []).at(-1); }
}
if (!customElements.get("t-cap-probe")) customElements.define("t-cap-probe", CapProbe);

const FELT_TERMINAL = "FELT-TERMINAL: you can sit down and work a thing out.";
const FELT_REMEMBER = "FELT-REMEMBER: you can set a fact down by name.";
const FELT_RECALL = "FELT-RECALL: you can bring a kept fact back whole.";
const FELT_NOTE = "FELT-NOTE: you can keep a thought somewhere safe.";
const FELT_INNER = "FELT-INNER-TERMINAL: the agent's own screen.";
const FELT_AGENT = "FELT-AGENT: you can hand off real work and get it back.";

const ALL_TAGS = `
  <m-mind name="cap-warmup">
    <m-stream name="stream"></m-stream>
    <m-facts name="facts" dir="off"></m-facts>
    <m-act name="hands"><m-terminal name="terminal"></m-terminal><m-note name="note" dir="off"></m-note>
      <m-orient name="orient"></m-orient>
      <m-agent name="builder" role="subagent" toolSettleMs="60"><m-reason name="reason"></m-reason>
        <m-read-file name="read_file"></m-read-file><m-write-file name="write_file"></m-write-file></m-agent>
    </m-act>
    <m-region name="warm" modality="text" aperture="open"></m-region>
  </m-mind>`;

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";
    resetBackendProbe();
    if (!customElements.get("m-mind")) customElements.define("m-mind", class extends A(HTMLElement) {});
    // Define every tag once up front so each mount below upgrades in production order
    // (assembler before its hands), whatever earlier files in this process defined —
    // the same harness step agent-compose.test.js takes.
    document.body.innerHTML = ALL_TAGS;
    await loadMindComponents(document);
    await quiet(100);
    document.body.innerHTML = "";
});

afterEach(() => { document.body.innerHTML = ""; });

afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
});

async function mount(html) {
    document.body.innerHTML = html;
    await loadMindComponents(document);
    return document.querySelector("t-cap-probe");
}

const REACH = "I keep wanting to actually check this rather than reason it by hand — count the cases, "
    + "run the numbers for real, see what the screen says instead of guessing again. The question has "
    + "turned concrete: a family of cases I could simply enumerate if I sat down and worked it out, and "
    + "the not-knowing has become an itch I would like to scratch by trying it for once. ";

test("a hand under m-act joins the body schema and is actually reached through the stream", async () => {
    const probe = await mount(`
      <m-mind name="cap-reach">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1" threshold="0.6" cooldown="0s" intentCooldown="1s">
          <m-terminal name="terminal" felt="${FELT_TERMINAL}"></m-terminal>
        </m-act>
        <t-cap-probe src="!scope/hands/embodiment !scope/hands/@acted"></t-cap-probe>
      </m-mind>`);
    await waitFor(() => (probe.last("!scope/hands/embodiment") || "").includes(FELT_TERMINAL));
    expect(probe.last("!scope/hands/embodiment")).toContain(FELT_TERMINAL);

    // Drive a reach the way the running system does: the stream publishes thought and
    // fires its burst boundary; m-act (an observer) decides, realizes, executes.
    const stream = document.querySelector("m-stream");
    stream.pub("chunk", REACH);
    const acted = () => probe.seen["!scope/hands/@acted"].find(a => a && a.capability === "terminal");
    for (let i = 0; i < 12 && !acted(); i++) {
        stream.fire("boundary", { reason: "completed" });
        await waitFor(acted, 150);
    }
    expect(acted()).toBeTruthy();
    expect(acted().ok).toBe(true);
});

test("an offer from outside m-act's subtree (m-facts) and a runtime-added hand both join the body schema", async () => {
    const probe = await mount(`
      <m-mind name="cap-late">
        <m-stream name="stream"></m-stream>
        <m-facts name="facts" dir="off" rememberFelt="${FELT_REMEMBER}" recallFelt="${FELT_RECALL}"></m-facts>
        <m-act name="hands" every="1" cooldown="0s">
          <m-terminal name="terminal" felt="${FELT_TERMINAL}"></m-terminal>
        </m-act>
        <t-cap-probe src="!scope/hands/embodiment"></t-cap-probe>
      </m-mind>`);
    const body = () => probe.last("!scope/hands/embodiment") || "";
    await waitFor(() => body().includes(FELT_REMEMBER) && body().includes(FELT_RECALL) && body().includes(FELT_TERMINAL));
    expect(body()).toContain(FELT_TERMINAL);
    expect(body()).toContain(FELT_REMEMBER);   // m-facts: a sibling, offered straight to m-act
    expect(body()).toContain(FELT_RECALL);

    const late = document.createElement("m-note");
    late.setAttribute("name", "note");
    late.setAttribute("dir", "off");
    late.setAttribute("felt", FELT_NOTE);
    document.querySelector("m-act").appendChild(late);
    await waitFor(() => body().includes(FELT_NOTE));
    expect(body()).toContain(FELT_NOTE);
    expect(body()).toContain(FELT_TERMINAL);   // nothing already offered was lost
});

test("a runtime schema change takes effect: m-orient's aperture enum follows a late aperture", async () => {
    await mount(`
      <m-mind name="cap-orient">
        <m-stream name="stream"></m-stream>
        <m-region name="early" modality="text" aperture="open"></m-region>
        <m-act name="hands" every="1" cooldown="0s">
          <m-orient name="orient"></m-orient>
        </m-act>
      </m-mind>`);
    const act = document.querySelector("m-act");
    // Internal read (see header): m-act publishes no projection of a hand's schema.
    const enumNow = () => act._capabilities.find(c => c.name === "orient")?.parameters?.properties?.aperture?.enum || [];
    await waitFor(() => enumNow().includes("early"));
    expect(enumNow()).toContain("early");

    document.querySelector("m-mind").insertAdjacentHTML("beforeend",
        `<m-region name="later" modality="text" aperture="open"></m-region>`);
    await loadMindComponents(document);
    await waitFor(() => enumNow().includes("later"));
    expect(enumNow()).toEqual(expect.arrayContaining(["early", "later"]));
});

test("the nearest assembler claims a tool; the agent is the mind's hand; a runtime tool joins the agent", async () => {
    const probe = await mount(`
      <m-mind name="cap-nested">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1" cooldown="0s">
          <m-agent name="builder" role="subagent" toolSettleMs="60" felt="${FELT_AGENT}">
            You are the mind's hands.
            <m-reason name="reason"></m-reason>
            <m-terminal name="terminal" felt="${FELT_INNER}"></m-terminal>
            <m-read-file name="read_file"></m-read-file>
            <t-cap-probe src="../tools"></t-cap-probe>
          </m-agent>
        </m-act>
        <t-cap-probe id="mind-probe" src="!scope/hands/embodiment"></t-cap-probe>
      </m-mind>`);
    const mindProbe = document.getElementById("mind-probe");
    const toolNames = () => (probe.last("../tools") || []).map(t => t.function?.name);
    const body = () => mindProbe.last("!scope/hands/embodiment") || "";

    await waitFor(() => toolNames().includes("terminal") && toolNames().includes("read_file") && body().includes(FELT_AGENT));
    expect(toolNames()).toEqual(expect.arrayContaining(["terminal", "read_file"]));
    expect(body()).toContain(FELT_AGENT);        // the agent offered itself to the mind's m-act
    await quiet();
    expect(body()).not.toContain(FELT_INNER);    // its own tool never leaked to the mind

    const late = document.createElement("m-write-file");
    late.setAttribute("name", "write_file");
    document.querySelector("m-agent").appendChild(late);
    await waitFor(() => toolNames().includes("write_file"));
    expect(toolNames()).toEqual(expect.arrayContaining(["terminal", "read_file", "write_file"]));
    await quiet();
    expect(body()).not.toMatch(/write/i);        // claimed by the agent, not the mind
});

test("an agent's FIRST turn already carries every tool offered at wake", async () => {
    // m-agent holds its first turn until tool offers go quiet (toolSettleMs), so the very
    // first request the model sees has the full menu — however late an offer lands.
    const probe = await mount(`
      <m-agent name="cap-first-turn" maxSteps="4" toolSettleMs="60" stopWhen="no-tools">
        You are a coding agent. Do the task and reply with a short summary.
        <m-objective name="objective">Make the failing tests pass.</m-objective>
        <m-reason name="reason"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
        <m-read-file name="read_file"></m-read-file>
        <t-cap-probe src="../turn"></t-cap-probe>
      </m-agent>`);
    await waitFor(() => probe.seen["../turn"].length > 0, 3000);
    const first = probe.seen["../turn"][0];
    expect(first).toBeTruthy();
    expect(first.tools.map(t => t.function?.name)).toEqual(expect.arrayContaining(["terminal", "read_file"]));
});
