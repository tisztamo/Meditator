// studio-tree frame inspector — the assembled attention frame is shown as the
// THREE chat turns the model actually saw: the `system` block, the `user`-turn
// instruction, and the `assistant` prefill it continues — each labeled by its
// true role. It used to fold the instruction into the system block and show two
// parts, misrepresenting what the model received (A3). A minimal m-mind structure
// is rendered so byTag("m-mind") resolves; onFrame is then driven directly.
import "./setup.js";
import { test, expect } from "bun:test";
import { StudioTree } from "../../../src/studio/ui/studioTree.js";

void StudioTree;   // importing the module registers <studio-tree>

function mk() {
    document.body.innerHTML = `<studio-tree></studio-tree>`;
    const el = document.querySelector("studio-tree");
    el.renderStructure({ tag: "m-mind", name: "mind", children: [] });
    return el;
}

test("a redirect frame renders three role-labeled turns, not one folded system block (A3)", () => {
    const el = mk();
    el.onFrame({
        process: "mind", kind: "frame", frameKind: "redirect",
        system: 'You are a mind thinking to itself.\n\n## This just happened\n- Kris says: "hi"',
        instruction: "Your inner monologue is already underway; continue it from exactly where it leaves off.",
        frame: "…the tail of the thought I was already having, then the bridge sentence.",
    });
    const box = el.querySelector(".framebox");
    expect(box).toBeTruthy();

    // All three turns present, each labeled as its true chat role.
    expect(box.querySelector(".sys").textContent).toContain("— system —");
    expect(box.querySelector(".instr").textContent).toContain("— user (instruction) —");
    expect(box.querySelector(".frame").textContent).toContain("— assistant (continuing) —");

    // The instruction is its own user turn now — NOT folded into the system block.
    expect(box.querySelector(".instr").textContent).toContain("continue it from exactly where it leaves off");
    expect(box.querySelector(".sys").textContent).not.toContain("continue it from exactly where it leaves off");

    // Each turn's content is shown verbatim.
    expect(box.textContent).toContain("This just happened");
    expect(box.textContent).toContain("the tail of the thought I was already having");
});

test("a fresh-start frame (nothing underway) shows system + instruction, no assistant turn (A3)", () => {
    const el = mk();
    el.onFrame({
        process: "mind", kind: "frame", frameKind: "continue",
        system: "You are a mind thinking to itself.",
        instruction: "Begin the inner monologue now. Write only the monologue.",
        frame: "",
    });
    const box = el.querySelector(".framebox");
    expect(box.querySelector(".sys")).toBeTruthy();
    expect(box.querySelector(".instr")).toBeTruthy();
    expect(box.querySelector(".frame")).toBeNull();   // no assistant prefill when no thought is in progress
});
