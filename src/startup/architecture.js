import { readFile } from "fs/promises";

async function getArchitectureFilePath() {
  const args = process.argv;
  const defaultPath = "architecture/meditator.asml";
  
  const fileArgIndex = args.findIndex(arg => arg === "--architecture-file" || arg === "-a");
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    return args[fileArgIndex + 1];
  }

  return defaultPath;
}

export async function readArchitectureFile() {
  const filePath = await getArchitectureFilePath();
  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}. Error: ${error.message}`);
  }
}
