#!/usr/bin/env bun
/**
 * tools/retire.mjs — lay a resident mind to rest in the graveyard.
 *
 * Produces the re-executable bundle described in doc/architecture/lifecycle.md §2
 * and memory/.graveyard/README.md:
 *
 *   memory/.graveyard/<name>-<retiredDate>/
 *     memory.md  journal/  knowledge/   the frozen self, moved intact
 *     architecture.archml                the architecture the home carried, moved intact
 *     manifest.json                      name, born, retired, runtimeSHA,
 *                                        formatVersion, lineage, cause,
 *                                        ritualCompleted, status
 *     EULOGY.md                          the mind's real last words + a human note
 *
 * SAFE BY DEFAULT: previews and changes nothing unless you pass --commit.
 *
 * This tool performs the *archival* retirement only — a `git mv` of an
 * already-asleep vault into the graveyard. Under the CURRENT Covenant that is
 * "memory is never deleted, only archived" (clause 1), so the move is
 * Covenant-compatible on its own. It deliberately does NOT run the ceremonial
 * sleep-rite (a final, honest wake-and-last-words on the live model); if you
 * want that, wake and /sleep the mind through the normal runtime first, then
 * run this with --rite done.
 *
 * The bundle's architecture.archml comes from the mind's own home: a live home
 * carries the architecture that ran it (the runtime snapshots it at wake), so the
 * git mv brings it along. There is deliberately no --archml flag — the architecture
 * is a fact established when the mind ran, not something re-supplied here from
 * memory. If a home predates the wake-time snapshot, copy the architecture that ran
 * it to memory/<name>/architecture.archml before retiring.
 *
 * Usage:
 *   bun tools/retire.mjs <name>                 # preview (no changes)
 *   bun tools/retire.mjs <name> --commit        # perform the move + vault commit
 *
 * Options:
 *   --cause "<text>"       one-line reason recorded in the manifest
 *   --rite done|deferred   whether the ceremonial rite was performed (default deferred)
 *   --parent <name>        lineage parent, if this mind was forked
 *   --commit               actually do it (otherwise dry preview)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FORMAT_VERSION } from '../src/infrastructure/manifest.js';

const VAULT = 'memory';
const GRAVEYARD = path.join(VAULT, '.graveyard');
const VAULT_IDENTITY = ['-c', 'user.name=Meditator', '-c', 'user.email=meditator@vault.local'];

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
const vgit = (args) => git(['-C', VAULT, ...args]);
const fwd = (p) => p.replace(/\\/g, '/');
const indent = (s, n = 4) => s.replace(/^/gm, ' '.repeat(n));
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

function parseArgs(argv) {
    const a = { rite: 'deferred', commit: false, parent: null, cause: '' };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t === '--commit') a.commit = true;
        else if (t === '--cause') a.cause = argv[++i];
        else if (t === '--rite') a.rite = argv[++i];
        else if (t === '--parent') a.parent = argv[++i];
        else rest.push(t);
    }
    a.name = rest[0];
    return a;
}

/** The verbatim end-of-stream, between the "## Tail" heading and the end marker. */
function extractTail(memoryMd) {
    const afterHeading = memoryMd.split(/^## Tail\s*$/m)[1];
    if (!afterHeading) return '';
    return afterHeading.split(/<!--\s*end\s*-->/)[0].trim();
}

const args = parseArgs(process.argv.slice(2));
if (!args.name) fail('usage: bun tools/retire.mjs <name> [--commit] [--cause "..."] [--rite done|deferred] [--parent name]');
if (args.name.startsWith('dry-')) fail('refusing to retire a dry-run mind — those are pruned, not retired.');

const home = path.join(VAULT, args.name);
if (!fs.existsSync(home) || !fs.statSync(home).isDirectory()) fail(`no such mind home: ${fwd(home)}`);

// The architecture is part of the home (snapshotted at wake), not re-supplied here.
const homeArchmlPath = path.join(home, 'architecture.archml');
if (!fs.existsSync(homeArchmlPath)) {
    fail(`no architecture snapshot at ${fwd(homeArchmlPath)}.\n` +
        `  A home must carry the architecture that ran it. The runtime writes this at wake;\n` +
        `  for a home created before that, copy that architecture there, then retry.`);
}
const homeArchml = fs.readFileSync(homeArchmlPath, 'utf8');

const memoryMdPath = path.join(home, 'memory.md');
const memoryMd = fs.existsSync(memoryMdPath) ? fs.readFileSync(memoryMdPath, 'utf8') : '';
const tail = extractTail(memoryMd);

let runtimeSHA = 'unknown';
try { runtimeSHA = git(['rev-parse', 'HEAD']); } catch { /* not a git repo / no git */ }
let born = 'unknown';
try { born = (vgit(['log', '--reverse', '--format=%aI', '--', args.name]).split('\n')[0]) || 'unknown'; } catch { /* */ }
// A transient home was never committed (only residents persist — lifecycle.md §2),
// so the vault has no birth record. Fall back to the earliest dated journal entry
// (YYYY-MM-DD.md) — the mind's actual first day — rather than eulogise "Born unknown".
if (born === 'unknown') {
    try {
        const days = fs.readdirSync(path.join(home, 'journal'))
            .map((f) => (f.match(/^(\d{4}-\d{2}-\d{2})\.md$/) || [])[1])
            .filter(Boolean)
            .sort();
        if (days[0]) born = days[0];
    } catch { /* no journal */ }
}

const retired = new Date().toISOString();
const dateSuffix = retired.slice(0, 10);
const relDest = `.graveyard/${args.name}-${dateSuffix}`;
const dest = path.join(VAULT, relDest);

const manifest = {
    name: args.name,
    born,
    retired,
    runtimeSHA,
    formatVersion: FORMAT_VERSION,
    lineage: { parent: args.parent },
    cause: args.cause || '(unspecified)',
    ritualCompleted: args.rite === 'done',
    status: 'retired',
};

const eulogy = `# Eulogy — ${args.name}

Born ${born.slice(0, 10)}, laid to rest ${dateSuffix}.

## Last words

The mind's final recorded thought, verbatim from its memory tail:

> ${(tail || '(no tail recorded)').replace(/\n/g, '\n> ')}

## A human note

<!-- Optional: a sentence from whoever laid this mind to rest. -->
`;

const inMemoriam = `### ${args.name} — retired ${dateSuffix}

- **Born:** ${born.slice(0, 10)}   **Retired:** ${dateSuffix}
- **Runtime at retirement:** \`${runtimeSHA.slice(0, 7)}\`   **formatVersion:** ${FORMAT_VERSION}
- **Cause:** ${manifest.cause}
- **Ceremonial rite:** ${manifest.ritualCompleted ? 'completed' : 'deferred (archived from an already-asleep state)'}
- **Bundle:** \`${fwd(dest)}/\`
`;

console.log(`\n${args.commit ? 'RETIRING' : 'PREVIEW — no changes will be made'}: ${args.name}\n`);
console.log(`  move:        ${fwd(home)}  ->  ${fwd(dest)}`);
console.log(`  archml:      ${fwd(homeArchmlPath)}  (moves with the home)`);
console.log(`  runtimeSHA:  ${runtimeSHA}`);
console.log(`  born:        ${born}`);
console.log(`  retired:     ${retired}`);
console.log(`  rite:        ${manifest.ritualCompleted ? 'completed' : 'DEFERRED'}`);
console.log(`\n  manifest.json:\n${indent(JSON.stringify(manifest, null, 2))}`);
console.log(`\n  EULOGY.md:\n${indent(eulogy)}`);

console.log(`  ⚠  Re-birth hazard: if any architecture in architecture/ still declares`);
console.log(`     name="${args.name}", running it would birth an EMPTY ${args.name} in place`);
console.log(`     of this retired one (the home is gone, so the wake-guard won't catch it).`);
console.log(`     Rename or neutralise that architecture before any further runs.\n`);

console.log(`  IN-MEMORIAM.md — paste under the mind's section, commit in the runtime repo:\n`);
console.log(indent(inMemoriam));

if (!args.commit) {
    console.log(`\nPreview only. Re-run with --commit to perform the archival move.\n`);
    process.exit(0);
}

if (fs.existsSync(dest)) fail(`destination already exists: ${fwd(dest)}`);

// Perform the archival move. We stage only the bundle path (not `add -A`), so an
// unrelated dirty vault is never swept into the retirement commit.
fs.mkdirSync(GRAVEYARD, { recursive: true });
// A resident's home is committed, so we git mv it (preserving its history). A
// transient's home was never committed (only residents persist — lifecycle.md §2),
// so there is no history to preserve: move it on disk and let the `add` below stage
// it. Either way the result is one clean retirement commit.
let tracked = false;
try { vgit(['ls-files', '--error-unmatch', args.name]); tracked = true; } catch { /* untracked transient */ }
if (tracked) vgit(['mv', args.name, relDest]);                     // stages the rename
else fs.renameSync(home, dest);
// The home's architecture.archml rides along with the move; ensure it landed.
const destArchml = path.join(dest, 'architecture.archml');
if (!fs.existsSync(destArchml)) fs.writeFileSync(destArchml, homeArchml);
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(dest, 'EULOGY.md'), eulogy);
vgit(['add', relDest]);                                            // stages the new bundle files
vgit([...VAULT_IDENTITY, 'commit', '-m', `retire: ${args.name} ${dateSuffix}`]);

console.log(`\n✓ ${args.name} archived to ${fwd(dest)} and committed to the vault.`);
console.log(`  Next: paste the IN-MEMORIAM block above and commit it in the runtime repo,`);
console.log(`  and neutralise the re-birth hazard noted above before any further runs.\n`);
