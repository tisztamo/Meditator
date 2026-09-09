// Amanita 0.5+ boundary refs: !scope / !cluster on reflected boundary attributes.
import { test, expect, beforeAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let society, prover, checker, proverMemory, checkerMemory;

beforeAll(async () => {
    document.body.innerHTML = `
      <m-society name="duet">
        <m-mind name="prover">
          <m-stream name="stream"></m-stream>
          <m-memory name="memory" persist="off" journal="off"></m-memory>
        </m-mind>
        <m-mind name="checker">
          <m-stream name="stream"></m-stream>
          <m-memory name="memory" persist="off" journal="off"></m-memory>
        </m-mind>
      </m-society>
    `;

    await loadMindComponents(document);
    await delay(80);

    society = document.querySelector("m-society");
    prover = document.querySelector('m-mind[name="prover"]');
    checker = document.querySelector('m-mind[name="checker"]');
    proverMemory = prover.querySelector("m-memory");
    checkerMemory = checker.querySelector("m-memory");
});

test("loader reflects boundary on identity roots", () => {
    expect(society.getAttribute("boundary")).toBe("cluster");
    expect(prover.getAttribute("boundary")).toBe("scope");
    expect(checker.getAttribute("boundary")).toBe("scope");
});

test("!scope binds to the nearest mind, not the society", async () => {
    const chunk = "prover-only tail seed";
    prover.querySelector("m-stream").pub("chunk", chunk);
    await delay(20);
    expect(proverMemory.getTail().includes(chunk)).toBe(true);
    expect(checkerMemory.getTail().includes(chunk)).toBe(false);
});

test("!cluster reaches a named member mind", async () => {
    let heard = null;
    await checker.sub("!cluster/prover/stream/chunk", c => { heard = c; });
    prover.querySelector("m-stream").pub("chunk", "cross-mind");
    await delay(20);
    expect(heard).toBe("cross-mind");
});
