import { readFile } from "fs/promises";
import { logger } from '../infrastructure/logger';

const log = logger('architecture.js');

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
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}. Error: ${error.message}`);
  }
}
