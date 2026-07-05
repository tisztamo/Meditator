import A from "amanita"
import { seedPos, anchorOnRing, applyStep, extractInfoton, envelope, ENERGY, SPACE_DEFAULTS } from "./infoton.js"

/**
 * Base component class for all mind components.
 * Extends the Amanita-enhanced HTMLElement with common functionality.
 *
 * ## The Plenum (doc/architecture/plenum.md)
 * Every component inside a space (an enclosing <m-society> or <m-mind>) holds a
 * position — PRIVATE state, seeded deterministically at connect. Movement happens
 * only inside message delivery: each delivery carries an infoton (explicitly as a
 * `detail.infoton` envelope stamped by fire(), or implicitly as the resolved
 * subscription target whose position the receiver reads), and the RECEIVER applies
 * one displacement step toward the source. Nobody owns the space: there is no
 * position registry, no tick, no force layer — cost is proportional to messages.
 *
 * Opt-outs: `space="off"` on any component; `static spaceParticipates = false` on a
 * class (m-ws — the camera does not gravitate); `spacePinned` attr or
 * `static spacePinnedDefault` (m-mind, m-society) to hold position while still
 * acting as a source (the paper's pinned-coordinator trick).
 *
 * @interface
 * Topics published to:
 *   - "prompt": Published on connect with the component's prompt content
 */
export class MBaseComponent extends A(HTMLElement) {
    pos = null        // {x,y,z} in the enclosing space, or null when outside any space
    _space = null     // cached {root, I, td} — space attrs are static after load

    connectedCallback() {
        this._spaceInit()
        super.connectedCallback()
    }

    /**
     * Called when the component is connected to the DOM
     * Publishes the component's prompt content
     */
    onConnect() {
        this.pub("prompt", this.getPrompt())
    }

    // Offer a hand up to its assembler (m-act) as a bubbling event; see efference.md / decoupling.md.
    offerCapability(spec) {
        this.fire("capability", spec)
    }

    // ------------------------------------------------------------- the Plenum

    /** Join the enclosing space: resolve the root and params, seed my position.
     *  Parents connect before children (document-order upgrades), so the parent's
     *  position exists to spawn near. */
    _spaceInit() {
        if (this.constructor.spaceParticipates === false) return
        if (this.attr("space") === "off") return
        const root = this.closest("m-society") || this.closest("m-mind")
        if (!root) return
        this._space = {
            root,
            I: Number(root.getAttribute("spaceI")) || SPACE_DEFAULTS.I,
            td: Number(root.getAttribute("spaceTd")) || SPACE_DEFAULTS.td,
        }
        const pinnedAttr = this.attr("spacePinned")
        this._spacePinned = pinnedAttr != null && pinnedAttr !== ""
            ? pinnedAttr === "true"
            : this.constructor.spacePinnedDefault === true
        const tag = (this.tagName || "").toLowerCase()
        if (this === root) {
            this.pos = { x: 0, y: 0, z: 0 }
        } else if (tag === "m-mind" && (root.tagName || "").toLowerCase() === "m-society"
                   && this.parentElement === root) {
            // A society member's anchor: the runtime twin of the viewer's cluster ring.
            const minds = Array.from(root.children).filter(c => (c.tagName || "").toLowerCase() === "m-mind")
            this.pos = anchorOnRing(minds.indexOf(this), minds.length, this._space.td)
        } else {
            let parent = this.parentElement
            while (parent && parent !== root && !parent.pos) parent = parent.parentElement
            this.pos = seedPos(this._spacePath(), (parent && parent.pos) || null, this._space.td)
        }
    }

    /** A deterministic identity for seeding: the tag#childIndex chain from the
     *  space root down to this element — stable across wakes for the same archml. */
    _spacePath() {
        const parts = []
        let el = this
        while (el && el !== this._space.root && el.parentElement) {
            const idx = Array.prototype.indexOf.call(el.parentElement.children, el)
            parts.unshift(`${(el.tagName || "").toLowerCase()}#${idx}`)
            el = el.parentElement
        }
        return parts.join("/")
    }

    /** Apply one infoton to myself — the receiver-side step (doc §3.3). Public so
     *  a component receiving messages outside the sub() path (m-interrupts' raw
     *  addEventListener) can apply the envelope it found. */
    applyInfoton(infoton) {
        if (!this.pos || this._spacePinned || !infoton) return
        const next = applyStep(this.pos, infoton, this._space)
        if (next) this.pos = next
    }

    /** Subscribe, with the Plenum's implicit carrier: each delivery applies one
     *  infoton to the receiver — the explicit `detail.infoton` envelope when the
     *  message carries one (a relayed voice), else a unit pull toward the resolved
     *  subscription target (the direct sender, read at delivery — equivalent to the
     *  attached infoton up to a microtask, in-process). Replays of retained values
     *  are not new messages: deliveries before the descriptor resolves are skipped
     *  (the replay microtask always runs first), spending each infoton exactly once. */
    async sub(ref, cb, optsOrTrycount) {
        if (!this._space || (cb && cb._plenumWrapped)) return super.sub(ref, cb, optsOrTrycount)
        const holder = { target: null, armed: false }
        const wrapped = (value, old) => {
            if (holder.armed && this.pos && !this._spacePinned) {
                const env = extractInfoton(value)
                if (env) this.applyInfoton(env)
                else if (holder.target && holder.target !== this && holder.target.pos
                         && holder.target._space && holder.target._space.root === this._space.root) {
                    this.applyInfoton({ pos: holder.target.pos, energy: ENERGY.implicit, sign: 1 })
                }
            }
            return cb(value, old)
        }
        // A resub re-subscribes with the stored (already wrapped) cb — never double-wrap.
        // Note the stale-holder tradeoff: after a resub the implicit carrier keeps the
        // original target reference; minds never reRender, so this stays theoretical.
        wrapped._plenumWrapped = true
        const desc = await super.sub(ref, wrapped, optsOrTrycount)
        holder.target = (desc && desc.target) || null
        holder.armed = true
        return desc
    }

    /** Fire, with the Plenum's explicit carrier: an object payload is stamped with
     *  an infoton envelope — a SNAPSHOT of my position at send time (paper-exact) —
     *  so relays (m-commons) can forward it and the final receiver pulls toward the
     *  true origin, not the relay. `opts.energy` sizes the dose (doc §3.4);
     *  default is the stimulus-scale unit. */
    fire(name, detail = null, opts = {}) {
        if (this.pos && detail && typeof detail === "object" && !detail.infoton && Object.isExtensible(detail)) {
            const env = envelope(this.pos, opts.energy ?? ENERGY.stimulus, 1)
            if (env) { try { detail.infoton = env } catch { /* sealed/exotic payloads stay unstamped */ } }
        }
        return super.fire(name, detail, opts)
    }

    /**
     * Retrieves prompt content from various sources
     * Checks named components, prompt attribute, m-prompt child, or direct text content
     *
     * @param {string} [promptName] - Optional name of a child component to get prompt from
     * @returns {string} The prompt content
     */
    getPrompt(promptName) {
        if (promptName) {
            const namedEl = this.querySelector(`[name="${promptName}"]`)
            if (namedEl && namedEl.getPrompt) {
                return namedEl.getPrompt()
            }
            console.debug(`Could not find element with name "${promptName}" that has getPrompt() method`)
        }

        const promptAttr = this.attr("prompt")
        if (promptAttr) {
            return promptAttr
        }
        const promptEl = this.querySelector("m-prompt")
        if (promptEl) {
            return promptEl.textContent
        }
        return getDirectTextContent(this)
    }
}

/**
 * Extracts only the direct text content from an element, ignoring child elements
 *
 * @param {Element} element - The element to extract text from
 * @returns {string} The extracted text content
 */
function getDirectTextContent(element) {
    let text = ""
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent.trim() + "\n"
        }
    }
    return text
}
