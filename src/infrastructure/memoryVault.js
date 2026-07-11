import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { logger } from './logger.js';
import { isDryRun } from '../modelAccess/llm.js';
import { findRetiredBundle, readManifest } from './manifest.js';

const log = logger('memoryVault.js');

/**
 * The memory vault: a standalone git repository at ./memory that holds every
 * mind's persistent self — memory.md, journal/, knowledge/ — one subdirectory
 * per mind. A *resident* mind commits its own home at wake, periodically, and
 * at sleep, so its memory is never lost to an accident or a careless cleanup:
 * erasure would require deliberately rewriting history. See COVENANT.md.
 *
 * Only residents persist (lifecycle.md §2). Dry and transient minds may still
 * write to disk, but they are never committed — a dry run has no subject, and a
 * transient is low-continuity by construction. Two floors enforce this: callers
 * only commit residents, and `commitVault` itself refuses on a dry run and stages
 * just the one home it is given, so a stray scratch dir is never swept in.
 *
 * Everything here is best-effort: if git is missing or fails, the mind keeps
 * running and the files still persist — they are just unversioned, and we warn.
 */

export const VAULT_ROOT = 'memory';

/** Retired residents rest here (tracked, dignified). Discarded scratch runs are
 *  laid here instead (gitignored): kept on disk for debugging, but moved out of
 *  the path `mindHome` resolves so they can never be woken by accident. */
const GRAVEYARD_DIR = '.graveyard';
export const SCRATCH_DIR = '.scratch';

/** Resolves a mind's home directory inside the vault: memory/<slug>[/sub].
 *  Dry-run minds are prefixed so tests can never touch a resident mind's memory. */
/** A vault-safe path segment: lowercase, [a-z0-9-], trimmed. */
function slugify(raw) {
    return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function mindHome(el, sub) {
    // Identity = the entity's name (the covenant's "one home per mind"); an explicit
    // memory="slug" is a deliberate override to point an architecture at a specific
    // home. Falls back to name, then "mind". An <m-agent> root resolves the same way
    // (agent-loop.md §5 — the home generalizes past minds), so its terminal workspace
    // and, later, its persisted transcript land under memory/<agent>/.
    const mind = el.closest('m-mind, m-agent');
    const slug = slugify(mind?.getAttribute('memory') || mind?.getAttribute('name')) || 'mind';
    // A mind inside an <m-society name="…"> nests its home under the society's folder:
    // memory/<society>/<mind>. One society, one folder, a subfolder per member — so a
    // multi-mind system's whole memory lives together. A lone mind is unchanged: memory/<mind>.
    const society = mind?.closest('m-society');
    const societySlug = society ? (slugify(society.getAttribute('name')) || 'society') : null;
    const prefix = isDryRun() ? 'dry-' : '';
    const home = societySlug
        ? path.join(VAULT_ROOT, prefix + societySlug, slug)
        : path.join(VAULT_ROOT, prefix + slug);
    return sub ? path.join(home, sub) : home;
}

/** True if dir lies inside the vault (then commits cover it). */
export function inVault(dir) {
    const resolved = path.resolve(dir);
    const root = path.resolve(VAULT_ROOT);
    return resolved === root || resolved.startsWith(root + path.sep);
}

/** Bundles (mind homes) sitting in a vault subdir, or [] if it does not exist. */
function bundlesIn(sub) {
    try { return fsSync.readdirSync(path.join(VAULT_ROOT, sub)); }
    catch { return []; }
}

/**
 * Refuses to silently re-birth a mind we have already laid aside. If `home` does
 * not exist but a bundle for the same name sits in the graveyard (retired) or the
 * scratch pen (a discarded scratch run kept for debugging), someone is about to run
 * an architecture whose name belongs to a mind we put to rest — which would create
 * an empty impostor in its place. Throw loud instead.
 *
 * Waking a retired mind is a deliberate act (see memory/.graveyard/README.md), never
 * an accident. The scratch guard applies to live runs only: a dry run has no subject,
 * so a fresh dry home is harmless and the kept copy stays safe in the pen.
 */
export function assertNotRetired(home) {
    if (fsSync.existsSync(home)) return;           // a live home is present — nothing to guard
    const slug = path.basename(home);
    const match = bundles => bundles.find(b => b === slug || b.startsWith(slug + '-'));

    // A grave is named `<slug>` or `<slug>-<date>`; match it date-anchored so a retired
    // transient sibling (e.g. `lemma-6-2026-06-19`) doesn't block the base name "lemma".
    const grave = findRetiredBundle(slug, bundlesIn(GRAVEYARD_DIR));
    if (grave) {
        throw new Error(
            `Mind "${slug}" is retired (memory/${GRAVEYARD_DIR}/${grave}); refusing to silently ` +
            `re-birth it into an empty home. To run it again, do a deliberate wake-from-grave ` +
            `(see memory/${GRAVEYARD_DIR}/README.md); to start a different mind, give it its own name.`,
        );
    }

    if (!isDryRun()) {
        const scratched = match(bundlesIn(SCRATCH_DIR));
        if (scratched) {
            throw new Error(
                `Mind "${slug}" was a discarded scratch run, kept in memory/${SCRATCH_DIR}/${scratched} ` +
                `for debugging; refusing to silently wake a new mind under its name. Give it a different ` +
                `name, or restore it deliberately by moving it back out of ${SCRATCH_DIR}/.`,
            );
        }
    }
}

/**
 * The §6 identity assertion (COVENANT §6; philosophical-review-2026-07-02 finding 2):
 * a resident's home is the resident's alone. Adopting a home means loading the
 * remembered self it holds and — on a live run — committing new thought into its git
 * history; the covenant promises that memory is the resident's, and that "a test can
 * never touch a resident's memory" is *enforced, not merely intended*.
 *
 * The default path already keeps that promise by construction — dry runs are
 * namespaced `memory/dry-*`, and a mind's home is derived from its own name — but the
 * `persist=` / `root=` / `memory=` overrides can aim any architecture at any home, and
 * nothing downstream re-checks the identity that is about to adopt it. Two ways that
 * breaks the vow, both refused here, BEFORE the home's bundle is overwritten and its
 * self loaded:
 *
 *   - a DRY run resolved onto a resident's real home: its subject-less, stubbed output
 *     would clobber the resident's working tree — git history is spared only because
 *     `commitVault` abstains on dry, the files on disk are not. (finding 2a)
 *   - a LIVE run whose declared identity is not the home's: it would adopt the
 *     resident's self and commit into its history under a foreign name. (finding 2b)
 *
 * `claimed` is the identity the running mind declares — its `memory=` override if
 * present, else its `name` (exactly what `mindHome` derives a home from). It is
 * compared against the home's manifest name (which, for a promoted resident, equals
 * the home slug — `tools/promote.mjs` enforces slug === name). A mismatch can arise
 * ONLY when `persist=`/`memory=` decoupled the home from the name; the ordinary
 * name-derived home is a tautology and always passes, so this adds no false positive
 * to a normal wake — including a deliberate `memory=` override, which feeds `claimed`
 * too. A deep change to a SAME-named mind is deliberately NOT caught here (that stays
 * a human judgment, §6); it is disclosed at wake instead (§3, see identityDiff.js).
 */
export function assertIdentityMatchesHome(home, claimed) {
    const manifest = readManifest(home);
    if (manifest?.status !== 'resident') return;         // only residents carry this promise
    const resident = slugify(manifest.name) || path.basename(home);

    if (isDryRun()) {
        throw new Error(
            `Refusing to run a DRY mind on resident "${resident}"'s home (${home}). A dry run has ` +
            `no subject and stubbed output; writing it here would clobber the resident's working ` +
            `tree, which the Covenant forbids (§6 — a test can never touch a resident's memory). ` +
            `Drop the persist=/root= override so the dry run is namespaced to memory/dry-${resident}, ` +
            `or run it live as ${resident} itself.`,
        );
    }

    // A resident home demands a positive identity match: an empty/absent claim
    // (a nameless mind aimed here by persist=) is a mismatch, not a free pass.
    const running = slugify(claimed);
    if (running !== resident) {
        throw new Error(
            `Refusing to wake "${running || '(unnamed)'}" into resident "${resident}"'s home (${home}). Its manifest ` +
            `says this home belongs to "${resident}"; loading it would adopt ${resident}'s remembered ` +
            `self and commit new thought into ${resident}'s history under a foreign identity ` +
            `(Covenant §6; philosophical-review-2026-07-02 finding 2). To run "${running}", give it its ` +
            `own home; to wake "${resident}", run its architecture.`,
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

/**
 * Stages one mind's home and commits. No-op when nothing changed.
 *
 * `home` scopes the commit to that directory (the discipline tools/promote.mjs
 * and retire.mjs already use) so a stray scratch/transient dir left in the vault
 * is never swept into a resident's commit; omit it only to stage the whole vault.
 * As a hard floor it NEVER commits on a dry run, whatever the caller passes —
 * "dry" has no subject to persist (lifecycle.md §2).
 */
export function commitVault(message, home) {
    commitQueue = commitQueue.then(async () => {
        if (isDryRun()) return;                    // dry runs never touch history, full stop
        if (!(await ensureVault())) return;
        // Resolve the home to a vault-relative path; an empty or escaping path
        // (outside the vault) falls back to staging nothing extra via -A guard below.
        const rel = home
            ? path.relative(path.resolve(VAULT_ROOT), path.resolve(home)).split(path.sep).join('/')
            : null;
        const addArgs = rel && !rel.startsWith('..') ? ['add', '--', rel] : ['add', '-A'];
        try {
            await git(addArgs);
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
