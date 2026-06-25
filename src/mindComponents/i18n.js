/**
 * i18n.js — localization primitives for the mind, the Amanita way. The canonical home.
 *
 * The language a mind thinks in is AMBIENT: a single `lang="…"` on <m-mind> colours the
 * whole component tree, and any component reads it by walking up to that attribute. From
 * that one read everything else is composed.
 *
 * The runtime's router (a-url → a-match → a-match) decomposes a path into many small
 * matchers, each consuming one segment of a "route" and passing the rest along, rather
 * than one wide regular expression. This is the same idea, turned to language: instead of
 * one wide translation table that every component imports, a component's voice is composed
 * from many small <m-phrase> elements sitting right beside it in the .archml — each a tiny
 * "route" of meaning the component picks up at runtime.
 *
 * A component asks a Phrasebook for a named slot ("now", "reach1", "felt") and gets a line
 * in the ambient language, with `{name}` placeholders filled in. Resolution order is
 * local-first:
 *
 *   1. the <m-phrase for="…"> children the .archml gives the component (the language);
 *   2. the component's built-in defaults for the active language;
 *   3. the component's built-in English defaults (so an English mind, and any slot a
 *      translation forgot, keep working);
 *   4. nothing — an empty string, which degrades visibly rather than throwing.
 *
 * So a new language is added purely by dropping phrases into the .archml — no code in the
 * mind components is language-specific. These primitives live in the RUNTIME (not in any
 * one project) because the runtime's own components need them too: to frame an external
 * human voice in the mind's language (InterruptRecord.renderForFrame), to phrase a loop
 * break (m-mind's clearing prefix, m-clear-mind's redirect), and to phrase the stimuli the
 * runtime raises. A localized project (e.g. hearth) re-exports these rather than carrying
 * its own copy, so the layers can never disagree about what language an element is in.
 */

/**
 * The ambient language for an element: the nearest ancestor (or self) carrying a
 * `lang` attribute, defaulting to English. Prefers Amanita's env() (which walks up
 * the tree to the first ancestor with the attribute) and falls back to a bare
 * closest("[lang]") so the helper works from plain elements and tests too.
 *
 * @param {Element} el
 * @returns {string} a language tag like "en" or "hu"
 */
export function langOf(el) {
    const viaEnv = el && typeof el.env === "function" ? el.env("lang") : null
    if (viaEnv) return viaEnv
    const host = el && typeof el.closest === "function" ? el.closest("[lang]") : null
    return (host && host.getAttribute("lang")) || "en"
}

/**
 * Fill `{name}` placeholders in a template from `vars`. Unknown placeholders are left
 * intact, so a half-translated line shows its gap rather than swallowing it.
 *
 * @param {string} template
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function fill(template, vars = {}) {
    return String(template ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/**
 * Read an element's direct <m-phrase> children into `{ slot: [template, …] }`, grouped
 * by their `for` attribute. Several phrases sharing a `for` become a rotation pool, so a
 * sense need not say the same words twice running.
 *
 * Reads each phrase's text the robust way: the value it published on the bus (`text`)
 * when it has upgraded, else its raw textContent — because component upgrade order is
 * not guaranteed, a phrase may still be a plain element when its parent first reads it
 * (the same reason m-base-component reads <m-prompt> via textContent).
 *
 * @param {Element} el
 * @returns {Record<string, string[]>}
 */
export function collectPhrases(el) {
    const book = {}
    if (!el || !el.children) return book
    for (const child of Array.from(el.children)) {
        if (child.localName !== "m-phrase") continue
        const key = child.getAttribute("for")
        if (!key) continue
        const text = phraseText(child)
        if (!text) continue
        ;(book[key] || (book[key] = [])).push(text)
    }
    return book
}

/** The text of one <m-phrase>: its published bus value if upgraded, else its content. */
function phraseText(el) {
    if (typeof el.text === "string" && el.text.length) return el.text.trim()
    return (el.textContent || "").trim()
}

/**
 * A component's localized voice: the <m-phrase> children it was given, over its built-in
 * defaults, resolved for the ambient language. Built once per component and cached; the
 * rotation cursor lives here so each slot advances independently and stably.
 */
export class Phrasebook {
    /**
     * @param {Element} component - the element whose <m-phrase> children and ambient
     *   language define this book
     * @param {Record<string, Record<string, string[]>>} [defaults] - built-in lines, keyed
     *   by language then slot, e.g. { en: { now: ["…"], who: ["my friend"] } }
     */
    constructor(component, defaults = {}) {
        this.lang = langOf(component)
        this.collected = collectPhrases(component)
        this.defaults = defaults || {}
        this._rot = {}
    }

    /** Whether any line exists for a slot (in the tree or the defaults). */
    has(key) {
        return this.all(key).length > 0
    }

    /** Every localized template for a slot, local-first then default-language then English. */
    all(key) {
        if (this.collected[key] && this.collected[key].length) return this.collected[key]
        const d = this.defaults
        if (d[this.lang] && d[this.lang][key] && d[this.lang][key].length) return d[this.lang][key]
        if (d.en && d.en[key] && d.en[key].length) return d.en[key]
        return []
    }

    /** The first template for a slot, filled — for one-of-a-kind lines (a felt sense, a description). */
    line(key, vars = {}) {
        const arr = this.all(key)
        return arr.length ? fill(arr[0], vars) : ""
    }

    /** A stable rotation through a slot's templates, filled — so a recurring line varies its words. */
    rotate(key, vars = {}) {
        const arr = this.all(key)
        if (!arr.length) return ""
        const i = (this._rot[key] = (this._rot[key] ?? -1) + 1) % arr.length
        return fill(arr[i], vars)
    }

    /** A random template from a slot, filled — for slots that want spread rather than order. */
    pick(key, vars = {}) {
        const arr = this.all(key)
        if (!arr.length) return ""
        return fill(arr[Math.floor(Math.random() * arr.length)], vars)
    }
}

/** Build a Phrasebook now, reading the component's current <m-phrase> children. */
export function makePhrasebook(component, defaults) {
    return new Phrasebook(component, defaults)
}

/**
 * Build a Phrasebook the Amanita way: after a microtask, so that freshly-defined
 * <m-phrase> children have had a turn to upgrade and publish on the bus before we read
 * them. The result is identical to makePhrasebook (which reads textContent regardless) —
 * this is the async opener for callers wiring up at connect time, where waiting for the
 * mycelium to settle is the natural thing to do.
 */
export async function openPhrasebook(component, defaults) {
    await Promise.resolve()
    return new Phrasebook(component, defaults)
}
