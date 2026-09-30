// Identity prose's {{interlocutor}} placeholder, filled the same way by the
// thinking frame (m-mind) and the spoken voice (m-speech), so it lives here rather
// than in m-mind's module (message-rule review §2.11).

/** Fill the {{interlocutor}} placeholder in identity prose with the mind's
 *  companion name (m-mind's `interlocutor` attribute, set in the file or at wake
 *  via MEDITATOR_INTERLOCUTOR). With no name it falls back to a warm generic so
 *  the sentence still reads — though an architecture that uses the placeholder
 *  should give an `interlocutor="…"` default. Shared with m-speech so the
 *  spoken-voice system prompt resolves the same name the thinking frame does. */
export function fillInterlocutor(text, name) {
    const who = (name || "").trim() || "whoever comes to talk with you"
    return (text || "").replace(/\{\{\s*interlocutor\s*\}\}/gi, who)
}
