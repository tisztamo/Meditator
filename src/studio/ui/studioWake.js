import A from "amanita";
import { esc, command } from "./helpers.js";

/**
 * studio-wake — the "wake a mind" panel (class="wake", inheriting the existing
 * .wake CSS). An architecture <select> grouped into architectures/tests, a model
 * profile <select>, a live detail line resolving the target memory home with
 * collision / busy / no-window warnings, a dry-run toggle, and the Wake button.
 * Ports renderArchSelect / selectedArch / renderArchDet. Wake dispatches a "wake"
 * studio-command the hub routes; the rail's ⟳ is its own studio-refresh control.
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
        <span class="lbl name-label">mind name</span>
        <input type="text" class="name-input" autocomplete="off" spellcheck="false" placeholder="a fresh name">
      </label>
      <label class="field interloc-field" hidden>
        <span class="lbl">your name <span class="lbl-hint interloc-hint">— how the mind knows the person it talks with</span></span>
        <input type="text" class="interloc-input" autocomplete="off" spellcheck="false" placeholder="the person it talks with">
      </label>
      <div class="det arch-det"></div>
      <label class="field origin-field" hidden>
        <span class="lbl">origin story <span class="lbl-hint">— the mind's first thought, editable</span></span>
        <textarea class="origin-input" rows="6" spellcheck="false" placeholder="the seed this mind begins on"></textarea>
      </label>
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
    this.nameLabel = this.querySelector(".name-label");
    this.nameInput = this.querySelector(".name-input");
    this.originField = this.querySelector(".origin-field");
    this.originInput = this.querySelector(".origin-input");
    this.interlocField = this.querySelector(".interloc-field");
    this.interlocInput = this.querySelector(".interloc-input");
    this.interlocHint = this.querySelector(".interloc-hint");

    // A new architecture selection re-seeds the name, the origin story AND the
    // companion name with the selected mind's defaults; editing any after that is
    // the wake-time override.
    this.select.addEventListener("change", () => { this.prefillName(); this.prefillOrigin(); this.prefillInterloc(); this.renderDet(); });
    this.profileSelect.addEventListener("change", () => this.renderDet());
    this.dryRunBox.addEventListener("change", () => this.renderDet());
    this.nameInput.addEventListener("input", () => this.renderDet());
    this.wakeBtn.addEventListener("click", () => {
      const a = this.selected();
      if (!a) return;
      command(this, "wake", { file: a.file, dryRun: this.dryRunBox.checked, modelProfile: this.selectedProfile(), name: this.chosenName(a), origin: this.chosenOrigin(a), interlocutor: this.chosenInterloc(a), projectRoot: a.projectRoot });
      // Let the next architectures broadcast (the new mind changes the roster)
      // re-seed the fields with the now-incremented suggestion / fresh defaults, so
      // back-to-back tuning runs auto-advance seedling-7 → seedling-8 without a re-select.
      this._prefilledFile = undefined;
      this._prefilledOriginFile = undefined;
      this._prefilledInterlocFile = undefined;
    });

    this.sub("/conn/profiles", list => { this.profiles = list || []; this.renderProfileSelect(); }, 12);
    this.sub("/conn/defaultProfile", p => { this.defaultProfile = p; this.renderProfileSelect(); }, 12);
    this.sub("/conn/architectures", list => { this.archList = list || []; this.renderSelect(); }, 12);
    this.sub("/conn/connState", on => {
      this.connOn = !!on;
      this.profileSelect.disabled = !this.connOn;
      this.renderDet();
    }, 12);
  }

  /** A stable, project-unique key for an architecture (two projects may share a
   *  relative file path, e.g. lab/companion.archml, so the file alone is not unique). */
  key(a) { return a ? `${a.projectRoot || ""}::${a.file}` : ""; }

  selected() { return this.archList.find(a => this.key(a) === this.select.value); }

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
    const file = a ? this.key(a) : null;
    if (file === this._prefilledFile) return;
    this._prefilledFile = file;
    if (this.offersName(a)) { this.nameInput.value = a.suggestedName || ""; this.nameField.hidden = false; }
    else { this.nameInput.value = ""; this.nameField.hidden = true; }
  }

  /** Does the selected architecture carry an origin (a seed of thought) to edit? */
  offersOrigin(a) { return !!(a && a.origin); }

  /** The origin to wake with: the edited text, or null when it is empty or unchanged
   *  from the file's default (→ the file's own origin stands, no override sent). */
  chosenOrigin(a) {
    if (!this.offersOrigin(a)) return null;
    const v = (this.originInput.value || "").trim();
    if (!v || v === (a.origin || "").trim()) return null;
    return v;
  }

  /** Re-seed the editable origin story from the selected mind's default — but, like
   *  the name, only when the selection actually changed, so a roster refresh never
   *  clobbers an origin the user is in the middle of editing. */
  prefillOrigin() {
    const a = this.selected();
    const file = a ? this.key(a) : null;
    if (file === this._prefilledOriginFile) return;
    this._prefilledOriginFile = file;
    if (this.offersOrigin(a)) { this.originInput.value = a.origin || ""; this.originField.hidden = false; }
    else { this.originInput.value = ""; this.originField.hidden = true; }
  }

  /** The companion name to wake with: the field value when set and different from
   *  the file's default (else null — the file's own interlocutor="…", if any,
   *  stands and no override is sent). Unlike origin, every mind can have a
   *  companion, so this is offered for any selected architecture. */
  chosenInterloc(a) {
    const v = (this.interlocInput.value || "").trim();
    if (!v || v === ((a && a.interlocutor) || "").trim()) return null;
    return v;
  }

  /** Re-seed the companion field from the selected mind's default — only when the
   *  selection actually changed, so a roster refresh never clobbers a name the
   *  user is in the middle of typing (same guard as name/origin). */
  prefillInterloc() {
    const a = this.selected();
    const file = a ? this.key(a) : null;
    if (file === this._prefilledInterlocFile) return;
    this._prefilledInterlocFile = file;
    this.interlocInput.value = (a && a.interlocutor) || "";
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
    const groups = { main: [], agents: [], experimental: [], test: [] };
    for (const a of this.archList) (groups[a.group] || groups.main).push(a);
    const addGroup = (label, arr) => {
      if (!arr.length) return;
      const og = document.createElement("optgroup"); og.label = label;
      for (const a of arr) {
        const o = document.createElement("option");
        o.value = this.key(a);
        const kind = a.kind === "society" ? "multi-mind" : a.kind === "agent" ? "agent" : "mind";
        o.textContent = `${a.external ? `[${a.project}] ` : ""}${a.experimental ? "⚠ " : ""}${a.name || a.file}  ·  ${kind}  ·  ${a.file}`;
        og.appendChild(o);
      }
      this.select.appendChild(og);
    };
    addGroup("architectures", groups.main);
    addGroup("agents · tool-calling", groups.agents);
    addGroup("research preview · work in progress", groups.experimental);
    addGroup("tests", groups.test);
    // Keep an explicit prior pick across refreshes; otherwise rest on the placeholder.
    this.select.value = (prev && this.archList.some(a => this.key(a) === prev)) ? prev : "";
    this.prefillName();
    this.prefillOrigin();
    this.prefillInterloc();
    this.renderDet();
  }

  renderDet() {
    const a = this.selected();
    if (!a) {
      this.det.innerHTML = "";
      this.modelDet.innerHTML = "";
      this.nameField.hidden = true;
      this.originField.hidden = true;
      this.interlocField.hidden = true;
      this.wakeBtn.disabled = true;
      return;
    }
    if (this.nameLabel) this.nameLabel.textContent = a.kind === "society" ? "multi-mind name" : a.kind === "agent" ? "agent name" : "mind name";
    // Every entity can name its companion — for a mind it shapes the voice framing,
    // for an agent it is who the task-sender is (prefilled "user") — so the field is
    // offered for any selected architecture, pre-filled with its default.
    this.interlocField.hidden = false;
    if (this.interlocHint) this.interlocHint.textContent = a.kind === "agent" ? "— the name this agent knows you by" : "— how the mind knows the person it talks with";
    const dry = this.dryRunBox.checked;
    // A transient template's instance name drives its own fresh home; the catalog's
    // tier/exists/busy info describes the template's PREFIX home, so it does not
    // apply to a named instance (the server's guards are the real backstop on wake).
    const named = this.chosenName(a);
    const slug = named ? this.slug(named) : a.homeSlug;
    const homeBase = a.external ? `${a.project}/memory` : "memory";
    const home = `${homeBase}/${dry ? "dry-" : ""}${slug}`;
    const hi = named ? {} : (a.homeInfo || {});
    const profile = this.selectedProfile();
    const resolved = (a.profileResolution && profile && a.profileResolution[profile]) || {};
    const archParts = [];
    const tier = dry ? "dry-run" : (named ? "new" : (hi.tier && hi.tier !== "none" ? hi.tier : "new"));
    const tierCls = tier === "resident" ? "ok" : (tier === "retired" ? "warn" : "");
    const tierBadge = `<span class="${tierCls}"${tierCls ? "" : ' style="color:var(--faint)"'}>tier: ${esc(tier)}</span>`;
    archParts.push(`→ <span class="home">${esc(home)}</span> ${dry ? `<span class="ok">(fresh dry-run home)</span>` : (hi.exists ? `<span class="ok">(existing memory · ${hi.files} entr${hi.files === 1 ? "y" : "ies"})</span>` : `<span>(new memory)</span>`)} · ${tierBadge}`);
    if (a.kind === "society") {
      const members = Array.isArray(a.members) ? a.members.length : 0;
      const surface = a.surface || {};
      const face = surface.face ? `face <b>${esc(surface.face)}</b>` : "face unspecified";
      const ear = surface.ear ? `ear <b>${esc(surface.ear)}</b>` : "ear inferred from websocket";
      const mouth = surface.mouth ? `mouth <b>${esc(surface.mouth)}</b>` : "mouth inferred from voice";
      archParts.push(`<span class="ok">multi-mind</span> <span style="color:var(--faint)">· ${members} member${members === 1 ? "" : "s"} · ${face} · ${ear} · ${mouth}${surface.declared ? "" : " · inferred"}</span>`);
    }
    if (a.description) archParts.push(`<span style="color:var(--faint);font-style:italic">${esc(a.description)}</span>`);
    if (!a.hasWs) archParts.push(`<span class="warn">⚠ no &lt;m-ws&gt; — it will run, but has no live window to watch</span>`);
    if (!named && a.sharesHomeWith && a.sharesHomeWith.length) archParts.push(`<span class="warn">⚠ shares this memory (same identity) with: ${a.sharesHomeWith.map(esc).join(", ")}</span>`);
    let busyBlock = false;
    if (!named && !dry && a.busy) { busyBlock = true; archParts.push(`<span class="block">⛔ this memory is held by a running mind — sleep it first, enable dry-run, or give it its own name/memory=</span>`); }
    if (!named && !dry && hi.exists && tier === "transient") { busyBlock = true; archParts.push(`<span class="block">⛔ transient mind with existing memory — restarts create an illusion of continuity. To force for testing: MEDITATOR_FORCE_TRANSIENT=1 bun run meditator.js -a ${esc(a.file)}</span>`); }
    // Research-preview minds (lab/ or stage="experimental") lead with a plain warning:
    // they are tuning artifacts, not a polished companion to talk to.
    if (a.experimental) archParts.unshift(`<span class="warn">⚠ research preview — a work-in-progress mind from our tuning runs; it may not be a happy or conversational companion yet.</span>`);
    // An external project (a spinoff on this runtime) wakes into its OWN vault.
    if (a.external) archParts.unshift(`<span class="ok">project: ${esc(a.project)}</span> <span style="color:var(--faint)">— wakes into ${esc(a.project)}'s own vault & graveyard</span>`);
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
