#!/usr/bin/env bun
/**
 * Layer 3 smoke orchestrator — dry-run full mind + websocket probe.
 *
 *   bun tools/smoke-run.mjs
 *
 * 1. Starts dash-smoke.archml under MEDITATOR_DRY_RUN=1
 * 2. Waits for ws://localhost:7627
 * 3. Runs architecture/tests/dash-probe.js
 * 4. Runs a bounded dry-fast.archml cycle (stdout sanity)
 * 5. Always tears down spawned minds
 */
import { spawn } from "bun";
import { join } from "node:path";
import net from "node:net";

const ROOT = join(import.meta.dir, "..");
const WS_PORT = 7627;
const DASH_ARCH = "architecture/tests/dash-smoke.archml";
const FAST_ARCH = "architecture/tests/dry-fast.archml";
const PROBE_SCRIPT = "architecture/tests/dash-probe.js";

const children = [];

function log(msg) {
    console.log(`[smoke] ${msg}`);
}

async function waitForPort(port, host = "127.0.0.1", timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const open = await new Promise(resolve => {
            const sock = net.connect({ port, host }, () => {
                sock.end();
                resolve(true);
            });
            sock.once("error", () => {
                sock.destroy();
                resolve(false);
            });
        });
        if (open) return true;
        await Bun.sleep(400);
    }
    return false;
}

function startMind(arch) {
    const proc = spawn({
        cmd: ["bun", "meditator.js", "-a", arch],
        cwd: ROOT,
        env: { ...process.env, MEDITATOR_DRY_RUN: "1" },
        stdout: "pipe",
        stderr: "pipe",
    });
    children.push(proc);
    return proc;
}

async function killAll() {
    for (const proc of children.splice(0)) {
        try { proc.kill(); } catch {}
        try { await Promise.race([proc.exited, Bun.sleep(3000)]); } catch {}
    }
}

async function runProbe(durationMs = 14_000) {
    const proc = spawn({
        cmd: ["bun", PROBE_SCRIPT, String(durationMs)],
        cwd: ROOT,
        stdout: "inherit",
        stderr: "inherit",
    });
    return proc.exited;
}

async function runBoundedDryFast(durationMs = 45_000) {
    const proc = startMind(FAST_ARCH);
    let out = "";
    const dec = new TextDecoder();
    const reader = (async () => {
        for await (const chunk of proc.stdout) out += dec.decode(chunk);
    })();
    const readerErr = (async () => {
        for await (const chunk of proc.stderr) out += dec.decode(chunk);
    })();
    await Bun.sleep(durationMs);
    proc.kill();
    await Promise.race([proc.exited, Bun.sleep(3000)]);
    await Promise.allSettled([reader, readerErr]);
    children.pop();
    return out;
}

async function main() {
    let failed = false;

    log("starting dash-smoke mind (dry run)…");
    const dashProc = startMind(DASH_ARCH);
    await Bun.sleep(1500);

    log(`waiting for localhost:${WS_PORT}…`);
    if (!await waitForPort(WS_PORT)) {
        dashProc.kill();
        await Promise.race([dashProc.exited, Bun.sleep(3000)]);
        console.error("[smoke] FAIL: websocket never opened within timeout");
        failed = true;
    } else {
        log("port open — running dash-probe…");
        const probeCode = await runProbe();
        if (probeCode !== 0) {
            console.error(`[smoke] FAIL: dash-probe exited ${probeCode}`);
            failed = true;
        }
    }

    await killAll();

    log(`running bounded dry-fast cycle (${FAST_ARCH})…`);
    const fastOut = await runBoundedDryFast();
    if (!/Meditating/i.test(fastOut)) {
        console.error("[smoke] FAIL: dry-fast never reached 'Meditating…'");
        failed = true;
    } else {
        log("dry-fast mind started and ran without crashing");
    }

    await killAll();

    if (failed) {
        console.error("[smoke] SMOKE_FAIL");
        process.exit(1);
    }
    console.log("[smoke] SMOKE_OK");
}

process.on("SIGINT", async () => { await killAll(); process.exit(130); });
process.on("SIGTERM", async () => { await killAll(); process.exit(143); });

main().catch(async err => {
    console.error("[smoke] error:", err);
    await killAll();
    process.exit(1);
});
