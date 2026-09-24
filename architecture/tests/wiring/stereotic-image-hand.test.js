// Validation for the stereotic-lab-jev image loop + the ANALYST hand: the archml
// loads through the real Amanita path (with its bundle layer,
// architecture/lab/components/), the data hand is a subagent under m-act that ANALYSES
// the data the senses already gathered (no fetch — network off, root="mind" shared
// desk), registers as a reachable capability, the mind is told plainly that an analyst
// works for it, and m-image carries the chart-and-text config.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { fileURLToPath } from "url";
import { delay } from "./setup.js";
import { readArchitectureFile } from "../../../src/startup/architecture.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { loadModelConfig } from "../../../src/modelAccess/modelConfig.js";

const archPath = fileURLToPath(new URL("../../lab/stereotic-lab-jev.archml", import.meta.url));

let mind;
beforeAll(async () => {
    process.env.MEDITATOR_DRY_RUN = "1";
    process.env.MEDITATOR_MODEL_PROFILE = "local-dev";
    await loadModelConfig();
    // Anchor the architecture file so the bundle layer (architecture/lab/components/)
    // resolves the lab's m-stereotic-* senses, exactly as a real wake does.
    process.argv = [process.argv[0], "test", "-a", archPath];
    const content = await readArchitectureFile();
    document.body.innerHTML = content;
    await loadMindComponents(document);
    mind = document.querySelector("m-mind");
    await delay(500);
});
afterAll(() => { document.body.innerHTML = ""; });

test("archml loads; m-mind tailLength bumped to 5000", () => {
    expect(mind).toBeTruthy();
    expect(mind.getAttribute("tailLength")).toBe("5000");
});

test("m-memory tailLength bumped to 5000", () => {
    expect(mind.querySelector("m-memory").getAttribute("tailLength")).toBe("5000");
});

test("the data hand is a subagent under m-act that ANALYSES (no fetch)", () => {
    const agent = mind.querySelector("m-act m-agent[role=subagent]");
    expect(agent).toBeTruthy();
    expect(agent.getAttribute("name")).toBe("data");
    // It computes over the data the senses already gathered — it does not fetch.
    expect(agent.querySelector("m-terminal").getAttribute("network")).toBe("off");
    // Its terminal + file tools point at the MIND's shared workspace (the senses' desk).
    expect(agent.querySelector("m-terminal").getAttribute("root")).toBe("mind");
    expect(agent.querySelector("m-write-file").getAttribute("root")).toBe("mind");
    expect(agent.querySelector("m-read-file").getAttribute("root")).toBe("mind");
    expect(agent.getAttribute("handDescription")).toContain("Analyse the market data");
});

test("the mind is told plainly that an analyst works for it", () => {
    const identity = mind.textContent;
    expect(identity).toContain("You have an analyst who works for you");
    // The affordance is framed as the moment the data is thin — not a redundant fetch.
    expect(identity).toContain("send for the analyst rather than to guess");
});

test("m-image carries the chart-and-text config", () => {
    const img = mind.querySelector("m-image");
    expect(img).toBeTruthy();
    expect(img.getAttribute("every")).toBe("2");
    expect(img.getAttribute("window")).toBe("3000");
    expect(img.getAttribute("style")).toContain("data visualization");
});

test("the data hand registers as a capability on m-act (reachable in the DECIDE prompt)", () => {
    const act = mind.querySelector("m-act");
    const caps = (act._capabilities || []).map(c => c.name);
    expect(caps).toContain("data");
    const dataCap = (act._capabilities || []).find(c => c.name === "data");
    expect(dataCap.description).toContain("Analyse the market data");
    expect(dataCap.felt).toBeTruthy();
});
