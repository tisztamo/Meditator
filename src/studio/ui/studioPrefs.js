// studioPrefs — one namespaced localStorage object for the Studio UI's persisted
// view state. The old code scattered keys across localStorage (studioStreamMode,
// studioFocus); Phase B collects them — plus the mobile pane and the tree's
// per-node open-states — under a single "studioPrefs" object, read and written
// through these two helpers.
//
// Pure and framework-free. Every access is wrapped, so private-mode / no-storage
// degrades to the supplied fallback instead of throwing.

const KEY = "studioPrefs";

function read() {
  try { return JSON.parse((globalThis.localStorage && globalThis.localStorage.getItem(KEY)) || "{}") || {}; }
  catch { return {}; }
}

function write(obj) {
  try { globalThis.localStorage && globalThis.localStorage.setItem(KEY, JSON.stringify(obj)); }
  catch { /* private mode / no storage — stay in-memory */ }
}

/** Read one top-level pref, returning `fallback` when it is unset. */
export function getPref(key, fallback) {
  const o = read();
  return key in o ? o[key] : fallback;
}

/** Write one top-level pref into the namespaced object. A null/undefined value
 *  removes the key (so "no focus" leaves nothing behind). */
export function setPref(key, value) {
  const o = read();
  if (value === undefined || value === null) delete o[key];
  else o[key] = value;
  write(o);
}
