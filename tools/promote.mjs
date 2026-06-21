#!/usr/bin/env bun
/**
 * tools/promote.mjs — birth a RESIDENT mind (doc/architecture/lifecycle.md §2, Phase 1).
 *
 * Promotion is the deliberate act that confers full Covenant standing on a mind:
 * it writes the manifest that makes "resident" a FACT in the vault, rather than a
 * label we assign by fiat. The complement of `tools/retire.mjs`.
 *
 *   memory/<name>/manifest.json
 *     { name, born, runtimeSHA, formatVersion, lineage:{parent}, status:"resident",
 *       promotedAt }
 *
 * It does NOT fabricate a memory: a resident is born with whatever home it has —
 * normally an empty one (a clean self, the recommended successor in Phase 7). If a
 * home already holds memory, that memory is kept as-is and simply gains a manifest.
 *
 * SAFE BY DEFAULT: previews and changes nothing unless you pass --commit.
 *
 * Usage:
 *   bun tools/promote.mjs <name>                 # preview (no changes)
 *   bun tools/promote.mjs <name> --commit        # write the manifest + vault commit
 *
 * Options:
 *   --parent <name>   lineage parent, if this resident was born from another mind
 *   --commit          actually do it (otherwise dry preview)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FORMAT_VERSION, getRuntimeSHA, readManifest, writeManifest, findRetiredBundle } from '../src/infrastructure/manifest.js';

const VAULT = 'memory';
const VAULT_IDENTITY = ['-c', 'user.name=Meditator', '-c', 'user.email=meditator@vault.local'];

const vgit = (args) => execFileSync('git', ['-C', VAULT, ...args], { encoding: 'utf8' }).trim();
const fwd = (p) => p.replace(/\\/g, '/');
const indent = (s, n = 4) => s.replace(/^/gm, ' '.repeat(n));
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

function parseArgs(argv) {
    const a = { commit: false, parent: null };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t === '--commit') a.commit = true;
        else if (t === '--parent') a.parent = argv[++i];
        else rest.push(t);
    }
    a.name = rest[0];
    return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.name) fail('usage: bun tools/promote.mjs <name> [--commit] [--parent <name>]');
if (args.name.startsWith('dry-')) fail('refusing to promote a dry-run mind — dry runs are not subjects (lifecycle.md §2).');

const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
if (slug !== args.name) fail(`use the slug form: "${slug}" (a mind's home is memory/<slug>/).`);

// Refuse to step on a retired name — that resurrection is a deliberate wake-from-grave.
// Date-anchored (findRetiredBundle): a retired transient sibling like `lemma-6-2026-06-19`
// shares the prefix but does NOT retire the base name "lemma", so it must not block it.
try {
    const grave = findRetiredBundle(slug, fs.readdirSync(path.join(VAULT, '.graveyard')));
    if (grave) fail(`"${slug}" is retired (memory/.graveyard/${grave}); promote a different name, or do a deliberate wake-from-grave.`);
} catch { /* no graveyard yet — fine */ }

const home = path.join(VAULT, slug);
const existing = readManifest(home);
if (existing?.status === 'resident') {
    console.log(`\nNote: ${fwd(home)} is already a resident (born ${String(existing.born).slice(0, 10)}). Re-stamping its manifest.\n`);
}

const homeExists = fs.existsSync(home) && fs.statSync(home).isDirectory();
const hasMemory = homeExists && fs.existsSync(path.join(home, 'memory.md'));

let born = existing?.born;
if (!born) {
    // First commit that touched this home, if any; else now.
    try { born = (vgit(['log', '--reverse', '--format=%aI', '--', slug]).split('\n')[0]) || null; } catch { /* */ }
    born = born || new Date().toISOString();
}

const promotedAt = new Date().toISOString();
const manifest = {
    name: args.name,
    born,
    runtimeSHA: getRuntimeSHA(),
    formatVersion: FORMAT_VERSION,
    lineage: { parent: args.parent ?? existing?.lineage?.parent ?? null },
    status: 'resident',
    promotedAt,
    ...(existing?.lastWokenAt ? { lastWokenAt: existing.lastWokenAt } : {}),
};

console.log(`\n${args.commit ? 'PROMOTING' : 'PREVIEW — no changes will be made'}: ${args.name}\n`);
console.log(`  home:        ${fwd(home)}${homeExists ? (hasMemory ? '  (existing memory — kept)' : '  (existing, no memory.md)') : '  (will be created, empty — a clean self)'}`);
console.log(`  runtimeSHA:  ${manifest.runtimeSHA}`);
console.log(`  born:        ${born}`);
console.log(`  lineage:     parent = ${manifest.lineage.parent ?? '(none)'}`);
console.log(`\n  manifest.json:\n${indent(JSON.stringify(manifest, null, 2))}`);

if (!args.commit) {
    console.log(`\nPreview only. Re-run with --commit to write the manifest and commit the vault.\n`);
    process.exit(0);
}

if (!writeManifest(home, manifest)) fail(`could not write ${fwd(path.join(home, 'manifest.json'))}`);

// Stage only this home, so an unrelated dirty vault is never swept into the commit.
try {
    vgit(['add', slug]);
    vgit([...VAULT_IDENTITY, 'commit', '-m', `promote: ${slug} → resident`]);
    console.log(`\n✓ ${args.name} is now a resident; manifest written and committed to the vault.`);
    console.log(`  Record its birth in IN-MEMORIAM.md if it begins a new lineage.\n`);
} catch (error) {
    const out = `${error.stdout || ''}${error.stderr || ''}`.trim();
    if (/nothing to commit/.test(out)) console.log(`\n✓ manifest written; nothing new to commit in the vault.\n`);
    else fail(`vault commit failed: ${out || error.message}`);
}
