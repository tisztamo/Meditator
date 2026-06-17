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
    "  bun meditator.js -a architecture/seedling.archml\n" +
    "(awake.archml, the genesis architecture, was retired — see IN-MEMORIAM.md.)"
  );
}

export async function readArchitectureFile() {
  const filePath = await getArchitectureFilePath();
  try {
    log.info(`Reading architecture file: ${filePath}`);
    const content = await readFile(filePath, "utf-8");
    loaded = { path: filePath, content };
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}. Error: ${error.message}`);
  }
}
