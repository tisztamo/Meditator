import {getUnregisteredCustomElements} from "./getUnregisteredCustomElements.js";

/**
   * Converts a kebab-case string (e.g. "m-stream") to camelCase (e.g. "mStream").
   *
   * @param {string} str - The kebab-case string.
   * @returns {string} The camelCase conversion.
   */
  function kebabToCamel(str) {
    return str.split('-')
              .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
              .join('');
  }
  
  /**
   * Loads the JS module for each unregistered custom element found in the given DOM.
   * The module for a tag (e.g. "m-stream") is expected to be located at:
   *    ../mindComponents/mStream.js
   *
   * This function returns a mapping of tag names to their imported module objects.
   *
   * @param {Document|Element} dom - The DOM to search.
   * @returns {Promise<Object>} An object mapping each custom element tag name to its module.
   */
  export async function loadMindComponents(dom) {
    // Get all custom element tag names that are not yet registered.
    const customTags = getUnregisteredCustomElements(dom);
  
    // Map each tag to its corresponding module.
    const imports = await Promise.all(customTags.map(async (tag) => {
      const camelCaseName = kebabToCamel(tag);
      // Build the module URL relative to the current file.
      const moduleUrl = new URL(`../mindComponents/${camelCaseName}.js`, import.meta.url);
      // Dynamically import the module.
      return import(moduleUrl);
    }));
  
    // Return an object mapping each tag name to its module.
    return customTags.reduce((acc, tag, index) => {
      acc[tag] = imports[index];
      return acc;
    }, {});
  }
  