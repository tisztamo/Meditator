// ArchML templating: a file carries the shared faculty stack ONCE (an <m-archetype>)
// and each member is written as only what makes it itself — its prose, origin, a few
// overridden scalars, the faculties it adds or drops. expandArchitecture() is a pure
// text → text pass run at wake before the name/origin/interlocutor overrides, so the
// running tree and the home snapshot are the fully-resolved architecture. The merge ⊕
// is deep and keyed by SLOT (a child's `name`/role), not by tag. See
// src/startup/templating.js and doc/improvements/mind-templating.md.
import { test, expect } from "bun:test";
import { expandArchitecture, mergeInto, instantiate } from "../../../src/startup/templating.js";

// Parse expanded output back into a queryable fragment (the same parser start.js uses).
const dom = (text) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = text;
  return tpl.content;
};
const el = (text) => dom(text).firstElementChild;
const expand = (text, opts) => expandArchitecture(text, opts);

// ── backward compatibility ─────────────────────────────────────────────────────

test("a file with no templating tokens is returned byte-for-byte unchanged", async () => {
  const src = `<m-mind name="lemma">\n  You are a mind.\n  <m-origin name="origin">a seed</m-origin>\n  <m-stream name="stream"></m-stream>\n</m-mind>\n`;
  expect(await expand(src)).toBe(src);
});

// ── basic inheritance ──────────────────────────────────────────────────────────

test("a mind inherits the archetype's faculty stack and keeps its own body", async () => {
  const src = `<m-society name="s">
    <m-archetype name="base" model="voice" pace="12s">
      <m-stream name="stream" temperature="0.8"></m-stream>
      <m-loop-detector name="loop-detector" every="5"></m-loop-detector>
    </m-archetype>
    <m-mind extends="base" name="alice">
      You are Alice.
      <m-origin name="origin">a seed</m-origin>
    </m-mind>
  </m-society>`;
  const mind = el(await expand(src)).querySelector("m-mind");
  // Inherited static attributes from the archetype:
  expect(mind.getAttribute("model")).toBe("voice");
  expect(mind.getAttribute("pace")).toBe("12s");
  expect(mind.getAttribute("name")).toBe("alice");          // own name wins
  // Inherited faculties + own origin, in archetype order then appended:
  expect(mind.querySelector("m-stream")).toBeTruthy();
  expect(mind.querySelector("m-loop-detector")).toBeTruthy();
  expect(mind.querySelector("m-origin").textContent.trim()).toBe("a seed");
  // The instance is an <m-mind>, never an <m-archetype>; archetypes are stripped.
  expect(el(await expand(src)).querySelector("m-archetype")).toBeNull();
  // Control directives never leak into the running tree.
  expect(mind.hasAttribute("extends")).toBe(false);
});

test("the archetype's persona text is replaced by the member's prose", async () => {
  const src = `<m-archetype name="base">{{persona}}<m-stream name="stream"></m-stream></m-archetype>
    <m-mind extends="base" name="alice">You are Alice, exactly.</m-mind>`;
  const out = dom(await expand(src)).querySelector("m-mind");
  expect(out.textContent).toContain("You are Alice, exactly.");
  expect(out.textContent).not.toContain("{{persona}}");
  expect(out.querySelector("m-stream")).toBeTruthy();   // faculties still merge in
});

// ── attribute merge ─────────────────────────────────────────────────────────────

test("a member overrides one scalar and inherits the rest", async () => {
  const src = `<m-archetype name="base">
      <m-stream name="stream" temperature="0.8" burstTokens="340"></m-stream>
    </m-archetype>
    <m-mind extends="base" name="alice">
      <m-stream name="stream" temperature="0.95"></m-stream>
    </m-mind>`;
  const stream = dom(await expand(src)).querySelector("m-mind m-stream");
  expect(stream.getAttribute("temperature")).toBe("0.95");        // overridden
  expect(stream.getAttribute("bursttokens")).toBe("340");          // inherited (HTML lowercases attr names)
});

// ── nested / deep merge ─────────────────────────────────────────────────────────

test("a member tunes a nested slot and appends a new sibling, keeping inherited siblings", async () => {
  const src = `<m-archetype name="base">
      <m-act name="hands" cooldown="60s">
        <m-note name="note" felt="default note"></m-note>
        <m-recall name="recall" felt="default recall"></m-recall>
      </m-act>
    </m-archetype>
    <m-mind extends="base" name="alice">
      <m-act name="hands" cooldown="20s">
        <m-note name="note" felt="alice note"></m-note>
        <m-terminal name="terminal" wall="15s"></m-terminal>
      </m-act>
    </m-mind>`;
  const hands = dom(await expand(src)).querySelector("m-mind m-act[name='hands']");
  expect(hands.getAttribute("cooldown")).toBe("20s");                              // act-level override
  expect(hands.querySelector("m-note").getAttribute("felt")).toBe("alice note");  // nested override
  expect(hands.querySelector("m-recall").getAttribute("felt")).toBe("default recall"); // inherited
  expect(hands.querySelector("m-terminal")).toBeTruthy();                          // appended new slot
  // Order: inherited note, recall, then the appended terminal.
  expect(Array.from(hands.children).map(c => c.tagName.toLowerCase()))
    .toEqual(["m-note", "m-recall", "m-terminal"]);
});

// ── implementation swap & fresh ─────────────────────────────────────────────────

test("a different tag in the same slot swaps the implementation in place, inheriting config", async () => {
  const src = `<m-archetype name="base">
      <m-origin name="origin" data-x="1">inherited text</m-origin>
    </m-archetype>
    <m-mind extends="base" name="alice">
      <my-origin name="origin">custom impl</my-origin>
    </m-mind>`;
  const slot = dom(await expand(src)).querySelector("m-mind").children[0];
  expect(slot.tagName.toLowerCase()).toBe("my-origin");      // implementation swapped
  expect(slot.getAttribute("data-x")).toBe("1");             // config inherited from the base slot
  expect(slot.textContent).toContain("custom impl");         // own text replaces inherited
});

test("fresh=\"true\" opts out of config inheritance for a slot", async () => {
  const src = `<m-archetype name="base">
      <m-origin name="origin" data-x="1" data-y="2">inherited</m-origin>
    </m-archetype>
    <m-mind extends="base" name="alice">
      <m-origin name="origin" fresh="true" data-z="9">from nothing</m-origin>
    </m-mind>`;
  const slot = dom(await expand(src)).querySelector("m-mind m-origin");
  expect(slot.getAttribute("data-z")).toBe("9");
  expect(slot.hasAttribute("data-x")).toBe(false);          // inherited nothing
  expect(slot.hasAttribute("data-y")).toBe(false);
  expect(slot.hasAttribute("fresh")).toBe(false);           // control attr stripped
  expect(slot.textContent).toContain("from nothing");
});

// ── drop ─────────────────────────────────────────────────────────────────────

test("drop removes inherited faculties by name", async () => {
  const src = `<m-archetype name="base">
      <m-resurface name="resurface"></m-resurface>
      <m-kb name="scribe"></m-kb>
      <m-stream name="stream"></m-stream>
    </m-archetype>
    <m-mind extends="base" name="vigil" drop="resurface scribe">
      You are Vigil.
    </m-mind>`;
  const mind = dom(await expand(src)).querySelector("m-mind");
  expect(mind.querySelector("m-resurface")).toBeNull();
  expect(mind.querySelector("m-kb")).toBeNull();
  expect(mind.querySelector("m-stream")).toBeTruthy();      // the rest is kept
  expect(mind.hasAttribute("drop")).toBe(false);            // control attr stripped
});

// ── mixins (N-element extends) and chains ───────────────────────────────────────

test("extends=\"a b\" folds both layers, later wins", async () => {
  const src = `<m-archetype name="a"><m-stream name="stream" temperature="0.1"></m-stream><m-x name="x"></m-x></m-archetype>
    <m-archetype name="b"><m-stream name="stream" temperature="0.9"></m-stream><m-y name="y"></m-y></m-archetype>
    <m-mind extends="a b" name="alice"></m-mind>`;
  const mind = dom(await expand(src)).querySelector("m-mind");
  expect(mind.querySelector("m-stream").getAttribute("temperature")).toBe("0.9");  // b wins over a
  expect(mind.querySelector("m-x")).toBeTruthy();                                   // from a
  expect(mind.querySelector("m-y")).toBeTruthy();                                   // from b
});

test("an archetype may extend another archetype (chain resolves before use)", async () => {
  const src = `<m-archetype name="root" model="voice"><m-stream name="stream"></m-stream></m-archetype>
    <m-archetype name="mid" extends="root"><m-loop-detector name="loop-detector"></m-loop-detector></m-archetype>
    <m-mind extends="mid" name="alice"></m-mind>`;
  const mind = dom(await expand(src)).querySelector("m-mind");
  expect(mind.getAttribute("model")).toBe("voice");          // from root, via mid
  expect(mind.querySelector("m-stream")).toBeTruthy();        // from root
  expect(mind.querySelector("m-loop-detector")).toBeTruthy(); // from mid
});

// ── society default ─────────────────────────────────────────────────────────────

test("a society's archetype= is the default every member extends; extends=\"none\" opts out", async () => {
  const src = `<m-society name="s" archetype="base">
      <m-archetype name="base" model="voice"><m-stream name="stream"></m-stream></m-archetype>
      <m-mind name="a"></m-mind>
      <m-mind name="b" extends="none"></m-mind>
    </m-society>`;
  const out = dom(await expand(src));
  const a = out.querySelector("m-mind[name='a']");
  const b = out.querySelector("m-mind[name='b']");
  expect(a.getAttribute("model")).toBe("voice");             // inherited the society default
  expect(a.querySelector("m-stream")).toBeTruthy();
  expect(b.querySelector("m-stream")).toBeNull();            // opted out
  expect(out.querySelector("m-society").hasAttribute("archetype")).toBe(false); // control attr stripped
});

// ── unnamed children are layer-local ────────────────────────────────────────────

test("unnamed children are layer-local: never a merge target, always inherited/appended", async () => {
  const src = `<m-archetype name="base">
      <m-region name="drift"><m-interrupts gain="0.6"></m-interrupts></m-region>
    </m-archetype>
    <m-mind extends="base" name="alice">
      <m-region name="drift"><m-interrupts gain="0.9"></m-interrupts></m-region>
    </m-mind>`;
  const drift = dom(await expand(src)).querySelector("m-mind m-region[name='drift']");
  const interrupts = drift.querySelectorAll("m-interrupts");
  // Both unnamed m-interrupts survive (neither is a merge target), base then member.
  expect(interrupts.length).toBe(2);
  expect(interrupts[0].getAttribute("gain")).toBe("0.6");
  expect(interrupts[1].getAttribute("gain")).toBe("0.9");
});

// ── imports ─────────────────────────────────────────────────────────────────────

test("an archetype can be imported from another file and inlined", async () => {
  const imported = `<m-archetype name="mathematician" model="voice"><m-stream name="stream"></m-stream></m-archetype>`;
  const src = `<m-society name="duet">
      <m-import src="../archetypes/mathematician.archml"></m-import>
      <m-mind extends="mathematician" name="prover"></m-mind>
    </m-society>`;
  const resolveImport = async (s) => (s.endsWith("mathematician.archml") ? imported : (() => { throw new Error("not found"); })());
  const out = dom(await expand(src, { resolveImport }));
  expect(out.querySelector("m-mind[name='prover'] m-stream")).toBeTruthy();
  expect(out.querySelector("m-mind[name='prover']").getAttribute("model")).toBe("voice");
  expect(out.querySelector("m-import")).toBeNull();          // import node removed
});

test("an inline archetype wins over an imported one of the same name", async () => {
  const imported = `<m-archetype name="base" model="imported"></m-archetype>`;
  const src = `<m-import src="x.archml"></m-import>
    <m-archetype name="base" model="inline"></m-archetype>
    <m-mind extends="base" name="a"></m-mind>`;
  const out = dom(await expand(src, { resolveImport: async () => imported }));
  expect(out.querySelector("m-mind").getAttribute("model")).toBe("inline");
});

// ── errors fail loud ─────────────────────────────────────────────────────────────

test("an unknown extends name throws and lists what is available", async () => {
  const src = `<m-archetype name="base"></m-archetype><m-mind extends="nope" name="a"></m-mind>`;
  await expect(expand(src)).rejects.toThrow(/Unknown archetype "nope".*base/s);
});

test("an archetype extends cycle throws", async () => {
  const src = `<m-archetype name="a" extends="b"></m-archetype>
    <m-archetype name="b" extends="a"></m-archetype>
    <m-mind extends="a" name="m"></m-mind>`;
  await expect(expand(src)).rejects.toThrow(/cycle/i);
});

test("a duplicate slot name within a parent throws", async () => {
  const src = `<m-mind name="a" extends="none">
      <m-stream name="stream"></m-stream>
      <m-stream name="stream"></m-stream>
    </m-mind>`;
  await expect(expand(src)).rejects.toThrow(/Duplicate slot name "stream"/);
});

test("a missing import src throws", async () => {
  const src = `<m-import></m-import><m-mind extends="x" name="a"></m-mind>`;
  await expect(expand(src)).rejects.toThrow(/src attribute/);
});

// ── the merge & production primitives directly ──────────────────────────────────

test("mergeInto deep-merges a patch onto a base element", () => {
  const base = el(`<m-act name="hands" cooldown="60s"><m-note name="note" felt="a"></m-note></m-act>`);
  const patch = el(`<m-act name="hands" cooldown="20s"><m-terminal name="terminal"></m-terminal></m-act>`);
  const merged = mergeInto(base, patch);
  expect(merged.getAttribute("cooldown")).toBe("20s");
  expect(merged.querySelector("m-note").getAttribute("felt")).toBe("a");  // inherited
  expect(merged.querySelector("m-terminal")).toBeTruthy();                // appended
});

test("instantiate builds a mind from an archetype plus overrides", () => {
  const arche = el(`<m-archetype name="base" model="voice"><m-stream name="stream" temperature="0.8"></m-stream><m-origin name="origin">{{origin}}</m-origin></m-archetype>`);
  const mind = instantiate(arche, { name: "newcomer", persona: "You are New.", origin: "a fresh task" });
  expect(mind.tagName.toLowerCase()).toBe("m-mind");
  expect(mind.getAttribute("name")).toBe("newcomer");
  expect(mind.getAttribute("model")).toBe("voice");
  expect(mind.querySelector("m-stream").getAttribute("temperature")).toBe("0.8");
  expect(mind.querySelector("m-origin").textContent).toContain("a fresh task");
  expect(mind.textContent).toContain("You are New.");
});
