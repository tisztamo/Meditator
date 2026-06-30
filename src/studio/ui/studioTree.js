import A from "amanita";
import { esc, clock, fmt } from "./helpers.js";
import { getPref, setPref } from "./studioPrefs.js";

/**
 * studio-tree — the focused mind's component structure (id="tree", inheriting
 * the existing #tree CSS). It renders the parsed .archml as a collapsible tree and
 * opens each process for inspection: a per-node event feed, live pulse, status
 * line, and (for m-mind) the assembled attention-frame inspector.
 *
 * It subscribes to every "event" and renders only the structural side (feeds /
 * pulses / stats) — the stream pane handles the prose side of the same events
 * and the header handles the gauge. Ports renderStructure / buildNode / pushNode /
 * pulse / setNodeStat / originNode / onFrame / onBid / onDecision / onEnergy /
 * onMemoryState / onCompressed / onFiled / onImpulse from the old monolith.
 */
export class StudioTree extends A(HTMLElement) {
  nodes = { byId: {}, byName: {}, byTag: {}, byScopedName: {}, byScopedTag: {} };
  lastFrame = null;

  onConnect() {
    this.sub("/conn/@focusReset", () => this.reset()).catch(() => {});
    this.sub("/conn/structure", tree => this.renderStructure(tree)).catch(() => {});
    this.sub("/conn/@event", e => this.onEvent(e.detail)).catch(() => {});
  }

  reset() { this.innerHTML = ""; this.nodes = { byId: {}, byName: {}, byTag: {}, byScopedName: {}, byScopedTag: {} }; this.lastFrame = null; }

  // ------------------------------------------------------------- the tree
  renderStructure(tree) {
    this.innerHTML = ""; this.nodes = { byId: {}, byName: {}, byTag: {}, byScopedName: {}, byScopedTag: {} };
    // Per-node open-states, keyed by path, persisted so reopening a mind restores
    // what you had expanded. Loaded once per build; _setOpen writes through.
    this._openStates = getPref("treeOpen", {});
    if (tree) this.appendChild(this.buildNode(tree, 0, "", 0, null));
  }

  /** Narrow screens (the mobile breakpoint) open only the root by default, so the
   *  tree isn't a wall of expanded panes on a phone. */
  _narrow() {
    try { return !!(globalThis.matchMedia && globalThis.matchMedia("(max-width:900px)").matches); }
    catch { return false; }
  }

  _setOpen(path, open) { this._openStates[path] = open; setPref("treeOpen", this._openStates); }

  buildNode(node, depth, parentPath, idx, member) {
    const nodeMember = node.tag === "m-mind" ? node.name : member;
    const seg = `${node.name || node.tag}`;
    const path = parentPath ? `${parentPath}>${idx}:${seg}` : seg;
    const det = document.createElement("details"); det.className = "node";
    // Restore a saved open-state if we have one; otherwise apply the default: the
    // root is always open, and on wide screens the stream/speech/image panes too.
    const saved = this._openStates[path];
    const open = saved !== undefined
      ? saved
      : depth === 0 || (!this._narrow() && (node.tag === "m-stream" || node.tag === "m-speech" || node.tag === "m-image"));
    // Setting .open=true queues one toggle event; swallow it so only genuine user
    // toggles persist (closed nodes set no attribute, so they fire nothing).
    det._skipToggle = open === true;
    det.open = open;
    det.addEventListener("toggle", () => {
      if (det._skipToggle) { det._skipToggle = false; return; }
      this._setOpen(path, det.open);
    });
    const sum = document.createElement("summary");
    sum.innerHTML = `<span class="tw">▶</span><span class="npulse"></span><span class="nname"></span> <span class="ntag"></span><span class="nstat"></span>`;
    sum.querySelector(".nname").textContent = node.name || node.tag;
    sum.querySelector(".ntag").textContent = node.name ? node.tag : "";
    det.appendChild(sum);
    const body = document.createElement("div"); body.className = "nbody";
    const attrs = node.attrs || {}; const keys = Object.keys(attrs).filter(k => k !== "name");
    if (keys.length) {
      const ab = document.createElement("div"); ab.className = "attrs";
      for (const k of keys) { const s = document.createElement("span"); s.className = "attr"; s.innerHTML = `<b>${esc(k)}</b> ${esc(attrs[k])}`; ab.appendChild(s); }
      body.appendChild(ab);
    }
    if (node.text) { const t = document.createElement("div"); t.className = "ident"; t.textContent = node.text; body.appendChild(t); }
    const feed = document.createElement("div"); feed.className = "feed"; body.appendChild(feed);
    det.appendChild(body);
    if (node.children && node.children.length) {
      const kids = document.createElement("div"); kids.className = "kids";
      node.children.forEach((c, i) => kids.appendChild(this.buildNode(c, depth + 1, path, i, nodeMember)));
      det.appendChild(kids);
    }
    const rec = { det, feed, pulse: sum.querySelector(".npulse"), stat: sum.querySelector(".nstat"), tag: node.tag, name: node.name, member: nodeMember };
    const id = node.name ? `name:${node.name}` : `tag:${node.tag}`;
    this.nodes.byId[id] = rec;
    if (node.name && !this.nodes.byName[node.name]) this.nodes.byName[node.name] = rec;
    if (!this.nodes.byTag[node.tag]) this.nodes.byTag[node.tag] = rec;
    if (nodeMember) {
      if (node.name && !this.nodes.byScopedName[`${nodeMember}:${node.name}`]) this.nodes.byScopedName[`${nodeMember}:${node.name}`] = rec;
      if (!this.nodes.byScopedTag[`${nodeMember}:${node.tag}`]) this.nodes.byScopedTag[`${nodeMember}:${node.tag}`] = rec;
    }
    return det;
  }

  byTag(t, member = null) { return (member && this.nodes.byScopedTag[`${member}:${t}`]) || this.nodes.byTag[t] || null; }
  byName(n, member = null) { return (member && this.nodes.byScopedName[`${member}:${n}`]) || this.nodes.byName[n] || null; }
  pulse(rec) { if (!rec) return; rec.pulse.classList.add("on"); setTimeout(() => rec.pulse.classList.remove("on"), 320); }
  setNodeStat(rec, text) { if (rec) rec.stat.textContent = text; }
  pushNode(rec, html) {
    if (!rec) return;
    this.pulse(rec);
    const stick = rec.feed.scrollHeight - rec.feed.scrollTop - rec.feed.clientHeight < 30;
    const div = document.createElement("div"); div.className = "ev"; div.innerHTML = html; rec.feed.appendChild(div);
    while (rec.feed.children.length > 40) rec.feed.removeChild(rec.feed.firstChild);
    if (stick) rec.feed.scrollTop = rec.feed.scrollHeight;
  }
  evLine(text, cls) { return `<span class="t">${clock()}</span> <span class="${cls || ""}">${esc(text)}</span>`; }
  originNode(type, d = null) {
    if (!type) return null;
    if (type.startsWith("Time-")) return this.nodeName(type.slice(5), d);
    if (type.startsWith("Observer-")) return this.nodeName(type.slice(9), d);
    if (type === "Association") return this.nodeTag("m-associate", d);
    if (type === "LoopGuard") return this.nodeTag("m-loop-guard", d);
    if (type === "UserInput") return this.nodeTag("m-ws", d);
    if (type === "ConsoleInput") return this.nodeTag("m-console", d);
    return null;
  }

  nodeTag(tag, d) { return this.byTag(tag, d && d.member); }
  nodeName(name, d) { return this.byName(name, d && d.member); }

  // ------------------------------------------------- events -> node feeds
  onEvent(d) {
    switch (`${d.process}/${d.kind}`) {
      case "mind/frame":         this.onFrame(d); break;
      case "stream/boundary":    this.pushNode(this.nodeTag("m-stream", d), this.evLine(`burst #${d.burstIndex} · ${d.burstChars}c · ${d.reason}`, d.reason === "completed" ? "good" : d.reason === "error" ? "bad" : "")); this.setNodeStat(this.nodeTag("m-stream", d), `#${d.burstIndex} ${d.reason}`); break;
      case "attention/bid":      this.onBid(d); break;
      case "attention/urgent":   this.pushNode(this.nodeTag("m-interrupts", d), this.evLine(`URGENT ${d.type}: ${d.type === "UserInput" ? d.reason : (d.text || d.reason || "")}`, "warn")); break;
      case "attention/decision": this.onDecision(d); break;
      case "economy/energy":     this.onEnergy(d); break;
      case "memory/state":       this.setNodeStat(this.nodeTag("m-memory", d), `tail ${fmt(d.tailLen)} · rec ${fmt(d.recentLen)} · sto ${fmt(d.storyLen)}`); break;
      case "memory/compressed":  this.onCompressed(d); break;
      case "scribe/filed":       this.onFiled(d); break;
      case "act/intent":         this.onIntent(d); break;
      case "act/acted":          this.onActed(d); break;
      case "speech/speaking":    this.pushNode(this.nodeTag("m-speech", d), this.evLine(d.speaking ? "started speaking" : "stopped speaking", d.speaking ? "warn" : "")); break;
      case "speech/impulse":     this.onImpulse(d); break;
      case "speech/boundary":    this.pushNode(this.nodeTag("m-speech", d), this.evLine(`said ${d.chars || 0}c · ${d.reason || ""}${d.text ? ` · "${d.text.slice(0, 120)}"` : ""}`, "good")); break;
      case "image/generating":   this.pushNode(this.nodeTag("m-image", d), this.evLine(d.generating ? "started image generation" : "finished image generation", d.generating ? "warn" : "")); break;
      case "image/impulse":      this.onImageImpulse(d); break;
      case "image/generated":    this.pushNode(this.nodeTag("m-image", d), this.evLine(`generated ${d.size || "image"} · ${d.model || ""}`, "good")); this.setNodeStat(this.nodeTag("m-image", d), d.size || "generated"); break;
      case "image/error":        this.pushNode(this.nodeTag("m-image", d), this.evLine(`error: ${d.message || "image generation failed"}`, "bad")); break;
    }
  }

  onFrame(d) {
    this.lastFrame = d;
    const mind = this.nodeTag("m-mind", d); if (!mind) return;
    this.pulse(mind); this.setNodeStat(mind, `frame: ${d.frameKind}`);
    let box = mind.feed.querySelector(".framebox");
    if (!box) { box = document.createElement("div"); box.className = "framebox"; mind.feed.prepend(box); }
    const sys = d.system ? `<span class="sys">— system —\n${esc(d.system)}\n\n</span>` : "";
    const instr = d.instruction ? `<span class="instr">— user (instruction) —\n${esc(d.instruction)}\n\n</span>` : "";
    const frame = d.frame ? `<span class="frame">— assistant (continuing) —\n${esc(d.frame)}</span>` : "";
    box.innerHTML = sys + instr + frame;
  }
  onBid(d) {
    const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
    // Use the canonical rendered text (renderForFrame()) — the same string the model saw.
    // Exception: for UserInput, show the raw words the person typed, not the internal narrative.
    const displayText = d.type === "UserInput" ? d.reason : (d.text || d.reason || "");
    const line = `${d.urgent ? "⚡" : ""}${esc(d.type || "?")} <span class="sal">${sal}</span> — ${esc(displayText)}`;
    const attention = this.nodeTag("m-interrupts", d);
    this.pushNode(attention, `<span class="t">${clock()}</span> ${line}`);
    const o = this.originNode(d.type, d); if (o && o !== attention) this.pushNode(o, this.evLine(`bid ${sal}: ${displayText}`));
  }
  onDecision(d) {
    const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
    const cls = d.accepted ? "good" : "drop";
    const attention = this.nodeTag("m-interrupts", d);
    this.pushNode(attention, this.evLine(`${d.accepted ? "✓" : "✕"} ${d.type} ${sal} — ${d.why}`, cls));
    this.setNodeStat(attention, d.accepted ? `✓ ${d.type}` : `✕ ${d.why}`);
  }
  onEnergy(d) {
    const e = typeof d.energy === "number" ? d.energy : 1;
    const spent = typeof d.spent === "number" ? ` · $${d.spent.toFixed(3)}` : "";
    const econ = this.nodeTag("m-economy", d);
    this.setNodeStat(econ, `${e.toFixed(2)}${spent} · pace x${d.paceFactor || 1}`);
    this.pushNode(econ, this.evLine(`energy ${e.toFixed(2)}${spent} · pace x${d.paceFactor || 1}`));
  }
  onCompressed(d) {
    const memory = this.nodeTag("m-memory", d);
    this.pushNode(memory, this.evLine(`consolidated → recent ${fmt(d.recentLen)}c, story ${fmt(d.storyLen)}c`, "good"));
    if (d.recentPreview) this.pushNode(memory, `<span class="t">${clock()}</span> <span class="t">recent:</span> ${esc(d.recentPreview)}…`);
  }
  onFiled(d) {
    const kb = this.nodeTag("m-kb", d);
    this.pushNode(kb, this.evLine(`filed: ${(d.files || []).join(", ")}`, "good"));
    this.setNodeStat(kb, `filed ${(d.files || []).length}`);
  }
  onImpulse(d) {
    const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
    const cls = d.accepted ? "warn" : "drop";
    const tag = d.addressed ? "↩ " : "";
    // B1: Relabel the impulse gist as intent, not utterance. The actual spoken words
    // appear in the speech/boundary line, not here.
    const why = d.accepted ? "✓ wanted to say" : `— quiet (${d.reason || "none"})`;
    const speech = this.nodeTag("m-speech", d);
    this.pushNode(speech, this.evLine(`${tag}impulse ${sal} ${why}${d.gist ? ": " + d.gist : ""}`, cls));
    this.setNodeStat(speech, `${tag}${sal} ${d.accepted ? "✓" : "✕"}`);
  }
  onIntent(d) {
    const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
    const cls = d.accepted ? "warn" : "drop";
    const why = d.accepted ? "✓ reach" : `— quiet (${d.reason || "none"})`;
    const act = this.nodeTag("m-act", d);
    this.pushNode(act, this.evLine(`intent ${sal} ${why}${d.gist ? ": " + d.gist : ""}`, cls));
    this.setNodeStat(act, `${sal} ${d.accepted ? "✓" : "✕"}`);
  }
  onActed(d) {
    const cls = d.ok ? "good" : "bad";
    const consequence = d.experience ? `: ${d.experience}` : (d.ok ? "" : " (slipped)");
    const act = this.nodeTag("m-act", d);
    this.pushNode(act, this.evLine(`✋ ${d.capability}${consequence}`, cls));
    this.setNodeStat(act, `✋ ${d.capability}`);
  }
  onImageImpulse(d) {
    const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
    const cls = d.accepted ? "warn" : "drop";
    const why = d.accepted ? "✓ image" : `— quiet (${d.reason || "none"})`;
    const image = this.nodeTag("m-image", d);
    this.pushNode(image, this.evLine(`impulse ${sal} ${why}${d.prompt ? ": " + d.prompt : ""}`, cls));
    this.setNodeStat(image, `${sal} ${d.accepted ? "✓" : "✕"}`);
  }
}
A.define("studio-tree", StudioTree);
