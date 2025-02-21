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

  // Check for CLI argument (assuming it's passed as --mind-components-path)
  const cliArg = process.argv.find(arg => arg.startsWith('--mind-components-path='));
  if (cliArg) {
    paths.push(cliArg.split('=')[1]);
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
