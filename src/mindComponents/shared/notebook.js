// The notebook format m-note writes, read back. m-recall's note source reads
// notes with it, so it lives here rather than in m-note's module (message-rule
// review §2.11).

/**
 * Parse a notebook written by m-note into entries, newest last (document order).
 * Pure and exported so m-recall can read notes back without duplicating the format,
 * and so it is testable without the filesystem.
 *
 * @param {string} md
 * @returns {{stamp: string, title: string|null, text: string}[]}
 */
export function parseNotebook(md) {
    if (!md) return []
    const entries = []
    const blocks = md.split(/^## /m).slice(1)   // each entry begins with "## <stamp>[ — <title>]"
    for (const block of blocks) {
        const nl = block.indexOf("\n")
        const header = (nl === -1 ? block : block.slice(0, nl)).trim()
        const text = (nl === -1 ? "" : block.slice(nl + 1)).trim()
        if (!text) continue
        const dash = header.indexOf(" — ")
        const stamp = (dash === -1 ? header : header.slice(0, dash)).trim()
        const title = dash === -1 ? null : header.slice(dash + 3).trim() || null
        entries.push({ stamp, title, text })
    }
    return entries
}
