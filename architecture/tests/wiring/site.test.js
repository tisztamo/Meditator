// Intro site replay in jsdom — offline hero mode, no live websocket.
import { test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";

test("docs/index.html replays and interactive chrome works", async () => {
    const html = await fs.readFile("docs/index.html", "utf8");
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

    const awakeCode = doc.querySelector("#view-awake pre").textContent;
    expect(awakeCode.includes("<m-mind")).toBe(true);
    expect(awakeCode.includes("m-loop-guard")).toBe(true);
    expect(doc.querySelector("#view-owl pre").textContent.includes("night-owl")).toBe(true);

    const card = doc.querySelector(".flipcard");
    expect(card.querySelector(".card-back pre").textContent.includes("<m-")).toBe(true);
    card.click();
    expect(card.classList.contains("flipped")).toBe(true);
    card.click();
    expect(card.classList.contains("flipped")).toBe(false);

    doc.querySelectorAll(".tab")[1].click();
    expect(doc.getElementById("view-owl").style.display).toBe("block");
    expect(doc.getElementById("view-awake").style.display).toBe("none");
}, { timeout: 15_000 });
