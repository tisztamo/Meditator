// The dry-run stub picks its reply by the call's debugTag, never by the prompt's
// text (message-rule review §2.3). Matching prose made the model layer know every
// component by its wording, and a mind's own words could steer it: memory's
// compression got the association reply whenever its thinking said "remind".
import { test, expect, beforeAll, afterAll } from "bun:test";
import { complete, completeWithTools, chatStream, generateImage } from "../../../src/modelAccess/llm.js";

let savedDry;
beforeAll(() => { savedDry = process.env.MEDITATOR_DRY_RUN; process.env.MEDITATOR_DRY_RUN = "1"; });
afterAll(() => {
  if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

const CONDENSED = /^Earlier I drifted between sounds and their names/;

test("a memory tier gets the condensed reply whatever its thinking says", async () => {
  const result = await complete({
    debugTag: "memory-recent",
    prompt: "This reminds me of an association; I feel the impulse to SPEAK and the impulse to REACH.",
  });
  expect(result.text).toMatch(CONDENSED);
});

test("an agent's context compaction gets the condensed reply", async () => {
  expect((await complete({ debugTag: "context", prompt: "USER: hi" })).text).toMatch(CONDENSED);
});

test("prompt wording alone selects nothing", async () => {
  const result = await complete({ prompt: "You are the loop sense of a mind. Write a summary." });
  expect(result.text).toBe("Noted.");
});

test("tagged replies keep their shapes", async () => {
  expect((await complete({ debugTag: "drift-choose", prompt: "x" })).text)
    .toBe("There is a kind of knot the river unties by simply keeping on.");
  expect((await complete({ debugTag: "bridge", prompt: "x" })).text).toMatch(/^Hold on/);
  const loop = (await complete({ debugTag: "loop-detector", prompt: "x" })).text;
  expect(loop).toMatch(/^LOOPING: (yes|no)\nSCORE: /);
});

test("the spoken voice streams an utterance, the conscious stream a thought", async () => {
  const read = async debugTag => {
    let text = "";
    for await (const chunk of await chatStream({ debugTag, messages: [{ role: "user", content: "say it aloud" }] })) text += chunk;
    return text.trim();
  };
  expect(await read("speech-voice")).toMatch(/^(Can I say something\?|I keep circling one thought|Yes — I am here)/);
  expect(await read("stream")).not.toMatch(/^(Can I say something\?|I keep circling one thought|Yes — I am here)/);
});

test("every dry call returns its usage for the caller to attribute", async () => {
  expect((await complete({ debugTag: "kb", prompt: "x" })).usage).toMatchObject({ prompt_tokens: 200, completion_tokens: 40 });
  expect((await completeWithTools({ tools: [] })).usage).toMatchObject({ prompt_tokens: 220 });
  expect((await generateImage({ prompt: "a key" })).usage).toMatchObject({ prompt_tokens: 80 });
  const burst = await chatStream({ debugTag: "stream", messages: [] });
  expect(burst.usage).toMatchObject({ prompt_tokens: 500 });
});
