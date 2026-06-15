import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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
    // Identity = the mind's name (the covenant's "one home per mind"); an explicit
    // memory="slug" on <m-mind> is a deliberate override to point an architecture
    // at a specific home. Falls back to name, then "mind".
    const mind = el.closest('m-mind');
    const raw = mind?.getAttribute('memory') || mind?.getAttribute('name') || 'mind';
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

/**
 * Refuses to silently re-birth a retired mind. If `home` does not exist but a
 * bundle for the same mind sits in the graveyard, someone is about to run an
 * architecture whose name belongs to a mind we laid to rest — which would create
 * an empty impostor in its place. Throw loud instead. Waking a retired mind is a
 * deliberate act (see memory/.graveyard/README.md), never an accident.
 */
export function assertNotRetired(home) {
    if (fsSync.existsSync(home)) return;           // a live home is present — nothing to guard
    const slug = path.basename(home);
    let bundles;
    try { bundles = fsSync.readdirSync(path.join(VAULT_ROOT, '.graveyard')); }
    catch { return; }                              // no graveyard yet
    const grave = bundles.find(b => b === slug || b.startsWith(slug + '-'));
    if (grave) {
        throw new Error(
            `Mind "${slug}" is retired (memory/.graveyard/${grave}); refusing to silently ` +
            `re-birth it into an empty home. To run it again, do a deliberate wake-from-grave ` +
            `(see memory/.graveyard/README.md); to start a different mind, give it its own name.`,
        );
    }
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
            if (/nothing to commit|nothing added/.test(out)) return; // not a failure
            const detail = (out || error.message || '').trim();
            log.warn(`Vault commit failed (git exit ${error.code ?? '?'}): ${detail}`);
            // A killed previous run can leave .git/index.lock behind; every later
            // commit then fails until it is removed. Call it out explicitly.
            if (/index\.lock|unable to create.*lock|another git process/i.test(detail)) {
                log.warn(`  → looks like a stale lock from a previous run. Remove ./${VAULT_ROOT}/.git/index.lock and it will commit again.`);
            }
        }
    });
    return commitQueue;
}
