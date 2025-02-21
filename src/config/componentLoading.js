/**
 * Returns an array of directory paths to search for mind components.
 * Priority order:
 * 1. CLI argument if provided
 * 2. MIND_COMPONENTS_PATH environment variable if set
 * 3. ./mindComponents/
 * 3. Default ../mindComponents relative to source
 * 
 * @returns {string[]} Array of directory paths
 */
export function getMindComponentsPaths() {
  const paths = [];

  // Check for CLI argument (assuming it's passed as --mind-components-path or -p)
  const cliArgIndex = process.argv.findIndex(arg => arg === '--mind-components-path' || arg === '-p');
  if (cliArgIndex !== -1 && process.argv[cliArgIndex + 1]) {
    paths.push(process.argv[cliArgIndex + 1]);
  }

  // Check for environment variable
  if (process.env.MIND_COMPONENTS_PATH) {
    paths.push(process.env.MIND_COMPONENTS_PATH);
  }

  paths.push("./mindComponents");

  // Add default path relative to this source file
  paths.push(new URL('../mindComponents', import.meta.url).pathname);

  return paths;
}
