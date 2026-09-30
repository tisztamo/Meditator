/**
 * What this process is running: the architecture source it read and the custom
 * components the loader resolved for it. The loader records them as it goes
 * (startup/architecture.js, config/componentResolver.js); the mind's memory reads
 * them at wake to snapshot a home into a re-executable bundle (lifecycle.md §2,
 * component-hierarchy.md §5.4). Memory reads this record, not the loader, so a
 * component does not depend on the loader (message-rule review §2.11).
 *
 * One record per process, reset per load. Empty until a load runs, e.g. when a
 * unit test builds the DOM directly, in which case no snapshot is written.
 */

let architecture = null;   // { path, content } of the architecture source, or null
let sources = [];          // [{ tag, path, layer }] resolved winners, in resolve order
let bundleDir = null;      // absolute path to <dir(archml)>/components, or null

/** Records the architecture source the process read (null clears it). */
export function recordArchitecture(record) {
  architecture = record || null;
}

/** The architecture source of the running mind, or null if none was read. */
export function runningArchitecture() {
  return architecture;
}

/** Starts a component load: forgets the previous one's winners and sets its bundle dir. */
export function beginComponentLoad({ bundleDir: dir = null } = {}) {
  sources = [];
  bundleDir = dir;
}

/** Records one tag's resolved winner. */
export function recordComponentSource({ tag, path, layer }) {
  sources.push({ tag, path, layer });
}

/** The non-built-in components the last load resolved — the ones a home must snapshot. */
export function runningComponentSources() {
  return sources.filter(s => s.layer !== 'built-in');
}

/** The bundle's components/ directory for the last load (whether or not it contributed). */
export function runningBundleDir() {
  return bundleDir;
}
