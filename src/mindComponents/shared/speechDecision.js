// The speech-decision reply parser, shared by m-speech (its own decision) and m-act
// (a spoken deed). Kept out of both components' modules (message-rule review §2.11).

/**
 * Parses the speech-decision model's reply TOLERANTLY. Small utility models
 * rarely keep a rigid two-line format, so rather than demanding a literal
 * "SAY:" line (and silently treating everything else as refusal), we treat any
 * non-NONE reply as the utterance and pull an optional strength score out of
 * whatever shape it arrived in. Returns
 *   { say: string|null, salience: number|null, reason: "say"|"none"|"empty" }.
 */
export function parseSpeechDecision(text) {
    let raw = (text || "").trim()
    if (!raw) return { say: null, salience: null, reason: "empty" }
    // Unwrap a reply the model wrapped wholesale in quotes (it sometimes tucks
    // the score inside, e.g. `"[0.9] I hear you."`), so the score still parses.
    if (raw.length > 1 && /^["'][\s\S]*["']$/.test(raw)) raw = raw.slice(1, -1).trim()

    // An optional strength score, in any of the tolerated shapes.
    let salience = null
    const sal = raw.match(/(?:salience|strength)\s*[:=]?\s*([01]?\.?\d+)/i)
        || raw.match(/^\s*\[\s*([01]?\.?\d+)\s*\]/)
        || raw.match(/^\s*([01]?\.?\d+)\s*[|:–-]\s/)
    if (sal) {
        const n = parseFloat(sal[1])
        if (Number.isFinite(n)) salience = Math.max(0, Math.min(1, n))
    }

    // Strip score markers and any leading label to isolate the words.
    let body = raw
        .replace(/(?:salience|strength)\s*[:=]?\s*[01]?\.?\d+\s*[:|–-]?\s*/i, "")
        .replace(/^\s*\[\s*[01]?\.?\d+\s*\]\s*/, "")
        .replace(/^\s*[01]?\.?\d+\s*[|:–-]\s*/, "")
        .replace(/^\s*(?:\.{3,}|…)+\s*/, "")
        .replace(/^\s*(?:SAY|SAID|THOUGHT|UTTERANCE|RESPONSE|REPLY)\s*[:–-]\s*/im, "")
        .trim()

    // Explicit refusal — when NONE is essentially the whole reply.
    if (/^["']?none\b/i.test(body)) return { say: null, salience: salience ?? 0, reason: "none" }

    body = body.replace(/^["']|["']$/g, "").trim()
    if (!body) return { say: null, salience: salience ?? 0, reason: "none" }
    return { say: body, salience, reason: "say" }
}
