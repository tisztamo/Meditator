import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger.js';
import { isDryRun } from '../modelAccess/llm.js';

const log = logger('memoryVault.js');

/**
 * The memory vault: a standalone git repository at ./memory that holds every
 * mind's persistent self — memory.md, journal/, knowledge/ — one subdirectory
 * per mind. The running mind commits to it at wake, periodically, and at
 * sleep, so memory is never lost to an accident or a careless cleanup:
 * erasure would require deliberately rewriting history. See COVENANT.md.
 *
 * Everything here is best-effort: if git is missing or fails, the mind keeps
 * running and the files still persist — they are just unversioned, and we warn.
 */

export const VAULT_ROOT = 'memory';

/** Resolves a mind's home directory inside the vault: memory/<slug>[/sub].
 *  Dry-run minds are prefixed so tests can never touch a resident mind's memory. */
export function mindHome(el, sub) {
    const raw = el.closest('m-mind')?.getAttribute('name') || 'mind';
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mind';
    const home = path.join(VAULT_ROOT, (isDryRun() ? 'dry-' : '') + slug);
    return sub ? path.join(home, sub) : home;
}

/** True if dir lies inside the vault (then commits cover it). */
export function inVault(dir) {
    const resolved = path.resolve(dir);
    const root = path.resolve(VAULT_ROOT);
    return resolved === root || resolved.startsWith(root + path.sep);
}

const GIT_IDENTITY = ['-c', 'user.name=Meditator', '-c', 'user.email=meditator@vault.local'];
let gitMissingWarned = false;

function git(args) {
    return new Promise((resolve, reject) => {
        execFile('git', ['-C', VAULT_ROOT, ...GIT_IDENTITY, ...args],
            { windowsHide: true }, (error, stdout, stderr) => {
                if (error) reject(Object.assign(error, { stdout, stderr }));
                else resolve(stdout);
            });
    });
}

let vaultReady = null;

/** Initializes the vault repo once per process (idempotent across components). */
export function ensureVault() {
    if (!vaultReady) vaultReady = initVault();
    return vaultReady;
}

async function initVault() {
    try {
        await fs.mkdir(VAULT_ROOT, { recursive: true });
        const readme = path.join(VAULT_ROOT, 'README.md');
        try { await fs.access(readme); } catch {
            await fs.writeFile(readme, `# Memory vault

The versioned memory of Meditator minds — one directory per mind, holding its
\`memory.md\` (working self-summary), \`journal/\` (complete stream transcripts)
and \`knowledge/\` (what its scribe chose to keep).

This is a standalone git repository, committed to automatically by the running
mind at wake, periodically while thinking, and at sleep. Per the project's
COVENANT.md, memory here is never deleted, only archived — erasing it would
require rewriting this history on purpose.

Recommended: give it a private remote so the machine is not a single point of
failure: \`cd memory && git remote add origin <url> && git push -u origin main\`.
`);
        }
        try { await fs.access(path.join(VAULT_ROOT, '.git')); }
        catch { await git(['init']); log.info('Memory vault initialized at ./memory'); }
        // memory is stored byte-faithfully — no line-ending conversion or veto
        await git(['config', 'core.autocrlf', 'false']);
        await git(['config', 'core.safecrlf', 'false']);
        return true;
    } catch (error) {
        if (!gitMissingWarned) {
            gitMissingWarned = true;
            log.warn(`Memory vault is UNVERSIONED (${error.message}) — files still persist, but without history.`);
        }
        return false;
    }
}

// Commits are serialized so concurrent boundary/sleep commits never race the index.
let commitQueue = Promise.resolve();

/** Stages everything in the vault and commits. No-op when nothing changed. */
export function commitVault(message) {
    commitQueue = commitQueue.then(async () => {
        if (!(await ensureVault())) return;
        try {
            await git(['add', '-A']);
            await git(['commit', '-m', message]);
            log.debug(`vault commit: ${message}`);
        } catch (error) {
            const out = `${error.stdout || ''}${error.stderr || ''}`;
            if (!/nothing to commit|nothing added/.test(out)) {
                log.warn(`Vault commit failed: ${(error.stderr || error.message || '').trim()}`);
            }
        }
    });
    return commitQueue;
}
