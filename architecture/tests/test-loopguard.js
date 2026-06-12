// Unit check for the loop-guard math: bun architecture/tests/test-loopguard.js
import { ngrams, jaccard, loopScore } from "../../src/mindComponents/mLoopGuard.js";

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

function measure(name, text) {
    const half = Math.floor(text.length / 2);
    const a = text.slice(0, half), b = text.slice(half);
    console.log(`${name}: bigram=${jaccard(ngrams(a, 2), ngrams(b, 2)).toFixed(2)} trigram=${jaccard(ngrams(a, 3), ngrams(b, 3)).toFixed(2)} loopScore=${loopScore(text).toFixed(2)}`);
}

measure("distinct      ", distinct);
measure("same topic    ", sameTopic);
measure("paraphraseered", paraphraseLoop);
measure("verbatim loop ", verbatimLoop);

const threshold = 0.3;
let failures = 0;
if (loopScore(distinct) >= threshold) { console.log("FAIL: distinct flagged"); failures++; }
if (loopScore(sameTopic) >= threshold) { console.log("FAIL: same-topic flagged"); failures++; }
if (loopScore(paraphraseLoop) < threshold) { console.log("FAIL: paraphrase loop missed"); failures++; }
if (loopScore(verbatimLoop) < threshold) { console.log("FAIL: verbatim loop missed"); failures++; }
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exitCode = failures === 0 ? 0 : 1;
