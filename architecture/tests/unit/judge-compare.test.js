import { test, expect, describe } from 'bun:test'
import { judgePrompt, parseJudgeReply } from '../../../src/infrastructure/judgeCompare.js'

describe('judgePrompt', () => {
    test('asks one question and includes both texts; no third text', () => {
        const prompt = judgePrompt({ expectText: 'the screen answers 42', evidenceText: 'I see 42' })
        expect(prompt).toContain('the screen answers 42')
        expect(prompt).toContain('I see 42')
        expect(prompt).toMatch(/MATCH/)
        expect(prompt).toMatch(/MISMATCH/)
        expect(prompt).toMatch(/INSUFFICIENT/)
        expect(prompt).not.toContain('hidden world')
    })

    test('asks for the verdict last, after the reasoning', () => {
        const prompt = judgePrompt({ expectText: 'the screen answers 42', evidenceText: 'I see 42' })
        expect(prompt).toContain('VERDICT: <MATCH|MISMATCH|INSUFFICIENT> CONFIDENCE: <0-1>')
        expect(prompt).toMatch(/Think it through[\s\S]*then end with a final line/)
    })
})

describe('parseJudgeReply', () => {
    test('maps the three tokens and confidence', () => {
        expect(parseJudgeReply('VERDICT: MATCH CONFIDENCE: 0.9')).toEqual({ verdict: 'match', confidence: 0.9 })
        expect(parseJudgeReply('VERDICT: MISMATCH CONFIDENCE: 0.4')).toEqual({ verdict: 'mismatch', confidence: 0.4 })
        expect(parseJudgeReply('VERDICT: INSUFFICIENT CONFIDENCE: 0.2')).toEqual({ verdict: 'insufficient', confidence: 0.2 })
        expect(parseJudgeReply('I think this is a MATCH (0.75).')).toEqual({ verdict: 'match', confidence: 0.75 })
    })

    test('the last token is the verdict, not the first', () => {
        // The reasoning names the options before it answers; only the final line decides.
        const reply = 'It could be a MATCH, but no result was produced.\nVERDICT: INSUFFICIENT CONFIDENCE: 0.1'
        expect(parseJudgeReply(reply)).toEqual({ verdict: 'insufficient', confidence: 0.1 })
    })

    test('a reply truncated before the verdict line is insufficient', () => {
        expect(parseJudgeReply('The expectation was a number, and the screen shows a traceback, so')).toEqual({ verdict: 'insufficient', confidence: 0 })
    })

    test('garbage is insufficient', () => {
        expect(parseJudgeReply('')).toEqual({ verdict: 'insufficient', confidence: 0 })
        expect(parseJudgeReply('sure, looks fine')).toEqual({ verdict: 'insufficient', confidence: 0 })
        expect(parseJudgeReply(null)).toEqual({ verdict: 'insufficient', confidence: 0 })
    })
})
