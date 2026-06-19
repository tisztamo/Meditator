import A from "amanita";
import { esc } from "./helpers.js";

/**
 * studio-wake — the "wake a mind" panel (class="wake", inheriting the existing
 * .wake CSS). An architecture <select> grouped into architectures/tests, a model
 * profile <select>, a live detail line resolving the target memory home with
 * collision / busy / no-window warnings, a dry-run toggle, and the Wake button.
 * Ports renderArchSelect / selectedArch / renderArchDet. Wake →
 * studio-conn.wake(); the rail's ⟳ → studio-conn.refresh().
 */
export class StudioWake extends A(HTMLElement) {
  archList = [];
  profiles = [];
  defaultProfile = null;
  connOn = false;

  onConnect() {
    this.innerHTML = `
      <h4>wake a mind</h4>
      <select class="arch-select"></select>
      <label class="field name-field" hidden>
        <span class="lbl">mind name</span>
        <input type="text" class="name-input" autocomplete="off" spellcheck="false" placeholder="a fresh name">
      </label>
      <div class="det arch-det"></div>
      <label class="field">
        <span class="lbl">model profile</span>
        <select class="profile-select"></select>
      </label>
      <div class="det model-det"></div>
      <div class="row">
        <label class="dry"><input type="checkbox" class="dry-run"> dry-run <span style="color:var(--faint)">(offline, free)</span></label>
        <button class="wake-btn">Wake</button>
      </div>`;
    this.select = this.querySelector(".arch-select");
    this.profileSelect = this.querySelector(".profile-select");
    this.det = this.querySelector(".arch-det");
    this.modelDet = this.querySelector(".model-det");
    this.dryRunBox = this.querySelector(".dry-run");
    this.wakeBtn = this.querySelector(".wake-btn");
    this.nameField = this.querySelector(".name-field");
    this.nameInput = this.querySelector(".name-input");

    // A new architecture selection re-seeds the name with the server's fresh
    // suggestion; editing it after that is the "semi-automatic" override.
    this.select.addEventListener("change", () => { this.prefillName(); this.renderDet(); });
    this.profileSelect.addEventListener("change", () => this.renderDet());
    this.dryRunBox.addEventListener("change", () => this.renderDet());
    this.nameInput.addEventListener("input", () => this.renderDet());
    this.wakeBtn.addEventListener("click", () => {
      const a = this.selected();
      if (!a) return;
      this.el("/conn/").wake(a.file, this.dryRunBox.checked, this.selectedProfile(), this.chosenName(a));
      // Let the next architectures broadcast (the new mind changes the roster)
      // re-seed the field with the now-incremented suggestion, so back-to-back
      // tuning runs auto-advance seedling-7 → seedling-8 without a re-select.
      this._prefilledFile = undefined;
    });
    const r = document.getElementById("archRefresh");
    if (r) r.addEventListener("click", () => this.el("/conn/").refresh());

    this.sub("/conn/profiles", list => { this.profiles = list || []; this.renderProfileSelect(); }, 12);
    this.sub("/conn/defaultProfile", p => { this.defaultProfile = p; this.renderProfileSelect(); }, 12);
    this.sub("/conn/architectures", list => { this.archList = list || []; this.renderSelect(); }, 12);
    this.sub("/conn/connState", on => {
      this.connOn = !!on;
      this.profileSelect.disabled = !this.connOn;
      this.renderDet();
    }, 12);
  }

  selected() { return this.archList.find(a => a.file === this.select.value); }

  selectedProfile() {
    return this.profileSelect.value || this.defaultProfile || this.profiles[0] || null;
  }

  /** A transient template offers a fresh, editable instance name; a fixed-home
   *  (resident) architecture does not. */
  offersName(a) { return !!(a && a.suggestedName); }

  /** Client-side mirror of the server's slugify, for the live home preview. */
  slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  /** The name to wake with: the field value (or the suggestion) for a transient
   *  template, else null — then the file's own name drives the home. */
  chosenName(a) {
    if (!this.offersName(a)) return null;
    return (this.nameInput.value || "").trim() || a.suggestedName || null;
  }

  /** Re-seed the name field from the selected architecture's fresh suggestion —
   *  but only when the selection actually changed, so an incidental roster refresh
   *  never clobbers a name the user has typed for the mind they're about to wake. */
  prefillName() {
    const a = this.selected();
    const file = a ? a.file : null;
    if (file === this._prefilledFile) return;
    this._prefilledFile = file;
    if (this.offersName(a)) { this.nameInput.value = a.suggestedName || ""; this.nameField.hidden = false; }
    else { this.nameInput.value = ""; this.nameField.hidden = true; }
  }

  renderProfileSelect() {
    const prev = this.profileSelect.value;
    this.profileSelect.innerHTML = "";
    for (const p of this.profiles) {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p === this.defaultProfile ? `${p} (studio default)` : p;
      this.profileSelect.appendChild(o);
    }
    const fallback = this.defaultProfile || this.profiles[0] || "";
    if (prev && this.profiles.includes(prev)) this.profileSelect.value = prev;
    else if (fallback) this.profileSelect.value = fallback;
    this.renderDet();
  }

  renderSelect() {
    const prev = this.select.value;
    this.select.innerHTML = "";
    // A non-selectable placeholder so a fresh load auto-selects nothing — waking a
    // mind is a deliberate pick, never whatever happened to sort first (the catalog
    // may be entirely research-preview minds, which should never be a default).
    const ph = document.createElement("option");
    ph.value = ""; ph.disabled = true; ph.textContent = "— choose an architecture —";
    this.select.appendChild(ph);
    const groups = { main: [], experimental: [], test: [] };
    for (const a of this.archList) (groups[a.group] || groups.main).push(a);
    const addGroup = (label, arr) => {
      if (!arr.length) return;
      const og = document.createElement("optgroup"); og.label = label;
      for (const a of arr) { const o = document.createElement("option"); o.value = a.file; o.textContent = `${a.experimental ? "⚠ " : ""}${a.name || a.file}  ·  ${a.file}`; og.appendChild(o); }
      this.select.appendChild(og);
    };
    addGroup("architectures", groups.main);
    addGroup("research preview · work in progress", groups.experimental);
    addGroup("tests", groups.test);
    // Keep an explicit prior pick across refreshes; otherwise rest on the placeholder.
    this.select.value = (prev && this.archList.some(a => a.file === prev)) ? prev : "";
    this.prefillName();
    this.renderDet();
  }

  renderDet() {
    const a = this.selected();
    if (!a) {
      this.det.innerHTML = "";
      this.modelDet.innerHTML = "";
      this.nameField.hidden = true;
      this.wakeBtn.disabled = true;
      return;
    }
    const dry = this.dryRunBox.checked;
    // A transient template's instance name drives its own fresh home; the catalog's
    // tier/exists/busy info describes the template's PREFIX home, so it does not
    // apply to a named instance (the server's guards are the real backstop on wake).
    const named = this.chosenName(a);
    const slug = named ? this.slug(named) : a.homeSlug;
    const home = `memory/${dry ? "dry-" : ""}${slug}`;
    const hi = named ? {} : (a.homeInfo || {});
    const profile = this.selectedProfile();
    const resolved = (a.profileResolution && profile && a.profileResolution[profile]) || {};
    const archParts = [];
    const tier = dry ? "dry-run" : (named ? "new" : (hi.tier && hi.tier !== "none" ? hi.tier : "new"));
    const tierCls = tier === "resident" ? "ok" : (tier === "retired" ? "warn" : "");
    const tierBadge = `<span class="${tierCls}"${tierCls ? "" : ' style="color:var(--faint)"'}>tier: ${esc(tier)}</span>`;
    archParts.push(`→ <span class="home">${esc(home)}</span> ${dry ? `<span class="ok">(fresh dry-run home)</span>` : (hi.exists ? `<span class="ok">(existing memory · ${hi.files} entr${hi.files === 1 ? "y" : "ies"})</span>` : `<span>(new memory)</span>`)} · ${tierBadge}`);
    if (a.description) archParts.push(`<span style="color:var(--faint);font-style:italic">${esc(a.description)}</span>`);
    if (!a.hasWs) archParts.push(`<span class="warn">⚠ no &lt;m-ws&gt; — it will run, but has no live window to watch</span>`);
    if (!named && a.sharesHomeWith && a.sharesHomeWith.length) archParts.push(`<span class="warn">⚠ shares this memory (same identity) with: ${a.sharesHomeWith.map(esc).join(", ")}</span>`);
    let busyBlock = false;
    if (!named && !dry && a.busy) { busyBlock = true; archParts.push(`<span class="block">⛔ this memory is held by a running mind — sleep it first, enable dry-run, or give it its own name/memory=</span>`); }
    if (!named && !dry && hi.exists && tier === "transient") { busyBlock = true; archParts.push(`<span class="block">⛔ transient mind with existing memory — restarts create an illusion of continuity. To force for testing: MEDITATOR_FORCE_TRANSIENT=1 bun run meditator.js -a ${esc(a.file)}</span>`); }
    // Research-preview minds (lab/ or stage="experimental") lead with a plain warning:
    // they are tuning artifacts, not a polished companion to talk to.
    if (a.experimental) archParts.unshift(`<span class="warn">⚠ research preview — a work-in-progress mind from our tuning runs; it may not be a happy or conversational companion yet.</span>`);
    this.det.innerHTML = archParts.join("<br>");

    const voiceRef = a.model || "voice";
    const utilRef = a.utilityModel || "utility";
    const voice = resolved.resolvedVoice || a.resolvedVoice || voiceRef;
    const util = resolved.resolvedUtility || a.resolvedUtility || utilRef;
    const modelParts = [
      `<span>voice: ${esc(voiceRef)}${voice !== voiceRef ? ` → ${esc(voice)}` : ""}</span>`
      + ` · <span>utility: ${esc(utilRef)}${util !== utilRef ? ` → ${esc(util)}` : ""}</span>`
      + `${a.pace ? ` · pace ${esc(a.pace)}` : ""}`,
    ];
    this.modelDet.innerHTML = modelParts.join("<br>");

    this.wakeBtn.disabled = !this.connOn || busyBlock;
  }
}
A.define("studio-wake", StudioWake);
