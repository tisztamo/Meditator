// studio-plenum — the 3D viewer's graph building and event→dynamics routing
// (the chora-imagined.md Plenum prototype). The renderer needs a real canvas and
// is not under test; buildGraph and onEvent are the logic that must be right:
// a society becomes one cluster per member around a commons hub, member-tagged
// telemetry lands on THAT member's faculties, and messages become pulses that
// deposit infoton co-location heat between their endpoints.
import "./setup.js";
import { test, expect } from "bun:test";
import { buildGraph, familyOf, StudioPlenum, PALETTE } from "../../../src/studio/ui/studioPlenum.js";

void StudioPlenum;   // importing the module registers <studio-plenum>

const societyTree = {
  tag: "m-society", name: "noo", attrs: {}, children: [
    { tag: "m-commons", name: "commons", attrs: {}, children: [] },
    { tag: "m-archetype", name: "expert", attrs: {}, children: [{ tag: "m-stream", name: "stream", attrs: {}, children: [] }] },
    {
      tag: "m-mind", name: "synthesis", attrs: {}, children: [
        { tag: "m-stream", name: "stream", attrs: {}, children: [] },
        { tag: "m-memory", name: "memory", attrs: {}, children: [] },
        { tag: "m-interrupts", name: "attention", attrs: {}, children: [] },
        { tag: "m-ear", name: "commons", attrs: {}, children: [] },
        { tag: "m-speech", name: "voice", attrs: {}, children: [] },
        {
          tag: "m-act", name: "hands", attrs: {}, children: [
            { tag: "m-note", name: "note", attrs: {}, children: [] },
            { tag: "m-terminal", name: "terminal", attrs: {}, children: [] },
          ],
        },
      ],
    },
    {
      tag: "m-mind", name: "calculus", attrs: {}, children: [
        { tag: "m-stream", name: "stream", attrs: {}, children: [] },
        { tag: "m-memory", name: "memory", attrs: {}, children: [] },
        { tag: "m-interrupts", name: "attention", attrs: {}, children: [] },
        { tag: "m-ear", name: "commons", attrs: {}, children: [] },
      ],
    },
  ],
};

function mount() {
  document.body.innerHTML = `<studio-plenum></studio-plenum>`;
  const el = document.querySelector("studio-plenum");
  el.tree = societyTree;
  el.rebuild();
  return el;
}

test("a society becomes one cluster per member around the commons hub; the archetype is not a living faculty", () => {
  const g = buildGraph(societyTree);
  expect(g.clusters.map(c => c.member)).toEqual(["synthesis", "calculus"]);
  expect(g.hub.tag).toBe("m-commons");
  // The archetype template (and its inner stream) must not appear as nodes.
  expect(g.nodes.some(n => n.tag === "m-archetype")).toBe(false);
  expect(g.nodes.filter(n => n.tag === "m-stream").length).toBe(2);
  // Member-scoped lookup resolves to that member's faculty, not another's.
  const synthMem = g.byKey.get("synthesis#m-memory");
  const calcMem = g.byKey.get("calculus#m-memory");
  expect(synthMem.member).toBe("synthesis");
  expect(calcMem.member).toBe("calculus");
  expect(synthMem).not.toBe(calcMem);
  // Each mind anchor is pinned to its own home position (the self as anchor, D9)
  // and the anchors are apart, not stacked at the origin.
  const [a, b] = g.clusters.map(c => c.anchor);
  expect(a.anchor).toBeTruthy();
  expect(Math.hypot(a.anchor.x - b.anchor.x, a.anchor.z - b.anchor.z)).toBeGreaterThan(100);
});

test("a lone mind is a single centered cluster with no hub", () => {
  const g = buildGraph({
    tag: "m-mind", name: "lemma", attrs: {}, children: [
      { tag: "m-stream", name: "stream", attrs: {}, children: [] },
    ],
  });
  expect(g.hub).toBeNull();
  expect(g.clusters.length).toBe(1);
  expect(g.clusters[0].member).toBe("lemma");
  expect(g.clusters[0].anchor.tag).toBe("m-mind");
});

test("families color the anatomy: stream/memory/attention/membrane/hands; act leaves inherit hands", () => {
  expect(familyOf("m-stream")).toBe("stream");
  expect(familyOf("m-kb")).toBe("memory");
  expect(familyOf("m-timeout")).toBe("attention");
  expect(familyOf("m-ear")).toBe("membrane");
  expect(familyOf("m-terminal")).toBe("hands");
  expect(familyOf("m-custom-hand", "m-act")).toBe("hands");
});

test("a member-tagged Peer bid arcs in from the commons hub and deposits infoton heat", () => {
  const el = mount();
  el.onEvent({ process: "attention", kind: "bid", member: "calculus", type: "Peer", salience: 0.66, reason: "Synthesis says: article 3…" });
  // Two pulses: commons → calculus's ear, and ear → calculus's attention.
  expect(el.pulses.length).toBe(2);
  expect(el.pulses[0].a.tag).toBe("m-commons");
  expect(el.pulses[0].b.member).toBe("calculus");
  expect(el.pulses[0].b.tag).toBe("m-ear");
  expect(el.pulses[1].b).toBe(el.nByTag("calculus", "m-interrupts"));
  // The message deposited co-location attraction between its endpoints.
  expect(el.pairHeat.size).toBeGreaterThan(0);
  expect([...el.pairHeat.values()].every(h => h > 0)).toBe(true);
  // And the origin faculty remembers what happened (the info panel line).
  expect(el.nByTag("calculus", "m-ear").last).toContain("bid 0.66");
});

test("untagged (public-face) events land on the face member's faculties", () => {
  const el = mount();
  // No roster: the face falls back to the first cluster (synthesis).
  el.onEvent({ process: "stream", kind: "boundary", burstIndex: 3, burstChars: 812, reason: "completed" });
  expect(el.clusterOf("synthesis").bursts).toBe(1);
  expect(el.clusterOf("calculus").bursts).toBe(0);
  expect(el.nByTag("synthesis", "m-stream").last).toContain("burst #3");
});

test("economy, loop, speaking and speech captions become that cluster's field state", () => {
  const el = mount();
  el.onEvent({ process: "economy", kind: "energy", member: "calculus", energy: 0.42, spent: 0.011 });
  // On the wire the loop payload's own kind overwrites the route kind (m-ws _emit
  // spread), so a real event arrives as loop/<loopkind>, e.g. loop/presence.
  el.onEvent({ process: "loop", kind: "presence", member: "calculus", active: true, score: 0.8, vocabulary: ["stillness", "enough"] });
  el.onEvent({ process: "speech", kind: "speaking", member: "calculus", speaking: true });
  el.onEvent({ process: "speech", kind: "boundary", member: "calculus", chars: 120, reason: "completed", text: "I propose Article 4: audits every two years." });
  const c = el.clusterOf("calculus");
  expect(c.energy).toBe(0.42);
  expect(c.loop).toEqual({ kind: "presence", vocabulary: ["stillness", "enough"] });
  expect(c.speaking).toBe(true);
  expect(c.caption.text).toContain("Article 4");
  // The other member's field is untouched.
  const s = el.clusterOf("synthesis");
  expect(s.energy).toBeNull();
  expect(s.speaking).toBe(false);
});

test("a deed pulses hands → capability leaf → mind, colored by outcome", () => {
  const el = mount();
  el.onEvent({ process: "act", kind: "acted", member: "synthesis", capability: "terminal", ok: true, experience: "2+2 returned 4" });
  const leaf = el.nByName("synthesis", "terminal");
  expect(el.pulses.length).toBe(2);
  expect(el.pulses[0].b).toBe(leaf);
  expect(el.pulses[1].a).toBe(leaf);
  expect(el.pulses[1].b.tag).toBe("m-mind");
  expect(el.pulses[1].color).toBe(PALETTE.good);
  expect(leaf.last).toContain("2+2 returned 4");
});
