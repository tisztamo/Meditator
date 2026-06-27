import { MBaseComponent } from "./mBaseComponent.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mSociety.js")

/**
 * A SOCIETY of minds — a container holding several <m-mind>s that run together in one
 * process and may overhear one another (doc/architecture/multi-mind.md). The first
 * recursive object: a society is a node with the same membrane a single mind has, so
 * it can itself nest inside another society later.
 *
 * Like m-region, it is almost pure marker — no thinking of its own. Its job is to be a
 * clean structural anchor:
 *
 *   - closest('m-society') gives any descendant its enclosing society (the third
 *     relative-ref anchor beside m-mind and m-region), so cross-mind wiring is
 *     addressed society-relative: an m-ear's from="..m-society/<member>/voice/spoken"
 *     resolves THROUGH the society to a NAMED member mind. Member names must be unique
 *     within the society; component names inside a mind (stream, voice, …) need not be.
 *
 *   - it nests the members' memory under ONE folder: a mind inside an
 *     <m-society name="duet"> homes at memory/duet/<mind>/ instead of memory/<mind>/
 *     (src/infrastructure/memoryVault.js → mindHome). One society, one folder, a
 *     subfolder per member.
 *
 * Each member keeps its OWN faculties (stream, memory, arbiter, transport) bound with
 * mind-relative refs, so members do not interfere; the only thing that crosses a mind's
 * membrane is what an m-ear is wired to overhear.
 *
 * @interface
 * Attributes:
 *   - name: the society's label and shared memory-folder name.
 */
export class MSociety extends MBaseComponent {
    onConnect() {
        const members = Array.from(this.children)
            .filter(c => (c.tagName || "").toLowerCase() === "m-mind")
            .map(c => c.getAttribute("name") || "?")
        log.info(`Society "${this.attr("name") || "society"}" of ${members.length} minds: ${members.join(", ")}`)
    }
}
