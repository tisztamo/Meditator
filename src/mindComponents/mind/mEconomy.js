import { MBaseComponent } from "../shared/mBaseComponent.js"
import { getUsageTotals } from "../../modelAccess/llm.js"
import { logger } from '../../infrastructure/logger.js';

const log = logger('mEconomy.js');

/**
 * The mind's metabolism. Reads accumulated API usage at every burst boundary,
 * converts it to spend (OpenRouter reports true cost; otherwise estimated from
 * token counts), and exposes a pace factor that m-mind multiplies into its
 * inter-burst pause. A mind low on energy thinks more slowly; a mind out of
 * budget all but sleeps — it never dies, the watchdog still ticks.
 *
 * @interface
 * Attributes:
 *   - budget: USD for this run (default "1.00")
 *   - estInPrice / estOutPrice: USD per million tokens used only when the
 *     provider does not report cost (defaults 0.15 / 1.00)
 *
 * Topics published:
 *   - "energy" (0..1) — budget head-room, the metabolic reading
 *   - "spent" (USD)
 *   - "paceFactor" (≥1) — the inter-burst pause multiplier (derived from energy); m-mind mirrors it
 *   - "arousal" (0..1) — the mind's standing READINESS, published as a retained
 *     value other faculties can subscribe to and modulate themselves by (e.g. a
 *     tired mind raises its interrupt threshold). It currently tracks energy;
 *     it is the seam where future interoceptive signals (novelty, recent load)
 *     will combine. See doc/architecture/deep-structure.md → "A state bus".
 */
export class MEconomy extends MBaseComponent {
    energy = 1
    spent = 0
    arousal = 1
    _boundaries = 0

    onConnect() {
        this.sub(this.attr("boundarySrc") || "..m-mind/stream/@boundary", this._onBoundary)
    }

    _onBoundary = () => {
        const totals = getUsageTotals()
        const estimated = (totals.promptTokens * Number(this.attr("estInPrice") || 0.15)
            + totals.completionTokens * Number(this.attr("estOutPrice") || 1.0)) / 1e6
        this.spent = totals.cost > 0 ? totals.cost : estimated

        const budget = Number(this.attr("budget") || 1.0)
        const newEnergy = Math.max(0, Math.min(1, 1 - this.spent / budget))
        const crossed = this._band(newEnergy) !== this._band(this.energy)
        this.energy = newEnergy

        this.arousal = this.energy
        this.pub("energy", this.energy)
        this.pub("spent", this.spent)
        this.pub("paceFactor", this._paceFactor())
        this.pub("arousal", this.arousal)

        this._boundaries += 1
        if (this._boundaries % 10 === 0 || crossed) {
            log.info(`≈$${this.spent.toFixed(4)} spent of $${budget} (${totals.promptTokens} in / ${totals.completionTokens} out tokens, ${totals.requests} calls) — energy ${this.energy.toFixed(2)}, pace x${this._paceFactor()}`)
        }
    }

    _band(energy) {
        if (energy > 0.5) return "fresh"
        if (energy > 0.25) return "tiring"
        if (energy > 0.1) return "tired"
        if (energy > 0) return "exhausted"
        return "resting"
    }

    /** Multiplier for the mind's pace. */
    _paceFactor() {
        switch (this._band(this.energy)) {
            case "fresh": return 1
            case "tiring": return 2
            case "tired": return 4
            case "exhausted": return 10
            default: return 30
        }
    }
}
