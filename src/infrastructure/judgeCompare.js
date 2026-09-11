/** Pure prompt/parse for the declared tier-2 text judge. No world state, no third text. */

const VERDICTS = new Set(['match', 'mismatch', 'insufficient'])

export function judgePrompt({ expectText, evidenceText }) {
    const expected = typeof expectText === 'string' ? expectText : ''
    const perceived = typeof evidenceText === 'string' ? evidenceText : ''
    return [
        'Given what was expected and what was then perceived, does the perception confirm the expectation, contradict it, or leave it undecided?',
        'Reply MATCH, MISMATCH, or INSUFFICIENT, then a confidence 0–1.',
        '',
        'Expected:',
        expected,
        '',
        'Perceived:',
        perceived,
    ].join('\n')
}

/** A reply that does not parse is `insufficient`. Confidence defaults to 0 when absent. */
export function parseJudgeReply(text) {
    const raw = typeof text === 'string' ? text.trim() : ''
    const token = raw.match(/\b(MATCH|MISMATCH|INSUFFICIENT)\b/i)
    if (!token) return { verdict: 'insufficient', confidence: 0 }
    const verdict = token[1].toLowerCase()
    if (!VERDICTS.has(verdict)) return { verdict: 'insufficient', confidence: 0 }
    const after = raw.slice(token.index + token[0].length)
    const conf = after.match(/(\d*\.?\d+)/)
    let confidence = 0
    if (conf) {
        const n = Number(conf[1])
        if (Number.isFinite(n)) confidence = Math.max(0, Math.min(1, n > 1 ? n / 100 : n))
    }
    return { verdict, confidence }
}
