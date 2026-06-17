import { getUnregisteredCustomElements } from "./getUnregisteredCustomElements.js";
import { getMindComponentsPaths } from '../config/componentLoading.js';
import { logger } from '../infrastructure/logger';

const log = logger('loadMindComponents.js');

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
  // Get all custom element tag names that are not yet registered (in document order).
  const customTags = getUnregisteredCustomElements(dom);

  // Phase 1 — import every module concurrently. This is the slow part (some
  // modules, e.g. m-stream, pull in the model/openai stack), so we let them
  // race here without side effects: nothing is registered yet.
  const descriptors = await Promise.all(
    customTags.map((tag) => importModuleForTag(tag, dom))
  );

  // Phase 2 — register the custom elements synchronously, in document order.
  // customElements.define() upgrades matching elements (running their
  // connectedCallback) immediately, so a component whose onConnect binds a ref
  // to an earlier sibling — e.g. the m-timeout watchdog binding "/stream/chunk"
  // to <m-stream> — finds that sibling already upgraded. Crucially there are no
  // awaits between defines, so even forward refs resolve on the next tick rather
  // than racing the import resolution order (which used to leave a referenced
  // element as a plain, un-upgraded HTMLElement). See git history for the dump.
  // jsdom runs a custom element's connectedCallback synchronously inside
  // customElements.define() while upgrading matching elements — but an exception
  // thrown there is REPORTED as an uncaught error on the window (CE reactions never
  // propagate out of define), not raised to us. Left unhandled, a component that
  // throws in onConnect (e.g. m-memory refusing a transient wake) would be silently
  // swallowed: define() returns "successfully", loading finishes, and the mind limps
  // on half-initialized until a watchdog interrupt kicks it into a broken run. Catch
  // that error per-define and treat it exactly like a registration failure.
  let connectError = null;
  const captureConnectError = event => {
    connectError = event.error || new Error(event.message || `connectedCallback failed`);
    event.preventDefault?.();   // we surface it ourselves; skip the duplicate jsdom dump
  };
  window.addEventListener('error', captureConnectError);
  try {
    for (let i = 0; i < customTags.length; i++) {
      const descriptor = descriptors[i];
      if (!descriptor) continue;
      connectError = null;
      try {
        registerCustomElement(customTags[i], descriptor.pascalCaseName, descriptor.module, descriptor.moduleUrl);
        // define() upgraded this tag's elements synchronously; if their
        // connectedCallback threw, the captured error is already set.
        if (connectError) throw connectError;
      } catch (error) {
        // A registration or connect failure (missing export, bad class, throwing
        // onConnect) is tolerated for skipload="true" components and fatal
        // otherwise — same policy as a failed import. handleModuleLoadError
        // warns-and-skips or re-throws.
        handleModuleLoadError(error, customTags[i], dom);
      }
    }
  } finally {
    window.removeEventListener('error', captureConnectError);
  }

  // Return an object mapping each tag name to its module (or null if load was skipped).
  return customTags.reduce((acc, tag, index) => {
    acc[tag] = descriptors[index] ? descriptors[index].module : null;
    return acc;
  }, {});
}

/**
 * Imports the module for a tag WITHOUT registering it. Returns a descriptor
 * ({module, pascalCaseName, moduleUrl}) for the registration phase, or null when
 * the load was skipped via skipload="true".
 */
async function importModuleForTag(tag, dom) {
  const camelCaseName = kebabToCamel(tag);
  const pascalCaseName = camelCaseName.charAt(0).toUpperCase() + camelCaseName.slice(1);
  const componentPaths = getMindComponentsPaths();

  for (const basePath of componentPaths) {
    const moduleUrl = new URL(`${basePath}/${camelCaseName}.js`, import.meta.url);

    try {
      const module = await import(moduleUrl);
      return { module, pascalCaseName, moduleUrl };
    } catch (error) {
      // If this is the last path and we still haven't found it, handle the error
      if (basePath === componentPaths[componentPaths.length - 1]) {
        return handleModuleLoadError(error, tag, dom);
      }
      continue;
    }
  }
}

function registerCustomElement(tag, exportedComponentName, module, moduleUrl) {
  const ComponentClass = module[exportedComponentName];
  if (!ComponentClass) {
    throw new Error(`Module ${moduleUrl} does not export ${exportedComponentName}`);
  }

  if (!customElements.get(tag)) {
    try {
      customElements.define(tag, ComponentClass);
    } catch (regError) {
      throw new Error(`Failed to register ${tag}: ${regError.message}`);
    }
  }
}

function handleModuleLoadError(error, tag, dom) {
  const componentPaths = getMindComponentsPaths();
  const pathsMessage = `\nAttempted paths:\n${componentPaths.map(p => `- ${p}`).join('\n')}`;
  const configMessage = '\nYou can configure component paths via:\n- CLI argument: --mind-components-path=<path>\n- Environment variable: MIND_COMPONENTS_PATH\n- Default: ./mindComponents/ dir';

  // If any element of this tag in the DOM has skipload="true", drop a warning and continue
  if (dom.querySelector(`${tag}[skipload="true"]`)) {
    log.warn(
      `Warning: Failed to load/register module for ${tag}.` +
      (!handleModuleLoadError.firstError ? `\n${error.message}\n${pathsMessage}\n${configMessage}\n` : '')
    );
    handleModuleLoadError.firstError = true;
    return null;
  }

  // Otherwise, re-throw with additional context
  log.error(`Failed to load module for ${tag} and skipLoad="true" is not set.`);
  log.log(!handleModuleLoadError.firstError ? `${pathsMessage}\n${configMessage}` : '');
  handleModuleLoadError.firstError = true;
  throw error;
}
