#!/usr/bin/env bun
/**
 * Opt-in live verification — needs OPENROUTER_API_KEY and/or a running mind.
 *
 *   bun run test:live
 */
import { spawn } from "bun";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");

function skip(msg) {
    console.log(`[live] SKIP: ${msg}`);
}

async function runScript(rel, env = {}) {
    const proc = spawn({
        cmd: ["bun", rel],
        cwd: ROOT,
        env: { ...process.env, ...env },
        stdout: "inherit",
        stderr: "inherit",
    });
    return proc.exited;
}

async function main() {
    let ran = 0;
    let failed = 0;

    if (process.env.OPENROUTER_API_KEY) {
        console.log("[live] running scribe prompt check…");
        ran++;
        const code = await runScript("architecture/tests/live/scribe-prompt.mjs");
        if (code !== 0) failed++;
    } else {
        skip("OPENROUTER_API_KEY unset — scribe prompt check");
    }

    if (process.env.MEDITATOR_LIVE_SITE === "1") {
        console.log("[live] running site live-mode check (expects mind on :7627)…");
        ran++;
        const code = await runScript("architecture/tests/live/site-live.mjs");
        if (code !== 0) failed++;
    } else {
        skip("MEDITATOR_LIVE_SITE unset — site live check (start a mind, then MEDITATOR_LIVE_SITE=1 bun run test:live)");
    }

    if (ran === 0) {
        console.log("[live] nothing to run — set OPENROUTER_API_KEY and/or MEDITATOR_LIVE_SITE=1");
        process.exit(0);
    }

    process.exit(failed ? 1 : 0);
}

main();
