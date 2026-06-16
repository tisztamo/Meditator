// mSpeech tolerant decision parser — locks in format-tolerant speaking decisions.
import { test, expect } from "bun:test";
import { parseSpeechDecision } from "../../../src/mindComponents/mSpeech.js";

const cases = [
    ["NONE", null],
    ["none.", null],
    ["NONE, nothing wants to be said", null],
    ["", null],
    ['"none"', null],
    ["SALIENCE: 0.8\nSAY: I want to speak.", "I want to speak."],
    ["[0.7] The silence is heavy and I must name it.", "The silence is heavy and I must name it."],
    ["0.9 | Yes, I am here.", "Yes, I am here."],
    ["SAY: hello there", "hello there"],
    ['"Just this once, I will say it."', "Just this once, I will say it."],
    ["I think the answer is the waiting itself.", "I think the answer is the waiting itself."],
    ["strength 0.6: the pause is the content", "the pause is the content"],
    ['"[0.9] I hear you. Who are you?"', "I hear you. Who are you?"],
];

for (const [input, expectSay] of cases) {
    test(`parseSpeechDecision(${JSON.stringify(input).slice(0, 40)}…)`, () => {
        const r = parseSpeechDecision(input);
        if (expectSay === null) expect(r.say).toBeNull();
        else expect(r.say).toBe(expectSay);
    });
}

test("does not invent salience from an in-sentence number", () => {
    const r = parseSpeechDecision("In 1893 the lighthouse keeper knew.");
    expect(r.salience).toBeNull();
    expect(r.say).toBe("In 1893 the lighthouse keeper knew.");
});
