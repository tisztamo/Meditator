/**
 * Enclosure by role: lookups that work on un-upgraded elements.
 *
 * Classes declare `static provides`. The loader (and connectedCallback) reflect
 * that onto a derived `provides` attribute so `closest('[provides~="aperture"]')`
 * is safe at connect — the upgrade race that used to force tag `closest()`.
 * The attribute is derived, never authored; authoring cannot grant a role.
 *
 * Lookups stop at the membrane. Composed acquisition is the region's
 * `percept-candidate` event, not these helpers.
 */

const IDENTITY_ROLES = ['mind', 'agent', 'society']

// Built-in identity tags, used only when the constructor has no `static provides`
// (wiring tests stub `<m-mind>` as a bare Amanita element). A real MMind /
// MAgent / MSociety is reflected from the class, not from this table.
const IDENTITY_BY_TAG = {
    'm-mind': 'mind',
    'm-agent': 'agent',
    'm-society': 'society',
}

/** Amanita `!value` scope roots — opaque to Amanita, convention in Meditator. */
const BOUNDARY_BY_IDENTITY = {
    mind: 'scope',
    agent: 'scope',
    society: 'cluster',
}

function tokens(value) {
    return (value || '').split(/\s+/).filter(Boolean)
}

function classOf(el) {
    if (!el) return null
    if (el.constructor?.provides) return el.constructor
    try {
        return customElements.get(el.localName) || null
    } catch {
        return null
    }
}

/** Roles this element provides, from a class (or the identity-tag fallback). */
export function rolesProvidedBy(el, ctor = classOf(el)) {
    const spec = ctor?.provides
    if (spec && typeof spec === 'object') {
        const roles = []
        for (const [role, pred] of Object.entries(spec)) {
            const ok = typeof pred === 'function' ? pred(el) : !!pred
            if (ok) roles.push(role)
        }
        return roles
    }
    const tagged = IDENTITY_BY_TAG[el?.localName]
    return tagged ? [tagged] : []
}

/**
 * Write the derived `provides` attribute. `onOverwrite(el, previous, next)`
 * fires when markup had a value that is not the derived list — authoring
 * cannot grant roles (fixture A1). Matching values are left quiet so a
 * second pass (upgrade, a later loadMindComponents) is not a warning.
 */
export function reflectProvides(el, ctor = classOf(el), onOverwrite) {
    if (!el || el.nodeType !== 1) return
    const next = rolesProvidedBy(el, ctor).join(' ')
    const had = el.hasAttribute('provides')
    const prev = had ? el.getAttribute('provides') : null
    if (had && prev !== next) onOverwrite?.(el, prev, next)
    if (next) el.setAttribute('provides', next)
    else el.removeAttribute('provides')
}

/** `boundary` for Amanita `!value` refs — derived from identity roles, never authored. */
export function boundaryFor(el, ctor = classOf(el)) {
    for (const role of rolesProvidedBy(el, ctor)) {
        const boundary = BOUNDARY_BY_IDENTITY[role]
        if (boundary) return boundary
    }
    return null
}

export function reflectBoundary(el, ctor = classOf(el), onOverwrite) {
    if (!el || el.nodeType !== 1) return
    const next = boundaryFor(el, ctor)
    const had = el.hasAttribute('boundary')
    const prev = had ? el.getAttribute('boundary') : null
    if (had && prev !== next) onOverwrite?.(el, prev, next)
    if (next) el.setAttribute('boundary', next)
    else el.removeAttribute('boundary')
}

/** Reflect every element under `root` (a Document or Element). */
export function reflectTree(root, classForTag, onOverwrite, onBoundaryOverwrite) {
    if (!root) return
    const visit = el => {
        if (!el || el.nodeType !== 1) return
        const ctor = classForTag ? classForTag(el.localName) : classOf(el)
        reflectProvides(el, ctor, onOverwrite)
        reflectBoundary(el, ctor, onBoundaryOverwrite)
    }
    if (root.nodeType === 9) {
        const docEl = root.documentElement
        if (!docEl) return
        visit(docEl)
        for (const el of docEl.querySelectorAll('*')) visit(el)
        return
    }
    visit(root)
    if (root.querySelectorAll) {
        for (const el of root.querySelectorAll('*')) visit(el)
    }
}

export function providesOf(el, role) {
    if (!el || el.nodeType !== 1 || !role) return false
    // Prefer the reflected attribute so this is true on an un-upgraded element.
    if (el.hasAttribute('provides')) return tokens(el.getAttribute('provides')).includes(role)
    const spec = classOf(el)?.provides
    if (spec && Object.prototype.hasOwnProperty.call(spec, role)) {
        const pred = spec[role]
        return typeof pred === 'function' ? !!pred(el) : !!pred
    }
    return IDENTITY_BY_TAG[el.localName] === role
}

export function isMembrane(el) {
    return IDENTITY_ROLES.some(role => providesOf(el, role))
}

/**
 * Nearest provider of `role` at or above `el`, stopping at the membrane
 * (the membrane itself is still a candidate). For a source span that is
 * how you find the aperture that owns it. Instance `enclosing()` starts
 * one level up — proper ancestor only.
 *
 * Stopping at the membrane is the judgment: faculty / aperture / arbiter
 * must not leak into a society or a sibling mind. `enclosing('society')`
 * from inside a mind therefore returns null; that lookup is still tag
 * `closest('m-society')` until enclosure's own phase 1. `membrane()` names
 * this identity root, not the society around it.
 */
export function enclosingOf(el, role) {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (providesOf(cur, role)) return cur
        if (isMembrane(cur)) break
    }
    return null
}

/** Proper-ancestor providers, nearest first, stopping at the membrane. */
export function enclosingAllOf(el, role) {
    const found = []
    for (let cur = el?.parentElement; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (providesOf(cur, role)) found.push(cur)
        if (isMembrane(cur)) break
    }
    return found
}

/** Nearest identity root (`mind` / `agent` / `society`), including `el` if it is one. */
export function membraneOf(el) {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
        if (isMembrane(cur)) return cur
    }
    return null
}

/**
 * Top-level providers of `role` inside `root`: not enclosed by another
 * provider of the same role, and not inside a nearer membrane. Tree order.
 * `root` itself is not returned — these are parts *inside* it.
 */
export function part(root, role) {
    if (!root || !role) return []
    const found = []
    const walk = node => {
        for (const child of node.children || []) {
            if (child !== root && isMembrane(child)) {
                if (providesOf(child, role)) found.push(child)
                continue
            }
            if (providesOf(child, role)) {
                found.push(child)
                continue
            }
            walk(child)
        }
    }
    walk(root)
    return found
}

/** Whether `el`'s tag has been `customElements.define`d.
 * `customElements.upgrade()` is a no-op until then — it cannot define a tag. */
export function isCustomElementDefined(el) {
    if (!el?.localName) return false
    try {
        return customElements.get(el.localName) != null
    } catch {
        return false
    }
}
