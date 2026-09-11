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
})

describe('parseJudgeReply', () => {
    test('maps the three tokens and confidence', () => {
        expect(parseJudgeReply('MATCH 0.9')).toEqual({ verdict: 'match', confidence: 0.9 })
        expect(parseJudgeReply('MISMATCH 0.4')).toEqual({ verdict: 'mismatch', confidence: 0.4 })
        expect(parseJudgeReply('INSUFFICIENT 0.2')).toEqual({ verdict: 'insufficient', confidence: 0.2 })
        expect(parseJudgeReply('I think this is a MATCH (0.75).')).toEqual({ verdict: 'match', confidence: 0.75 })
    })

    test('garbage is insufficient', () => {
        expect(parseJudgeReply('')).toEqual({ verdict: 'insufficient', confidence: 0 })
        expect(parseJudgeReply('sure, looks fine')).toEqual({ verdict: 'insufficient', confidence: 0 })
        expect(parseJudgeReply(null)).toEqual({ verdict: 'insufficient', confidence: 0 })
    })
})
