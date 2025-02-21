import { getUnregisteredCustomElements } from "./getUnregisteredCustomElements.js";
import { getMindComponentsPaths } from '../config/componentLoading.js';

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

  // For each tag, attempt to import its module and register the component
  const imports = await Promise.all(
    customTags.map(async (tag) => {
      const module = await loadModuleForTag(tag, dom);
      return module;
    })
  );

  // Return an object mapping each tag name to its module (or null if load was skipped).
  return customTags.reduce((acc, tag, index) => {
    acc[tag] = imports[index];
    return acc;
  }, {});
}

async function loadModuleForTag(tag, dom) {
  const camelCaseName = kebabToCamel(tag);
  const componentPaths = getMindComponentsPaths();
  
  // Try each path in order until we find the module
  for (const basePath of componentPaths) {
    const moduleUrl = new URL(`${basePath}/${camelCaseName}.js`, import.meta.url);
    
    try {
      // Dynamically import the module
      const module = await import(moduleUrl);
      await registerCustomElement(tag, camelCaseName, module);
      return module;
    } catch (error) {
      // If this is the last path and we still haven't found it, handle the error
      if (basePath === componentPaths[componentPaths.length - 1]) {
        return handleModuleLoadError(error, tag, dom, moduleUrl);
      }
      continue;
    }
  }
}

async function registerCustomElement(tag, exportedComponentName, module) {
  // Get the exported class (assumed to be named same as camelCase)
  const ComponentClass = module[exportedComponentName];
  if (!ComponentClass) {
    throw new Error(`Module ${moduleUrl} does not export ${exportedComponentName}`);
  }

  // Register the custom element if not already registered
  if (!customElements.get(tag)) {
    try {
      customElements.define(tag, ComponentClass);
    } catch (regError) {
      throw new Error(`Failed to register ${tag}: ${regError.message}`);
    }
  }
}

function handleModuleLoadError(error, tag, dom, moduleUrl) {
  const componentPaths = getMindComponentsPaths();
  const pathsMessage = `\nAttempted paths:\n${componentPaths.map(p => `- ${p}`).join('\n')}`;
  const configMessage = '\nYou can configure component paths via:\n- CLI argument: --mind-components-path=<path>\n- Environment variable: MIND_COMPONENTS_PATH\n- Default: ./mindComponents/ dir';

  // If any element of this tag in the DOM has skipload="true", drop a warning and continue
  if (dom.querySelector(`${tag}[skipload="true"]`)) {
    console.warn(
      `Warning: Failed to load/register module for ${tag}. skipload="true" is set; skipping load.` +
      (!handleModuleLoadError.firstError ? `\nError: ${error.message}${pathsMessage}\n${configMessage}` : '')
    );
    handleModuleLoadError.firstError = true;
    return null;
  }

  // Otherwise, re-throw with additional context
  console.error(`Failed to load module for ${tag}`)
  console.log(!handleModuleLoadError.firstError ? `${pathsMessage}\n${configMessage}` : '');
  handleModuleLoadError.firstError = true;
  throw error;
}
