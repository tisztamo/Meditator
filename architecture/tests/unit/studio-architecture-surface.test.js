import { test, expect } from "bun:test";
import { parseArchitecture } from "../../../src/studio/architectureSurface.js";

test("Studio parses a root society as one multi-mind with an inferred face", () => {
  const meta = parseArchitecture(`<!-- a society -->
<m-society name="hearth-society">
  <m-mind name="face" interlocutor="Margit" stage="experimental" model="voice" utilityModel="utility" pace="18s">
    <m-origin name="origin">Begin with listening.</m-origin>
    <m-speech name="voice"></m-speech>
    <m-ws name="ws"></m-ws>
  </m-mind>
  <m-mind name="kin"><m-speech name="voice"></m-speech></m-mind>
</m-society>`);

  expect(meta.kind).toBe("society");
  expect(meta.name).toBe("hearth-society");
  expect(meta.memory).toBe("hearth-society");
  expect(meta.stage).toBe("experimental");
  expect(meta.hasWs).toBe(true);
  expect(meta.interlocutor).toBe("Margit");
  expect(meta.origin).toBe("Begin with listening.");
  expect(meta.surface).toEqual({ face: "face", ear: "face/ws", mouth: "face/voice", declared: false });
  expect(meta.members.map(m => m.name)).toEqual(["face", "kin"]);
});

test("Studio honors explicit society external ear and mouth attributes", () => {
  const meta = parseArchitecture(`<m-society name="council"
    external-face="speaker"
    external-ear="listener/ws"
    external-mouth="speaker/public-voice">
  <m-mind name="listener"><m-ws name="ws"></m-ws></m-mind>
  <m-mind name="speaker"><m-speech name="public-voice"></m-speech></m-mind>
</m-society>`);

  expect(meta.kind).toBe("society");
  expect(meta.surface).toEqual({
    face: "speaker",
    ear: "listener/ws",
    mouth: "speaker/public-voice",
    declared: true,
  });
});

test("Studio recognizes an m-agent root and surfaces its objective as the editable seed", () => {
  const meta = parseArchitecture(`<!-- a coding agent -->
<m-agent name="coder" model="voice" utilityModel="utility" maxSteps="40" stopWhen="no-tools">
  You are a coding agent.
  <m-objective name="objective">Make the failing tests pass.</m-objective>
  <m-reason name="reason"></m-reason>
  <m-terminal name="terminal"></m-terminal>
  <m-ws name="ws" port="7640"></m-ws>
</m-agent>`);

  expect(meta.kind).toBe("agent");
  expect(meta.name).toBe("coder");
  expect(meta.model).toBe("voice");
  expect(meta.utilityModel).toBe("utility");
  expect(meta.maxSteps).toBe("40");
  expect(meta.stopWhen).toBe("no-tools");
  expect(meta.hasWs).toBe(true);
  // The objective is the seed of the WORK — surfaced as `origin` so the wake form edits
  // it uniformly (the server maps it to MEDITATOR_OBJECTIVE for an agent).
  expect(meta.objective).toBe("Make the failing tests pass.");
  expect(meta.origin).toBe("Make the failing tests pass.");
  expect(meta.description).toBe("a coding agent");
  expect(meta.surface).toBe(null);
  expect(meta.members).toEqual([]);
});

test("Studio parses a service agent (no objective, prompt= on m-objective) too", () => {
  const meta = parseArchitecture(`<m-agent name="svc" stopWhen="finish-tool">
  A service agent.
  <m-reason name="reason"></m-reason>
</m-agent>`);
  expect(meta.kind).toBe("agent");
  expect(meta.name).toBe("svc");
  expect(meta.stopWhen).toBe("finish-tool");
  expect(meta.hasWs).toBe(false);
  expect(meta.origin).toBe(null);   // no <m-objective> — tasks arrive over the membrane
});

test("Studio surfaces an agent's interlocutor so the wake form prefills 'your name'", () => {
  const meta = parseArchitecture(`<m-agent name="coder" interlocutor="user" stopWhen="no-tools">
  A coding agent.
  <m-reason name="reason"></m-reason>
</m-agent>`);
  expect(meta.kind).toBe("agent");
  expect(meta.interlocutor).toBe("user");
});

test("Studio does not read a commented-out m-ws as a live window (agent)", () => {
  // Several shipped agents (coder, coder-async, coder-team) DOCUMENT the optional
  // socket in a comment: "to watch in the Studio, add <m-ws …>". A raw regex read
  // that as a real membrane, so the supervisor looped forever trying to connect to
  // a port that never binds and the agent hung in "waking" — process log, no
  // architecture, no transcript. Comments must be masked before detecting <m-ws>.
  const meta = parseArchitecture(`<m-agent name="coder" stopWhen="no-tools">
  A coding agent.
  <m-objective name="objective">Make the tests pass.</m-objective>
  <m-reason name="reason"></m-reason>
  <!-- To watch it in the Studio, add <m-ws name="ws" port="7640"></m-ws>. -->
</m-agent>`);
  expect(meta.kind).toBe("agent");
  expect(meta.hasWs).toBe(false);
});

test("Studio keeps single-mind parsing unchanged", () => {
  const meta = parseArchitecture(`<m-mind name="seed" memory="seed-home" interlocutor="Kris">
    <m-origin name="origin" prompt="old seed"></m-origin>
    <m-ws name="ws"></m-ws>
  </m-mind>`);

  expect(meta.kind).toBe("mind");
  expect(meta.name).toBe("seed");
  expect(meta.memory).toBe("seed-home");
  expect(meta.surface).toBe(null);
  expect(meta.origin).toBe("old seed");
  expect(meta.interlocutor).toBe("Kris");
  expect(meta.hasWs).toBe(true);
});
