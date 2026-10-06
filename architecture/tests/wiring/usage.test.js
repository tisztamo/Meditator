// Spend attributed by the caller (message-rule review §2.3). llm.js used to keep
// one process-wide usage total that every m-economy read, so in a society each
// mind was charged for everyone's calls. Now the component that made a call fires
// `usage` and an economy adds up what it hears on its own membrane. These tests
// put two minds side by side, one with a sub-agent inside it, and read what each
// economy publishes at its boundary.
import "./setup.js";
import { test, expect, afterEach } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js";
import { spend, spent } from "../../../src/mindComponents/shared/usage.js";
import { watchTopic } from "./topicProbe.js";

// Own tags: the custom-element registry is shared across the wiring files.
class UsageMind extends MBaseComponent { static provides = { mind: true } }
class UsageAgent extends MBaseComponent { static provides = { agent: true } }
class UsageSociety extends MBaseComponent { static provides = { society: true } }
// A faculty that makes a "call" and attributes it, as a model caller does.
class UsageSpender extends MBaseComponent {}
// The stream's boundary is when an economy takes its reading.
class UsageStream extends MBaseComponent {}
for (const [tag, cls] of [["u-mind", UsageMind], ["u-agent", UsageAgent], ["u-society", UsageSociety],
                          ["u-spender", UsageSpender], ["u-stream", UsageStream]]) {
  if (!customElements.get(tag)) customElements.define(tag, cls);
}

afterEach(async () => {
  document.body.replaceChildren();
  await delay(20);
});

async function mount(html) {
  document.body.innerHTML = html;
  await loadMindComponents(document);
  await delay(20);   // the economies' subscriptions resolve
}

const mindHtml = (name, inner = "") => `
  <u-mind name="${name}">
    <u-stream name="stream"></u-stream>
    <m-economy name="economy" budget="1.00"></m-economy>
    <u-spender name="hand"></u-spender>
    ${inner}
  </u-mind>`;

async function boundary(root) {
  for (const stream of root.querySelectorAll("u-stream")) stream.fire("boundary", { reason: "completed" });
}

test("each mind's economy is charged for its own spend, not its neighbour's", async () => {
  await mount(`<u-society name="duet">${mindHtml("a")}${mindHtml("b")}</u-society>`);
  const [a, b] = document.querySelectorAll("u-mind");
  const spentA = await watchTopic(a.querySelector("m-economy"), "spent");
  const spentB = await watchTopic(b.querySelector("m-economy"), "spent");

  spend(a.querySelector("u-spender"), { prompt_tokens: 100, completion_tokens: 10, cost: 0.25 });
  spend(b.querySelector("u-spender"), { prompt_tokens: 100, completion_tokens: 10, cost: 0.05 });
  await boundary(document);

  expect(await spentA.until(v => v > 0)).toBeCloseTo(0.25, 9);
  expect(await spentB.until(v => v > 0)).toBeCloseTo(0.05, 9);
});

test("a mind pays for what a sub-agent inside it spends", async () => {
  await mount(mindHtml("host", `<u-agent name="helper"><u-spender name="sub"></u-spender></u-agent>`));
  const mind = document.querySelector("u-mind");
  const spentHost = await watchTopic(mind.querySelector("m-economy"), "spent");

  spend(mind.querySelector("u-spender[name='hand']"), { prompt_tokens: 1, completion_tokens: 1, cost: 0.1 });
  spend(mind.querySelector("u-spender[name='sub']"), { prompt_tokens: 1, completion_tokens: 1, cost: 0.2 });
  await boundary(document);

  expect(await spentHost.until(v => v > 0.25)).toBeCloseTo(0.3, 9);
});

test("with no reported cost the economy estimates from the tokens it heard", async () => {
  await mount(mindHtml("solo").replace('budget="1.00"', 'budget="1.00" estInPrice="1" estOutPrice="2"'));
  const mind = document.querySelector("u-mind");
  const spentSolo = await watchTopic(mind.querySelector("m-economy"), "spent");

  const hand = mind.querySelector("u-spender");
  // A call through spent(): the result passes through, its usage is attributed.
  const result = spent(hand, { text: "ok", usage: { prompt_tokens: 3000, completion_tokens: 500 } });
  expect(result.text).toBe("ok");
  // A soft-failed decide() (null) made no billable call.
  expect(spent(hand, null)).toBeNull();
  await boundary(document);

  // 3000 in at $1/M + 500 out at $2/M.
  expect(await spentSolo.until(v => v > 0)).toBeCloseTo(0.004, 9);
});
