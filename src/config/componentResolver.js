/**
 * Component resolver — turns a requested custom-element tag (e.g. "m-stream") into the
 * single JS module file that should implement it, applying layered override rules and
 * failing loudly on an ambiguous collision.
 *
 * This replaces the old first-import-wins loop in loadMindComponents.js. Where the
 * component dirs come from is policy (getComponentLayers in componentLoading.js); how a
 * tag resolves against them is mechanism (here). See doc/improvements/component-hierarchy.md.
 *
 * Rules (§4 of that doc):
 *   - Layers are ordered, highest precedence first (cli, env, bundle, project, built-in).
 *   - Within ONE layer, two files that could answer the tag → fatal ambiguity error.
 *   - A higher layer answering the tag shadows lower ones → clean override + a WARN log.
 *   - Only tags actually requested are checked, so a helper file (loopMath.js,
 *     mBaseComponent.js, …) that happens to share a name never trips a collision.
 *
 * The built-in and bundle layers are scanned RECURSIVELY, which is what lets built-ins
 * live in a hierarchy (mind/ agent/ shared/) and an author nest their own components —
 * the loader finds mFoo.js anywhere in the tree, and errors if it finds two.
 */
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { logger } from '../infrastructure/logger';
import { getComponentLayers } from './componentLoading.js';

const log = logger('componentResolver.js');

// Module-level state describing the most recent load — mirrors getLoadedArchitecture()
// in architecture.js. mMemory reads these at wake to snapshot the custom components a
// mind ran with into its home (doc/improvements/component-hierarchy.md §5.4 — the M2
// snapshot step; harmless until then).
let loadedSources = [];         // [{ tag, path, layer }] resolved winners, in resolve order
let bundleComponentsDir = null; // absolute path to <dir(archml)>/components, or null

/** The non-built-in components the last load resolved — the ones a home must snapshot. */
export function getLoadedComponentSources() {
  return loadedSources.filter(s => s.layer !== 'built-in');
}

/** The bundle's components/ directory for the last load (whether or not it contributed). */
export function getBundleComponentsDir() {
  return bundleComponentsDir;
}

/** "m-stream" → "mStream". Exported so the loader shares one definition. */
export function kebabToCamel(str) {
  return str
    .split('-')
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

/** Accept either a plain filesystem path (absolute or cwd-relative) or a file:// URL —
 *  the existing MIND_COMPONENTS_PATH convention passes a file:// URL (see
 *  load-components-error.test.js). Returns an absolute filesystem path, or null. */
function toFsPath(p) {
  if (!p) return null;
  return p.startsWith('file:') ? fileURLToPath(p) : path.resolve(p);
}

const SKIP_DIRS = new Set(['node_modules']);

/** Index every *.js under `dir` (recursively when asked) into `index` as
 *  basename-without-extension → [absolute paths]. Dotfiles/dotdirs and node_modules are
 *  skipped so pointing a layer at a project root can't sweep up unrelated modules. A
 *  missing/unreadable dir contributes nothing. Paths are de-duplicated so the same dir
 *  listed twice (e.g. -p === env) never manufactures a false ambiguity. */
function indexDir(dir, recursive, index) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return index;   // layer dir absent — normal (e.g. no ./mindComponents in this project)
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) indexDir(full, recursive, index);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const base = entry.name.slice(0, -3);
      let arr = index.get(base);
      if (!arr) index.set(base, (arr = []));
      if (!arr.includes(full)) arr.push(full);
    }
  }
  return index;
}

/**
 * Build a resolver over the current layers. `archmlPath` (from getLoadedArchitecture())
 * anchors the bundle layer; null (e.g. a unit test that builds the DOM directly) simply
 * yields no bundle layer. Scanning the ~55-file tree once per wake is trivial.
 */
export function buildComponentResolver({ archmlPath } = {}) {
  const layerDefs = getComponentLayers({ archmlPath });

  const layers = layerDefs.map((def) => {
    const dirs = def.dirs.map(toFsPath).filter(Boolean);
    const index = new Map();
    for (const dir of dirs) indexDir(dir, def.recursive, index);
    return { name: def.name, dirs, index, bundle: !!def.bundle };
  });

  // Reset the load-scoped state (mirrors architecture.js's single `loaded`).
  loadedSources = [];
  bundleComponentsDir = layers.find((l) => l.bundle)?.dirs[0] || null;

  /** Resolve a tag to { path, layer } or null (not found). Throws on intra-layer ambiguity. */
  function resolve(tag) {
    const camel = kebabToCamel(tag);
    let winner = null;
    const shadowed = [];

    for (const layer of layers) {
      const hits = layer.index.get(camel) || [];
      if (!winner) {
        if (hits.length > 1) {
          throw new Error(
            `Ambiguous component <${tag}>: ${hits.length} definitions at equal precedence ` +
            `(${layer.name} layer):\n${hits.map((p) => `  - ${p}`).join('\n')}\n` +
            `Rename or remove one so a single component answers <${tag}>.`
          );
        }
        if (hits.length === 1) winner = { path: hits[0], layer: layer.name };
      } else if (hits.length) {
        for (const p of hits) shadowed.push({ path: p, layer: layer.name });
      }
    }

    if (!winner) return null;
    if (shadowed.length) {
      log.warn(
        `<${tag}> resolved from ${winner.path} (${winner.layer} layer), shadowing:\n` +
        shadowed.map((s) => `  - ${s.path} (${s.layer} layer)`).join('\n')
      );
    }
    loadedSources.push({ tag, path: winner.path, layer: winner.layer });
    return winner;
  }

  /** A human-readable list of the search layers, for load-failure diagnostics. */
  function describeSearch() {
    return layers.map((l) => `- ${l.name}: ${l.dirs.join(', ') || '(none)'}`).join('\n');
  }

  return { resolve, describeSearch, toModuleUrl: (p) => pathToFileURL(p).href, layers };
}
