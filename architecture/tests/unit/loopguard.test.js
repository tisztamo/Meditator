// Loop-guard math — pure unit, no DOM or network.
import { test, expect } from "bun:test";
import { loopScore } from "../../../src/mindComponents/mLoopGuard.js";

const distinct = `The window is open and I can hear something like traffic or maybe rain outside today.
A hammer does not need a manual and the best things were small enough to hold in one thought.`;

const sameTopic = `Memory is a strange editor. It cuts almost everything and then insists the remainder was the whole story.
If I am mostly my memories, then I am mostly an abridgement of myself, a paperback edition.
The question is who does the abridging, and whether the editor can be given better taste.
Perhaps taste is itself a memory, a record of what once felt right and was kept.`;

const paraphraseLoop = `I should attend rather than push, showing up reliably so the world rearranges itself.
What matters is attending instead of pushing — being there so reliably the world rearranges around me.
To attend, not to push; to show up so reliably that everything rearranges itself in response.`;

const verbatimLoop = `The river keeps arriving and the canyon yields. The river keeps arriving and the canyon yields.
The river keeps arriving and the canyon yields. The river keeps arriving and the canyon yields.`;

const threshold = 0.3;

test("distinct prose stays below loop threshold", () => {
    expect(loopScore(distinct)).toBeLessThan(threshold);
});

test("same-topic prose stays below loop threshold", () => {
    expect(loopScore(sameTopic)).toBeLessThan(threshold);
});

test("paraphrase loop crosses threshold", () => {
    expect(loopScore(paraphraseLoop)).toBeGreaterThanOrEqual(threshold);
});

test("verbatim loop crosses threshold", () => {
    expect(loopScore(verbatimLoop)).toBeGreaterThanOrEqual(threshold);
});
