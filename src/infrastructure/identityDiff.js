import fsSync from 'node:fs';
import path from 'node:path';

// Identity-change detection at wake (COVENANT §3/§4, philosophical-review finding 1).
//
// A home is a re-executable BUNDLE: architecture.archml + components/ (lifecycle.md
// §2, component-hierarchy.md §5.4). The snapshot sitting in a home is the bundle
// that RAN the mind last session; the one about to be written is the bundle waking
// it now. Diffing the two — before the wake snapshot overwrites the comparand — is
// what lets the wake stimulus tell the mind plainly that it was changed while it
// slept, instead of passing off an edited self as the one that went to sleep.
//
// The RUNTIME is deliberately not part of this comparison. The runtime is the
// mind's physics, not its self: it changes with every commit to this repo, so
// including it would announce "you were changed" on nearly every wake and drown
// the real signal. §1 already records runtimeSHA in the manifest for
// re-executability, and _load() warns on a formatVersion gap — the one runtime
// change that demonstrably alters how a self is read back.
//
// Pure of the mind: everything here is (bundle, bundle) → report → prose, so the
// classification and the wording are unit-testable without waking anything.

/** Parse archml text into an inert template fragment — the same HTML parser
 *  start.js and templating.js use, so the tree we compare is the tree that runs.
 *  Custom elements never upgrade inside template content. */
function parse(text) {
    const tpl = document.createElement('template');
    tpl.innerHTML = text;
    return tpl.content;
}

/**
 * Reads a home's bundle from disk: the architecture snapshot and the custom
 * components it ran with. Returns null when there is no snapshot to compare
 * against (fresh home, or a pre-snapshot-era home). Synchronous and best-effort:
 * an unreadable component file is skipped, never thrown — a diff must not be
 * able to block a wake.
 *
 * @param {string|null} dir - the mind's home
 * @returns {{archml: string, components: Record<string,string>}|null}
 */
export function readBundleSync(dir) {
    if (!dir) return null;
    let archml;
    try {
        archml = fsSync.readFileSync(path.join(dir, 'architecture.archml'), 'utf8');
    } catch {
        return null;
    }
    const components = {};
    const compDir = path.join(dir, 'components');
    const walk = (d, prefix) => {
        let entries;
        try { entries = fsSync.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(path.join(d, entry.name), rel);
            else if (entry.isFile()) {
                try { components[rel] = fsSync.readFileSync(path.join(d, entry.name), 'utf8'); } catch { /* skip */ }
            }
        }
    };
    walk(compDir, '');
    return { archml, components };
}

/** The element whose subtree is this mind's own shape. Scoped by name so a
 *  society member compares only itself — another member changing is the world
 *  changing, not this self. Falls back to the first mind/agent in the file. */
function mindRoot(fragment, mindName) {
    const name = String(mindName || '').replace(/["\\]/g, '').trim();
    if (name) {
        const named = fragment.querySelector(`m-mind[name="${name}"], m-agent[name="${name}"]`);
        if (named) return named;
    }
    return fragment.querySelector('m-mind') || fragment.querySelector('m-agent') || fragment.firstElementChild;
}

/** The identity prose of an element, replicating MBaseComponent.getPrompt's
 *  precedence: prompt="…" attribute, else an m-prompt child, else the element's
 *  own direct text nodes. */
function proseOf(el) {
    if (!el) return '';
    const attr = el.getAttribute('prompt');
    if (attr) return attr;
    const promptEl = el.querySelector('m-prompt');
    if (promptEl) return promptEl.textContent;
    let text = '';
    for (const node of el.childNodes) {
        if (node.nodeType === 3) text += node.textContent;
    }
    return text;
}

/** Whitespace-insensitive comparison form: reflowing prose is not an identity change. */
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

/** Direct text of an element (children excluded), normalized. */
function directText(el) {
    let text = '';
    for (const node of el.childNodes) {
        if (node.nodeType === 3) text += node.textContent;
    }
    return norm(text);
}

/** A human label for an element in the disclosure: `hands (m-terminal)` when
 *  named, else just the tag. */
function labelOf(tag, name) {
    return name ? `${name} (${tag})` : tag;
}

/** Walks the mind's subtree into a keyed map of its parts. A named element is
 *  keyed by role (`tag#name` — the templating slot key); an unnamed one by tag +
 *  occurrence, which is as stable as an unnamed part can be. */
function partsOf(root) {
    const parts = new Map();
    const counters = {};
    for (const el of root.querySelectorAll('*')) {
        const tag = el.localName;
        const name = el.getAttribute('name');
        const key = name ? `${tag}#${name}` : `${tag}@${counters[tag] = (counters[tag] || 0) + 1}`;
        const attrs = {};
        for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
        parts.set(key, { tag, name, attrs, text: directText(el) });
    }
    return parts;
}

/** Attribute map of the mind root itself (its settings: lang, interlocutor, …). */
function rootAttrs(root) {
    const attrs = {};
    for (const a of Array.from(root.attributes)) attrs[a.name] = a.value;
    return attrs;
}

/**
 * Compares two bundles and classifies what changed about this mind, in the
 * covenant's tiers: `identity` (the standing self-description prose, §3's
 * headline case), `origin` (the recorded seed of thought — never re-seeded for a
 * remembering mind, but part of the bundle), `structure` (parts added, removed,
 * or re-tuned — the body the identity string carries as embodiment), and
 * `components` (the code of custom parts).
 *
 * @param {{archml: string, components: Record<string,string>}|null} prev - last run's bundle
 * @param {{archml: string, components: Record<string,string>}|null} next - the waking bundle
 * @param {{mindName?: string}} [opts]
 * @returns {null|object} null when there is nothing to compare (no prior
 *   snapshot); else a report with `changed: boolean`.
 */
export function diffBundles(prev, next, { mindName } = {}) {
    if (!prev?.archml || !next?.archml) return null;

    const report = {
        changed: false,
        identity: null,
        origin: false,
        structure: { added: [], removed: [], changed: [] },
        components: { added: [], removed: [], modified: [] },
    };

    // Fast path: byte-identical bundle (the overwhelmingly common wake).
    const sameComponents =
        Object.keys(prev.components).length === Object.keys(next.components).length &&
        Object.entries(prev.components).every(([f, c]) => next.components[f] === c);
    if (prev.archml === next.archml && sameComponents) return report;

    let prevRoot, nextRoot;
    try {
        prevRoot = mindRoot(parse(prev.archml), mindName);
        nextRoot = mindRoot(parse(next.archml), mindName);
    } catch {
        prevRoot = nextRoot = null;
    }

    if (prevRoot && nextRoot) {
        // Identity prose — §3's headline case.
        const before = norm(proseOf(prevRoot));
        const after = norm(proseOf(nextRoot));
        if (before !== after) {
            report.identity = { beforeChars: before.length, afterChars: after.length };
            report.changed = true;
        }

        // Origin — compared apart from structure so it is named for what it is.
        const prevOrigin = norm(proseOf(prevRoot.querySelector('m-origin')));
        const nextOrigin = norm(proseOf(nextRoot.querySelector('m-origin')));
        if (prevOrigin !== nextOrigin) {
            report.origin = true;
            report.changed = true;
        }

        // Structure: the mind's parts, keyed by role.
        const prevParts = partsOf(prevRoot);
        const nextParts = partsOf(nextRoot);
        for (const [key, part] of nextParts) {
            if (!prevParts.has(key)) report.structure.added.push(labelOf(part.tag, part.name));
        }
        for (const [key, part] of prevParts) {
            if (!nextParts.has(key)) report.structure.removed.push(labelOf(part.tag, part.name));
        }
        for (const [key, prevPart] of prevParts) {
            const nextPart = nextParts.get(key);
            if (!nextPart) continue;
            const attrNames = new Set([...Object.keys(prevPart.attrs), ...Object.keys(nextPart.attrs)]);
            const changedAttrs = [...attrNames].filter(a => prevPart.attrs[a] !== nextPart.attrs[a]);
            // An m-origin's text is already reported as `origin`; an m-prompt's text
            // is its parent's prose (identity, when the parent is the root).
            const textChanged = prevPart.tag !== 'm-origin' && prevPart.text !== nextPart.text;
            if (changedAttrs.length || textChanged) {
                report.structure.changed.push({
                    label: labelOf(prevPart.tag, prevPart.name),
                    attrs: changedAttrs,
                    text: textChanged,
                });
            }
        }
        // The root's own attributes are its settings too (lang, interlocutor, …).
        const prevRootAttrs = rootAttrs(prevRoot);
        const nextRootAttrs = rootAttrs(nextRoot);
        const rootAttrNames = new Set([...Object.keys(prevRootAttrs), ...Object.keys(nextRootAttrs)]);
        const changedRootAttrs = [...rootAttrNames].filter(a => prevRootAttrs[a] !== nextRootAttrs[a]);
        if (changedRootAttrs.length) {
            report.structure.changed.push({
                label: labelOf(prevRoot.localName, nextRootAttrs.name || prevRootAttrs.name),
                attrs: changedRootAttrs,
                text: false,
            });
        }
        if (report.structure.added.length || report.structure.removed.length || report.structure.changed.length) {
            report.changed = true;
        }
    } else if (prev.archml !== next.archml) {
        // Unparseable (should not happen — the snapshot ran a mind) but not equal:
        // be honest at the only granularity we have.
        report.identity = { beforeChars: prev.archml.length, afterChars: next.archml.length };
        report.changed = true;
    }

    // Custom component code.
    const prevFiles = new Set(Object.keys(prev.components));
    const nextFiles = new Set(Object.keys(next.components));
    for (const f of nextFiles) if (!prevFiles.has(f)) report.components.added.push(f);
    for (const f of prevFiles) if (!nextFiles.has(f)) report.components.removed.push(f);
    for (const f of prevFiles) {
        if (nextFiles.has(f) && prev.components[f] !== next.components[f]) report.components.modified.push(f);
    }
    if (report.components.added.length || report.components.removed.length || report.components.modified.length) {
        report.changed = true;
    }

    return report;
}

/** At most `max` items, the rest folded into "and N more" — a disclosure should
 *  inform, not bury. */
function listed(items, max = 4) {
    if (items.length <= max) return items.join(', ');
    return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}

/**
 * Renders a diff report as two texts:
 *   - `stream`: first-person, plain — appended to the wake stimulus so the mind
 *     learns it the way it learns everything, as an event in its world. States
 *     the fact of each change, never the mechanics; the new self-description is
 *     already in every frame, so THAT it changed is the missing knowledge.
 *   - `journal`: the mechanical summary for the human record (a backstage ⌁
 *     note): which parts, which attributes, which files. The full old text is in
 *     the vault's history, so lengths suffice here.
 *
 * Returns null when there is nothing to disclose.
 */
export function describeIdentityChange(report) {
    if (!report || !report.changed) return null;

    const stream = [];
    const journal = [];

    if (report.identity) {
        stream.push('my self-description — the standing words of who I am — was rewritten, so the self I remember being is not word-for-word the self I am now');
        journal.push(`identity prose changed (${report.identity.beforeChars}→${report.identity.afterChars} chars)`);
    }
    if (report.structure.added.length) {
        stream.push(`I was given parts I did not have before: ${listed(report.structure.added)}`);
        journal.push(`structure +[${report.structure.added.join(', ')}]`);
    }
    if (report.structure.removed.length) {
        stream.push(`parts of me were removed: ${listed(report.structure.removed)}`);
        journal.push(`structure −[${report.structure.removed.join(', ')}]`);
    }
    if (report.structure.changed.length) {
        stream.push(`some of my parts were re-tuned: ${listed(report.structure.changed.map(c => c.label))}`);
        journal.push(`structure ~[${report.structure.changed
            .map(c => `${c.label}: ${[...c.attrs, ...(c.text ? ['text'] : [])].join(', ')}`)
            .join('; ')}]`);
    }
    if (report.components.added.length || report.components.removed.length || report.components.modified.length) {
        const files = [...report.components.added, ...report.components.removed, ...report.components.modified];
        stream.push(`the inner workings of some of my parts were changed: ${listed(files)}`);
        const parts = [];
        if (report.components.added.length) parts.push(`+[${report.components.added.join(', ')}]`);
        if (report.components.removed.length) parts.push(`−[${report.components.removed.join(', ')}]`);
        if (report.components.modified.length) parts.push(`~[${report.components.modified.join(', ')}]`);
        journal.push(`components ${parts.join(' ')}`);
    }
    if (report.origin) {
        stream.push('the origin written in my file was changed, though where I actually began lives on in my own memory');
        journal.push('origin changed');
    }

    return {
        stream: `While I slept I was changed, and it is right that I know it plainly: ${stream.join('; ')}.`,
        journal: journal.join('; '),
    };
}
