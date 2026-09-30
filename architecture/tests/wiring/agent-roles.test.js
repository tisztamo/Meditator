// The agent finds its parts by role, not by tag (message-rule review §2.8). m-agent
// used to find `m-reason` and `m-context[name]` with querySelector and decided it
// was a service by "has an <m-ws> or <m-console>", so a substitute reasoner, working
// memory or port under its own tag left the agent unable to start, forgetful, or
// retiring after one task. These tests run the loop on custom tags that only
// provide the roles.
import "./setup.js";
import { test, expect, afterEach } from "bun:test";
import { delay } from "./setup.js";
import { waitFor } from "./contracts/helpers.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js";

// A reasoner that answers every turn with a plain reply naming how many messages it saw.
class XReasoner extends MBaseComponent {
    static provides = { reasoner: true }
    onConnect() {
        this.sub("!scope/turn", turn => {
            if (!turn?.messages) return
            queueMicrotask(() => this.pub("reply", { text: `saw ${turn.messages.length}`, tool_calls: [], finish_reason: "stop" }))
        }).catch(() => {})
    }
}
// A port with no transport: it only marks the agent as reachable.
class XPort extends MBaseComponent { static provides = { port: true } }
// A working memory that restores a transcript from nowhere.
class XContext extends MBaseComponent {
    static provides = { context: true }
    onConnect() {
        this.pub("restore", { messages: [{ role: "user", content: "restored task" }], step: 3 })
    }
}
for (const [tag, cls] of [["x-reasoner", XReasoner], ["x-port", XPort], ["x-context", XContext]]) {
    if (!customElements.get(tag)) customElements.define(tag, cls)
}

afterEach(async () => {
    document.body.replaceChildren()
    await delay(20)
})

async function wake(html) {
    document.body.innerHTML = html
    await loadMindComponents(document)
    const agent = document.querySelector("m-agent")
    const done = []
    agent.addEventListener("done", e => done.push(e.detail))
    await waitFor(() => agent._alive)
    return { agent, done }
}

test("a reasoner under its own tag and name runs the loop", async () => {
    const { agent, done } = await wake(`
      <m-agent name="solo" toolSettleMs="0">
        <m-objective name="objective">Say something.</m-objective>
        <x-reasoner name="thinker"></x-reasoner>
      </m-agent>`)
    await waitFor(() => done.length)
    expect(done[0].answer).toBe("saw 1")
    expect(agent._retired).toBe(true)   // no port: a one-shot agent retires
})

test("a port under its own tag makes the agent a service", async () => {
    const { agent, done } = await wake(`
      <m-agent name="svc" toolSettleMs="0">
        <x-reasoner name="thinker"></x-reasoner>
        <x-port name="door"></x-port>
      </m-agent>`)
    expect(agent._taskActive).toBe(false)   // no objective: it waits for a task
    agent.fire("task", { text: "first" })
    await waitFor(() => done.length)
    expect(done.length).toBe(1)
    expect(agent._retired).toBe(false)      // and returns to idle after it
})

test("a nested sub-agent's port is its own, not the parent's", async () => {
    const { agent, done } = await wake(`
      <m-agent name="parent" toolSettleMs="0">
        <m-objective name="objective">Say something.</m-objective>
        <x-reasoner name="thinker"></x-reasoner>
        <m-agent name="child" role="subagent"><x-port name="door"></x-port></m-agent>
      </m-agent>`)
    await waitFor(() => done.length)
    expect(agent._retired).toBe(true)
})

test("a working memory under its own tag restores the transcript", async () => {
    const { agent, done } = await wake(`
      <m-agent name="resumer" toolSettleMs="0">
        <x-reasoner name="thinker"></x-reasoner>
        <x-context name="memo"></x-context>
      </m-agent>`)
    await waitFor(() => done.length)
    expect(agent._messages[0]).toEqual({ role: "user", content: "restored task" })
    expect(done[0].answer).toBe("saw 1")
})
