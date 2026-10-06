// A background job that is another agent (agent-loop.md §16), as messages
// (doc/architecture/message-rule.md). The lead's <m-jobs> never calls the
// sub-agent: it asks.
//
//   m-jobs ──agent-job {agent, task, jobId}──▶ (bubbles to the lead agent, which
//                                               stops it: a membrane-local request)
//   sub-agent, bound on the lead, answers only its own name:
//     busy      → reply {accepted: false, reason: "busy"} at once
//     otherwise → publishes `jobProgress {jobId, started: true}`, then one
//                 `jobProgress {jobId, text}` per step, and replies at the end
//                 {accepted: true, answer, isError}
//
// Kill and the wall-clock cap abort the request's signal: the seam's
// `request-cancel` follows the request's path to the lead, where the sub-agent
// hears it and stops its loop at a safe point. The progress topic is retained, so
// a subscriber may hear an earlier job's last value; it carries the jobId and m-jobs
// drops anything else.
import { respond } from "../../infrastructure/requestReply.js"

export const AGENT_JOB_REQUEST = "agent-job"
export const JOB_PROGRESS = "jobProgress"

/** The name m-jobs addresses a sub-agent by. */
export function subagentName(el) {
    return el?.getAttribute?.("name") || "subagent"
}

/**
 * Serve `agent-job` requests addressed to `agent` (by name), heard on its lead
 * (an address found by lookup at connect). `run(task, {jobId, signal})` resolves to
 * the task's outcome {answer, isError}; `busy()` turns work away. Returns the
 * listener, for removeEventListener on the lead.
 */
export function serveAgentJobs(agent, lead, { busy, run }) {
    return respond(agent, AGENT_JOB_REQUEST, async (detail, _event, { signal }) => {
        if (detail.agent !== subagentName(agent)) return undefined
        if (busy()) return { accepted: false, reason: "busy" }
        agent.pub(JOB_PROGRESS, { jobId: detail.jobId, started: true })
        const out = await run(String(detail.task ?? ""), { jobId: detail.jobId, signal })
        return { accepted: true, answer: String(out?.answer ?? ""), isError: !!out?.isError }
    }, { on: lead })
}
