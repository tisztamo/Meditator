import A from "amanita";
import { getPref, setPref } from "./studioPrefs.js";

/**
 * studio-panes — the mobile pane switcher (class="panebar", hidden on the desktop
 * three-column layout). A segmented control that picks which column is visible on
 * a narrow screen by setting `data-pane` on the <main> view, persisting the choice.
 * It subscribes to `/conn/focused` so focusing a mind jumps to the Stream pane
 * (otherwise the always-visible selector keeps covering it).
 *
 * It replaces the inline <script> the page used to carry, folding the switcher
 * into the mesh: it reads focus from a topic instead of `studio-conn.on(…)`, and
 * reaches the <main> view through a declared `/view/` ref rather than
 * `document.querySelector("main")`.
 */
export class StudioPanes extends A(HTMLElement) {
  onConnect() {
    this.innerHTML =
      `<button data-pane="minds">Minds</button>` +
      `<button data-pane="stream">Stream</button>` +
      `<button data-pane="structure">Structure</button>`;
    this.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (b) this.setPane(b.dataset.pane, true);
    });
    this.setPane(getPref("pane", "minds"), false);
    // Focusing a mind jumps to the Stream pane so the selector stops blocking it.
    // /conn/focused covers a focus *change* (incl. reload-restore); /conn/revealStream
    // also fires when re-tapping the already-focused mind (which focus() dedups), so a
    // tap in the Minds pane always lands on that mind's stream.
    this.sub("/conn/focused", id => { if (id) this.setPane("stream", true); }, 12);
    this.sub("/conn/revealStream", () => this.setPane("stream", true), 12);
  }

  setPane(p, persist) {
    const main = this.el("/view/");
    if (main) main.setAttribute("data-pane", p);
    for (const b of this.querySelectorAll("button")) b.classList.toggle("active", b.dataset.pane === p);
    if (persist) setPref("pane", p);
  }
}
A.define("studio-panes", StudioPanes);
