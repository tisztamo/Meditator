// ArchML templating — archetypes and thin minds.
//
// A society's members are nearly the same mind written out several times: the same
// faculty stack, the same wiring, copied per member with only a few scalars and the
// persona changing. Templating lets a file carry the shared skeleton ONCE (an
// <m-archetype>) and write each member as only what makes it itself — its prose, its
// origin, a handful of overridden scalars, the faculties it adds or drops.
//
// This is a pure TEXT → TEXT pass run at wake (inside readArchitectureFile, BEFORE the
// name/origin/interlocutor overrides), so:
//   - the running tree, and the home snapshot, are the FULLY EXPANDED architecture —
//     a home never depends on an external archetype file (architecture.js principle 3);
//   - a file with no templating tokens expands to ITSELF, byte-for-byte (the fast path
//     below) — every current resident and home is untouched;
//   - the expander is a clean string-in/string-out function, unit-tested exactly like
//     origin-override.test.js / interlocutor-override.test.js test their transforms.
//
// Why a DOM merge and not string-splicing: wiring is addressed STRUCTURALLY
// (..m-mind/stream/chunk, ..m-society/checker/voice/spoken). A faculty cloned from an
// archetype into a member keeps resolving to ITS OWN stream and ITS OWN neighbours
// because relative refs resolve by tree position — so cloning nodes is correct and
// splicing text is not. We expand on inert plain elements inside a <template> (whose
// content never upgrades custom elements), so there are no onConnect side effects
// during expansion (the window described in mind-templating.md, principle 1).
//
// The merge ⊕ is deep and keyed by SLOT — a child's `name` (its ROLE), not its tag
// (the IMPLEMENTATION that fills it) — so a later layer can swap an implementation in
// place. See doc/improvements/mind-templating.md for the full design.
import { logger } from '../infrastructure/logger';

const log = logger('templating.js');

// Directives the expander consumes; never emitted into the running tree.
const CONTROL_ATTRS = ['extends', 'drop', 'fresh'];
const CONTROL_SET = new Set(CONTROL_ATTRS);

// ── small DOM helpers ────────────────────────────────────────────────────────

const isText = (n) => n.nodeType === 3;
const nameOf = (el) => (el.getAttribute ? el.getAttribute('name') : null);
const hasNonWsText = (el) => Array.from(el.childNodes).some(n => isText(n) && n.textContent.trim() !== '');
const isFresh = (el) => el.hasAttribute && el.hasAttribute('fresh') && el.getAttribute('fresh') !== 'false';

const dropSet = (el) => {
  const d = el.getAttribute ? el.getAttribute('drop') : null;
  return new Set((d || '').split(/\s+/).filter(Boolean));
};

function copyAttrs(from, to, skip) {
  for (const attr of Array.from(from.attributes)) {
    if (skip && skip.has(attr.name)) continue;
    to.setAttribute(attr.name, attr.value);
  }
}

/** Parse archml text into an inert <template>. Its `.content` is a DocumentFragment of
 *  plain elements (custom elements never upgrade inside template content), and the
 *  `.innerHTML` getter serializes it back — same HTML parser start.js uses, so the tree
 *  we shape is the tree that will run. Keep explicit close tags in templated files:
 *  `<m-x/>` self-closing swallows following siblings, exactly as it would at runtime. */
function parse(text) {
  const tpl = document.createElement('template');
  tpl.innerHTML = text;
  return tpl;
}

// ── the ⊕ operator ───────────────────────────────────────────────────────────

/**
 * Deep keyed merge of `patch` onto `base`, returning a NEW element. The slot key is
 * `name` (role), not the tag (implementation), so a later layer can tune in place,
 * swap an implementation into a slot, or — with fresh="true" — reset a slot entirely.
 *
 * Rules (mind-templating.md §2):
 *  - fresh="true" on the patch → take the patch verbatim, inheriting nothing.
 *  - the winning (patch) layer's tag wins; same tag → tune, different tag → swap.
 *  - attributes deep-merge (base kept, patch overrides);
 *  - children merge by slot (recursively); a same-named child tunes/swaps in place,
 *    a new-named or unnamed child appends (unnamed children are layer-local — never a
 *    merge target);
 *  - the patch's own non-whitespace direct text replaces the base's (so a member's
 *    persona prose overwrites the archetype's {{persona}} while faculties stay shared);
 *  - drop="a b" on the patch removes inherited (base) children with those names.
 */
export function mergeInto(base, patch) {
  // fresh: inherit nothing from the base slot — only its position (the caller's concern).
  if (isFresh(patch)) return patch.cloneNode(true);

  const doc = base.ownerDocument;
  const result = doc.createElement(patch.tagName.toLowerCase());   // winning layer's tag wins

  // Attributes: base first, patch overrides. Control directives never leak through.
  copyAttrs(base, result, CONTROL_SET);
  copyAttrs(patch, result, CONTROL_SET);

  // Clone the base subtree first (preserves base order & formatting), then layer the patch.
  for (const node of Array.from(base.childNodes)) result.appendChild(node.cloneNode(true));

  // drop: remove inherited named children the patch rejects.
  const drops = dropSet(patch);
  if (drops.size) {
    for (const child of Array.from(result.children)) {
      const n = nameOf(child);
      if (n && drops.has(n)) child.remove();
    }
  }

  // Direct text: the patch's non-whitespace text replaces the base's (prose-before-
  // faculties is the archml convention, so re-insert it ahead of the first element).
  if (hasNonWsText(patch)) {
    for (const node of Array.from(result.childNodes)) if (isText(node)) node.remove();
    const firstEl = result.firstElementChild;
    for (const node of Array.from(patch.childNodes)) {
      if (isText(node)) result.insertBefore(node.cloneNode(true), firstEl);
    }
  }

  // Element children: merge a same-named slot in place, else append (new slot or
  // unnamed/layer-local).
  for (const child of Array.from(patch.children)) {
    const n = nameOf(child);
    const existing = n ? Array.from(result.children).find(c => nameOf(c) === n) : null;
    if (existing) result.replaceChild(mergeInto(existing, child), existing);
    else result.appendChild(child.cloneNode(true));
  }

  return result;
}

/**
 * A production rule: build an element from an archetype plus per-instance overrides.
 * Pure and runtime-callable — the seed of a future m-beget hand (mind-templating.md
 * §Doors/1) — but used here only via tests. `archetype` is an element (not a registry
 * key), so there is no I/O.
 */
export function instantiate(archetype, { tag = 'm-mind', name, persona, origin, attrs = {}, children = [] } = {}) {
  const doc = archetype.ownerDocument || document;
  const patch = doc.createElement(tag);
  if (name) patch.setAttribute('name', name);
  for (const [k, v] of Object.entries(attrs)) patch.setAttribute(k, String(v));
  if (persona) patch.appendChild(doc.createTextNode(persona));
  if (origin) {
    const o = doc.createElement('m-origin');
    o.setAttribute('name', 'origin');
    o.textContent = origin;
    patch.appendChild(o);
  }
  for (const c of children) patch.appendChild(c.cloneNode ? c.cloneNode(true) : c);
  const layer = archetype.cloneNode(true);
  layer.removeAttribute('name');               // the archetype's name is its registry key, not a slot
  const result = mergeInto(layer, patch);
  stripControlDeep(result);
  return result;
}

// ── expansion passes ─────────────────────────────────────────────────────────

/** Collect every <m-archetype> in `root` into the registry (by name) and remove it from
 *  the tree. Called for imported files first, then the main file, so INLINE WINS. */
function collectArchetypes(root, registry) {
  for (const el of Array.from(root.querySelectorAll('m-archetype'))) {
    const name = el.getAttribute('name');
    if (!name) throw new Error('<m-archetype> requires a name attribute.');
    registry.set(name, el.cloneNode(true));
    el.remove();
  }
}

/** Resolve <m-import src="…"> by pulling the imported file's archetypes into the
 *  registry (inlined — the snapshot stays self-contained), then removing the node.
 *  Recurses so imported files may themselves import; a per-chain `seen` set fails a
 *  cycle loudly. */
async function processImports(root, registry, resolveImport, seen) {
  for (const imp of Array.from(root.querySelectorAll('m-import'))) {
    const src = imp.getAttribute('src');
    if (!src) throw new Error('<m-import> requires a src attribute.');
    if (seen.has(src)) throw new Error(`Cyclic <m-import>: "${src}" appears more than once along an import chain.`);
    if (!resolveImport) throw new Error(`<m-import src="${src}"> but no resolveImport was provided to expandArchitecture.`);
    let text;
    try {
      text = await resolveImport(src);
    } catch (e) {
      throw new Error(`Failed to resolve <m-import src="${src}">: ${e.message}`);
    }
    const childSeen = new Set(seen).add(src);
    const sub = parse(text);
    await processImports(sub.content, registry, resolveImport, childSeen);
    collectArchetypes(sub.content, registry);   // only its archetypes; not its other content
    imp.remove();
  }
}

/** Apply a society's default archetype: each member <m-mind> with no `extends` of its
 *  own inherits it (extends="none" opts out, set explicitly). Closest society wins for
 *  nested societies. */
function applySocietyDefaults(root) {
  for (const soc of Array.from(root.querySelectorAll('m-society[archetype]'))) {
    const def = soc.getAttribute('archetype');
    if (!def) continue;
    for (const mind of Array.from(soc.querySelectorAll('m-mind'))) {
      if (mind.closest('m-society') !== soc) continue;          // owned by a nearer society
      if (!mind.hasAttribute('extends')) mind.setAttribute('extends', def);
    }
  }
}

/** Fold one archetype's `extends` chain (and mixins) into a single whole element, so a
 *  member that extends it gets the complete stack. Cycles fail loudly. */
function resolveArchetypeChains(registry) {
  const resolved = new Map();
  const resolve = (name, chain) => {
    if (resolved.has(name)) return resolved.get(name);
    if (chain.has(name)) throw new Error(`Archetype extends cycle: ${[...chain, name].join(' → ')}.`);
    const arche = registry.get(name);
    if (!arche) throw new Error(`Unknown archetype "${name}" referenced by extends. Available: ${[...registry.keys()].join(', ') || '(none)'}.`);
    const ext = arche.getAttribute('extends');
    if (!ext) { resolved.set(name, arche); return arche; }

    const next = new Set(chain).add(name);
    const layers = ext.split(/\s+/).filter(n => n && n !== 'none');
    let acc = null;
    for (const ln of layers) {
      const layer = resolve(ln, next).cloneNode(true);
      layer.removeAttribute('name');
      acc = acc ? mergeInto(acc, layer) : layer;
    }
    const self = arche.cloneNode(true);
    self.removeAttribute('extends');
    const merged = acc ? mergeInto(acc, self) : self;
    merged.setAttribute('name', name);          // keep the archetype's registry identity
    resolved.set(name, merged);
    return merged;
  };
  for (const name of registry.keys()) resolve(name, new Set());
  for (const [name, el] of resolved) registry.set(name, el);
}

/** Expand one instance (an element carrying `extends`): fold its archetype layers
 *  left→right, then merge the instance's own body as the final, winning layer. */
function expandElement(el, registry) {
  const ext = el.getAttribute('extends');
  const names = ext.split(/\s+/).filter(n => n && n !== 'none');

  let acc = null;
  for (const name of names) {
    const arche = registry.get(name);
    if (!arche) throw new Error(`Unknown archetype "${name}" in extends="${ext}". Available: ${[...registry.keys()].join(', ') || '(none)'}.`);
    const layer = arche.cloneNode(true);
    layer.removeAttribute('name');              // registry key, not a slot for the instance
    acc = acc ? mergeInto(acc, layer) : layer;
  }

  const result = acc ? mergeInto(acc, el) : el.cloneNode(true);
  stripControlDeep(result);
  el.replaceWith(result);
}

/** Expand every element carrying `extends`, anywhere in the tree (level-agnostic: a
 *  faculty, a mind, and a society are the same kind of node — mind-templating.md
 *  §Doors). Re-query after each expansion since replaceWith swaps the node out. */
function expandInstances(root, registry) {
  for (let guard = 0; ; guard++) {
    const el = root.querySelector('[extends]');
    if (!el) break;
    if (guard > 100000) throw new Error('Runaway extends expansion (a self-referential layer?).');
    expandElement(el, registry);
  }
}

/** Validate that named children of any element are unique within their parent — that
 *  uniqueness is what makes the slot key unambiguous (unnamed children may repeat). */
function validateUniqueSlots(root) {
  const check = (el) => {
    const seen = new Set();
    for (const child of el.children) {
      const n = child.getAttribute('name');
      if (n) {
        if (seen.has(n)) {
          const where = el.getAttribute && el.getAttribute('name');
          throw new Error(`Duplicate slot name "${n}" among children of <${el.tagName.toLowerCase()}${where ? ` name="${where}"` : ''}>.`);
        }
        seen.add(n);
      }
      check(child);
    }
  };
  for (const child of root.children) check(child);
}

function stripControlDeep(node) {
  const els = node.nodeType === 1 ? [node, ...node.querySelectorAll('*')] : [...node.querySelectorAll('*')];
  for (const el of els) for (const a of CONTROL_ATTRS) el.removeAttribute(a);
}

function stripSocietyArchetype(root) {
  for (const soc of root.querySelectorAll('m-society[archetype]')) soc.removeAttribute('archetype');
}

// ── the entry point ──────────────────────────────────────────────────────────

/**
 * Expand a templated architecture into a flat, runnable one. Pure text → text; the only
 * I/O is the injected `resolveImport(src) → Promise<text>` reader for <m-import>.
 *
 * A file with no templating tokens is returned UNCHANGED (byte-for-byte) — the fast
 * path keeps every current resident and home untouched. A templated file is normalized
 * by the parse/serialize round-trip (attribute casing, whitespace), which is fine for a
 * runtime archive — the commented source stays in git.
 */
export async function expandArchitecture(text, { resolveImport } = {}) {
  // Backward compatible & cheap: nothing to expand → return the source verbatim. Match
  // only genuine templating tokens (tag forms, and the two control attributes as
  // attributes), never the bare words in prose.
  if (!/<m-archetype|<m-import|\sextends\s*=|\sarchetype\s*=/i.test(text)) return text;

  const tpl = parse(text);
  const root = tpl.content;
  const registry = new Map();

  await processImports(root, registry, resolveImport, new Set());   // imported archetypes first…
  collectArchetypes(root, registry);                                // …then inline (inline wins)
  applySocietyDefaults(root);
  resolveArchetypeChains(registry);
  expandInstances(root, registry);
  validateUniqueSlots(root);
  stripControlDeep(root);
  stripSocietyArchetype(root);

  const out = tpl.innerHTML;
  log.debug(`Expanded architecture (${registry.size} archetype(s)): ${text.length} → ${out.length} chars`);
  return out;
}
