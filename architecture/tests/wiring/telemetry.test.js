// Telemetry as a message (message-rule review §2.1). m-ws used to find each
// faculty by tag and read some of them by method, so a substitute faculty went
// silent in the Studio. Now a faculty fires `telemetry {process, kind, data}` and
// m-ws forwards what it hears under its membrane. These tests use a faculty m-ws
// has never heard of, a society member's faculty, and the `telemetry-wanted`
// replay a faculty answers once the transport listens.
import "./setup.js";
import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js";
import { telemetry, onTelemetryWanted, TELEMETRY_EVENT } from "../../../src/mindComponents/shared/telemetry.js";

// Own tags: the custom-element registry is shared across the wiring files, and
// another file may already have defined `m-mind` as a plain stub. m-ws finds its
// mind and a society's members by role (review §2.6), so custom tags that provide
// `mind` and `society` stand in for the built-in ones.
class StubMind extends MBaseComponent { static provides = { mind: true } }
class StubSociety extends MBaseComponent { static provides = { society: true } }
// A memory m-ws has never heard of: it reports its state, and again when asked.
class XMemory extends MBaseComponent {
  onConnect() {
    onTelemetryWanted(this, () => telemetry(this, "memory", "state", { tailLen: 7, recentLen: 0, storyLen: 0 }));
  }
}
for (const [tag, cls] of [["x-mind", StubMind], ["x-society", StubSociety], ["x-memory", XMemory]]) {
  if (!customElements.get(tag)) customElements.define(tag, cls);
}

// The stub minds publish their text as `prompt`, so keep the streams' bursts dry.
let savedDry;
beforeAll(() => { savedDry = process.env.MEDITATOR_DRY_RUN; process.env.MEDITATOR_DRY_RUN = "1"; });
afterAll(() => {
  if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

afterEach(async () => {
  document.body.replaceChildren();
  await delay(20);
});

async function mount(html) {
  document.body.innerHTML = html;
  await loadMindComponents(document);
}

/** A recording client on `ws`, once its instrumentation is listening. */
async function attach(ws) {
  for (let i = 0; i < 200 && !ws.server; i++) await delay(10);
  const client = { readyState: 1, OPEN: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); }, close() {} };
  ws.clients.add(client);
  ws.clientBuffers.set(client, { inputBuffer: "", clientId: "cap" });
  return client;
}

const events = client => client.sent.filter(m => m.type === "event").map(m => m.data);
const routed = (client, route) => events(client).filter(d => `${d.process}/${d.kind}` === route);

async function until(pred, tries = 200) {
  for (let i = 0; i < tries && !pred(); i++) await delay(10);
}

test("a faculty m-ws never looks up is forwarded, and answers telemetry-wanted", async () => {
  await mount(`
    <x-mind name="solo">
      <m-stream name="stream"></m-stream>
      <x-memory name="memory"></x-memory>
      <m-ws name="ws" port="0"></m-ws>
    </x-mind>`);
  const ws = document.querySelector("m-ws");
  const memory = document.querySelector("x-memory");
  // The replay lands in the snapshot a fresh client is sent.
  await until(() => ws._snapshot.has(":memory/state"));
  expect(ws._snapshot.get(":memory/state").data.tailLen).toBe(7);

  const client = await attach(ws);
  telemetry(memory, "memory", "compressed", { recentLen: 3, storyLen: 0, recentPreview: "abc", storyPreview: "" });
  await until(() => routed(client, "memory/compressed").length > 0);
  const [c] = routed(client, "memory/compressed");
  expect(c.recentPreview).toBe("abc");
  expect(c.member).toBeUndefined();
  // A built-in reports the same way: the stream's (dry) burst ends in a boundary.
  await until(() => ws._snapshot.has(":stream/boundary"));
  expect(typeof ws._snapshot.get(":stream/boundary").data.burstIndex).toBe("number");
});

test("a payload's own kind stays the route's kind on the wire, as before", async () => {
  await mount(`
    <x-mind name="solo">
      <m-stream name="stream"></m-stream>
      <x-memory name="loop-detector"></x-memory>
      <m-ws name="ws" port="0"></m-ws>
    </x-mind>`);
  const ws = document.querySelector("m-ws");
  const client = await attach(ws);
  await until(() => ws._snapshot.has(":memory/state"));
  telemetry(document.querySelector("x-memory"), "loop", "state", { kind: "loop", score: 0.9 });
  await until(() => events(client).some(d => d.process === "loop"));
  const loop = events(client).find(d => d.process === "loop");
  // m-ws spreads the payload over {process, kind}: the loop sense's `kind` wins,
  // exactly as when m-ws read the `loop` topic itself.
  expect(loop.kind).toBe("loop");
  expect(loop.score).toBe(0.9);
});

test("telemetry stops at the membrane", async () => {
  await mount(`
    <div id="outside">
      <x-mind name="inner"><x-memory name="memory"></x-memory></x-mind>
    </div>`);
  const mind = document.querySelector("x-mind");
  const heardInside = [], crossed = [];
  mind.addEventListener(TELEMETRY_EVENT, e => heardInside.push(e.detail));
  document.getElementById("outside").addEventListener(TELEMETRY_EVENT, e => crossed.push(e.detail));
  await delay(20);
  telemetry(document.querySelector("x-memory"), "memory", "state", { tailLen: 1, recentLen: 0, storyLen: 0 });
  await until(() => heardInside.length > 0);
  await delay(20);
  expect(heardInside.length).toBe(1);
  expect(crossed).toEqual([]);
});

test("a society member's telemetry reaches the public socket, tagged with the member", async () => {
  await mount(`
    <x-society name="duet">
      <x-mind name="front">
        <m-stream name="stream"></m-stream>
        <m-ws name="ws" port="0"></m-ws>
      </x-mind>
      <x-mind name="back">
        <m-stream name="stream"></m-stream>
        <x-memory name="memory"></x-memory>
      </x-mind>
    </x-society>`);
  const ws = document.querySelector("m-ws");
  const client = await attach(ws);
  await delay(50);

  telemetry(document.querySelector("x-memory"), "memory", "state", { tailLen: 2, recentLen: 0, storyLen: 0 });
  await until(() => routed(client, "memory/state").length > 0);
  const states = routed(client, "memory/state");
  expect(states.length).toBe(1);
  expect(states[0].member).toBe("back");
  expect(states[0].public).toBe(false);
  expect(states[0].tailLen).toBe(2);
});
