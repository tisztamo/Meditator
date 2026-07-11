// Research-site replay in jsdom — offline hero mode, no live websocket.
// The engineering-first harness page is now the root (docs/index.html) and has its
// own smoke test (tools/smoke-harness-site.mjs); the research-first site with the
// live replay relocated to docs/research/index.html (commit b8de4a6).
import { test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";

test("docs/research/index.html replays and interactive chrome works", async () => {
    const html = await fs.readFile("docs/research/index.html", "utf8");
    const dom = new JSDOM(html, {
        runScripts: "dangerously",
        url: "http://localhost/",
        beforeParse(window) {
            window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
            window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
            window.WebSocket = class {
                constructor() { setTimeout(() => this.onerror && this.onerror(new Error("no server")), 10); }
                close() {}
            };
            window.navigator.clipboard = { writeText: async () => {} };
            window.requestAnimationFrame = cb => setTimeout(cb, 16);
        },
    });

    const errors = [];
    dom.window.addEventListener("error", e => errors.push(e.message));
    await new Promise(resolve => setTimeout(resolve, 4000));

    const doc = dom.window.document;
    const streamText = doc.getElementById("stream").textContent;
    const stimCount = doc.querySelectorAll("#stream .stim").length;

    expect(errors.length).toBe(0);
    expect(streamText.length).toBeGreaterThan(40);
    expect(stimCount).toBeGreaterThanOrEqual(1);
    expect(doc.querySelector("#stream .caret")).toBeTruthy();

    // Single code panel (replaced the old two-tab awake/owl layout)
    const mindCode = doc.querySelector("#view-src pre").textContent;
    expect(mindCode.includes("<m-mind")).toBe(true);
    expect(mindCode.includes("m-act")).toBe(true);

    // Flip card: pick one whose back contains actual component markup
    const card = doc.querySelector('.flipcard[data-snip="observers"]');
    expect(card.querySelector(".card-back pre").textContent.includes("<m-")).toBe(true);
    card.click();
    expect(card.classList.contains("flipped")).toBe(true);
    card.click();
    expect(card.classList.contains("flipped")).toBe(false);

}, { timeout: 15_000 });
