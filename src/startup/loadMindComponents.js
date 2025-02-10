import { getUnregisteredCustomElements } from "./getUnregisteredCustomElements.js";

/**
 * Converts a kebab-case string (e.g. "m-stream") to camelCase (e.g. "mStream").
 *
 * @param {string} str - The kebab-case string.
 * @returns {string} The camelCase conversion.
 */
function kebabToCamel(str) {
  return str
    .split('-')
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');
}

/**
 * Loads the JS module for each unregistered custom element found in the given DOM.
 * The module for a tag (e.g. "m-stream") is expected to be located at:
 *    ../mindComponents/mStream.js
 *
 * When a component has the attribute skipload="true", if its module fails to load,
 * the error is caught and a warning is dropped to the console instead of throwing.
 *
 * This function returns a mapping of tag names to their imported module objects.
 *
 * @param {Document|Element} dom - The DOM to search.
 * @returns {Promise<Object>} An object mapping each custom element tag name to its module (or null if skipped).
 */
export async function loadMindComponents(dom) {
  // Get all custom element tag names that are not yet registered.
  const customTags = getUnregisteredCustomElements(dom);

  // For each tag, attempt to import its module.
  const imports = await Promise.all(
    customTags.map(async (tag) => {
      const camelCaseName = kebabToCamel(tag);
      // Build the module URL relative to the current file.
      const moduleUrl = new URL(`../mindComponents/${camelCaseName}.js`, import.meta.url);
      try {
        // Dynamically import the module.
        return await import(moduleUrl);
      } catch (error) {
        console.log(tag)
        // If any element of this tag in the DOM has skipload="true", drop a warning and continue.
        if (dom.querySelector(`${tag}[skipload="true"]`)) {
          console.warn(
            `Warning: Failed to load module for ${tag} (expected at ${moduleUrl}). skipload="true" is set; skipping load.`
          );
          return null;
        }
        else
        // Otherwise, re-throw the error.
        throw error;
      }
    })
  );

  // Return an object mapping each tag name to its module (or null if load was skipped).
  return customTags.reduce((acc, tag, index) => {
    acc[tag] = imports[index];
    return acc;
  }, {});
}
