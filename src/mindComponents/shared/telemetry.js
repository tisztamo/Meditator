// Telemetry as a message (review §2.1, §7 step 9).
//
// Before this, m-ws found each faculty by tag (`mind.querySelector("m-memory")`)
// and subscribed to its topics, some read back by method (`memory.getTail()`,
// `economy.paceFactor`), so a new faculty needed an edit to the transport and a
// substitute `<my-memory name="memory">` went silent in the Studio. Now a faculty
// that wants to be seen says so:
//
//   telemetry {process, kind, data}      (bubbling; the membrane stops it)
//
// `process` and `kind` name the Studio's event route (`memory/state`,
// `act/acted`), `data` is the plain payload the Studio renders. The transport
// forwards whatever it hears under its membrane and knows no faculty. A payload's
// own `kind` field (the loop sense's) is kept apart from the route by `data`.
//
// A record is an event, so one fired before the transport subscribed is gone. A
// faculty whose state matters from the start (memory's loaded story) also answers
//
//   telemetry-wanted {}                  (fired by the transport once it listens)
//
// by firing its current state again. It is heard on the membrane, and the
// membrane stops it.
//
// Telemetry is observation, so it carries only the implicit infoton dose (the
// transport itself stays out of the space).

import { ENERGY } from "./infoton.js"

export const TELEMETRY_EVENT = "telemetry"
export const TELEMETRY_WANTED = "telemetry-wanted"

/** Fire one telemetry record from `el` (an MBaseComponent). */
export function telemetry(el, process, kind, data = {}) {
  el.fire(TELEMETRY_EVENT, { process, kind, data }, { energy: ENERGY.implicit })
}

/** Call `announce` whenever a transport under `el`'s membrane asks for state. */
export function onTelemetryWanted(el, announce) {
  return el.sub(`!scope/@${TELEMETRY_WANTED}`, () => announce()).catch(() => {})
}
