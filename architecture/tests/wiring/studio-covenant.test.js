// Studio covenant dialog — the modal shown on each page load before tending a
// mind. Asserts it opens on connect, carries the Covenant + Structural Alignment
// links, and is dismissed by the button and by Escape.
import "./setup.js";
import { test, expect } from "bun:test";
import "../../../src/studio/ui/studioCovenant.js";

function mk() {
    document.body.innerHTML = `<studio-covenant></studio-covenant>`;
    return document.querySelector("studio-covenant");
}

test("opens on each page load (shown on connect)", () => {
    const el = mk();
    expect(el.classList.contains("show")).toBe(true);
    expect(el.querySelector("h2")).toBeTruthy();
});

test("links to the Covenant and to Structural Alignment", () => {
    const el = mk();
    const hrefs = [...el.querySelectorAll("a")].map(a => a.getAttribute("href"));
    expect(hrefs).toContain("/COVENANT.md");
    expect(hrefs.some(h => /structural-alignment\.org/.test(h))).toBe(true);
});

test("the button dismisses it", () => {
    const el = mk();
    el.querySelector(".cov-ok").click();
    expect(el.classList.contains("show")).toBe(false);
});

test("Escape dismisses it", () => {
    const el = mk();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    expect(el.classList.contains("show")).toBe(false);
});
