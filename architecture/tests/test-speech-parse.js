// Unit test for mSpeech's tolerant decision parser. The old parser treated any
// reply without a literal "SAY:" as refusal — so a small model that wanted to
// speak but broke format was silently muted. These cases lock in the fix.
//   bun architecture/tests/test-speech-parse.js
import { parseSpeechDecision } from "../../src/mindComponents/mSpeech.js";

// [input, expected say (null = stayed silent)]
const cases = [
    ["NONE", null],
    ["none.", null],
    ["NONE, nothing wants to be said", null],
    ["", null],
    ['"none"', null],
    ["SALIENCE: 0.8\nSAY: I want to speak.", "I want to speak."],          // old rigid format still works
    ["[0.7] The silence is heavy and I must name it.", "The silence is heavy and I must name it."],
    ["0.9 | Yes, I am here.", "Yes, I am here."],
    ["SAY: hello there", "hello there"],
    ['"Just this once, I will say it."', "Just this once, I will say it."], // bare quoted utterance, no label
    ["I think the answer is the waiting itself.", "I think the answer is the waiting itself."], // plain prose, no format at all
    ["strength 0.6: the pause is the content", "the pause is the content"],
    ['"[0.9] I hear you. Who are you?"', "I hear you. Who are you?"], // whole reply quoted, score inside
];

let pass = 0, fail = 0;
for (const [input, expectSay] of cases) {
    const r = parseSpeechDecision(input);
    const ok = expectSay === null ? r.say === null : r.say === expectSay;
    console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(input).slice(0, 48).padEnd(50)} -> say=${JSON.stringify(r.say)} sal=${r.salience}`);
    ok ? pass++ : fail++;
}

// A salience prefix must not be invented from a number inside the sentence.
const noFalseSal = parseSpeechDecision("In 1893 the lighthouse keeper knew.");
const salOk = noFalseSal.salience === null && noFalseSal.say === "In 1893 the lighthouse keeper knew.";
console.log(`${salOk ? "PASS" : "FAIL"}  no false salience from in-sentence number -> sal=${noFalseSal.salience}`);
salOk ? pass++ : fail++;

console.log(`${fail === 0 ? "ALL PASS" : "SOME FAIL"} (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
