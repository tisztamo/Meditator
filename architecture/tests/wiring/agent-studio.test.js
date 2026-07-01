// The producer side of the Studio agent panel (agent-loop.md §13 M4): an <m-agent>'s
// m-ws is a task port that ALSO forwards the loop as telemetry the Studio renders. We
// wake a dry service agent with a real (ephemeral-port) m-ws, attach a fake client to
// capture its broadcasts, feed it a task, and assert it emits: the classic {type:status}
// state frame (header pill), and `agent/step` / `agent/answer` / `agent/tools` events
// (the transcript). No live socket or supervisor is involved — broadcastToClients just
// iterates ws.clients, so a recording fake client sees exactly the wire.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;
beforeAll(() => {
  savedDry = process.env.MEDITATOR_DRY_RUN;
  savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
  process.env.MEDITATOR_DRY_RUN = "1";
  process.env.MEDITATOR_SANDBOX_BACKEND = "none";
  resetBackendProbe();
});
afterAll(() => {
  document.body.innerHTML = "";
  if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
  if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
  resetBackendProbe();
});

const AGENT = `
  <m-agent name="studio-svc" maxSteps="10" toolSettleMs="60" stopWhen="finish-tool">
    You are a service coding agent. Call finish(summary) when the task is done.
    <m-reason name="reason" toolTokens="256"></m-reason>
    <m-terminal name="terminal" network="off"></m-terminal>
    <m-ws name="ws" port="0"></m-ws>
  </m-agent>`;

test("m-ws forwards an agent's loop as status + agent/step + agent/answer telemetry", async () => {
  document.body.innerHTML = AGENT;
  await loadMindComponents(document);
  const agent = document.querySelector("m-agent");
  const ws = agent.querySelector("m-ws");
  for (let i = 0; i < 120 && !(agent._alive && ws.server && ws._forAgent()); i++) await delay(25);
  expect(ws._forAgent()).toBe(true);

  // A fake client that records every framed message the agent broadcasts.
  const client = { readyState: 1, OPEN: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); }, close() {} };
  ws.clients.add(client);
  ws.clientBuffers.set(client, { inputBuffer: "", clientId: "cap" });

  const done = [];
  agent.addEventListener("done", e => done.push(e.detail));
  agent.fire("task", { text: "Fix the failing parser test." });
  for (let i = 0; i < 160 && done.length < 1; i++) await delay(25);
  expect(done.length).toBe(1);
  await delay(20);   // let the final status/answer broadcasts flush

  const events = client.sent.filter(m => m.type === "event").map(m => m.data);
  const route = d => `${d.process}/${d.kind}`;

  // The header state frame (mind-parallel) reached the client.
  expect(client.sent.some(m => m.type === "status" && m.data && m.data.state)).toBe(true);

  // At least one step, carrying the assistant text / calls / observations shape.
  const steps = events.filter(d => route(d) === "agent/step");
  expect(steps.length).toBeGreaterThan(0);
  const s = steps[0];
  expect(typeof s.index).toBe("number");
  expect(Array.isArray(s.calls)).toBe(true);
  expect(Array.isArray(s.observations)).toBe(true);
  expect(s.calls.length).toBeGreaterThan(0);
  expect(typeof s.calls[0].name).toBe("string");

  // The final answer, once.
  const answers = events.filter(d => route(d) === "agent/answer");
  expect(answers.length).toBe(1);
  expect(answers[0].reason).toBe("finish-tool");

  // The tool palette was emitted at wake and snapshotted (replayed to a fresh client).
  expect(ws._snapshot.has(":agent/tools")).toBe(true);
  const palette = ws._snapshot.get(":agent/tools").data;
  expect(palette.names).toContain("terminal");
  expect(palette.names).toContain("finish");
});
