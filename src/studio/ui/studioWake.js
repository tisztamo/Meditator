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

    this.select.addEventListener("change", () => this.renderDet());
    this.profileSelect.addEventListener("change", () => this.renderDet());
    this.dryRunBox.addEventListener("change", () => this.renderDet());
    this.wakeBtn.addEventListener("click", () => {
      const a = this.selected();
      if (a) this.el("/conn/").wake(a.file, this.dryRunBox.checked, this.selectedProfile());
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
    const groups = { main: [], test: [] };
    for (const a of this.archList) (groups[a.group] || groups.main).push(a);
    const addGroup = (label, arr) => {
      if (!arr.length) return;
      const og = document.createElement("optgroup"); og.label = label;
      for (const a of arr) { const o = document.createElement("option"); o.value = a.file; o.textContent = `${a.name || a.file}  ·  ${a.file}`; og.appendChild(o); }
      this.select.appendChild(og);
    };
    addGroup("architectures", groups.main);
    addGroup("tests", groups.test);
    if (prev && this.archList.some(a => a.file === prev)) this.select.value = prev;
    this.renderDet();
  }

  renderDet() {
    const a = this.selected();
    if (!a) {
      this.det.innerHTML = "";
      this.modelDet.innerHTML = "";
      this.wakeBtn.disabled = true;
      return;
    }
    const dry = this.dryRunBox.checked;
    const home = dry ? `memory/dry-${a.homeSlug}` : a.home;
    const hi = a.homeInfo || {};
    const profile = this.selectedProfile();
    const resolved = (a.profileResolution && profile && a.profileResolution[profile]) || {};
    const archParts = [];
    const tier = dry ? "dry-run" : (hi.tier && hi.tier !== "none" ? hi.tier : "new");
    const tierCls = tier === "resident" ? "ok" : (tier === "retired" ? "warn" : "");
    const tierBadge = `<span class="${tierCls}"${tierCls ? "" : ' style="color:var(--faint)"'}>tier: ${esc(tier)}</span>`;
    archParts.push(`→ <span class="home">${esc(home)}</span> ${dry ? `<span class="ok">(fresh dry-run home)</span>` : (hi.exists ? `<span class="ok">(existing memory · ${hi.files} entr${hi.files === 1 ? "y" : "ies"})</span>` : `<span>(new memory)</span>`)} · ${tierBadge}`);
    if (a.description) archParts.push(`<span style="color:var(--faint);font-style:italic">${esc(a.description)}</span>`);
    if (!a.hasWs) archParts.push(`<span class="warn">⚠ no &lt;m-ws&gt; — it will run, but has no live window to watch</span>`);
    if (a.sharesHomeWith && a.sharesHomeWith.length) archParts.push(`<span class="warn">⚠ shares this memory (same identity) with: ${a.sharesHomeWith.map(esc).join(", ")}</span>`);
    let busyBlock = false;
    if (!dry && a.busy) { busyBlock = true; archParts.push(`<span class="block">⛔ this memory is held by a running mind — sleep it first, enable dry-run, or give it its own name/memory=</span>`); }
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
