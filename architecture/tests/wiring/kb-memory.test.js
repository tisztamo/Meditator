// The scribe↔memory wires live in the architecture, not in either component:
// the scribe (m-kb) reads its context from topics (its own stream window + memory's
// `compressed`) and announces work on `filed`; a memory subscribes to `filed` and
// journals it. Neither names the other, so memory can be replaced or doubled freely.
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, stream, memory, scribe, journalDir;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    journalDir = path.join(os.tmpdir(), "med-kb-test-" + Date.now());

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off"></m-memory>
        <m-kb name="scribe"></m-kb>
      </m-mind>
    `;
    // Set the journal dir on the raw element (a Windows temp path has backslashes
    // that would be illegal escapes inside the template literal above).
    document.querySelector('[name="memory"]').setAttribute("journal", journalDir);

    await loadMindComponents(document);
    await delay(120);

    mind = document.querySelector("m-mind");
    stream = mind.querySelector("m-stream");
    memory = mind.querySelector('[name="memory"]');
    scribe = mind.querySelector('[name="scribe"]');
});

afterAll(() => {
    try { fs.rmSync(journalDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("the scribe reads context from topics, not by reaching into memory", async () => {
    stream.pub("chunk", "I keep returning to the idea of slow attention.");
    memory.pub("compressed", { recent: "Earlier I explored boredom and patience.", story: "" });
    await delay(10);
    expect(scribe.window.includes("slow attention")).toBe(true);   // verbatim, own window
    expect(scribe._recent.includes("boredom and patience")).toBe(true); // summary, via topic
});

test("a filing is journaled by memory via the `filed` topic (note inversion)", async () => {
    scribe.pub("filed", { files: ["attention/slow.md", "self/values.md"] });
    await delay(40);
    expect(memory._lastFiled?.files).toContain("attention/slow.md");
    const day = new Date().toISOString().slice(0, 10);
    const journal = fs.readFileSync(path.join(journalDir, `${day}.md`), "utf8");
    expect(journal.includes("The scribe filed thoughts into: attention/slow.md")).toBe(true);
    expect(journal.includes("⌁")).toBe(true); // the backstage (unseen) marker
});

test("a replayed filing (same object) is journaled only once", async () => {
    const f = { files: ["once/only.md"] };
    scribe.pub("filed", f);
    await delay(20);
    scribe.pub("filed", f); // same object identity → dedupe guard
    await delay(40);
    const day = new Date().toISOString().slice(0, 10);
    const journal = fs.readFileSync(path.join(journalDir, `${day}.md`), "utf8");
    expect(journal.split("once/only.md").length - 1).toBe(1);
});
