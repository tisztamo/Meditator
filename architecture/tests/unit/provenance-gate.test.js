// Provenance gate: the stream runs every model chunk through it BEFORE emission, so a
// confabulated `> ⟂` line (a perception the model authored that no attended percept
// accounts for) never reaches the tail or the journal. A `> ⟂` line is the ONE rendering
// of perception in the stream record (withPerceivedEvents renders each sense on its own
// line), so the gate flags a line that BEGINS with `> ⟂` and matches no allowed percept.
// Allowed = the frame's attended percepts + the `> ⟂` lines already carried in the tail;
// anything else the model authors on its own `> ⟂` line is a confabulation.
import { test, expect } from "bun:test";
import { ProvenanceGate, perceptLines, scanProvenance } from "../../../src/mindComponents/mind/provenanceGate.js";

const feed = (gate, ...chunks) => {
    let emit = ""
    let confabulation = null
    for (const c of chunks) {
        const r = gate.feed(c)
        emit += r.emit
        if (r.confabulation) { confabulation = r.confabulation; break }   // the stream interrupts here
    }
    if (!confabulation) {
        const f = gate.flush()
        emit += f.emit
        if (f.confabulation) confabulation = f.confabulation
    }
    return { emit, confabulation }
}

test("a model-authored `> ⟂` line with no percept is a confabulation", () => {
    const { emit, confabulation } = feed(
        new ProvenanceGate({ allowed: [] }),
        "the air is warm\n", "> ⟂ 71.3°\n", "and I feel it\n",
    )
    expect(confabulation?.line).toBe("> ⟂ 71.3°")
    // only the prose BEFORE the bad line is emitted; the sense and what follows it
    // are discarded with the interrupted burst
    expect(emit).toBe("the air is warm\n")
})

test("a model line matching an attended percept is legitimate", () => {
    const { confabulation, emit } = feed(
        new ProvenanceGate({ allowed: ["> ⟂ 71.3°"] }),
        "the air is warm\n", "> ⟂ 71.3°\n", "and I feel it\n",
    )
    expect(confabulation).toBeNull()
    expect(emit).toContain("> ⟂ 71.3°")
})

test("a model line echoing a `> ⟂` line already in the tail is legitimate", () => {
    const { confabulation } = feed(
        new ProvenanceGate({ allowed: ["> ⟂ You do not need to come up with a sense. Senses will come to you. Think about what interests you and they will come."] }),
        "I hear it\n", "> ⟂ You do not need to come up with a sense. Senses will come to you. Think about what interests you and they will come.\n",
    )
    expect(confabulation).toBeNull()
})

test("a confabulation split across chunks is caught when the line completes", () => {
    const { confabulation } = feed(new ProvenanceGate({ allowed: [] }), "the air is warm\n", "> ⟂", " 71", ".3°\n")
    expect(confabulation?.line).toBe("> ⟂ 71.3°")
})

test("a confabulation that ends the burst (no trailing newline) is caught on flush", () => {
    const gate = new ProvenanceGate({ allowed: [] })
    expect(gate.feed("the air is warm\n> ⟂ 71.3°").confabulation).toBeNull()   // line not complete yet
    const f = gate.flush()
    expect(f.confabulation?.line).toBe("> ⟂ 71.3°")
    expect(f.emit).toBe("")   // the confabulated final line is held back, not emitted
})

test("a non-`> ⟂` line is never a confabulation", () => {
    const { confabulation } = feed(new ProvenanceGate({ allowed: [] }), "I feel the air is warm.\n")
    expect(confabulation).toBeNull()
})

test("an inline `> ⟂` mention (not a line of its own) is prose, not a perception line", () => {
    const { confabulation } = feed(new ProvenanceGate({ allowed: [] }), "I keep thinking about > ⟂ 71.3°\n")
    expect(confabulation).toBeNull()
})

test("perceptLines extracts the `> ⟂` lines from a stretch of text", () => {
    expect(perceptLines("a\n> ⟂ 71.3°\nmid\n> ⟂ a voice\nb")).toEqual(["> ⟂ 71.3°", "> ⟂ a voice"])
    expect(perceptLines("")).toEqual([])
})

test("scanProvenance scans a whole string at once", () => {
    expect(scanProvenance("x\n> ⟂ invented\n", { allowed: [] })?.line).toBe("> ⟂ invented")
    expect(scanProvenance("x\n> ⟂ real\n", { allowed: ["> ⟂ real"] })).toBeNull()
})
