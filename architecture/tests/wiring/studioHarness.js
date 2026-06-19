// A fake Studio hub for pane wiring tests. It is the real StudioConn — so its
// command routing (run) and topic shapes are exactly what ships — with the
// WebSocket stubbed out: it keeps the "studio-command" listener and the topic
// fan-out, but never opens a socket. send() records messages, so a test can
// dispatch a command from a pane and assert what reached the wire.
import "./setup.js";
import A from "amanita";
import { StudioConn } from "../../../src/studio/ui/studioConn.js";

class TestConn extends StudioConn {
  sent = [];
  onConnect() {
    // The real onConnect also calls connect() (a WebSocket) and wires visibility;
    // we keep only the UP-path listener so the hub routes commands without a socket.
    this.addEventListener("studio-command", e => this.run(e.detail));
  }
  send(obj) { this.sent.push(obj); }
}
if (!customElements.get("test-conn")) A.define("test-conn", TestConn);

/** Mount a fake hub named "conn" wrapping `inner`; returns { hub, el }. */
export function mountHub(inner) {
  document.body.innerHTML = `<test-conn name="conn">${inner}</test-conn>`;
  const hub = document.querySelector("test-conn");
  return { hub, el: hub.firstElementChild };
}

/** A hub that is never connected (no onConnect, no socket) — for driving run()
 *  directly to assert the command→message mapping. */
export function detachedHub() {
  return document.createElement("test-conn");
}
