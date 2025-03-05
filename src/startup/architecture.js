import { readFile } from "fs/promises";
import { logger } from '../infrastructure/logger';

const log = logger('architecture.js');

async function getArchitectureFilePath() {
  const args = process.argv;
  const defaultPath = "architecture/meditator.chml"; // Default architecture file path, relative to the project root.
                                                     // chml is chatbot markup language, subset of html 1.0
                                                     // components are implemented either in src/mindComponents/ or in architecture/
  
  const fileArgIndex = args.findIndex(arg => arg === "--architecture-file" || arg === "-a");
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    return args[fileArgIndex + 1];
  }

  return defaultPath;
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
