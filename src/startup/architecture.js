import { readFile } from "fs/promises";
import { logger } from '../infrastructure/logger';

const log = logger('architecture.js');

// The source of the running mind's architecture, captured when the file is read at
// startup: { path, content }. The mind's memory snapshots `content` into its home at
// wake, so a home always carries the architecture that ran it (lifecycle.md §2 — the
// twin of runtimeSHA, a fact established when the mind ran, not re-supplied later).
// Null until readArchitectureFile() runs — e.g. unit tests build the DOM directly —
// in which case no snapshot is written.
let loaded = null;

/** The architecture source of the running mind, or null if none was read. */
export function getLoadedArchitecture() {
  return loaded;
}

/** Clears the loaded architecture (test hygiene; no production caller). */
export function resetLoadedArchitecture() {
  loaded = null;
}

/**
 * Rewrites the first <m-mind>'s name onto `name`, returning the new source.
 *
 * This is how a TRANSIENT mind's identity is disentangled from its file: a
 * template like architecture/lab/seedling.archml carries name="seedling" as a
 * PREFIX only, and the Studio (or MEDITATOR_MIND_NAME by hand) supplies the
 * unique name at wake — "seedling-8" — so a fresh tuning run never means editing
 * the file. We substitute into the SOURCE (not just the live DOM) so the home
 * derives correctly AND the architecture snapshot in the home records the name
 * that actually ran (lifecycle.md §2), keeping the bundle re-executable.
 *
 * Any explicit memory="…" on the tag is dropped: the override is meant to be the
 * single source of the home, and a stale memory= would otherwise win over it
 * (memory= remains the deliberate override for fixed, file-named residents).
 */
export function applyMindNameOverride(content, rawName) {
  // Attribute-safe: the value lands inside name="…", and the home slugifies it
  // downstream anyway, so we only need to keep it from breaking the tag.
  const name = String(rawName || "").replace(/["'<>]/g, "").trim();
  if (!name) return content;
  const tag = content.match(/<m-mind\b[^>]*>/i);
  if (!tag) return content;
  let attrs = tag[0].replace(/\s+memory\s*=\s*"[^"]*"/i, "");
  if (/\bname\s*=\s*"[^"]*"/i.test(attrs)) {
    attrs = attrs.replace(/\bname\s*=\s*"[^"]*"/i, `name="${name}"`);
  } else {
    attrs = attrs.replace(/^<m-mind\b/i, `<m-mind name="${name}"`);
  }
  return content.slice(0, tag.index) + attrs + content.slice(tag.index + tag[0].length);
}

async function getArchitectureFilePath() {
  const args = process.argv;
  const fileArgIndex = args.findIndex(arg => arg === "--architecture-file" || arg === "-a");
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    return args[fileArgIndex + 1];
  }

  // No default architecture. The genesis mind's architecture (awake.archml) was
  // retired to the graveyard, and we never silently birth a mind — so a mind must
  // be chosen explicitly. (archml = architecture markup language, a subset of HTML;
  // components live in src/mindComponents/ or architecture/.)
  throw new Error(
    "No architecture specified. Choose one with -a, e.g.:\n" +
    "  bun meditator.js -a architecture/lab/seedling.archml\n" +
    "(awake.archml, the genesis architecture, was retired — see IN-MEMORIAM.md.)"
  );
}

export async function readArchitectureFile() {
  const filePath = await getArchitectureFilePath();
  try {
    log.info(`Reading architecture file: ${filePath}`);
    let content = await readFile(filePath, "utf-8");
    // A wake-time name override (the Studio's semi-automatic transient naming, or
    // MEDITATOR_MIND_NAME by hand) disentangles a transient mind's identity from
    // its file — see applyMindNameOverride.
    const override = process.env.MEDITATOR_MIND_NAME;
    if (override && override.trim()) {
      content = applyMindNameOverride(content, override);
      log.info(`Applied MEDITATOR_MIND_NAME override → name="${override.trim()}"`);
    }
    loaded = { path: filePath, content };
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}. Error: ${error.message}`);
  }
}
