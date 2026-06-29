// Fact memory: keyed verbatim facts live outside narrative memory, pinned facts
// are published for every frame, and the same component registers remember /
// recall-fact as base hands.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../src/mindComponents/mMind.js";

let mind, facts, act, factsDir, pinnedSeen;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    factsDir = path.join(os.tmpdir(), "med-facts-test-" + Date.now());
    const dirAttr = factsDir.replace(/\\/g, "/");

    document.body.innerHTML = `
      <m-mind name="t">
        <m-origin name="origin" key="puzzle" pin>
          GRID:
          [[1,2],[3,4]]
        </m-origin>
        <m-stream name="stream"></m-stream>
        <m-facts name="facts" dir="${dirAttr}" pinnedBudget="10000">
          <m-fact key="const:bg" pin>8</m-fact>
        </m-facts>
        <m-act name="hands" every="1" cooldown="0s" readCooldown="0s"></m-act>
      </m-mind>
    `;

    await loadMindComponents(document);
    await delay(180);

    mind = document.querySelector("m-mind");
    facts = mind.querySelector("m-facts");
    act = mind.querySelector("m-act");
    pinnedSeen = null;
    await mind.sub("facts/pinned", v => { pinnedSeen = v; });
    await delay(10);
});

afterAll(() => {
    try { fs.rmSync(factsDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("seeded pinned facts are stored and published verbatim", () => {
    expect(pinnedSeen).toContain("[const:bg]\n8");
    expect(pinnedSeen).toContain("[puzzle]");
    expect(pinnedSeen).toContain("[[1,2],[3,4]]");

    const files = fs.readdirSync(factsDir).filter(f => f.endsWith(".md"));
    expect(files.length).toBe(2);
    const all = files.map(f => fs.readFileSync(path.join(factsDir, f), "utf8")).join("\n");
    expect(all).toContain('"key":"puzzle"');
    expect(all).toContain('[[1,2],[3,4]]');
});

test("m-facts registers remember and recall-fact hands", () => {
    const names = act._capabilities.map(c => c.name);
    expect(names).toContain("remember");
    expect(names).toContain("recall-fact");
    expect(act._capabilities.find(c => c.name === "remember").readonly).toBe(false);
    expect(act._capabilities.find(c => c.name === "recall-fact").readonly).toBe(true);
});

test("earned facts are recalled whole by exact key or unique prefix", async () => {
    const remembered = await facts._rememberHand({
        key: "verdict:crop-rule",
        value: "fails example 1 at r3,c2: got 8, wanted 3",
        pin: false,
    });
    expect(remembered.experience).toContain("fact key: verdict:crop-rule");
    expect(remembered.experience).toContain('recall-fact with key "verdict:crop-rule"');
    const out = await facts._recallHand({ key: "verdict:" });
    expect(out.experience).toContain("verdict:crop-rule");
    expect(out.experience).toContain("fails example 1 at r3,c2: got 8, wanted 3");
    expect(out.urgent).toBe(true);
});

test("m-mind places pinned facts in a separate verbatim frame section", async () => {
    const fake = {
        _memTail: "",
        _memStory: "I used to be thinking about grids.",
        _memRecent: "I recently guessed a rule.",
        _factsPinned: "[puzzle]\n[[1,2],[3,4]]",
        _speaking: false,
        attr(name) { return name === "tailLength" ? "1500" : null },
        querySelector(sel) { return sel === "m-stream" ? { getRecentOutput: () => "" } : null },
        _identity() { return "I check exact grids." },
        fire() {},
    };
    const payload = await MMind.prototype.assembleFrame.call(fake, []);
    expect(payload.system).toContain("## What I know (verbatim)");
    expect(payload.system).toContain("[puzzle]\n[[1,2],[3,4]]");
    expect(payload.system.indexOf("## What I know (verbatim)")).toBeLessThan(payload.system.indexOf("## How I got here"));
});
