import { describe, expect, it } from 'bun:test';
import { rawConsequence, blindSubset } from '../../lab/expect-study/analysis/pairs.mjs';

// The expect-study B2/§2.7 harness turns a narrated consequence into the raw
// payload the world actually produced (the "raw" Jev arm) and picks the blind
// subset the gate is stated over. Both are pure and both are load-bearing for
// the numbers in doc/research/expect-study.md, so they are pinned here.

describe('rawConsequence', () => {
    it('drops the narration before the payload', () => {
        const narrated = 'Checking whether it runs — I run it, and the screen answers:\n\nFound 1 result\nn=65';
        expect(rawConsequence(narrated)).toEqual({ text: 'Found 1 result\nn=65', stripped: true });
    });

    it('keeps a perception that is narration all the way down', () => {
        const kept = 'I set this down to keep, somewhere I can find it again, under "A note": “the content…”';
        expect(rawConsequence(kept)).toEqual({ text: kept, stripped: false });
    });

    it('keeps the whole text when the narration has an empty payload', () => {
        const empty = 'Checking it — the screen comes back with:\n\n   \n';
        expect(rawConsequence(empty).stripped).toBe(false);
        expect(rawConsequence(empty).text).toBe(empty);
    });

    it('splits on the first payload break only', () => {
        const two = 'head:\n\nfirst\n\nsecond:\n\nthird';
        expect(rawConsequence(two).text).toBe('first\n\nsecond:\n\nthird');
    });

    it('reads a missing perception as an empty, unstripped one', () => {
        expect(rawConsequence(null)).toEqual({ text: '', stripped: false });
    });
});

describe('blindSubset', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ predictionId: `id-${i}` }));

    it('picks the requested size and is stable across calls', () => {
        const a = blindSubset(pairs, 8);
        const b = blindSubset([...pairs].reverse(), 8);
        expect(a.size).toBe(8);
        expect([...a].sort()).toEqual([...b].sort());
    });

    it('never asks for more than it has', () => {
        expect(blindSubset(pairs, 50).size).toBe(20);
    });
});
