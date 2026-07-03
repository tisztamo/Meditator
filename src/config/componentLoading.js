import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Returns the ordered COMPONENT LAYERS to search, highest precedence first. Each layer is
 * a set of directories at equal precedence; the resolver (componentResolver.js) applies
 * the override/collision rules over them. See doc/improvements/component-hierarchy.md §3.
 *
 * Order (highest → lowest):
 *   1. cli      — the -p / --mind-components-path argument: the deliberate one-off operator
 *                 override (testing, a bug workaround). On top, above the bundle, because a
 *                 re-run of a home normally passes no -p, so re-executability is untouched.
 *   2. bundle   — a `components/` directory beside the running .archml (the author's own
 *                 components); present only when an architecture path is known. ABOVE env
 *                 (below) so a home's snapshotted components beat a project-wide library on
 *                 re-execution — a bundle is more specific than a whole project's dir, and
 *                 the Studio always sets env for an external project (re-executability).
 *   3. env      — the MIND_COMPONENTS_PATH environment variable (a project's component
 *                 library; the Studio sets it per external project)
 *   4. project  — ./mindComponents relative to cwd (external-project convention)
 *   5. built-in — the shipped faculties under src/mindComponents (scanned recursively, so
 *                 they may live in a hierarchy: mind/ agent/ shared/)
 *
 * `recursive` says whether a layer's dirs are walked into subdirectories. cli/env/project
 * stay shallow (matching the historical `${base}/mFoo.js` lookup); bundle and built-in are
 * recursive so components may be organised into folders.
 *
 * @param {{archmlPath?: string|null}} [opts]
 * @returns {Array<{name:string, dirs:string[], recursive:boolean, bundle?:boolean}>}
 */
export function getComponentLayers({ archmlPath } = {}) {
  const layers = [];

  // 1. CLI: --mind-components-path / -p (first occurrence, as before).
  const cliArgIndex = process.argv.findIndex(
    (arg) => arg === '--mind-components-path' || arg === '-p'
  );
  if (cliArgIndex !== -1 && process.argv[cliArgIndex + 1]) {
    layers.push({ name: 'cli', dirs: [process.argv[cliArgIndex + 1]], recursive: false });
  }

  // 2. Bundle: a components/ directory beside the .archml being run. This is what makes a
  //    home self-contained — the home's own components/ IS this layer on re-execution — so
  //    it sits above env (a project-wide library) to keep a re-run home faithful.
  if (archmlPath) {
    const dir = path.join(path.dirname(archmlPath), 'components');
    layers.push({ name: 'bundle', dirs: [dir], recursive: true, bundle: true });
  }

  // 3. Environment variable.
  if (process.env.MIND_COMPONENTS_PATH) {
    layers.push({ name: 'env', dirs: [process.env.MIND_COMPONENTS_PATH], recursive: false });
  }

  // 4. Project convention (cwd-relative).
  layers.push({ name: 'project', dirs: ['./mindComponents'], recursive: false });

  // 5. Built-in faculties, relative to this source file, scanned recursively.
  layers.push({
    name: 'built-in',
    dirs: [fileURLToPath(new URL('../mindComponents', import.meta.url))],
    recursive: true,
  });

  return layers;
}
