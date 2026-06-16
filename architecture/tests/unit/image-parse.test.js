// mImage tolerant decision parser — locks in format-tolerant visual decisions.
import { test, expect } from "bun:test";
import { parseImageDecision } from "../../../src/mindComponents/mImage.js";

const cases = [
  ["NONE", null],
  ["none, nothing visual", null],
  ["", null],
  ['"none"', null],
  ["SALIENCE: 0.8\nPROMPT: A small brass key on a rain-dark windowsill.", "A small brass key on a rain-dark windowsill."],
  ["[0.72] A quiet kitchen at dawn, blue light on a chipped mug.", "A quiet kitchen at dawn, blue light on a chipped mug."],
  ["0.9 | A river carving a canyon under moonlight.", "A river carving a canyon under moonlight."],
  ["IMAGE: A fox asleep in tall grass.", "A fox asleep in tall grass."],
  ['"A glass greenhouse full of moths and warm lamps."', "A glass greenhouse full of moths and warm lamps."],
];

for (const [input, expectPrompt] of cases) {
  test(`parseImageDecision(${JSON.stringify(input).slice(0, 40)}...)`, () => {
    const r = parseImageDecision(input);
    if (expectPrompt === null) expect(r.prompt).toBeNull();
    else expect(r.prompt).toBe(expectPrompt);
  });
}

test("does not invent salience from an in-sentence number", () => {
  const r = parseImageDecision("Three bowls on a table in 1893.");
  expect(r.salience).toBeNull();
  expect(r.prompt).toBe("Three bowls on a table in 1893.");
});
