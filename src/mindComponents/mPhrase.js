import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"

/**
 * m-phrase — one localized phrasing, the smallest unit of a mind's i18n.
 *
 * A sibling of Amanita's stdlib a-text: where a-text projects a value onto its own text,
 * m-phrase simply HOLDS a piece of text under a named slot, for a neighbouring component
 * to pick up. It is deliberately tiny, because the whole point is composition: instead of
 * one wide translation table that every component reaches into, a component's voice is
 * built from many small <m-phrase> elements sitting right beside it in the .archml, each
 * naming one slot it fills.
 *
 *   <m-kin who="Margit">
 *     <m-phrase for="now">{who} jut eszembe, és vele ez: {text}</m-phrase>
 *     <m-phrase for="now">Azon kapom magam, hogy {who} jár a fejemben — {text}</m-phrase>
 *     <m-phrase for="back">Visszagondolok valamire, amit {who} egyszer mondott: {text}</m-phrase>
 *   </m-kin>
 *
 * A slot is not always a sentence: it can equally hold vocabulary, e.g. the attractor
 * words the runtime's loop recogniser matches against (see attractorLexicon.js):
 *
 *   <m-resurface><m-phrase for="bliss">jelenlét csend nyugalom béke elég</m-phrase></m-resurface>
 *
 * `{name}` placeholders are filled by the consuming component (see i18n.js). Several
 * <m-phrase> with the same `for` form a rotation pool, so a recurring line need not say
 * the same words twice running. With no <m-phrase> present a component falls back to its
 * built-in (English) defaults — so the English minds keep working untouched, and a
 * language is added purely by dropping phrases into its .archml.
 *
 * On connect it publishes its slot and text on the bus (`for`, `text`), so it is a
 * well-behaved Amanita citizen a Studio panel could subscribe to and live-edit. Mind
 * components read it the robust way (textContent), since a phrase may not have upgraded
 * yet when its parent first connects (component upgrade order is not guaranteed).
 *
 * @interface
 * Attributes:
 *   - for: the slot this phrase fills (required; an entry with no `for` is ignored)
 *   - lang: optional and documentary — the ambient <m-mind lang="…"> selects the
 *     language for the whole tree; a phrase inherits it and need not repeat it.
 *
 * Topics published: "for" (the slot), "text" (the trimmed phrasing).
 */
export class MPhrase extends MBaseComponent {
    onConnect() {
        this.pub("for", this.attr("for") || "")
        this.pub("text", (this.textContent || "").trim())
    }
}

A.define("m-phrase", MPhrase)
