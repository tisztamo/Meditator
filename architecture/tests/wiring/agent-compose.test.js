// COMPOSITION: a mind owns an agent as a single HAND (agent-loop.md §11, milestone 5),
// fully offline. An <m-agent role="subagent"> nested in the mind's <m-act> offers itself
// as one capability; the mind's realizer hands it a task; the agent runs its WHOLE
// tool-calling loop backstage; and only the OUTCOME re-enters the mind as one plain
// first-person sensation — the One Rule preserved at the mind's membrane. Two levels:
// (1) the wiring + a direct execute() (the seam m-act calls), and (2) the whole path
// through m-act's decide → realize → consequence, driven by the dry reasoner. NO model,
// NO real process. Modeled on act-terminal-dry + agent-loop.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";                 // decide + realize + the whole sub-loop, offline
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";
    resetBackendProbe();
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    // Pre-register every component this file uses (a throwaway load), so each build()'s
    // innerHTML then upgrades in production order — parent m-act, and its `capability`
    // listener, before its children offer. Without this the suite's cross-file
    // registration state can leave m-act unregistered at parse time (upgraded only later,
    // after a child already bubbled its one-shot offer past a listener that wasn't there):
    // a pure test-harness artifact, not a production path (see agent-loop.md §14).
    document.body.innerHTML = MIND();
    await loadMindComponents(document);
    document.body.innerHTML = "";
});

afterAll(() => {
    document.body.innerHTML = "";   // disconnect the mind + subagent so nothing lingers in the shared jsdom
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
});

// A mind whose one world-changing hand IS a subagent. every=1, cooldown 0 so a reach can
// act on any boundary; threshold clears the dry reach's 0.78. No `model` attr anywhere:
// m-act's realizer and the subagent's m-reason then resolve the null-ref hardcoded
// fallback, so no models.yaml is needed offline (as agent-loop does).
const MIND = () => `
  <m-mind name="researcher-test">
    <m-stream name="stream"></m-stream>
    <m-memory name="memory" persist="off"></m-memory>
    <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
    <m-act name="hands" every="1" threshold="0.6" cooldown="0s" intentCooldown="1s">
      <m-agent name="builder" role="subagent" maxSteps="8" toolSettleMs="60" stopWhen="finish-tool">
        You are the researcher's hands. Do the task, checking your work, then finish(summary).
        <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
      </m-agent>
    </m-act>
  </m-mind>
`;

async function build() {
    document.body.innerHTML = MIND();
    await loadMindComponents(document);
    const mind = document.querySelector("m-mind");
    const act = mind.querySelector('[name="hands"]');
    const builder = mind.querySelector('[name="builder"]');
    // Wait for the subagent to have offered itself as a hand AND come alive (reason up +
    // its own terminal settled), rather than a fixed delay — robust under load.
    for (let i = 0; i < 200; i++) {
        const offered = act._capabilities?.some(c => c.name === "builder");
        const settled = builder._tools?.some(t => t.name === "terminal");
        if (offered && settled && builder._alive) break;
        await delay(20);
    }
    return { mind, act, builder, terminal: mind.querySelector('[name="terminal"]') };
}

test("the subagent registers as a HAND on the mind's m-act — world-changing, with a felt line", async () => {
    const { act } = await build();
    const names = act._capabilities.map(c => c.name);
    expect(names).toContain("builder");
    const builderCap = act._capabilities.find(c => c.name === "builder");
    expect(builderCap.readonly).toBe(false);        // an agent that runs commands is world-changing
    expect(builderCap.felt).toBeTruthy();           // woven into the mind's body schema
});

test("the nearest entity owns its tools: the subagent's terminal registers with IT, not the mind", async () => {
    const { act, builder, terminal } = await build();
    // The terminal is in AGENT mode (its nearest enclosing entity is the m-agent)…
    expect(terminal._forAgent).toBe(true);
    // …so it registered with the subagent, and did NOT leak up to the mind's m-act.
    expect(builder._tools.map(t => t.name)).toContain("terminal");
    expect(act._capabilities.map(c => c.name)).not.toContain("terminal");
});

test("a subagent hand does not auto-begin — it idles until the mind reaches for it", async () => {
    const { builder } = await build();
    expect(builder._asHand).toBe(true);
    expect(builder._taskActive).toBe(false);
    expect(builder._messages.length).toBe(0);       // nothing seeded on its own
    expect(builder._retired).toBe(false);
});

test("executing the hand runs the WHOLE sub-loop and returns the outcome as a first-person sensation", async () => {
    const { act, builder } = await build();
    const hand = act._capabilities.find(c => c.name === "builder");

    // Call it exactly as m-act does: (args, { intent }).
    const out = await hand.execute({ task: "Make the failing tests pass." }, { intent: "settle the conjecture by actually checking it" });

    // The sub-loop really ran (dry: two terminal steps, then finish) — the step count is
    // reported back in the receipt data (the loop itself has since reset to idle).
    expect(out.data.steps).toBeGreaterThan(0);
    // The answer is returned verbatim as the observation (for logs/receipts)…
    expect(out.observation).toMatch(/inspected the workspace/i);
    // …and framed as a first-person sensation of work returning — grounded in the reach,
    // no mechanism word (no agent/loop/tool_call/stdout/exit code leaks to the mind).
    expect(out.experience).toBeTruthy();
    expect(out.experience).toMatch(/\bI\b/);
    expect(out.experience).toMatch(/settle the conjecture by actually checking it/);
    expect(out.experience.toLowerCase()).not.toMatch(/\bagent\b|tool_call|\bstdout\b|exit code|\bsubprocess\b/);
    expect(out.type).toBe("Sense-builder");
});

test("the hand resets to idle and can be reached for again", async () => {
    const { act, builder } = await build();
    const hand = act._capabilities.find(c => c.name === "builder");
    await hand.execute({ task: "First piece of work." }, {});
    expect(builder._taskActive).toBe(false);
    expect(builder._handResolve).toBeNull();
    const out2 = await hand.execute({ task: "Second piece of work." }, {});
    expect(out2.observation).toMatch(/inspected the workspace/i);
});

test("end-to-end through m-act: a concrete reach → the sub-loop → a perceived sensation, never a tool result", async () => {
    const { mind, act } = await build();
    const stream = mind.querySelector('[name="stream"]');
    const consequences = [];
    mind.addEventListener("interrupt-request", e => {
        const r = e && e.detail;
        if (r && String(r.type || "").startsWith("Sense-builder")) consequences.push(r);
    });

    // A concrete reach — enough thought (>200 chars) for m-act to judge it. The dry decide
    // accepts on alternate checks and the dry realizer picks the `task`-shaped hand.
    stream.pub("chunk",
        "I have been turning this conjecture over by hand for too long, squaring numbers in my head "
        + "and losing the thread. What I really want is to stop guessing and actually build the check: "
        + "write the little program, run it against the real numbers, and see what actually comes back. ");
    await delay(10);

    for (let i = 0; i < 12 && consequences.length === 0; i++) {
        await act.onBoundary({ reason: "completed" });
        await delay(10);
    }

    expect(consequences.length).toBeGreaterThan(0);
    const c = consequences[0];
    expect(c.source).toBe("External");                       // the world reaching back in
    expect(c.type).toBe("Sense-builder");
    expect(c.reason.toLowerCase()).toMatch(/\bi\b/);         // a first-person sensation
    expect(c.reason.toLowerCase()).not.toMatch(/tool_call|\bstdout\b|exit code|\bsubprocess\b/);
    // The reach's intent rides ALL the way into the consequence — m-act forwards its
    // DECIDE-stage gist as ctx.intent, and _handConsequence weaves it in, so the mind reads
    // an answer that still remembers the question (the twin of the terminal intent fix,
    // commit bf98a26). The dry decide gist is the "light outside" reach.
    expect(c.reason.toLowerCase()).toMatch(/light .* outside|wondering/);
});
