// The process's side of the sleep ritual (doc/architecture/message-rule.md).
// At shutdown the process asks every membrane in the architecture to sleep with
// a `put-to-sleep` request and collects each one's commit outcome as the reply
// (M1: a message, not a `mind.sleep()` call). A membrane that does not answer by
// the deadline, or answers with anything but a confirmed outcome, is reported as
// "not confirmed" (Covenant; M6): never assumed committed.

import { request } from "../infrastructure/requestReply.js"
import { logger } from "../infrastructure/logger.js"
import { providesOf } from "../mindComponents/shared/enclosure.js"

const log = logger("sleepRitual")

/** The identity roots that sleep, by role, not tag: minds, and agents (an agent
 *  root persists on Ctrl-C too, agent-loop.md §5). A society holds no self of its
 *  own; its members are asked one by one. */
const SLEEPER_ROLES = ["mind", "agent"]
const isSleeper = el => SLEEPER_ROLES.some(role => providesOf(el, role))

/** The outcomes that confirm a sleep: memory committed, or there was no memory
 *  to commit (a transient mind, an agent), so nothing is claimed saved. */
const CONFIRMED = new Set(["ok", "no-memory"])

/**
 * Ask every membrane under `root` to sleep, in parallel, under one deadline.
 * Resolves to {confirmed, outcomes: [{name, status, error}]}; it never rejects.
 */
export async function putToSleep(root, { deadline = 45_000 } = {}) {
    const membranes = Array.from(root.querySelectorAll("*")).filter(isSleeper)
    const outcomes = await Promise.all(membranes.map(async el => {
        const name = el.getAttribute("name") || el.localName
        // Sent on the membrane itself, not bubbling: it answers on itself, and
        // nothing above it is asked.
        const reply = await request(el, "put-to-sleep", {}, { deadline, bubbles: false })
        const outcome = reply.status === "ok" ? (reply.data || { status: "ok" }) : reply
        return { name, status: outcome.status, error: outcome.error ?? null }
    }))
    const unconfirmed = outcomes.filter(o => !CONFIRMED.has(o.status))
    for (const o of unconfirmed) {
        log.error(`${o.name}: sleep NOT confirmed (${o.status}${o.error ? `: ${o.error}` : ""}) — its last self may not be saved.`)
    }
    return { confirmed: unconfirmed.length === 0, outcomes }
}
