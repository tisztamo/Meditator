// A fixture HAND for wiring tests: a real component that offers `spec` to the
// assembler it is appended to, exactly as m-look or m-note do — plain data in a
// `capability` offer, then answering the assembler's `call` requests with
// spec.execute (src/mindComponents/shared/hands.js). Tests use it instead of
// reaching into an assembler's registry, so they drive the message protocol.
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js";

class FixtureHand extends MBaseComponent {
    static spaceParticipates = false;
    spec = null;
    onConnect() {
        if (this.spec) this.offerCapability(this.spec);
    }
}
if (!customElements.get("t-fixture-hand")) customElements.define("t-fixture-hand", FixtureHand);

const menuOf = host => host._capabilities || host._tools || [];

/**
 * Append a fixture hand offering `spec` ({name, …, execute}) to assembler `host`
 * (m-act or m-agent). Resolves to the assembler's entry once the offer landed —
 * at once under synchronous dispatch, a delivery later under chaos.
 */
export async function offerFixtureHand(host, spec, { timeout = 1000 } = {}) {
    const hand = document.createElement("t-fixture-hand");
    hand.spec = spec;
    host.appendChild(hand);
    const end = Date.now() + timeout;
    let entry;
    while (!(entry = menuOf(host).find(c => c.name === spec.name)) && Date.now() < end) {
        await new Promise(r => setTimeout(r, 5));
    }
    return entry;
}
