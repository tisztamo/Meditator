// modelConfig profile error messages — verifies helpful suggestions for unknown profiles.
import { test, expect, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-modelcfg-"));

afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

// Helper: write a minimal models.yaml and return a fresh loadModelConfig bound to it.
async function getLoader(argvExtras, yamlText) {
    const yamlPath = path.join(tmp, `models-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
    fs.writeFileSync(yamlPath, yamlText);

    // Save & restore argv
    const savedArgv = process.argv;
    process.argv = ["bun", "meditator.js", ...argvExtras, "--models-config", yamlPath];

    // Cache-bust with timestamp so each test gets a fresh module with its own globals
    const { loadModelConfig } = await import(
      "../../../src/modelAccess/modelConfig.js?t=" + Date.now() + Math.random()
    );

    return async () => {
        try {
            return await loadModelConfig();
        } finally {
            process.argv = savedArgv;
        }
    };
}

const baseYaml = (extraProfiles = "") => `
defaultProfile: cloud
providers:
  openrouter:
    baseURL: "https://openrouter.ai/api/v1"
    apiKey: "sk-test"
roles:
  voice:
    provider: openrouter
    model: test-model
  utility:
    provider: openrouter
    model: test-model
profiles:
  cloud:
    roles:
      voice: voice
      utility: utility
${extraProfiles}
`;

test("unknown profile suggests closest match (partial substring)", async () => {
    const yaml = baseYaml(`
  local-dev:
    roles:
      voice: voice
      utility: utility
`);
    const loader = await getLoader(["-mp", "local"], yaml);
    await expect(loader()).rejects.toThrow(/Did you mean "local-dev"/);
});

test("unknown profile lists available profiles when no close match", async () => {
    const yaml = baseYaml(`
  staging:
    roles:
      voice: voice
      utility: utility
`);
    const loader = await getLoader(["-mp", "nonexistent"], yaml);
    await expect(loader()).rejects.toThrow(/Available profiles: cloud, staging/);
});

test("unknown profile still reports the profile name and config path", async () => {
    const yaml = baseYaml();
    const loader = await getLoader(["-mp", "ghost"], yaml);
    let thrown;
    try {
        await loader();
    } catch (e) {
        thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/Unknown model profile "ghost"/);
    expect(thrown.message).toMatch(/\.yaml/);
});
