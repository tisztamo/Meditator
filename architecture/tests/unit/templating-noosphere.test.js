// The noosphere lab is the conversion proof for templating (mind-templating.md §4): six
// experts that share one faculty stack, written once in <m-archetype name="expert"> and
// extended by default via the society's archetype="expert". This test expands the real
// seed file and asserts each member resolves to the full stack with its own overrides —
// a regression guard that the shared skeleton still unfolds correctly. (Byte-equivalence
// of the resolved tree against the pre-conversion file was verified out-of-band with
// scripts/dev/compare-architecture.mjs: identical but for the intended name="commons"
// slot key on the ear.)
import { test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { expandArchitecture } from "../../../src/startup/templating.js";

const SEED = fileURLToPath(new URL("../../lab/noosphere-lab.archml", import.meta.url));

const dom = (text) => { const t = document.createElement("template"); t.innerHTML = text; return t.content; };

let out;
const member = (name) => out.querySelector(`m-mind[name='${name}']`);

test("the noosphere seed expands to six fully-stacked members", async () => {
  out = dom(await expandArchitecture(await readFile(SEED, "utf8")));

  expect(out.querySelectorAll("m-archetype").length).toBe(0);      // archetype stripped
  expect(out.querySelector("m-society").hasAttribute("archetype")).toBe(false);
  const minds = out.querySelectorAll("m-mind");
  expect(minds.length).toBe(6);

  // Every member carries the whole shared stack (written once in the archetype).
  const STACK = ["m-origin[name='origin']", "m-stream[name='stream']", "m-memory[name='memory']",
    "m-interrupts[name='attention']", "m-timeout[name='watchdog']", "m-ear[name='commons']",
    "m-region[name='drift'] m-timeout[name='wander']", "m-loop-detector", "m-clear-mind",
    "m-resurface", "m-act[name='hands'] m-note", "m-act[name='hands'] m-recall",
    "m-speech[name='voice']", "m-kb[name='scribe']", "m-economy", "m-ws"];
  for (const m of minds) {
    for (const sel of STACK) expect(m.querySelector(sel), `${m.getAttribute("name")} → ${sel}`).toBeTruthy();
    expect(m.hasAttribute("extends")).toBe(false);                 // control directive stripped
    expect(m.getAttribute("model")).toBe("voice");                 // inherited static attr
    expect(m.getAttribute("interlocutor")).toBe("Kris");
  }

  // Unique ports survived per member.
  const ports = Array.from(minds).map(m => m.querySelector("m-ws").getAttribute("port"));
  expect(new Set(ports).size).toBe(6);
  expect(ports.sort()).toEqual(["7641", "7642", "7643", "7644", "7645", "7646"]);
});

test("members override the right scalars and add their own hands", async () => {
  out = dom(await expandArchitecture(await readFile(SEED, "utf8")));

  // calculus: overrides + the appended terminal hand (note, recall, terminal).
  const calc = member("calculus");
  expect(calc.querySelector("m-stream").getAttribute("temperature")).toBe("0.82");
  expect(calc.querySelector("m-ear").getAttribute("salience")).toBe("0.68");
  expect(calc.querySelector("m-memory").getAttribute("taillength")).toBe("7200");
  const calcHands = Array.from(calc.querySelector("m-act[name='hands']").children).map(c => c.tagName.toLowerCase());
  expect(calcHands).toEqual(["m-note", "m-recall", "m-terminal"]);

  // chronicle: a fresh hands keeps read/note/recall ORDER (read first), with its read hand.
  const chron = member("chronicle");
  const chronHands = Array.from(chron.querySelector("m-act[name='hands']").children).map(c => c.tagName.toLowerCase());
  expect(chronHands).toEqual(["m-look", "m-note", "m-recall"]);
  expect(chron.querySelector("m-look[name='read']").getAttribute("newsurl")).toContain("wikipedia.org");

  // criticism: overrides nothing on the stream/ear, so it inherits the archetype defaults.
  const crit = member("criticism");
  expect(crit.querySelector("m-stream").getAttribute("temperature")).toBe("0.84");
  expect(crit.querySelector("m-stream").getAttribute("bursttokens")).toBe("330");
  expect(crit.querySelector("m-ear").getAttribute("salience")).toBe("0.66");

  // synthesis: the most-tuned member.
  const synth = member("synthesis");
  expect(synth.querySelector("m-interrupts[name='attention']").getAttribute("keep")).toBe("4");
  expect(synth.querySelector("m-kb[name='scribe']").getAttribute("every")).toBe("12");
  expect(synth.querySelector("m-economy").getAttribute("budget")).toBe("0.45");
  expect(synth.querySelector("m-speech[name='voice']").getAttribute("every")).toBe("3");
});
