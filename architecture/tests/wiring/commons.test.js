// m-commons — one society relay turns member voices into a shared gossip topic.
// Individual minds still hear through their own m-ear, so the ingress path remains
// local to the listener.
import { test, expect, beforeAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let calculusVoice, historyVoice;
const heard = { calculus: [], history: [] };

beforeAll(async () => {
  document.body.innerHTML = `
    <m-society name="commons-test">
      <m-commons name="commons" members="calculus history"></m-commons>
      <section name="calculus">
        <m-region name="voice"></m-region>
        <m-ear from="..m-society/commons/gossip" as="Commons" ignoreSpeaker="calculus" salience="0.7"></m-ear>
      </section>
      <section name="history">
        <m-region name="voice"></m-region>
        <m-ear from="..m-society/commons/gossip" as="Commons" ignoreSpeaker="history" salience="0.7"></m-ear>
      </section>
    </m-society>
  `;
  await loadMindComponents(document);
  await delay(80);

  const calculus = document.querySelector('section[name="calculus"]');
  const history = document.querySelector('section[name="history"]');
  calculusVoice = calculus.querySelector('[name="voice"]');
  historyVoice = history.querySelector('[name="voice"]');
  calculus.addEventListener("interrupt-request", e => heard.calculus.push(e.detail));
  history.addEventListener("interrupt-request", e => heard.history.push(e.detail));
});

test("commons relays one member's speech to the other with speaker attribution", async () => {
  heard.calculus.length = 0; heard.history.length = 0;
  calculusVoice.fire("spoken", { text: "The invariant is modulo 9.", at: 1 });
  await delay(30);

  expect(heard.calculus.length).toBe(0);
  expect(heard.history.length).toBe(1);
  expect(heard.history[0].from).toBe("calculus");
  expect(heard.history[0].reason).toBe("The invariant is modulo 9.");
  expect(heard.history[0].renderForFrame()).toBe('calculus says: "The invariant is modulo 9."');
});

test("commons dedupes duplicate utterances (same `at`) per speaker", async () => {
  heard.calculus.length = 0; heard.history.length = 0;
  historyVoice.fire("spoken", { text: "That form appears in a chronicle.", at: 4 });
  await delay(30);
  historyVoice.fire("spoken", { text: "That form appears in a chronicle.", at: 4 });
  await delay(30);

  expect(heard.calculus.length).toBe(1);
  expect(heard.history.length).toBe(0);
});
