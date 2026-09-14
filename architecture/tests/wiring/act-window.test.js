// Window attributes: m-act's DECIDE prompt and REALIZE frame must honor
// `decideWindow` / `realizeWindow`, and their defaults must stay the historical
// 1200 / 900 so existing architectures produce identical prompts.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let act, savedDry;

const OLD = "UNIQUE_OLD_MARKER";
const NEW = "UNIQUE_NEW_TAIL";

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1" cooldown="0s"></m-act>
        <m-act name="hands-wide" every="1" cooldown="0s" decideWindow="6000" realizeWindow="3000"></m-act>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(60);
    act = document.querySelector('[name="hands"]');
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
});

test("DECIDE sees only the last 1200 chars by default", () => {
    act.window = OLD + "x".repeat(5000) + NEW;
    const prompt = act._decisionPrompt();
    expect(prompt).toContain(NEW);
    expect(prompt).not.toContain(OLD);
});

test("DECIDE honors decideWindow", () => {
    const wide = document.querySelector('[name="hands-wide"]');
    wide.window = OLD + "x".repeat(5000) + NEW;
    const prompt = wide._decisionPrompt();
    expect(prompt).toContain(OLD);
    expect(prompt).toContain(NEW);
});

test("REALIZE carries only the last 900 tail chars by default", () => {
    act._memTail = OLD + "y".repeat(2500) + NEW;
    const frame = act._realizeFrame({ gist: "a reach" }, []);
    expect(frame).toContain(NEW);
    expect(frame).not.toContain(OLD);
});

test("REALIZE honors realizeWindow", () => {
    const wide = document.querySelector('[name="hands-wide"]');
    wide._memTail = OLD + "y".repeat(2500) + NEW;
    const frame = wide._realizeFrame({ gist: "a reach" }, []);
    expect(frame).toContain(OLD);
    expect(frame).toContain(NEW);
});
