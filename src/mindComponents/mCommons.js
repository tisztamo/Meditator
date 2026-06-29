import { MBaseComponent } from "./mBaseComponent.js"
import { logger } from "../infrastructure/logger.js"

const log = logger("mCommons.js")

/**
 * m-commons — a society-local relay for gossip-style multi-mind wiring.
 *
 * It subscribes to each named member's voice and republishes a single `gossip` topic:
 *   { speaker, text, at, sourceAt }
 *
 * Listeners then need one m-ear pointed at `..m-society/commons/gossip`, instead of
 * N-1 ears per mind. The relay stays on the pub/sub side of the membrane; ingress
 * into any particular mind still happens through that mind's own m-ear.
 *
 * Attributes:
 *   - name: the relay name, used in refs (usually "commons")
 *   - members: optional comma/space separated member names. If omitted, direct named
 *              children of the enclosing m-society are used, excluding this relay.
 *   - port: member egress component name (default "voice")
 *   - topic: member voice event name (default "spoken"; normalized to "@spoken")
 *
 * Publishes:
 *   - gossip: { speaker, text, at, sourceAt }
 */
export class MCommons extends MBaseComponent {
    onConnect() {
        super.onConnect()
        this._lastBySpeaker = new Map()
        this._seq = 0
        this._port = this.attr("port") || "voice"
        // A member's voice (`spoken`) is FIRED as a transient @event since the events
        // refactor (c699bba) — m-speech never pub()s it — so the relay must subscribe to
        // the EVENT form (".../voice/@spoken"), or it binds a behaviour-value that never
        // fires and goes silently deaf. `_relay` unwraps the CustomEvent's `.detail`.
        this._topic = this.attr("topic") || "spoken"
        const eventTopic = this._topic.startsWith("@") ? this._topic : `@${this._topic}`
        const members = this._members()
        for (const member of members) {
            const ref = `..m-society/${member}/${this._port}/${eventTopic}`
            this.sub(ref, msg => this._relay(member, msg), 12)
                .catch(err => log.warn(`could not bind ${ref}: ${err?.message || err}`))
        }
        log.info(`commons "${this.attr("name") || "commons"}" relaying ${members.join(", ") || "(none)"}`)
    }

    _members() {
        const explicit = (this.attr("members") || "")
            .split(/[,\s]+/)
            .map(s => s.trim())
            .filter(Boolean)
        if (explicit.length) return [...new Set(explicit)]

        const society = this.closest("m-society")
        if (!society) return []
        return Array.from(society.children)
            .filter(el => el !== this)
            .map(el => el.getAttribute("name"))
            .filter(Boolean)
    }

    _relay(speaker, raw) {
        // A fired voice delivers the CustomEvent (payload in `.detail`); a plain pub or the
        // unit harness delivers the payload directly; a bare string is the text itself.
        const msg = raw?.detail ?? raw
        const text = (typeof msg === "string" ? msg : msg?.text) || ""
        if (!text.trim()) return

        const sourceAt = typeof msg === "string" ? null : msg?.at
        if (sourceAt != null && this._lastBySpeaker.get(speaker) === sourceAt) return
        this._lastBySpeaker.set(speaker, sourceAt)

        this.pub("gossip", {
            speaker,
            text,
            at: `${speaker}:${sourceAt ?? ++this._seq}`,
            sourceAt,
        })
    }
}
