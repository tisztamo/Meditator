// A custom element that throws in connectedCallback used to be swallowed: jsdom
// reports CE-reaction exceptions as an uncaught error on the window rather than
// propagating them out of customElements.define(), so loading "succeeded" and the
// mind limped on half-initialized. loadMindComponents now captures that error and
// fails loud (fatal unless the component is skipload).
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let tmp, savedPath;

beforeAll(() => {
    // A throwaway component module whose connectedCallback throws. Loaded via
    // MIND_COMPONENTS_PATH so loadMindComponents discovers and defines it for the
    // first time — the define() upgrade then runs (and throws in) connectedCallback.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-loadcomp-"));
    fs.writeFileSync(path.join(tmp, "mThrower.js"),
        `export class MThrower extends HTMLElement {\n` +
        `  connectedCallback() { throw new Error("boom in connect"); }\n` +
        `}\n`);
    savedPath = process.env.MIND_COMPONENTS_PATH;
    process.env.MIND_COMPONENTS_PATH = pathToFileURL(tmp).href;   // searched first
});

afterAll(() => {
    if (savedPath === undefined) delete process.env.MIND_COMPONENTS_PATH;
    else process.env.MIND_COMPONENTS_PATH = savedPath;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("a throwing connectedCallback fails loadMindComponents instead of being swallowed", async () => {
    document.body.innerHTML = `<m-thrower></m-thrower>`;
    let threw = null;
    try { await loadMindComponents(document); }
    catch (e) { threw = e; }
    expect(threw).toBeTruthy();
    expect(threw.message).toContain("boom in connect");
});
