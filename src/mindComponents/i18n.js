/**
 * i18n.js — framework-level localization primitives, shared across the mind.
 *
 * The language a mind thinks in is AMBIENT: a single `lang="…"` on <m-mind> colours
 * the whole component tree, and any component reads it by walking up to that attribute.
 * `langOf()` is that read. It lives in the runtime because two layers now need the
 * same answer for the same element:
 *
 *   - the runtime itself, to frame an external human voice in the mind's own language
 *     ("<name> says: …" / "Margit azt mondja: …" — see InterruptRecord.renderForFrame);
 *   - project components built on the runtime (e.g. hearth's <m-phrase> Phrasebook,
 *     which composes a component's localized voice out of the tree).
 *
 * Keeping the reader here means a localized project re-exports it rather than carrying
 * its own copy, so the two can never disagree about what language an element is in.
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
