import A from "amanita"
import { MBaseComponent } from "./mBaseComponent.js"

// <m-objective> — an agent's OBJECTIVE: the single task it was set to. The twin of
// a mind's <m-origin> (mOrigin.js), and it behaves the same way: it is the seed of
// the WORK, held apart from the agent's CHARTER (the standing identity prose of
// <m-agent>).
//
// Charter answers "what kind of agent am I / how do I work"; the objective answers
// "what was I asked to do." They differ in time exactly as identity and origin do
// for a mind:
//
//   - The CHARTER is placed in the system turn of every step, forever.
//   - The OBJECTIVE seeds only the FIRST `user` turn of a freshly-woken agent, then
//     lives on inside the transcript like any other message. It is NOT re-stated in
//     every turn. (A service agent may carry no <m-objective> at all and instead
//     take its tasks as `user` turns over the membrane — see agent-loop.md §10.)
//
// WIRING (doc/architecture/decoupling.md): the agent must never reach in and read
// this element's content with a querySelector. So m-objective is a PRODUCER — it
// publishes its text on the `prompt` topic (the MBaseComponent default, from a
// `prompt="…"` attribute or its text content) — and m-agent SUBSCRIBES through an
// auto-discovered, overridable `objectiveSrc` ref, exactly as m-mind mirrors
// m-origin's `prompt`. Hence it needs a `name` so the ref has a path:
// <m-objective name="objective">…</m-objective>. No behaviour beyond publishing;
// overridable at wake with MEDITATOR_OBJECTIVE (applyObjectiveOverride), the twin
// of MEDITATOR_ORIGIN.

export class MObjective extends MBaseComponent {}

A.define("m-objective", MObjective)
