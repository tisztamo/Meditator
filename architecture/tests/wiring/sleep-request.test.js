// Sleep as request/reply (message-rule.md, review §7 step 5). The process asks
// every membrane to sleep with a `put-to-sleep` request (putToSleep, what start.js
// runs on Ctrl-C and on a port's `/sleep`); each answers with its commit outcome.
// A commit nobody confirmed is reported as "not confirmed" (Covenant), never
// assumed. Real mind, stream, memory and agent; the dry voice; no process exit.
import "./setup.js";
import { test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { waitFor, quiet } from "./contracts/helpers.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../src/mindComponents/mind/mMind.js";
import { putToSleep } from "../../../src/startup/sleepRitual.js";

class TSleepAskMind extends MMind {}
if (!customElements.get("t-sleep-ask-mind")) customElements.define("t-sleep-ask-mind", TSleepAskMind);

let dir = null, savedDry;

async function mount(memoryAttrs = "", mindAttrs = "") {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "med-sleep-request-"));
    document.body.innerHTML = `
      <t-sleep-ask-mind name="asker" pace="300ms" paceSigma="0" ${mindAttrs}
                        imagePerceptSrc="off" embodimentSrc="off" paceFactorSrc="off">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="${dir}/home" journal="${dir}/journal" ${memoryAttrs}></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
      </t-sleep-ask-mind>`;
    await loadMindComponents(document);
    const mind = document.querySelector("t-sleep-ask-mind");
    const chunks = [];
    mind.querySelector("m-stream").on("chunk", t => chunks.push(t));
    const prompts = [];
    mind.on("prompt", p => prompts.push(p));
    expect(await waitFor(() => chunks.length > 3, 4000)).toBeTruthy();   // the mind is thinking
    return { mind, prompts };
}

const readMemory = () => {
    const file = path.join(dir, "home", "memory.md");
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};
const sleepFrames = prompts => prompts.filter(p => /> ⟂ I am (coming to rest|being put to sleep)/.test(p?.prefill || ""));

afterEach(async () => {
    document.body.replaceChildren();
    await quiet(40);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

test("the process asks, the mind answers with its commit: confirmed, and memory ended cleanly", async () => {
    await mount();
    const result = await putToSleep(document, { deadline: 10000 });
    expect(result.confirmed).toBe(true);
    expect(result.outcomes).toEqual([{ name: "asker", status: "ok", error: null }]);
    expect(readMemory()).toMatch(/"endedCleanly":true/);
});

test("a second asker gets the same outcome; the ritual runs once", async () => {
    const { mind, prompts } = await mount();
    const [direct, asked] = await Promise.all([mind.sleep(), putToSleep(document, { deadline: 10000 })]);
    expect(direct.status).toBe("ok");
    expect(asked.outcomes[0].status).toBe("ok");
    expect(sleepFrames(prompts).length).toBe(1);
});

test("a memory that never confirms the commit is reported NOT confirmed, never assumed saved", async () => {
    await mount(`sleepSrc="off"`, `sleepDeadline="300ms"`);
    const result = await putToSleep(document, { deadline: 10000 });
    expect(result.confirmed).toBe(false);
    expect(result.outcomes[0]).toMatchObject({ name: "asker", status: "timeout" });
});

test("an agent root answers too: nothing to commit, so nothing is claimed saved", async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";
    document.body.innerHTML = `
      <m-agent name="svc" maxSteps="4" stopWhen="finish-tool">
        You are a service agent.
        <m-reason name="reason" toolTokens="64"></m-reason>
        <m-context name="context" persist="off"></m-context>
        <m-console name="console"></m-console>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    expect(await waitFor(() => agent._alive, 3000)).toBeTruthy();
    const result = await putToSleep(document, { deadline: 2000 });
    expect(result).toEqual({ confirmed: true, outcomes: [{ name: "svc", status: "no-memory", error: null }] });
});
