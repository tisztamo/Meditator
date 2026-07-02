import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from './logger.js';

const log = logger('sandbox.js');

/**
 * The sandbox for m-terminal (terminal.md §4): run a small script the mind wrote,
 * with the strongest confinement the host actually offers, and refuse to run
 * arbitrary code with no real sandbox at all.
 *
 * The threat model is the mind's OWN code, not an adversary: accidental damage
 * (rm -rf, a fork bomb, filling the disk, an infinite loop), network abuse, and —
 * the single most important line in the whole design — leaking host secrets back
 * into the mind's memory. A `print(os.environ)` must never surface OPENROUTER_API_KEY
 * as a "sensation" that gets written into the journal and committed to git. So the
 * env scrub (scrubbedEnv) is non-negotiable and holds independently of how strong
 * the namespace sandbox is.
 *
 * Backends, in preference order, each PROBE-GATED at startup (probeBackend runs the
 * real assembled recipe on a trivial script; only a backend that passes is offered):
 *   - bwrap (bubblewrap) if present — `--unshare-all --die-with-parent`, ro-bind the
 *     system, one writable bind for the workspace. The clean production recipe.
 *   - rootless `unshare` — new user+mount+pid+net namespaces; the root filesystem
 *     remounted read-only in-place with the workspace the one writable bind, /proc
 *     fresh in the pid namespace, no network. Works without bubblewrap installed.
 *   - none — no real sandbox; m-terminal then does NOT register (fail safe).
 *
 * This module is deliberately split so the dangerous part is small and the rest is
 * pure: assembleCommand()/scrubbedEnv() are pure and unit-tested; runScript() is the
 * only impure spawner; probeBackend() decides which recipe the host supports.
 */

// The env the child gets — a minimal allow-list, NEVER the parent's. terminal.md §4.3.
// HOME/TMPDIR point at /work (the bind target in bwrap; harmless elsewhere — the real
// writable desk is always the cwd). No secret can ride in because nothing else is set.
const SANDBOX_ENV = {
    PATH: '/usr/bin:/bin',
    HOME: '/work',
    LANG: 'C',
    TMPDIR: '/work',
};

/** The scrubbed environment handed to a sandboxed child (terminal.md §4.3). Pure. */
export function scrubbedEnv() {
    return { ...SANDBOX_ENV };
}

/** Map the closed `language` verb to the interpreter binary. Throws on anything
 *  else — but the menu is closed (schema enum), so this is just defense in depth. */
export function interpreterFor(language) {
    if (language === 'python') return 'python3';
    if (language === 'bash') return 'bash';
    throw new Error(`unsupported language "${language}"`);
}

// Parse "1g"/"512m"/"16k"/bytes → kilobytes (for ulimit -v, -f). Pure.
export function parseSizeKb(value, fallbackKb = 0) {
    const kb = toBytes(value);
    return kb == null ? fallbackKb : Math.max(1, Math.floor(kb / 1024));
}

// Parse "16k"/"1m"/bytes → bytes (for the output cap). Pure.
export function parseSizeBytes(value, fallbackBytes = 0) {
    const b = toBytes(value);
    return b == null ? fallbackBytes : Math.max(1, Math.floor(b));
}

function toBytes(value) {
    if (typeof value === 'number') return value;
    const m = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([gmk]?)b?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const factor = unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1;
    return n * factor;
}

/** Seconds (integer) from a time expression like "10s"/"500ms"/number-of-seconds. Pure. */
export function toSeconds(value, fallback = 10) {
    if (typeof value === 'number') return Math.max(1, Math.round(value));
    const m = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
    if (!m) return fallback;
    const n = parseFloat(m[1]);
    const unit = (m[2] || 's').toLowerCase();
    const sec = unit === 'ms' ? n / 1000 : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n;
    return Math.max(1, Math.round(sec));
}

// The inner shell run inside the namespace, once it exists. It confines the
// filesystem (read-only system, writable workspace only), applies the resource
// rlimits, then execs the interpreter with a scrubbed env and the script's own
// stderr folded into stdout (2>&1) so a traceback rides the SAME "screen" the mind
// reads — while this setup's own stderr stays on fd2 (mechanism, never afference).
// Positional args: $1=workspace $2=script $3=interpreter $4=cpu $5=memKb $6=fileKb $7=nproc
const UNSHARE_INNER = `set -e
WS="$1"; SCRIPT="$2"; INTERP="$3"; CPU="$4"; MEMKB="$5"; FILEKB="$6"; NPROC="$7"
mount --make-rprivate /
mount --bind "$WS" "$WS"
mount -o remount,bind,ro /
mount -o remount,bind,rw "$WS"
cd "$WS"
ulimit -t "$CPU" 2>/dev/null || true
ulimit -v "$MEMKB" 2>/dev/null || true
ulimit -f "$FILEKB" 2>/dev/null || true
ulimit -u "$NPROC" 2>/dev/null || true
exec env -i PATH=/usr/bin:/bin HOME=/work LANG=C TMPDIR=/work "$INTERP" "$SCRIPT" 2>&1`;

// The bwrap variant: bwrap itself builds the read-only root + writable bind + the
// clean env, so the inner shell only applies the rlimits and execs.
// Positional args: $1=interpreter $2=script $3=cpu $4=memKb $5=fileKb $6=nproc
const BWRAP_INNER = `set -e
INTERP="$1"; SCRIPT="$2"; CPU="$3"; MEMKB="$4"; FILEKB="$5"; NPROC="$6"
cd /work
ulimit -t "$CPU" 2>/dev/null || true
ulimit -v "$MEMKB" 2>/dev/null || true
ulimit -f "$FILEKB" 2>/dev/null || true
ulimit -u "$NPROC" 2>/dev/null || true
exec "$INTERP" "$SCRIPT" 2>&1`;

/**
 * Assemble the full argv that runs `scriptPath` for `language` under `backend`,
 * confined and resource-capped. PURE — no fs, no Date, no spawn — so the exact
 * command can be unit-tested without executing anything (terminal.md §9).
 *
 * @returns {{command: string, args: string[]}} ready for spawn()
 */
export function assembleCommand({
    backend, language, runDir, scriptPath,
    wall = '20s', killGrace = '2s', cpu = '10s', mem = '1g',
    fileSize = '64m', maxProcs = 256, network = 'off',
}) {
    const interp = interpreterFor(language);
    const cpuSec = String(toSeconds(cpu, 10));
    const memKb = String(parseSizeKb(mem, 1048576));
    const fileKb = String(parseSizeKb(fileSize, 65536));
    const nproc = String(maxProcs || 256);
    const wallArg = `${toSeconds(wall, 20)}s`;
    const killArg = `${toSeconds(killGrace, 2)}s`;
    const netOff = network !== 'on';

    // Every backend is wrapped in GNU timeout for the wall-clock bound: SIGTERM at
    // `wall`, SIGKILL `killGrace` later if it ignores the term (terminal.md §4.4).
    const timeoutHead = ['-k', killArg, '-s', 'TERM', wallArg];

    if (backend === 'bwrap') {
        const bwrap = [
            '--die-with-parent', '--unshare-all', ...(netOff ? [] : ['--share-net']),
            '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp',
            '--bind', runDir, '/work', '--chdir', '/work',
            '--clearenv',
            '--setenv', 'PATH', SANDBOX_ENV.PATH, '--setenv', 'HOME', SANDBOX_ENV.HOME,
            '--setenv', 'LANG', SANDBOX_ENV.LANG, '--setenv', 'TMPDIR', SANDBOX_ENV.TMPDIR,
            'bash', '--norc', '--noprofile', '-c', BWRAP_INNER, 'sandbox',
            interp, '/work/' + path.basename(scriptPath), cpuSec, memKb, fileKb, nproc,
        ];
        return { command: 'timeout', args: [...timeoutHead, 'bwrap', ...bwrap] };
    }

    if (backend === 'unshare') {
        const unshare = [
            '--user', '--map-root-user', '--mount', '--pid', '--fork',
            ...(netOff ? ['--net'] : []), '--mount-proc',
            'bash', '--norc', '--noprofile', '-c', UNSHARE_INNER, 'sandbox',
            runDir, scriptPath, interp, cpuSec, memKb, fileKb, nproc,
        ];
        return { command: 'timeout', args: [...timeoutHead, 'unshare', ...unshare] };
    }

    throw new Error(`no sandbox backend (${backend}) — refusing to run arbitrary code unconfined`);
}

// ---------------------------------------------------------------------------
// The impure runner.
// ---------------------------------------------------------------------------

function killGroup(child, signal = 'SIGKILL') {
    if (!child || child.exitCode != null || child.signalCode != null) return;
    try { process.kill(-child.pid, signal); }          // the whole detached group
    catch { try { child.kill(signal); } catch { /* already gone */ } }
}

/**
 * Spawn the assembled command non-blocking, as a detached process group so the
 * whole fork-tree can be killed at once. Returns a handle immediately:
 *   - handle.done  → Promise resolving to the outcome once the process ends:
 *       { screen, stderr, exitCode, signal, timedOut, truncated, durationMs }
 *     The promise REJECTS only on a spawn failure (the binary is missing, etc.) —
 *     that is a hand-slip the caller turns into silence. A script that errors or
 *     times out still RESOLVES (its traceback / partial output is content the mind
 *     reads — terminal.md §3).
 *   - handle.kill() → SIGKILL the whole group (single-slot reuse, sleep, flood).
 *
 * Output is captured to a byte cap (`maxOutput`); on a flood the group is killed and
 * the capture is marked truncated. `screen` is the script's own stdout+stderr (folded
 * by the inner 2>&1); `stderr` here is the SANDBOX's setup noise (mount/ulimit), kept
 * only for debugging and never shown to the mind.
 *
 * `opts.onData(chunk)` — an OPTIONAL live-output hook, called with each stdout chunk as
 * it arrives (before the cap is applied). A background job (jobRegistry.js) uses it to
 * keep a live tail so `check(id)` can show progress before the run ends; a synchronous
 * caller (m-terminal) simply omits it and reads the whole `screen` on `done`. It must
 * never throw — a live-tail consumer cannot be allowed to break the authoritative capture.
 */
export function runScript(opts) {
    const { command, args } = assembleCommand(opts);
    const capBytes = parseSizeBytes(opts.maxOutput || '16k', 16384);
    const wallMs = toSeconds(opts.wall, 20) * 1000;
    const killGraceMs = toSeconds(opts.killGrace, 2) * 1000;

    const start = Date.now();
    let child;
    let watchdog = null;

    const done = new Promise((resolve, reject) => {
        try {
            child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
            reject(error);
            return;
        }

        let out = Buffer.alloc(0);
        let err = '';
        let truncated = false;
        let flooded = false;

        child.stdout.on('data', chunk => {
            try { opts.onData?.(chunk); } catch { /* a live-tail consumer must never break capture */ }
            if (truncated) return;
            out = Buffer.concat([out, chunk]);
            if (out.length > capBytes) {
                out = out.subarray(0, capBytes);
                truncated = true;
                flooded = true;
                killGroup(child);                       // stop a flood at the cap
            }
        });
        child.stderr.on('data', chunk => { if (err.length < 8192) err += chunk.toString('utf8'); });

        child.on('error', error => { if (watchdog) clearTimeout(watchdog); reject(error); });
        child.on('close', (code, signal) => {
            if (watchdog) clearTimeout(watchdog);
            // GNU timeout exits 124 (SIGTERM took) or 137 (needed SIGKILL) on a
            // wall-clock kill; a forcible signal with no flood is the same "I let it
            // go". A flood is its own thing (truncated, not "never settled").
            const killed = code === 124 || code === 137 || signal === 'SIGTERM' || signal === 'SIGKILL';
            resolve({
                screen: out.toString('utf8'),
                stderr: err,
                exitCode: code,
                signal: signal || null,
                timedOut: killed && !flooded,
                truncated,
                durationMs: Date.now() - start,
            });
        });

        // Belt-and-suspenders watchdog: if GNU timeout somehow fails to reap, SIGKILL
        // the group ourselves a little after the wall + kill grace (terminal.md §4.4).
        watchdog = setTimeout(() => killGroup(child), wallMs + killGraceMs + 3000);
    });

    return { done, kill: () => { if (watchdog) clearTimeout(watchdog); killGroup(child); } };
}

// ---------------------------------------------------------------------------
// Backend probe (terminal.md §4.1) — memoized per process.
// ---------------------------------------------------------------------------

let _probe = null;

/**
 * Decide which sandbox backend this host actually supports, by RUNNING the real
 * assembled recipe on a trivial script and checking it comes back clean. Memoized.
 * Returns 'bwrap' | 'unshare' | 'none'. Set MEDITATOR_SANDBOX_BACKEND to force one
 * (handy for tests/ops: 'none' makes the hand inert; 'unshare' pins the fallback).
 */
export function probeBackend() {
    if (_probe) return _probe;
    _probe = (async () => {
        const forced = process.env.MEDITATOR_SANDBOX_BACKEND;
        if (forced) {
            log.info(`sandbox backend forced to "${forced}" via MEDITATOR_SANDBOX_BACKEND`);
            return forced;
        }
        if (hasExe('timeout')) {
            if (hasExe('bwrap') && await tryBackend('bwrap')) { log.info('sandbox backend: bwrap'); return 'bwrap'; }
            if (hasExe('unshare') && await tryBackend('unshare')) { log.info('sandbox backend: rootless unshare'); return 'unshare'; }
        }
        log.warn('no working sandbox backend (bwrap / rootless unshare) — arbitrary execution will be refused');
        return 'none';
    })();
    return _probe;
}

/** Forget the memoized probe (tests that flip MEDITATOR_SANDBOX_BACKEND). */
export function resetBackendProbe() { _probe = null; }

function hasExe(name) {
    try {
        const r = spawnSync('command', ['-v', name], { shell: true, stdio: 'ignore' });
        return r.status === 0;
    } catch { return false; }
}

async function tryBackend(backend) {
    let dir;
    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-sbprobe-'));
        fs.mkdirSync(path.join(dir, '.runs'), { recursive: true });
        const scriptPath = path.join(dir, '.runs', 'probe.sh');
        fs.writeFileSync(scriptPath, 'echo sandbox-ok\n');
        const { done } = runScript({
            backend, language: 'bash', runDir: dir, scriptPath,
            wall: '10s', killGrace: '2s', cpu: '5s', mem: '512m', maxOutput: '4k', network: 'off',
        });
        const r = await done;
        return r.screen.includes('sandbox-ok');
    } catch (error) {
        log.debug(`backend "${backend}" probe failed: ${error?.message || error}`);
        return false;
    } finally {
        try { if (dir) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}
