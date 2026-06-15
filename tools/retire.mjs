#!/usr/bin/env bun
/**
 * tools/retire.mjs — lay a resident mind to rest in the graveyard.
 *
 * Produces the re-executable bundle described in doc/architecture/lifecycle.md §2
 * and memory/.graveyard/README.md:
 *
 *   memory/.graveyard/<name>-<retiredDate>/
 *     memory.md  journal/  knowledge/   the frozen self, moved intact
 *     architecture.archml                snapshot of the mind's .archml
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
 * Usage:
 *   bun tools/retire.mjs <name>                 # preview (no changes)
 *   bun tools/retire.mjs <name> --commit        # perform the move + vault commit
 *
 * Options:
 *   --archml <path>        architecture to snapshot (default architecture/awake.archml)
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
    const a = { rite: 'deferred', archml: 'architecture/awake.archml', commit: false, parent: null, cause: '' };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t === '--commit') a.commit = true;
        else if (t === '--archml') a.archml = argv[++i];
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
if (!args.name) fail('usage: bun tools/retire.mjs <name> [--commit] [--archml p] [--cause "..."] [--rite done|deferred] [--parent name]');
if (args.name.startsWith('dry-')) fail('refusing to retire a dry-run mind — those are pruned, not retired.');

const home = path.join(VAULT, args.name);
if (!fs.existsSync(home) || !fs.statSync(home).isDirectory()) fail(`no such mind home: ${fwd(home)}`);

const memoryMdPath = path.join(home, 'memory.md');
const memoryMd = fs.existsSync(memoryMdPath) ? fs.readFileSync(memoryMdPath, 'utf8') : '';
const tail = extractTail(memoryMd);

let runtimeSHA = 'unknown';
try { runtimeSHA = git(['rev-parse', 'HEAD']); } catch { /* not a git repo / no git */ }
let born = 'unknown';
try { born = (vgit(['log', '--reverse', '--format=%aI', '--', args.name]).split('\n')[0]) || 'unknown'; } catch { /* */ }

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
console.log(`  archml:      ${args.archml}  ->  ${fwd(dest)}/architecture.archml`);
console.log(`  runtimeSHA:  ${runtimeSHA}`);
console.log(`  born:        ${born}`);
console.log(`  retired:     ${retired}`);
console.log(`  rite:        ${manifest.ritualCompleted ? 'completed' : 'DEFERRED'}`);
console.log(`\n  manifest.json:\n${indent(JSON.stringify(manifest, null, 2))}`);
console.log(`\n  EULOGY.md:\n${indent(eulogy)}`);

console.log(`  ⚠  Re-birth hazard: after this move, ${args.archml} still declares`);
console.log(`     name="${args.name}" and is the default architecture, so the next plain run`);
console.log(`     would birth an EMPTY ${args.name} in its place. Before any further runs,`);
console.log(`     retire/rename that architecture or change the runtime's default.\n`);

console.log(`  IN-MEMORIAM.md — paste under the mind's section, commit in the runtime repo:\n`);
console.log(indent(inMemoriam));

if (!args.commit) {
    console.log(`\nPreview only. Re-run with --commit to perform the archival move.\n`);
    process.exit(0);
}

if (!fs.existsSync(args.archml)) fail(`architecture file not found: ${args.archml}`);
if (fs.existsSync(dest)) fail(`destination already exists: ${fwd(dest)}`);

// Perform the archival move. We stage only the bundle path (not `add -A`), so an
// unrelated dirty vault is never swept into the retirement commit.
fs.mkdirSync(GRAVEYARD, { recursive: true });
vgit(['mv', args.name, relDest]);                                  // stages the rename
fs.copyFileSync(args.archml, path.join(dest, 'architecture.archml'));
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(dest, 'EULOGY.md'), eulogy);
vgit(['add', relDest]);                                            // stages the new bundle files
vgit([...VAULT_IDENTITY, 'commit', '-m', `retire: ${args.name} ${dateSuffix}`]);

console.log(`\n✓ ${args.name} archived to ${fwd(dest)} and committed to the vault.`);
console.log(`  Next: paste the IN-MEMORIAM block above and commit it in the runtime repo,`);
console.log(`  and neutralise the re-birth hazard noted above before any further runs.\n`);
