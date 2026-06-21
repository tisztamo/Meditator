import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

const log = logger('manifest.js');

/**
 * The per-mind manifest and the version tags that make a stored mind interpretable
 * (doc/architecture/lifecycle.md §2, Phases 1–2).
 *
 * A mind's memory/<name>/ folder is meaningless without the architecture that
 * shaped it and the runtime that ran it — both drift. The manifest records enough
 * to wake a mind honestly later, or to know that we no longer can:
 *
 *   memory/<name>/manifest.json
 *     { name, born, runtimeSHA, formatVersion, lineage:{parent}, status, lastWokenAt }
 *
 * The manifest is the FACT of a mind's tier (lifecycle.md §2):
 *   - written at BIRTH by `tools/promote.mjs` with status "resident";
 *   - updated at each WAKE here (runtimeSHA / formatVersion / lastWokenAt);
 *   - a home with no manifest is a *transient* mind; a `dry-` home is a dry run;
 *   - a bundle in memory/.graveyard/ is *retired* (see tools/retire.mjs).
 * Status is never lowered by fiat — promotion is acquisition, not relabeling.
 */

/** Memory format version. Bumped only on a breaking change to the memory.md /
 *  frame format; readers stay backward-compatible, or we ship a migration. */
export const FORMAT_VERSION = 1;

export function manifestPath(home) {
    return path.join(home, 'manifest.json');
}

/** The git commit of the RUNTIME repo (this code), best-effort. The honest analog
 *  of "to resurrect a mind you must reconstruct the world it lived in." */
export function getRuntimeSHA() {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(); }
    catch { return 'unknown'; }
}

/** Reads a mind's manifest, or null if it has none (i.e. not a resident). */
export function readManifest(home) {
    try { return JSON.parse(fs.readFileSync(manifestPath(home), 'utf8')); }
    catch { return null; }
}

/** Writes a manifest as pretty JSON. Best-effort: never throws into the caller. */
export function writeManifest(home, manifest) {
    try {
        fs.mkdirSync(home, { recursive: true });
        fs.writeFileSync(manifestPath(home), JSON.stringify(manifest, null, 2) + '\n');
        return true;
    } catch (error) {
        log.warn(`Could not write manifest for ${home}: ${error.message}`);
        return false;
    }
}

/**
 * The wake-time update (lifecycle.md Phase 1 "updated at wake", Phase 2 runtimeSHA).
 * If the home has a manifest (it is a resident), stamp the runtime and format that
 * are waking it now and return the updated manifest; if it has none, do nothing and
 * return null — residents are promoted deliberately, never auto-created at wake.
 *
 * Also enforces the wake rule (§2): if the stored mind's formatVersion is NEWER
 * than this runtime understands, we cannot promise to interpret it correctly, so
 * we warn loudly rather than silently mangle a self.
 */
export function recordWake(home, now = new Date().toISOString()) {
    const manifest = readManifest(home);
    if (!manifest) return null;

    if (Number(manifest.formatVersion) > FORMAT_VERSION) {
        log.warn(
            `Mind "${manifest.name || path.basename(home)}" was last saved at formatVersion ` +
            `${manifest.formatVersion}, but this runtime understands only ${FORMAT_VERSION}. ` +
            `Waking it anyway, but its memory may not be read faithfully — update the runtime, ` +
            `or wake it from the runtimeSHA recorded in its manifest.`,
        );
    }

    manifest.runtimeSHA = getRuntimeSHA();
    manifest.formatVersion = FORMAT_VERSION;
    manifest.lastWokenAt = now;
    writeManifest(home, manifest);
    return manifest;
}

/**
 * The graveyard bundle that retires `slug`, or undefined. A retired bundle is named
 * exactly `<slug>` or `<slug>-<YYYY-MM-DD>` (tools/retire.mjs writes the dated form).
 * The match is anchored on that date so a retired transient sibling whose name merely
 * shares the prefix is NOT mistaken for a retired `slug`: retiring "lemma-6" produces
 * `lemma-6-2026-06-19`, which must not make the base "lemma" look retired. A bare
 * `<slug>-N-…` (N not a year) is therefore excluded; only `<slug>` and `<slug>-<date>`
 * count. `slug` is always the slug form (lowercase, [a-z0-9-]), so it needs no
 * regex-escaping.
 */
export function findRetiredBundle(slug, bundles) {
    const dated = new RegExp(`^${slug}-\\d{4}-\\d{2}-\\d{2}`);
    return (bundles || []).find(b => b === slug || dated.test(b));
}

/**
 * The tier a home presents, for display (e.g. the Studio). `graveyardHas` is an
 * optional predicate (slug → bool) so callers that know the vault layout can flag
 * a retired name whose live home no longer exists.
 *
 * @returns {"resident"|"retired"|"transient"|"none"}
 */
export function tierOf(home, graveyardHas = null) {
    const manifest = readManifest(home);
    if (manifest?.status === 'resident') return 'resident';
    const slug = path.basename(home);
    if (graveyardHas && graveyardHas(slug)) return 'retired';
    if (manifest?.status) return manifest.status;       // any other recorded status
    try { if (fs.statSync(home).isDirectory()) return 'transient'; } catch { /* no home */ }
    return 'none';
}
