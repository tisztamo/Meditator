// Seam trimming for streamed bursts. The first chunk of a new burst can begin
// with a continuation marker from the model; we strip that before overlap
// detection so the rendered stream does not show the artifact.
import { test, expect } from "bun:test";
import { trimSeamOverlap } from "../../../src/mindComponents/mStream.js";

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
