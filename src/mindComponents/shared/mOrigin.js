import { MBaseComponent } from "./mBaseComponent.js"

// <m-origin> — the mind's ORIGIN: the single thing it was first set thinking
// about. The math problem for `lemma`; a question, a situation, an opening line
// for any other mind. It is the seed of the *thought*, deliberately separated
// from the seed of the *self* (the prose of <m-mind>, the standing system
// prompt / identity).
//
// Identity answers "who am I"; the origin answers "what was I given." The two
// behave differently in time:
//
//   - The IDENTITY is placed in every attention frame, forever — it is who the
//     mind is.
//   - The ORIGIN works like an opening user query: it seeds only the FIRST
//     thought of a freshly-born mind, then is let go. Thereafter it lives (or
//     fades) in memory as the mind's origin story — whatever consolidation
//     chose to keep. It is NOT re-stated in every frame, and a mind that wakes
//     up remembering is never re-seeded (re-injecting would deny it its own
//     forgetting). See mMind.js → _seedIfFresh().
//
// WIRING (doc/architecture/decoupling.md): the mind must never reach in and read
// this element's content with a querySelector. So m-origin is a PRODUCER — it
// publishes its text on the `prompt` topic (the MBaseComponent default, from a
// `prompt="…"` attribute or its text content) — and m-mind SUBSCRIBES through an
// auto-discovered, overridable `originSrc` ref, exactly as it mirrors memory's
// `tail` and the hands' `embodiment`. Hence it needs a `name` so the ref has a
// path: <m-origin name="origin">…</m-origin>. No behaviour beyond publishing.

export class MOrigin extends MBaseComponent {}
