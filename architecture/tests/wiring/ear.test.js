// m-ear — a peer mind's spoken voice crosses the membrane into another mind: it is
// framed as a voice and raised as a bubbling interrupt-request on the listener. Also
// pins the society-relative cross-mind ref (..m-society/<member>/voice/spoken): it must
// resolve to the NAMED member, so two minds reusing the same component name ("voice")
// never cross-bind. (doc/architecture/multi-mind.md)
//
// The minds here are bare <section>s, not <m-mind>s, on purpose: we want to test the EAR
// in isolation, with no stream/watchdog/wander adding bids that would pollute the counts.
// A trivial <m-region> stands in as the spoken-topic publisher (any Amanita component
// with .pub will do; the ref matches it by name, not tag), and we catch each mind's raised
// bids with a plain listener where its arbiter would otherwise sit.
import { test, expect, beforeAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let proverVoice, checkerVoice;
const heard = { prover: [], checker: [] };

beforeAll(async () => {
  document.body.innerHTML = `
    <m-society name="duet">
      <section name="prover">
        <m-region name="voice"></m-region>
        <m-ear from="..m-society/checker/voice/spoken" as="Checker" salience="0.85"></m-ear>
      </section>
      <section name="checker">
        <m-region name="voice"></m-region>
        <m-ear from="..m-society/prover/voice/spoken" as="Prover" salience="0.85"></m-ear>
      </section>
    </m-society>
  `;
  await loadMindComponents(document);
  await delay(80);

  const proverSec = document.querySelector('section[name="prover"]');
  const checkerSec = document.querySelector('section[name="checker"]');
  proverVoice = proverSec.querySelector('[name="voice"]');
  checkerVoice = checkerSec.querySelector('[name="voice"]');

  proverSec.addEventListener("interrupt-request", e => heard.prover.push(e.detail));
  checkerSec.addEventListener("interrupt-request", e => heard.checker.push(e.detail));
});

test("components upgrade and the publishers can pub", () => {
  expect(typeof proverVoice?.pub).toBe("function");
  expect(document.querySelector('section[name="checker"] m-ear')?.on).toBeTruthy();
});

test("the Prover's spoken claim reaches the Checker, framed as a voice", async () => {
  heard.prover.length = 0; heard.checker.length = 0;
  proverVoice.pub("spoken", { text: "I think n = 23 is balanced.", at: 1 });
  await delay(30);
  expect(heard.checker.length).toBe(1);
  const r = heard.checker[0];
  expect(r.from).toBe("Prover");
  expect(r.type).toBe("Peer");
  expect(r.reason).toBe("I think n = 23 is balanced.");
  expect(Math.abs(r.salience - 0.85)).toBeLessThan(1e-9);
  expect(r.urgent).toBe(false);
  expect(r.renderForFrame()).toBe('Prover says: "I think n = 23 is balanced."');
});

test("the membrane holds — the Prover does not overhear itself", async () => {
  heard.prover.length = 0; heard.checker.length = 0;
  proverVoice.pub("spoken", { text: "still me", at: 2 });
  await delay(30);
  expect(heard.prover.length).toBe(0);   // the Prover's ear listens to the Checker, not itself
  expect(heard.checker.length).toBe(1);  // and the Checker did hear it
});

test("a repeated utterance (same `at`) is not raised twice", async () => {
  heard.prover.length = 0;
  checkerVoice.pub("spoken", { text: "checked: it holds", at: 7 });
  await delay(30);
  expect(heard.prover.length).toBe(1);
  checkerVoice.pub("spoken", { text: "checked: it holds", at: 7 }); // retained-replay / duplicate
  await delay(30);
  expect(heard.prover.length).toBe(1);   // deduped on `at`
});

test("an empty utterance is not a voice", async () => {
  heard.prover.length = 0;
  checkerVoice.pub("spoken", { text: "   ", at: 99 });
  await delay(30);
  expect(heard.prover.length).toBe(0);
});
