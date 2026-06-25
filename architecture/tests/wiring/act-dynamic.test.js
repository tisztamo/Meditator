// Dynamism: a hand added to <m-act> at RUNTIME (after load) must register itself, the
// same way the statically-wired hands do. The whole point of the deferred-A.define order
// fix is that m-act upgrades before its hands, so its "capability" listener is attached;
// that same listener is still there when a hand is appended later, so the late hand's
// fire is caught. No loader involvement, no per-hand wiring.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let act, savedDry;

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1" cooldown="0s">
          <m-look name="look" latitude="47.4979" longitude="19.0402"></m-look>
        </m-act>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(60);
    act = document.querySelector('[name="hands"]');
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
});

test("the statically-wired hand registered (baseline)", () => {
    expect(act._capabilities.map(c => c.name)).toContain("look");
});

test("a hand appended at runtime registers itself", async () => {
    // m-look's tag is already defined (loaded), so appending a fresh instance upgrades it
    // immediately → its onConnect fires "capability" → m-act's standing listener catches it.
    const late = document.createElement("m-look");
    late.setAttribute("name", "look-late");
    late.setAttribute("latitude", "47.4979");
    late.setAttribute("longitude", "19.0402");
    act.appendChild(late);
    await delay(20);

    const names = act._capabilities.map(c => c.name);
    expect(names).toContain("look");          // the original is still there
    expect(names).toContain("look-late");     // and the runtime addition registered too
});
