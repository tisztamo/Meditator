// The Plenum, live in the wiring (doc/architecture/plenum.md): positions are
// per-component state seeded deterministically; an infoton rides each message and
// the RECEIVER applies one step at delivery; the envelope survives the
// voice → commons → ear relay so a listener pulls toward the SPEAKER, not the
// relay; replayed retained values are old messages and move nothing; the
// plenumCoupling falloff attenuates a far voice and leaves the control untouched.
//
// Like ear.test.js, the "minds" are bare <section>s and the voices are trivial
// <m-region>s, so no stream/watchdog machinery pollutes the geometry. Tests own
// their geometry: stretching the duet apart (voice.pos = …) stands in for the
// society-anchor distances a real m-society ring would provide.
import { test, expect, beforeAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { dist, SPACE_DEFAULTS, ENERGY } from "../../../src/mindComponents/shared/infoton.js";

const TD = SPACE_DEFAULTS.td;

const HTML = `
  <m-society name="duet">
    <m-commons name="commons" members="prover checker"></m-commons>
    <section name="prover">
      <m-region name="voice"></m-region>
    </section>
    <section name="checker">
      <m-region name="voice"></m-region>
      <m-ear name="plainear" from="..m-society/commons/gossip" as="Prover" salience="0.85"></m-ear>
      <m-ear name="coupledear" from="..m-society/commons/gossip" as="Prover" salience="0.85" plenumCoupling="1"></m-ear>
    </section>
    <m-region name="quiet"></m-region>
  </m-society>
`;

let society, commons, proverVoice, plainEar, coupledEar, quiet, checkerSec;
let quietSeed;
const heard = [];
const gossips = [];

function grab() {
  society = document.querySelector("m-society");
  commons = document.querySelector("m-commons");
  proverVoice = document.querySelector('section[name="prover"] [name="voice"]');
  plainEar = document.querySelector('[name="plainear"]');
  coupledEar = document.querySelector('[name="coupledear"]');
  quiet = document.querySelector('[name="quiet"]');
  checkerSec = document.querySelector('section[name="checker"]');
}

beforeAll(async () => {
  document.body.innerHTML = HTML;
  await loadMindComponents(document);
  await delay(80);
  grab();
  quietSeed = { ...quiet.pos };
  checkerSec.addEventListener("interrupt-request", e => heard.push(e.detail));
  commons.on("gossip", g => gossips.push(g));
});

test("everyone in the space holds a position; the root is pinned at the origin", () => {
  expect(society.pos).toEqual({ x: 0, y: 0, z: 0 });
  for (const el of [commons, proverVoice, plainEar, coupledEar, quiet]) {
    expect(el.pos).toBeTruthy();
    expect([el.pos.x, el.pos.y, el.pos.z].every(Number.isFinite)).toBe(true);
  }
  // Distinct components seed at distinct spots (path-hashed, parent-relative).
  expect(dist(plainEar.pos, coupledEar.pos)).toBeGreaterThan(0);
});

test("seeds are deterministic: the same archml wakes into the same layout", async () => {
  const first = {
    commons: { ...commons.pos }, voice: { ...proverVoice.pos },
    plain: { ...plainEar.pos }, coupled: { ...coupledEar.pos }, quiet: { ...quiet.pos },
  };
  document.body.innerHTML = HTML;                     // remount — classes already defined
  await delay(40);
  grab();
  expect(commons.pos).toEqual(first.commons);
  expect(proverVoice.pos).toEqual(first.voice);
  expect(plainEar.pos).toEqual(first.plain);
  expect(coupledEar.pos).toEqual(first.coupled);
  expect(quiet.pos).toEqual(first.quiet);
  // Re-attach the observers lost with the old DOM.
  quietSeed = { ...quiet.pos };
  checkerSec.addEventListener("interrupt-request", e => heard.push(e.detail));
  commons.on("gossip", g => gossips.push(g));
  await delay(20);
});

test("the envelope survives voice → commons → ear, and each hearing is one step toward the SPEAKER", async () => {
  proverVoice.pos = { x: 300, y: 0, z: 0 };           // stretch the duet apart
  const earBefore = { ...plainEar.pos };
  const commonsBefore = { ...commons.pos };
  const dBefore = dist(earBefore, proverVoice.pos);

  proverVoice.fire("spoken", { text: "I claim n = 23 is balanced.", at: 1 }, { energy: ENERGY.spoken });
  await delay(30);

  // The relay forwarded the speaker's snapshot untouched.
  const g = gossips.at(-1);
  expect(g.speaker).toBe("prover");
  expect(g.infoton).toBeTruthy();
  expect(g.infoton.pos).toEqual({ x: 300, y: 0, z: 0 });
  expect(g.infoton.energy).toBe(ENERGY.spoken);

  // The ear moved one energy·I step toward the VOICE (not toward the commons),
  // and the source did not move (receiver-only — the paper's rule).
  const dAfter = dist(plainEar.pos, proverVoice.pos);
  expect(dAfter).toBeCloseTo(Math.max(TD, dBefore - ENERGY.spoken * SPACE_DEFAULTS.I), 6);
  expect(proverVoice.pos).toEqual({ x: 300, y: 0, z: 0 });
  // The commons heard the voice directly, so it too drifted toward the speaker.
  expect(dist(commons.pos, proverVoice.pos)).toBeLessThan(dist(commonsBefore, proverVoice.pos));
});

test("the coupling: a far voice is fainter for the coupled ear, full-strength for the control", async () => {
  heard.length = 0;
  proverVoice.fire("spoken", { text: "still here", at: 2 }, { energy: ENERGY.spoken });
  await delay(30);
  expect(heard.length).toBe(2);
  const saliences = heard.map(r => r.salience).sort((a, b) => a - b);
  // The control ear bids exactly its authored salience.
  expect(saliences[1]).toBeCloseTo(0.85, 9);
  // The coupled ear is attenuated by falloff(TD/d), computed at its post-step
  // position — strictly weaker than authored, never amplified.
  const dNow = dist(coupledEar.pos, { x: 300, y: 0, z: 0 });
  expect(saliences[0]).toBeCloseTo(0.85 * (TD / Math.max(dNow, TD)), 6);
  expect(saliences[0]).toBeLessThan(0.85);
});

test("convergence is the accumulation of exchanges, and it floors exactly on the TD shell", async () => {
  for (let i = 3; i < 40; i++) {
    proverVoice.fire("spoken", { text: `claim ${i}`, at: i }, { energy: ENERGY.spoken });
    await delay(4);
  }
  await delay(40);
  expect(dist(plainEar.pos, proverVoice.pos)).toBeCloseTo(TD, 6);
  expect(dist(commons.pos, proverVoice.pos)).toBeCloseTo(TD, 6);
  // The source never moved through all of it.
  expect(proverVoice.pos).toEqual({ x: 300, y: 0, z: 0 });
});

test("a replayed retained value is an old message: a late subscriber spends no infoton on it", async () => {
  const late = document.createElement("m-ear");
  late.setAttribute("name", "lateear");
  late.setAttribute("from", "..m-society/commons/gossip");
  late.setAttribute("as", "Prover");
  checkerSec.appendChild(late);
  const seed = { ...late.pos };
  await delay(60);                                    // bind + retained-gossip replay
  expect(late.pos).toEqual(seed);                     // the replay moved nothing

  // …but the next FRESH utterance is a real message and moves it.
  proverVoice.fire("spoken", { text: "one more", at: 99 }, { energy: ENERGY.spoken });
  await delay(30);
  expect(dist(late.pos, seed)).toBeGreaterThan(0);
});

test("the quiet control never moves: no messages, no steps (no tick anywhere)", () => {
  expect(quiet.pos).toEqual(quietSeed);
});
