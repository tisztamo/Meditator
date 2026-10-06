// A mind without memory continues from the stream's own words, heard on the stream's
// `chunk` topic, and thins its thinking while its voice speaks by sending a
// `burstFactor` the stream applies to its own budget. Neither reads the stream
// element (message rule M4: no getRecentOutput(), no burstTokens attribute read).
//
// Real MMind (subclass tag: the suite registers <m-mind> as a stub) and m-stream
// (dry run); the voice is a stub that only publishes `speaking`.
import "./setup.js";
import { test, expect, afterEach } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../src/mindComponents/mind/mMind.js";

if (!customElements.get("t-words-mind")) customElements.define("t-words-mind", class extends MMind {});
if (!customElements.get("t-words-voice")) customElements.define("t-words-voice", class extends A(HTMLElement) {});

let savedDry;

afterEach(async () => {
    const mind = document.querySelector("t-words-mind");
    if (mind) await mind.sleep?.().catch(() => {});
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
});

async function mount() {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";
    document.body.innerHTML = `
      <t-words-mind name="worder" pace="100ms" paceSigma="0" tailSrc="off" compressedSrc="off"
                    imagePerceptSrc="off" embodimentSrc="off" paceFactorSrc="off">
        <m-stream name="stream" burstTokens="200"></m-stream>
        <t-words-voice name="voice"></t-words-voice>
      </t-words-mind>`;
    await loadMindComponents(document);
    const mind = document.querySelector("t-words-mind");
    const stream = mind.querySelector("m-stream");
    const voice = mind.querySelector("t-words-voice");
    const prompts = [];
    const chunks = [];
    mind.on("prompt", p => prompts.push(p));
    stream.on("chunk", t => chunks.push(t));
    return { mind, voice, prompts, chunks };
}

const until = async (pred, ms = 8000) => {
    const end = Date.now() + ms;
    while (!pred()) {
        if (Date.now() > end) throw new Error("timed out");
        await delay(20);
    }
};

test("without memory, the next frame continues from what the stream said", async () => {
    const { prompts, chunks } = await mount();
    await until(() => chunks.join("").length > 0 && prompts.length >= 2);
    const said = chunks.join("");
    const later = prompts[prompts.length - 1];
    expect(said.length).toBeGreaterThan(0);
    expect(later.prefill).toContain(said.trim().slice(0, 20));
}, 15000);

test("while the voice speaks, the frame asks for a thinner burst by factor", async () => {
    const { mind, voice, prompts } = await mount();
    mind.setAttribute("speakingTokensFactor", "0.5");
    await until(() => prompts.length >= 1);
    expect(prompts[prompts.length - 1].burstFactor).toBeUndefined();
    voice.pub("speaking", true);
    const seen = prompts.length;
    await until(() => prompts.length > seen && prompts[prompts.length - 1].burstFactor !== undefined);
    const thin = prompts[prompts.length - 1];
    expect(thin.burstFactor).toBe(0.5);
    expect(thin.burstTokens).toBeUndefined();
}, 15000);
