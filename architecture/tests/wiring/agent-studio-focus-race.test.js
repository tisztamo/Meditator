// Regression (found live: a freshly-woken coder-service agent showed a BLANK Studio panel —
// no steps, no finish call, no answer). The cause was a message-ordering race, not a
// rendering bug: on a fresh wake the supervisor sends `woke` immediately but coalesces the
// `roster` ~120ms behind it, so focusing the new entity guessed kind="mind" (the _kindOf
// default). The supervisor's state+backfill focus-reply then arrived within milliseconds —
// while focusedKind was still "mind" — and studio-transcript's isAgent gate DROPPED the
// backfill; when the roster finally corrected the kind, nothing re-fetched the lost batch
// and an idle agent emitted no further live events, so the panel stayed empty.
//
// The fix: the `woke` reply carries the entity's `kind`, and studio-conn seeds a kind hint
// from it so focus() knows the kind on the first frame — before the roster arrives. This
// drives the REAL StudioConn (socket stubbed) through the exact wire ordering, mounting the
// real transcript + stream, and asserts the agent's backfill renders.
import "./setup.js";
import { test, expect } from "bun:test";
import { delay } from "./setup.js";
import A from "amanita";
import { StudioConn } from "../../../src/studio/ui/studioConn.js";
import "../../../src/studio/ui/studioTranscript.js";
import "../../../src/studio/ui/studioStream.js";

class TestConn extends StudioConn {
  onConnect() {}            // the real routing (onMsg/focus/_kindOf), no socket
  send() {}
}
if (!customElements.get("test-conn-race")) A.define("test-conn-race", TestConn);

const settle = () => delay(20);

const AGENT_ROSTER = { id: "m1", kind: "agent", name: "coder-service-5", home: "memory/coder-service-5", state: "awake", port: 7627 };
const STEP = { k: "agent-step", index: 1, assistantText: "", calls: [{ name: "finish", args: { summary: "greeted" } }], observations: [{ name: "finish", observation: "finished: greeted", isError: false }] };
const ANSWER = { k: "agent-answer", t: "Hello! How can I help you today?", reason: "finish-tool", steps: 2 };

function mountRace() {
  document.body.innerHTML = `<test-conn-race name="conn"><studio-transcript id="transcript"></studio-transcript><studio-stream id="stream"></studio-stream></test-conn-race>`;
  const hub = document.querySelector("test-conn-race");
  return { hub, transcript: document.querySelector("#transcript"), stream: document.querySelector("#stream") };
}

test("a freshly-woken agent renders its backfill even though it arrives before the roster", async () => {
  const { hub, transcript, stream } = mountRace();
  await settle();

  // `woke` (carrying kind) arrives first — roster is still empty (the 120ms coalesce).
  hub.onMsg({ type: "hello", data: { publicPort: 7627, profiles: [], modelProfile: "local-voice", voice: {} } });
  hub.onMsg({ type: "woke", data: { id: "m1", file: "agents/coder-service.archml", kind: "agent" } });
  await settle();
  expect(transcript.style.display).toBe("");     // known to be an agent from the woke hint
  expect(stream.style.display).toBe("none");

  // The supervisor's focus-reply (state + backfill) comes back within ms — BEFORE the roster.
  hub.onMsg({ type: "state", data: { id: "m1", structure: { tag: "m-agent", name: "coder-service-5" }, status: "idle", snapshots: [] } });
  hub.onMsg({ type: "backfill", data: { id: "m1", entries: [STEP, ANSWER], lastSeq: 5 } });
  await settle();
  expect(transcript.querySelectorAll(".ag-step").length).toBe(1);   // NOT dropped
  expect(transcript.querySelector(".ag-answer").textContent).toContain("Hello!");

  // The roster catches up later; focus stays an agent and the content is intact.
  hub.onMsg({ type: "roster", data: { minds: [AGENT_ROSTER] } });
  await settle();
  expect(transcript.style.display).toBe("");
  expect(transcript.querySelectorAll(".ag-step").length).toBe(1);
});

test("_kindOf prefers the roster, then a woke hint, then defaults to mind", async () => {
  const { hub } = mountRace();
  await settle();
  expect(hub._kindOf("mX")).toBe("mind");                                   // unknown → default
  hub.onMsg({ type: "woke", data: { id: "mX", file: "f", kind: "agent" } }); // hint before any roster
  expect(hub._kindOf("mX")).toBe("agent");                                  // hint wins over default
  hub.onMsg({ type: "roster", data: { minds: [{ id: "mX", kind: "society", state: "awake" }] } });
  expect(hub._kindOf("mX")).toBe("society");                               // roster is authoritative
});
