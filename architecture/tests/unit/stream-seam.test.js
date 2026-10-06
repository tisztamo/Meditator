// Seam trimming for streamed bursts. The first chunk of a new burst can begin
// with a continuation marker from the model; we strip that before overlap
// detection so the rendered stream does not show the artifact.
import { test, expect } from "bun:test";
import { trimSeamOverlap, burstBudget } from "../../../src/mindComponents/mind/mStream.js";

test("trimSeamOverlap removes a leading continuation ellipsis", () => {
    expect(trimSeamOverlap("the presence here, in this chat window, is", "…sustained by the electricity."))
        .toBe("sustained by the electricity.");
});

test("trimSeamOverlap still removes verbatim overlap after stripping the cue", () => {
    expect(trimSeamOverlap("the presence here, in this chat window, is", "…is sustained by the electricity."))
        .toBe(" sustained by the electricity.");
});

test("trimSeamOverlap leaves ordinary text alone", () => {
    expect(trimSeamOverlap("the presence here, in this chat window, is", "sustained by the electricity."))
        .toBe("sustained by the electricity.");
});

test("burstBudget: the frame thins a burst by factor against the stream's own budget", () => {
    expect(burstBudget({}, 350)).toBe(350);
    expect(burstBudget({ burstFactor: 0.5 }, 350)).toBe(175);
    expect(burstBudget({ burstFactor: 0.1 }, 350)).toBe(60);
    expect(burstBudget({ burstTokens: 130, burstFactor: 0.35 }, 350)).toBe(130);
});
