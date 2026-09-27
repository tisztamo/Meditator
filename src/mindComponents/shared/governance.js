// Governance as messages (doc/architecture/message-rule.md; review §5 row "proposal").
//
// Between reason and act an agent asks its governors about each tool call. The
// question is a `proposal` request carrying plain data, {agent, name, args}. Each
// governor answers with a decision (design-agents-norms-codex.md, "Norm decision
// shape"):
//
//   {decision: "permit"}                    the call may run as proposed
//   {decision: "deny", reason}              veto
//   {decision: "modify", patch, reason?}    the call runs with {...args, ...patch}
//
// Before the message rule a governor called `proposal.deny()` / `proposal.hold()`
// and mutated `proposal.args`, and the agent read all three back the moment the
// event returned (M3). An asynchronous policy (an LLM norm) now simply answers
// later: the reply is the hold.
//
// Quorum (M6, monotone authority). The agent's governors are its parts that
// provide the `governor` role, counted by name when it proposes (M4: a lookup that
// yields names, never a handle). It waits until every one of them has answered or
// one has denied, for at most the deadline. A governor that has not answered by
// then denies, and so does one whose decision threw: a missing norm never counts as
// permission. With no governor the call proceeds at once, unchanged: a bare agent is
// ungoverned (agent-loop.md §6).
//
// Composition (codex, "Norm decision ordering"). Any deny stops the call. Patches
// apply in the governors' tree order and the agent re-validates the result against
// the tool's schema, so a governor cannot patch a call into a shape the tool would
// reject. The proposal still bubbles, as it did, so an enclosing agent's governor
// can hear a nested agent's call; its deny counts if it arrives in time, but only
// the proposing agent's own governors are waited for.

import { requestAll, respond, responderName, rosterAnswered } from "../../infrastructure/requestReply.js"
import { part } from "./enclosure.js"

export const PROPOSAL_EVENT = "proposal"
export const GOVERNOR_ROLE = "governor"
export const DEFAULT_GOVERN_DEADLINE_MS = 60_000

const DENIED_BY_DEFAULT = "denied by a governing norm"

/** Normalize a governor's answer. `undefined` / `null` is a permit. */
export function decisionOf(answer) {
    if (answer == null) return { decision: "permit" }
    const decision = String(answer.decision || "permit")
    if (decision === "deny") return { decision, reason: String(answer.reason || DENIED_BY_DEFAULT) }
    if (decision === "modify") {
        const patch = answer.patch && typeof answer.patch === "object" && !Array.isArray(answer.patch) ? answer.patch : {}
        return answer.reason ? { decision, patch, reason: String(answer.reason) } : { decision, patch }
    }
    return { decision: "permit" }
}

/**
 * Governor side: answer the nearest agent's proposals. `decide(proposal)` gets
 * {agent, name, args, requestId} and returns a decision (or a Promise of one);
 * `undefined` permits, so a governor that does not cover a tool still answers and
 * the agent does not wait on it. Returns the subscription promise (rejects when no
 * agent is found).
 */
export function governProposals(el, decide, { src = "!scope/@proposal" } = {}) {
    return respond(el, PROPOSAL_EVENT, async proposal => decisionOf(await decide(proposal)), { src })
}

const denies = reply => reply.status === "ok" && reply.data?.decision === "deny"

/**
 * Agent side: ask this agent's governors about one call. Resolves to
 * {denied: reason | null, args}, never rejects.
 */
export async function proposeCall(agent, { name, args }, { deadline = DEFAULT_GOVERN_DEADLINE_MS } = {}) {
    const roster = part(agent, GOVERNOR_ROLE).map(responderName)
    const proposal = { agent: responderName(agent) || "agent", name, args: structuredClone(args ?? {}) }
    const { replies } = await requestAll(agent, PROPOSAL_EVENT, proposal, {
        deadline,
        until: rosterAnswered(roster, denies),
    })
    return composeDecisions(args, replies, roster)
}

/** Fold the replies into one outcome (see the module comment). Pure. */
export function composeDecisions(args, replies, roster = []) {
    const deny = replies.find(denies)
    if (deny) return { denied: deny.data.reason || DENIED_BY_DEFAULT, args }
    const failed = replies.find(r => r.status === "error")
    if (failed) return { denied: `governor error: ${failed.error}`, args }
    const left = [...roster]
    for (const r of replies) {
        const i = left.indexOf(r.from)
        if (i >= 0) left.splice(i, 1)
    }
    if (left.length) return { denied: `governor "${left[0]}" did not answer in time`, args }

    const rank = r => {
        const i = roster.indexOf(r.from)
        return i < 0 ? roster.length : i
    }
    let out = args
    for (const r of [...replies].sort((a, b) => rank(a) - rank(b))) {
        if (r.data?.decision === "modify") out = { ...out, ...r.data.patch }
    }
    return { denied: null, args: out }
}
