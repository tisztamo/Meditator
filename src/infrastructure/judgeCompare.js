/** Pure prompt/parse for the declared tier-2 text judge. No world state, no third text. */

const VERDICTS = new Set(['match', 'mismatch', 'insufficient'])

/** Default reply budget. Large enough that the reasoning and the final verdict
 * line both fit — a truncated reply has no verdict token and reads as
 * `insufficient`, which is the safe direction. */
export const JUDGE_MAX_TOKENS = 400

/** The verdict comes LAST, after the reasoning. Asking for the label first made
 * the model commit before looking: in the B1 arm-P ledger it opened with MATCH
 * and then argued the opposite in its own prose ("no numerical results were
 * produced"), and the opening word was the one recorded. Reasoning first fixes
 * that.
 *
 * The three one-line glosses name the two distinctions the judge kept losing:
 * a failed reach carries no result and so cannot contradict anything
 * (INSUFFICIENT, not MISMATCH), and an expectation that only asked which way
 * something would come out is met by a clear answer either way (MATCH, however
 * unwelcome the answer). They say what the verdicts mean, not what to conclude
 * about any particular kind of evidence. See doc/research/expect-study.md §2. */
export const VERDICT_GLOSSES = {
    match: 'the perception is what the expectation said would be there. An expectation that was only to see which way something would come out is met by a clear result either way, and news that is unwelcome is still a match.',
    mismatch: 'the perception shows a result that conflicts with what the expectation said would be there.',
    insufficient: 'the perception carries no result to compare against — an error, a crash, an empty output.',
}

export function judgePrompt({ expectText, evidenceText }) {
    const expected = typeof expectText === 'string' ? expectText : ''
    const perceived = typeof evidenceText === 'string' ? evidenceText : ''
    return [
        'Given what was expected and what was then perceived, does the perception confirm the expectation, contradict it, or leave it undecided?',
        `MATCH: ${VERDICT_GLOSSES.match}`,
        `MISMATCH: ${VERDICT_GLOSSES.mismatch}`,
        `INSUFFICIENT: ${VERDICT_GLOSSES.insufficient}`,
        'Think it through in at most three sentences, then end with a final line of exactly:',
        'VERDICT: <MATCH|MISMATCH|INSUFFICIENT> CONFIDENCE: <0-1>',
        '',
        'Expected:',
        expected,
        '',
        'Perceived:',
        perceived,
    ].join('\n')
}

/** The LAST verdict token in the reply is the verdict — the ones before it are
 * the reasoning talking about the options, not the answer. A reply that does not
 * parse (no token, or truncated before the final line) is `insufficient`.
 * Confidence defaults to 0 when absent. */
export function parseJudgeReply(text) {
    const raw = typeof text === 'string' ? text.trim() : ''
    const tokens = [...raw.matchAll(/\b(MATCH|MISMATCH|INSUFFICIENT)\b/gi)]
    const token = tokens.length ? tokens[tokens.length - 1] : null
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
