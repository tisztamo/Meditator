// The judge is its own model role: a profile can hold the comparator on a
// different model from utility (local-voice runs the judge locally while
// utility stays cloud), and an architecture names the role, not the hardware.
import { test, expect, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-judgerole-"));
afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

async function load(yamlText, { profile = null } = {}) {
    const yamlPath = path.join(tmp, `models-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
    fs.writeFileSync(yamlPath, yamlText);
    const savedArgv = process.argv;
    process.argv = ["bun", "meditator.js", ...(profile ? ["--model-profile", profile] : []), "--models-config", yamlPath];
    const mod = await import("../../../src/modelAccess/modelConfig.js?t=" + Date.now() + Math.random());
    try {
        await mod.loadModelConfig();
        return mod;
    } finally {
        process.argv = savedArgv;
    }
}

const YAML = `
defaultProfile: cloud
providers:
  openrouter:
    baseURL: "https://openrouter.ai/api/v1"
    apiKey: "sk-test"
  local:
    baseURL: "http://localhost:1248"
roles:
  voice:
    provider: openrouter
    model: cloud-voice
  utility:
    provider: openrouter
    model: cloud-utility
  judge:
    provider: openrouter
    model: cloud-judge
presets:
  gpu-local:
    provider: local
    model: ardincoder-1
profiles:
  cloud:
    roles:
      voice: voice
      utility: utility
      judge: judge
  local-voice:
    roles:
      voice: gpu-local
      utility: utility
      judge: gpu-local
`;

test("the judge role resolves through the active profile", async () => {
    const cloud = await load(YAML);
    expect(cloud.resolveModelRef(null, "judge")).toMatchObject({ provider: "openrouter", model: "cloud-judge" });

    const localVoice = await load(YAML, { profile: "local-voice" });
    // The point of the split: judge goes local, utility stays cloud.
    expect(localVoice.resolveModelRef(null, "judge")).toMatchObject({ provider: "local", model: "ardincoder-1" });
    expect(localVoice.resolveModelRef(null, "utility")).toMatchObject({ provider: "openrouter", model: "cloud-utility" });
});

test("an archml may name the role or a preset directly", async () => {
    const mod = await load(YAML, { profile: "local-voice" });
    // <m-judge model="judge"> — the profile decides.
    expect(mod.resolveModelRef("judge", "judge")).toMatchObject({ provider: "local", model: "ardincoder-1" });
    // <m-judge model="gpu-local"> — pinned regardless of profile.
    expect(mod.resolveModelRef("gpu-local", "judge")).toMatchObject({ provider: "local", model: "ardincoder-1" });
});

test("MEDITATOR_JUDGE_MODEL overrides the role", async () => {
    const mod = await load(YAML);
    const saved = process.env.MEDITATOR_JUDGE_MODEL;
    process.env.MEDITATOR_JUDGE_MODEL = "gpu-local";
    try {
        expect(mod.resolveModelRef(null, "judge")).toMatchObject({ provider: "local", model: "ardincoder-1" });
    } finally {
        if (saved === undefined) delete process.env.MEDITATOR_JUDGE_MODEL; else process.env.MEDITATOR_JUDGE_MODEL = saved;
    }
});

test("a config with no judge role still loads (falls back, does not throw)", async () => {
    const noJudge = YAML
        .replace(/  judge:\n    provider: openrouter\n    model: cloud-judge\n/, "")
        .replace(/      judge: judge\n/, "")
        .replace(/      judge: gpu-local\n/, "");
    const mod = await load(noJudge);
    expect(mod.resolveModelRef(null, "judge").provider).toBe("openrouter");
});
