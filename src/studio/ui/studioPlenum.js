import A from "amanita";
import { esc, fmt, clock, command } from "./helpers.js";

/**
 * studio-plenum — a 3D viewer for the currently available minds, prototyping the
 * Plenum of doc/architecture/chora-imagined.md (Part 2) over what we run TODAY.
 *
 * The focused entity (a mind, or a whole society) is rendered as a bounded 3D
 * space: every component of every member is a glowing node, structural edges are
 * faint filaments, and the live telemetry the Studio already receives becomes the
 * space's dynamics:
 *
 *   - EVENT PULSES: an attention bid travels from its origin faculty to the
 *     arbiter; an accepted decision travels on into the mind; speech leaves the
 *     voice for the commons; a heard peer voice arcs from the commons into an ear.
 *   - INFOTON CO-LOCATION (the doc's first force): every pulse deposits a decaying
 *     attraction between its two endpoints, so faculties that talk a lot literally
 *     drift together — the functional graph becomes a spatial clustering, live.
 *   - CHEMISTRY AS FIELDS: each mind sits in a diffuse aura — energy sets its
 *     glow, a detected loop turns it crimson, speaking makes it ripple.
 *   - THE SELF AS ANCHOR (D9): each m-mind node is pinned to its home position;
 *     its faculties arrange themselves around it.
 *
 * The scene reads as an OBSERVATORY PLATE: every faculty family owns a glyph
 * silhouette (shape is the second identity channel besides color — it survives
 * where hues blur), the constellation hangs above a surveyed ground reticle each
 * mind drops a plumb line to, and clicking a faculty pins a live inspector card
 * carrying the same feed/stats the structure pane keeps.
 *
 * It is deliberately a prototype renderer (Canvas 2D, painter's algorithm, O(n²)
 * physics): tuned to look great for a ~6-mind society, not to scale.
 *
 * The launch button lives in the header (#plenumbtn, static in studio.html); this
 * component owns it, like studio-voice owns #voicebtn. Other live minds from the
 * roster appear as distant presence-orbs; clicking one refocuses the Studio on it.
 */

const TAU = Math.PI * 2;

// Family palette — the studio's accent hues, mapped to faculty families so color
// is informative: cyan consciousness, green memory, amber attention, violet
// membrane (voice/senses/world), coral hands, pale-gold metabolism.
export const PALETTE = {
  mind:      "#f2efe7",
  commons:   "#dfe6ff",
  stream:    "#7fe0f0",
  memory:    "#7ee2a8",
  attention: "#f2c879",
  membrane:  "#b79cf0",
  hands:     "#f0966f",
  economy:   "#e3d59a",
  good:      "#7ee2a8",
  bad:       "#e87f7f",
};

const FAMILY = {
  "m-mind": "mind", "m-agent": "mind", "m-society": "mind", "m-commons": "commons",
  "m-stream": "stream",
  "m-memory": "memory", "m-kb": "memory", "m-facts": "memory", "m-note": "memory", "m-recall": "memory",
  "m-interrupts": "attention", "m-timeout": "attention", "m-observer": "attention",
  "m-region": "attention", "m-associate": "attention", "m-loop-detector": "attention",
  "m-loop-guard": "attention", "m-clear-mind": "attention", "m-resurface": "attention",
  "m-speech": "membrane", "m-ear": "membrane", "m-ws": "membrane", "m-console": "membrane",
  "m-look": "membrane", "m-sense": "membrane", "m-origin": "membrane",
  "m-act": "hands", "m-terminal": "hands", "m-image": "hands",
  "m-economy": "economy",
};

/** The faculty family a tag belongs to (drives its color). Unknown leaves under
 *  m-act are hands (custom capabilities); anything else reads as attention-adjacent. */
export function familyOf(tag, parentTag) {
  if (FAMILY[tag]) return FAMILY[tag];
  if (parentTag === "m-act") return "hands";
  return "attention";
}

// Family glyphs — the second identity channel. Every family owns a silhouette:
// the self is a ringed planet, the commons a hexagonal plaza, consciousness a
// four-point star, memory a rounded slab, attention a diamond, the membrane an
// open ring (a boundary), hands a delta, and metabolism a battery cell whose
// live fill IS the mind's energy.
const SHAPE = {
  mind: "self", commons: "hub", stream: "star", memory: "slab",
  attention: "diamond", membrane: "ring", hands: "delta", economy: "cell",
};

/** The glyph a node renders as (self/hub/star/slab/diamond/ring/delta/cell). */
export function shapeOf(tag, family) {
  if (tag === "m-mind" || tag === "m-agent" || tag === "m-society") return "self";
  if (tag === "m-commons") return "hub";
  return SHAPE[family] || "diamond";
}

// The same silhouettes as 14×14 inline SVG (legend chips + the inspector header),
// authored with currentColor so one string serves every family hue.
const GLYPH_SVG = {
  self:    `<circle cx="7" cy="7" r="2.7" fill="currentColor"/><ellipse cx="7" cy="7" rx="6.1" ry="2.2" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(-17 7 7)"/>`,
  hub:     `<polygon points="7,1.4 11.9,4.2 11.9,9.8 7,12.6 2.1,9.8 2.1,4.2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="1.7" fill="currentColor"/>`,
  star:    `<path d="M7 .9 L8.8 5.2 L13.1 7 L8.8 8.8 L7 13.1 L5.2 8.8 L.9 7 L5.2 5.2 Z" fill="currentColor"/>`,
  slab:    `<rect x="2.6" y="2.6" width="8.8" height="8.8" rx="2.5" fill="currentColor"/>`,
  diamond: `<polygon points="7,1.3 12.7,7 7,12.7 1.3,7" fill="currentColor"/>`,
  ring:    `<circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="2.6"/>`,
  delta:   `<polygon points="7,1.7 12.5,11.8 1.5,11.8" fill="currentColor"/>`,
  cell:    `<rect x="4.5" y="3.2" width="5" height="9.2" rx="1.7" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="5.7" y="7.4" width="2.6" height="3.8" rx="1" fill="currentColor"/><rect x="5.8" y="1.3" width="2.4" height="1.5" fill="currentColor"/>`,
};

const glyphSVG = (shape, color, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 14 14" style="color:${color}" aria-hidden="true">${GLYPH_SVG[shape] || GLYPH_SVG.diamond}</svg>`;

/** Deterministic 0..1 from a string — stable node jitter across rebuilds. */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function nodeRadius(tag, depth) {
  if (tag === "m-mind" || tag === "m-agent") return 11;
  if (tag === "m-commons") return 9;
  if (tag === "m-origin") return 2.4;
  if (depth === 1) return 5.6;
  return 3.2;
}

/**
 * Build the render/physics graph from the wire structure tree (m-ws _serializeTree).
 * Pure — exported for tests. Returns { nodes, edges, clusters, byKey, hub, kind }.
 * Node keys: `${member}:${name}` and (first-wins) `${member}#${tag}`.
 */
export function buildGraph(tree) {
  const g = { nodes: [], edges: [], clusters: [], byKey: new Map(), hub: null, kind: tree ? tree.tag : null };
  if (!tree) return g;

  const addNode = (t, member, depth, parent, cluster) => {
    if (t.tag === "m-archetype") return null;          // a template, not a living faculty
    const id = `${member || ""}/${t.name || t.tag}/${g.nodes.length}`;
    const family = familyOf(t.tag, parent ? parent.tag : null);
    const node = {
      idx: g.nodes.length, id, tag: t.tag, name: t.name || null, member,
      family, color: PALETTE[family], shape: shapeOf(t.tag, family),
      r: nodeRadius(t.tag, depth), depth,
      attrs: t.attrs || {}, cluster,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      anchor: null, auth: null, heat: 0, last: null,
      feed: [], stat: null, v: 0,                      // live inspector state
      sx: 0, sy: 0, sz: 0, scale: 1,                   // projected, per frame
    };
    g.nodes.push(node);
    if (cluster) cluster.nodes.push(node);
    const nameKey = `${member || ""}:${t.name || ""}`;
    if (t.name && !g.byKey.has(nameKey)) g.byKey.set(nameKey, node);
    const tagKey = `${member || ""}#${t.tag}`;
    if (!g.byKey.has(tagKey)) g.byKey.set(tagKey, node);
    if (parent) {
      g.edges.push({ a: parent.idx, b: node.idx, rest: (depth <= 1 ? 46 : 24) + parent.r + node.r, traffic: 0 });
    }
    for (const c of t.children || []) addNode(c, member, depth + 1, node, cluster);
    return node;
  };

  const newCluster = member => {
    const c = { member, anchor: null, ax: 0, ay: 0, az: 0, nodes: [],
      energy: null, spent: null, speaking: false, loop: null, bursts: 0,
      mem: null, caption: null, frame: null, v: 0 };
    g.clusters.push(c);
    return c;
  };

  if (tree.tag === "m-society") {
    const minds = (tree.children || []).filter(c => c.tag === "m-mind");
    const rest = (tree.children || []).filter(c => c.tag !== "m-mind" && c.tag !== "m-archetype");
    // The commons (or any society-level organ) sits at the origin — the shared hub.
    for (const c of rest) {
      const n = addNode(c, null, 1, null, null);
      if (n && !g.hub) g.hub = n;
    }
    const R = minds.length > 1 ? Math.max(140, 70 + minds.length * 22) : 0;
    minds.forEach((m, i) => {
      const cluster = newCluster(m.name || `mind-${i}`);
      const ang = -Math.PI / 2 + (i / Math.max(1, minds.length)) * TAU;
      cluster.ax = Math.cos(ang) * R;
      cluster.az = Math.sin(ang) * R;
      cluster.ay = (i % 2 ? 1 : -1) * 16;
      const n = addNode(m, m.name || `mind-${i}`, 0, null, cluster);
      cluster.anchor = n;
    });
  } else {
    // A lone mind or an agent: one cluster centered at the origin.
    const cluster = newCluster(tree.name || tree.tag);
    cluster.anchor = addNode(tree, tree.name || tree.tag, 0, null, cluster);
  }

  // Initial positions: each node jittered (deterministically) around its cluster
  // anchor; the physics then settles the layout.
  for (const c of g.clusters) {
    for (const n of c.nodes) {
      const spread = n.depth === 0 ? 0 : n.depth === 1 ? 52 : 74;
      n.x = c.ax + (hash01(n.id + "x") - 0.5) * spread;
      n.y = c.ay + (hash01(n.id + "y") - 0.5) * spread * 0.7;
      n.z = c.az + (hash01(n.id + "z") - 0.5) * spread;
      if (n.depth === 0) { n.x = c.ax; n.y = c.ay; n.z = c.az; n.anchor = { x: c.ax, y: c.ay, z: c.az, k: 0.028 }; }
    }
  }
  if (g.hub) { g.hub.x = 0; g.hub.y = 0; g.hub.z = 0; g.hub.anchor = { x: 0, y: 0, z: 0, k: 0.2 }; }
  return g;
}

export class StudioPlenum extends A(HTMLElement) {
  active = false;
  focusedId = null;
  roster = [];
  tree = null;
  graph = buildGraph(null);
  faceName = null;             // the society member public events belong to
  pulses = [];                 // traveling lights: {a,b,t,dur,color,size}
  rings = [];                  // expanding circles: {node,t,dur,color,kind}
  pairHeat = new Map();        // "i|j" -> infoton co-location heat
  orbs = [];                   // distant presence-orbs for the other live minds
  hover = null;
  selected = null;
  pageHidden = false;
  _raf = 0;
  _lastT = 0;
  _lastSpeakRing = 0;
  _lastHud = 0;
  _cam = { theta: 0.6, phi: 0.32, dist: 470, fov: 560 };
  _lastInteract = 0;
  _pointers = new Map();
  _pinchDist = 0;
  _dust = null;

  onConnect() {
    this.innerHTML = `
      <canvas></canvas>
      <div class="pl-corners"></div>
      <div class="pl-top">
        <button class="pl-back" type="button" aria-label="Close the plenum">‹ Back</button>
        <div class="pl-title">
          <span class="pl-mark">◉ PLENUM</span>
          <span class="pl-name">no mind in focus</span>
          <span class="pl-kind" hidden></span>
        </div>
        <span class="pl-meta"></span>
      </div>
      <div class="pl-legend"></div>
      <div class="pl-info" hidden></div>
      <div class="pl-plate"></div>
      <div class="pl-hint">drag to orbit · scroll to zoom · click a faculty to inspect it live</div>`;
    this.canvas = this.querySelector("canvas");
    // No 2D context under jsdom (tests) — the graph/event logic still runs; only
    // the render loop needs the context (and rAF), so both are gated on it.
    const isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "");
    this.ctx = (!isJsdom && this.canvas && this.canvas.getContext) ? this.canvas.getContext("2d") : null;
    this.nameEl = this.querySelector(".pl-name");
    this.kindEl = this.querySelector(".pl-kind");
    this.metaEl = this.querySelector(".pl-meta");
    this.infoEl = this.querySelector(".pl-info");
    this.plateEl = this.querySelector(".pl-plate");
    this.legendEl = this.querySelector(".pl-legend");
    this._legend();

    this.querySelector(".pl-back").addEventListener("click", () => this.close());
    // The inspector's deselect button (the card is pointer-events:auto only when pinned).
    this.infoEl.addEventListener("click", e => {
      if (e.target.closest && e.target.closest(".pl-x")) { this.selected = null; this._info(true); }
    });
    this._onKey = e => { if (e.key === "Escape" && this.active) this.close(); };
    if (typeof document !== "undefined") document.addEventListener("keydown", this._onKey);

    // The launch button is static in the header; we own it (cf. studio-voice).
    this.launch = (typeof document !== "undefined") ? document.getElementById("plenumbtn") : null;
    if (this.launch) this.launch.addEventListener("click", () => this.toggle());

    this._wireInput();

    this.sub("/conn/focused", id => { this.focusedId = id; this._syncLaunch(); this._header(); }).catch(() => {});
    this.sub("/conn/roster", r => { this.roster = r || []; this._syncLaunch(); this._header(); this._rebuildOrbs(); }).catch(() => {});
    this.sub("/conn/structure", t => { this.tree = t || null; this.rebuild(); }).catch(() => {});
    this.sub("/conn/layout", p => this.onLayout(p)).catch(() => {});
    this.sub("/conn/@focusReset", () => { this.tree = null; this.rebuild(); }).catch(() => {});
    this.sub("/conn/@event", e => this.onEvent(e.detail)).catch(() => {});
    this.sub("/conn/@streamFragment", e => this.onFragment(e.detail)).catch(() => {});
    this.sub("/conn/hidden", h => { this.pageHidden = !!h; this._syncLoop(); }).catch(() => {});
  }

  onDisconnect() {
    if (this._onKey && typeof document !== "undefined") document.removeEventListener("keydown", this._onKey);
    this._stopLoop();
  }

  // ------------------------------------------------------------ open / close
  toggle() { this.active ? this.close() : this.open(); }

  open() {
    this.active = true;
    this.classList.add("show");
    this._resize();
    if (!this._ro && typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
    }
    this._header();
    this._syncLoop();
  }

  close() {
    this.active = false;
    this.classList.remove("show");
    this._syncLoop();
  }

  _syncLaunch() {
    if (this.launch) this.launch.hidden = !(this.roster && this.roster.length);
  }

  _syncLoop() {
    const wants = this.active && !this.pageHidden && !!this.ctx;
    if (wants && !this._raf) { this._lastT = 0; this._raf = requestAnimationFrame(t => this._frame(t)); }
    if (!wants) this._stopLoop();
  }

  _stopLoop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }

  _resize() {
    if (!this.canvas) return;
    const rect = this.getBoundingClientRect();
    const dpr = (typeof devicePixelRatio === "number" ? devicePixelRatio : 1) || 1;
    this._w = Math.max(1, rect.width);
    this._h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this._w * dpr);
    this.canvas.height = Math.round(this._h * dpr);
    this._dpr = dpr;
  }

  // ---------------------------------------------------------------- the graph
  rebuild() {
    // Preserve settled positions and warmth for nodes that survive the rebuild
    // (a reconnect resends the same structure).
    const old = new Map();
    for (const n of this.graph.nodes) old.set(`${n.member || ""}/${n.tag}/${n.name || ""}`, n);
    this.graph = buildGraph(this.tree);
    for (const n of this.graph.nodes) {
      const o = old.get(`${n.member || ""}/${n.tag}/${n.name || ""}`);
      if (o) { n.x = o.x; n.y = o.y; n.z = o.z; n.heat = o.heat; n.last = o.last; n.feed = o.feed; n.stat = o.stat; n.v = o.v; }
    }
    this.pulses = [];
    this.rings = [];
    this.pairHeat = new Map();
    this.selected = null;
    this.hover = null;
    this._infoKey = null;
    this._legend();
    if (!this._dust) {
      this._dust = [];
      for (let i = 0; i < 150; i++) {
        const u = hash01("du" + i) * TAU, v = Math.acos(2 * hash01("dv" + i) - 1);
        const r = 650 + hash01("dr" + i) * 500;
        this._dust.push({ x: r * Math.sin(v) * Math.cos(u), y: r * Math.cos(v) * 0.5, z: r * Math.sin(v) * Math.sin(u), a: 0.04 + hash01("da" + i) * 0.1 });
      }
    }
    this._header();
  }

  /** The glyph legend — shape + hue per family; the commons chip only when a hub exists. */
  _legend() {
    if (!this.legendEl) return;
    const rows = [
      ["mind", "self", "the self"],
      ...(this.graph.hub ? [["commons", "hub", "commons"]] : []),
      ["stream", "star", "consciousness"], ["memory", "slab", "memory"],
      ["attention", "diamond", "attention"], ["membrane", "ring", "voice & senses"],
      ["hands", "delta", "hands"], ["economy", "cell", "metabolism"],
    ];
    this.legendEl.innerHTML = `<span class="pl-legend-h">faculties</span>` +
      rows.map(([f, s, label]) => `<span class="pl-chip">${glyphSVG(s, PALETTE[f])}${label}</span>`).join("");
  }

  _focusedEntry() { return this.roster.find(x => x.id === this.focusedId) || null; }

  /** Which member public (untagged) events belong to: the society's face, else
   *  the sole cluster. */
  _face() {
    const m = this._focusedEntry();
    if (m && m.surface && m.surface.face) return m.surface.face;
    return this.graph.clusters.length === 1 ? this.graph.clusters[0].member : (this.graph.clusters[0] ? this.graph.clusters[0].member : null);
  }

  nByName(member, name) {
    if (!name) return null;
    return this.graph.byKey.get(`${member || ""}:${name}`) || this.graph.byKey.get(`:${name}`) || null;
  }
  nByTag(member, tag) {
    return this.graph.byKey.get(`${member || ""}#${tag}`) || this.graph.byKey.get(`#${tag}`) || null;
  }
  clusterOf(member) { return this.graph.clusters.find(c => c.member === member) || null; }

  // --------------------------------------------------- the runtime's own layout
  /**
   * A `layout` snapshot from the mind's m-ws (plenum.md §5): the space is CAUSAL in
   * the runtime now, so when positions arrive we render those — each matched node
   * lerps toward its runtime position and the local simulation lets go of it. The
   * local physics remains only for what the runtime doesn't position (a pre-plenum
   * mind, presence orbs, unmatched nodes). Null clears back to simulation.
   *
   * Matching mirrors m-ws's walk (same document order, same exclusions): named
   * entries pair by `member:name`; unnamed ones pair with the k-th unnamed graph
   * node of the same member+tag.
   */
  onLayout(positions) {
    if (!positions || !positions.length) {
      for (const n of this.graph.nodes) n.auth = null;
      return;
    }
    const unnamed = new Map();   // "member#tag" -> ordered unnamed graph nodes
    for (const n of this.graph.nodes) {
      if (n.name) continue;
      const key = `${n.member || ""}#${n.tag}`;
      if (!unnamed.has(key)) unnamed.set(key, []);
      unnamed.get(key).push(n);
    }
    const taken = new Map();     // "member#tag" -> how many unnamed entries consumed
    for (const p of positions) {
      let node = null;
      if (p.name) {
        node = this.graph.byKey.get(`${p.member || ""}:${p.name}`) || null;
      } else {
        const key = `${p.member || ""}#${p.tag}`;
        const k = taken.get(key) || 0;
        node = (unnamed.get(key) || [])[k] || null;
        taken.set(key, k + 1);
      }
      if (node) node.auth = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    }
  }

  // -------------------------------------------------------- events → dynamics
  /** The faculty a stimulus type originates from (the tree's originNode, spatial). */
  originNode(type, member) {
    if (!type) return null;
    if (type.startsWith("Time-")) return this.nByName(member, type.slice(5));
    if (type.startsWith("Observer-")) return this.nByName(member, type.slice(9));
    if (type.startsWith("Sense-")) return this.nByName(member, type.slice(6));
    if (type === "Association") return this.nByTag(member, "m-associate");
    if (type === "LoopGuard") return this.nByTag(member, "m-loop-guard");
    if (type === "Recall") return this.nByTag(member, "m-resurface");
    if (type === "Peer") return this.nByTag(member, "m-ear");
    if (type === "UserInput") return this.nByTag(member, "m-ws");
    if (type === "ConsoleInput") return this.nByTag(member, "m-console");
    if (type === "Waking" || type === "Origin") return this.nByTag(member, "m-memory");
    return null;
  }

  heatUp(node, amount) { if (node) node.heat = Math.min(1.6, node.heat + amount); }

  pulse(a, b, color, size = 1, dur = 900) {
    if (!a || !b || a === b) return;
    if (this.pulses.length > 240) this.pulses.shift();
    this.pulses.push({ a, b, t: 0, dur, color, size });
    this.heatUp(a, 0.25 * size);
    // The infoton: the message deposits attraction between its endpoints, so
    // faculties that talk drift together (chora-imagined.md Part 2, first force).
    const key = a.idx < b.idx ? `${a.idx}|${b.idx}` : `${b.idx}|${a.idx}`;
    this.pairHeat.set(key, Math.min(3, (this.pairHeat.get(key) || 0) + 0.6));
  }

  ring(node, color, kind = "burst", dur = 700) {
    if (!node) return;
    if (this.rings.length > 120) this.rings.shift();
    this.rings.push({ node, t: 0, dur, color, kind });
  }

  /** A per-faculty event line — the same feed the structure pane keeps, held on
   *  the node so selecting it in space replays its live history. */
  note(node, text, cls) {
    if (!node) return;
    node.feed.push({ t: clock(), text, cls: cls || "" });
    if (node.feed.length > 30) node.feed.shift();
    node.last = `${clock()} ${text}`;
    node.v++;
  }

  /** The node's one-line live status (the structure pane's summary stat). */
  stat(node, text) { if (node) { node.stat = text; node.v++; } }

  /** Cluster-level state changed (energy, memory, loop…): nudge the inspector. */
  poke(cl) { if (cl) cl.v++; }

  onFragment(f) {
    if (!f) return;
    const member = this._face();
    const node = f.kind === "speech" ? this.nByTag(member, "m-speech") : this.nByTag(member, "m-stream");
    this.heatUp(node, 0.05);
  }

  onEvent(d) {
    if (!d || !this.graph.nodes.length) return;
    const member = d.member || this._face();
    const cl = this.clusterOf(member);
    const mind = this.nByTag(member, "m-mind") || (cl && cl.anchor);
    const route = `${d.process}/${d.kind}`;
    const clip = s => (s || "").replace(/\s+/g, " ").slice(0, 90);

    // The loop sense: its payload's own `kind` (presence/content/void/…) overwrites
    // the route kind in m-ws's _emit spread, so match on the process alone.
    if (d.process === "loop") {
      if (cl) { cl.loop = d.active ? { kind: d.kind, vocabulary: d.vocabulary || [] } : null; this.poke(cl); }
      const det = this.nByTag(member, "m-loop-detector");
      if (d.active) this.note(det, `loop: ${d.kind} — ${clip((d.vocabulary || []).join(", "))}`, "bad");
      this.stat(det, d.active ? `⟳ ${d.kind}` : "clear");
      this.heatUp(det, d.active ? 0.6 : 0.1);
      return;
    }

    switch (route) {
      case "attention/bid": {
        const att = this.nByTag(member, "m-interrupts");
        const org = this.originNode(d.type, member);
        const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
        const text = clip(d.type === "UserInput" ? d.reason : (d.text || d.reason));
        // A heard peer arcs in from the commons hub through the ear — the
        // society's cross-talk made visible.
        if (d.type === "Peer" && this.graph.hub) this.pulse(this.graph.hub, org || att, PALETTE.membrane, 1.3, 1100);
        if (org && att) this.pulse(org, att, PALETTE.attention, 0.7 + Math.min(0.7, d.salience || 0));
        else this.heatUp(att || org, 0.3);
        this.note(org || att, `bid ${sal} — ${text}`);
        if (att && org && org !== att) this.note(att, `${d.urgent ? "⚡" : ""}${d.type || "?"} ${sal} — ${text}`);
        break;
      }
      case "attention/urgent": {
        const att = this.nByTag(member, "m-interrupts");
        const org = this.originNode(d.type, member);
        this.pulse(org || att, mind, "#ffffff", 1.6, 600);
        this.ring(att || mind, PALETTE.attention, "spark");
        this.note(att, `URGENT ${d.type}: ${clip(d.reason || d.text)}`, "warn");
        break;
      }
      case "attention/decision": {
        const att = this.nByTag(member, "m-interrupts");
        if (d.accepted) this.pulse(att, mind, PALETTE.good, 1.2);
        else this.ring(att, PALETTE.bad, "spark", 450);
        this.note(att, `${d.accepted ? "✓" : "✕"} ${d.type || ""} — ${clip(d.why)}`, d.accepted ? "good" : "drop");
        this.stat(att, d.accepted ? `✓ ${d.type || ""}` : `✕ ${clip(d.why)}`);
        break;
      }
      case "stream/boundary": {
        const stream = this.nByTag(member, "m-stream");
        this.ring(stream, PALETTE.stream, "burst");
        this.pulse(stream, this.nByTag(member, "m-memory"), PALETTE.memory, 0.6, 1100);
        if (cl) { cl.bursts++; this.poke(cl); }
        this.note(stream, `burst #${d.burstIndex} · ${fmt(d.burstChars)}c · ${d.reason}`,
          d.reason === "completed" ? "good" : d.reason === "error" ? "bad" : "");
        this.stat(stream, `#${d.burstIndex} ${d.reason}`);
        break;
      }
      case "mind/frame": {
        this.pulse(this.nByTag(member, "m-memory"), mind, PALETTE.memory, 0.4, 1200);
        // Keep the whole assembled frame — the inspector shows it for the self
        // node, like the structure pane's frame box.
        if (cl) { cl.frame = { kind: d.frameKind, system: d.system, instruction: d.instruction, frame: d.frame }; this.poke(cl); }
        this.stat(mind, `frame: ${d.frameKind || "?"}`);
        break;
      }
      case "memory/state": {
        if (cl) { cl.mem = { tail: d.tailLen, recent: d.recentLen, story: d.storyLen }; this.poke(cl); }
        this.stat(this.nByTag(member, "m-memory"), `tail ${fmt(d.tailLen)} · rec ${fmt(d.recentLen)} · sto ${fmt(d.storyLen)}`);
        break;
      }
      case "memory/compressed": {
        const mem = this.nByTag(member, "m-memory");
        this.ring(mem, PALETTE.memory, "implode", 900);
        this.note(mem, `consolidated → recent ${fmt(d.recentLen)}c · story ${fmt(d.storyLen)}c`, "good");
        break;
      }
      case "economy/energy": {
        if (cl) { cl.energy = typeof d.energy === "number" ? d.energy : cl.energy; cl.spent = d.spent; this.poke(cl); }
        const econ = this.nByTag(member, "m-economy");
        const e = typeof d.energy === "number" ? d.energy : 1;
        this.stat(econ, `${e.toFixed(2)}${typeof d.spent === "number" ? ` · $${d.spent.toFixed(3)}` : ""} · pace x${d.paceFactor || 1}`);
        this.heatUp(econ, 0.06);
        break;
      }
      case "speech/impulse": {
        const voice = this.nByTag(member, "m-speech");
        const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
        if (d.accepted) this.pulse(mind, voice, PALETTE.attention, 1);
        else this.ring(voice, PALETTE.attention, "spark", 400);
        this.note(voice, `impulse ${sal} ${d.accepted ? "✓" : "— quiet"}${d.gist ? ": " + clip(d.gist) : ""}`, d.accepted ? "warn" : "drop");
        this.stat(voice, `${sal} ${d.accepted ? "✓" : "✕"}`);
        break;
      }
      case "speech/speaking": {
        if (cl) { cl.speaking = !!d.speaking; this.poke(cl); }
        this.note(this.nByTag(member, "m-speech"), d.speaking ? "started speaking" : "stopped speaking", d.speaking ? "warn" : "");
        break;
      }
      case "speech/boundary": {
        const voice = this.nByTag(member, "m-speech");
        const out = this.graph.hub || this.nByTag(member, "m-ws");
        this.pulse(voice, out, PALETTE.attention, 1.6, 1200);
        this.ring(voice, PALETTE.attention, "burst", 900);
        if (cl && d.text) cl.caption = { text: clip(d.text) + ((d.text || "").length > 90 ? "…" : ""), t: 0, dur: 7000 };
        this.note(voice, `said ${fmt(d.chars)}c — ${clip(d.text)}`, "good");
        break;
      }
      case "act/intent": {
        const hands = this.nByTag(member, "m-act");
        const sal = typeof d.salience === "number" ? d.salience.toFixed(2) : "?";
        if (d.accepted) this.pulse(mind, hands, PALETTE.hands, 1);
        this.note(hands, `intent ${sal} ${d.accepted ? "✓" : "— quiet"}${d.gist ? ": " + clip(d.gist) : ""}`, d.accepted ? "warn" : "drop");
        this.stat(hands, `${sal} ${d.accepted ? "✓" : "✕"}`);
        break;
      }
      case "act/acted": {
        const hands = this.nByTag(member, "m-act");
        const leaf = this.nByName(member, d.capability) || hands;
        this.pulse(hands, leaf, PALETTE.hands, 1.2);
        this.pulse(leaf, mind, d.ok ? PALETTE.good : PALETTE.bad, 1.2, 1200);
        this.ring(leaf, d.ok ? PALETTE.good : PALETTE.bad, "spark");
        this.note(leaf, `✋ ${d.capability}${d.experience ? " — " + clip(d.experience) : d.ok ? "" : " (slipped)"}`, d.ok ? "good" : "bad");
        this.stat(hands, `✋ ${d.capability}`);
        break;
      }
      case "scribe/filed": {
        const kb = this.nByTag(member, "m-kb");
        this.ring(kb, PALETTE.memory, "spark");
        this.note(kb, `filed: ${clip((d.files || []).join(", "))}`, "good");
        this.stat(kb, `filed ${(d.files || []).length}`);
        break;
      }
      case "image/generating": {
        const img = this.nByTag(member, "m-image");
        this.heatUp(img, d.generating ? 0.8 : 0.1);
        this.note(img, d.generating ? "started image generation" : "finished image generation", d.generating ? "warn" : "");
        break;
      }
      case "image/generated": {
        const img = this.nByTag(member, "m-image");
        this.ring(img, PALETTE.membrane, "burst");
        this.note(img, `generated ${d.size || "image"} · ${d.model || ""}`, "good");
        this.stat(img, d.size || "generated");
        break;
      }
      case "image/error": {
        const img = this.nByTag(member, "m-image");
        this.ring(img, PALETTE.bad, "spark");
        this.note(img, `error: ${clip(d.message) || "image generation failed"}`, "bad");
        break;
      }
      case "agent/step": {
        this.heatUp(mind, 0.5);
        this.note(mind, `step ${d.index}${(d.calls || []).length ? " — " + d.calls.map(c => c.name).join(", ") : ""}`);
        this.stat(mind, `step ${d.index}`);
        break;
      }
      case "agent/answer": {
        this.ring(mind, PALETTE.good, "burst", 1200);
        this.note(mind, "answered", "good");
        break;
      }
    }
  }

  // -------------------------------------------------------------- the physics
  // A node with `auth` (a runtime position from the mind's own space — plenum.md §5)
  // is not simulated: it lerps to where the runtime says it is, and the local forces
  // neither move it nor read through it. The simulation remains for free nodes only.
  _step(dt) {
    const g = this.graph;
    const N = g.nodes.length;
    if (!N) return;
    const k = dt / 16.7;                               // normalize to 60fps steps

    // Structural springs.
    for (const e of g.edges) {
      const a = g.nodes[e.a], b = g.nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = 0.045 * (d - e.rest) / d * k;
      if (!a.auth) { a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; }
      if (!b.auth) { b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f; }
      e.traffic *= Math.pow(0.985, k);
    }

    // Infoton co-location: decaying attraction between messaging endpoints — the
    // local stand-in for what the runtime space now does for real (authoritative
    // nodes carry their own layout, so the stand-in lets go of them).
    for (const [key, h] of this.pairHeat) {
      const [ai, bi] = key.split("|");
      const a = g.nodes[+ai], b = g.nodes[+bi];
      if (a && b) {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const f = Math.min(0.02, h * 0.0022 * Math.max(0, d - 34) / d) * k;
        if (!a.auth) { a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; }
        if (!b.auth) { b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f; }
      }
      const nh = h * Math.pow(0.9985, k);
      if (nh < 0.02) this.pairHeat.delete(key); else this.pairHeat.set(key, nh);
    }

    // Short-range repulsion (the anti-collapse force; O(n²), prototype-honest).
    for (let i = 0; i < N; i++) {
      const a = g.nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = g.nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 22500) continue;                      // 150px cutoff
        const d = Math.sqrt(d2) || 1;
        const f = Math.min(1.6, 950 / (d2 + 60)) / d * k;
        if (!a.auth) { a.vx -= dx * f; a.vy -= dy * f; a.vz -= dz * f; }
        if (!b.auth) { b.vx += dx * f; b.vy += dy * f; b.vz += dz * f; }
      }
    }

    // Anchors (the self pinned at its home position — D9), containment, damping.
    for (const n of g.nodes) {
      if (n.auth) {
        // The runtime owns this node: glide toward its position (~1 Hz frames).
        const r = 1 - Math.pow(0.94, k);
        n.x += (n.auth.x - n.x) * r; n.y += (n.auth.y - n.y) * r; n.z += (n.auth.z - n.z) * r;
        n.vx = 0; n.vy = 0; n.vz = 0;
        n.heat *= Math.pow(0.97, k);
        continue;
      }
      if (n.anchor) {
        n.vx += (n.anchor.x - n.x) * n.anchor.k * k;
        n.vy += (n.anchor.y - n.y) * n.anchor.k * k;
        n.vz += (n.anchor.z - n.z) * n.anchor.k * k;
      } else if (n.cluster && n.cluster.anchor) {
        const a = n.cluster.anchor;
        n.vx += (a.x - n.x) * 0.0016 * k;
        n.vy += (a.y - n.y) * 0.0016 * k;
        n.vz += (a.z - n.z) * 0.0016 * k;
      }
      const damp = Math.pow(0.86, k);
      n.vx *= damp; n.vy *= damp; n.vz *= damp;
      const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy + n.vz * n.vz);
      if (sp > 4) { const s = 4 / sp; n.vx *= s; n.vy *= s; n.vz *= s; }
      n.x += n.vx * k; n.y += n.vy * k; n.z += n.vz * k;
      n.heat *= Math.pow(0.97, k);
    }
  }

  // -------------------------------------------------------------- the render
  _project(x, y, z) {
    const c = this._cam;
    const ct = Math.cos(c.theta), st = Math.sin(c.theta);
    const cp = Math.cos(c.phi), sp = Math.sin(c.phi);
    const rx = x * ct - z * st, rz = x * st + z * ct;
    const ry = y * cp - rz * sp, rz2 = y * sp + rz * cp;
    const depth = rz2 + c.dist;
    const s = c.fov / Math.max(60, depth);
    return { sx: this._w / 2 + rx * s, sy: this._h / 2 + ry * s, sz: depth, scale: s };
  }

  _frame(t) {
    this._raf = 0;
    if (!this.active || this.pageHidden || !this.ctx) return;
    const dt = Math.min(48, this._lastT ? t - this._lastT : 16.7);
    this._lastT = t;

    if (typeof performance !== "undefined" && performance.now() - this._lastInteract > 4000) {
      this._cam.theta += 0.00022 * dt;                 // slow idle drift around the space
    }
    this._step(dt);
    this._draw(dt, t);
    if (t - this._lastHud > 400) { this._lastHud = t; this._header(); this._info(); }
    this._raf = requestAnimationFrame(tt => this._frame(tt));
  }

  _draw(dt, now) {
    const ctx = this.ctx, g = this.graph;
    const dpr = this._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, this._w, this._h);

    // Distant dust — depth cue, nearly free.
    for (const d of this._dust || []) {
      const p = this._project(d.x, d.y, d.z);
      if (p.sz < 80) continue;
      ctx.fillStyle = `rgba(200,215,255,${d.a})`;
      ctx.fillRect(p.sx, p.sy, 1.2, 1.2);
    }

    // Project every node once.
    for (const n of g.nodes) {
      const p = this._project(n.x, n.y, n.z);
      n.sx = p.sx; n.sy = p.sy; n.sz = p.sz; n.scale = p.scale;
    }

    // The observatory plate the constellation hangs above — the scene's signature.
    this._chart(ctx);

    // Per-mind chemical aura: energy sets the glow, a loop turns it crimson,
    // speaking warms it — the diffusing field of chora-imagined.md D5, painted.
    for (const c of g.clusters) {
      const a = c.anchor; if (!a) continue;
      let warmth = 0;
      for (const n of c.nodes) warmth += n.heat;
      warmth = Math.min(1, warmth / Math.max(4, c.nodes.length * 0.5));
      const R = 96 * a.scale * (1.05 + warmth * 0.5);
      const alpha = 0.05 + (c.energy != null ? c.energy * 0.05 : 0.02) + (c.speaking ? 0.05 : 0) + warmth * 0.06;
      const grad = ctx.createRadialGradient(a.sx, a.sy, 0, a.sx, a.sy, Math.max(8, R));
      const tint = c.loop ? "220,90,90" : c.speaking ? "242,200,121" : "120,130,235";
      grad.addColorStop(0, `rgba(${tint},${alpha.toFixed(3)})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(a.sx - R, a.sy - R, R * 2, R * 2);
    }

    // Structural filaments.
    ctx.lineCap = "round";
    for (const e of g.edges) {
      const a = g.nodes[e.a], b = g.nodes[e.b];
      const alpha = Math.min(0.42, 0.06 + e.traffic * 0.4 + Math.min(a.heat, b.heat) * 0.18);
      ctx.strokeStyle = this._rgba(b.color, alpha);
      ctx.lineWidth = Math.max(0.4, 0.8 * ((a.scale + b.scale) / 2));
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    // Infoton bonds — the emergent (non-structural) proximity links, drawn so the
    // co-location force is *visible* as a forming filament.
    for (const [key, h] of this.pairHeat) {
      if (h < 0.35) continue;
      const [ai, bi] = key.split("|");
      const a = g.nodes[+ai], b = g.nodes[+bi];
      if (!a || !b) continue;
      ctx.strokeStyle = `rgba(223,230,255,${Math.min(0.2, h * 0.06)})`;
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Additive layer: pulses, rings, node glows.
    ctx.globalCompositeOperation = "lighter";

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt / p.dur;
      if (p.t >= 1) {
        this.heatUp(p.b, 0.3 * p.size);
        const e = g.edges.find(e2 => (e2.a === p.a.idx && e2.b === p.b.idx) || (e2.a === p.b.idx && e2.b === p.a.idx));
        if (e) e.traffic = Math.min(1.4, e.traffic + 0.5);
        this.pulses.splice(i, 1);
        continue;
      }
      // Ease + a slight lift off the chord so the light arcs through the space.
      const tt = p.t * p.t * (3 - 2 * p.t);
      const lift = Math.sin(p.t * Math.PI) * 14;
      const x = p.a.x + (p.b.x - p.a.x) * tt;
      const y = p.a.y + (p.b.y - p.a.y) * tt - lift;
      const z = p.a.z + (p.b.z - p.a.z) * tt;
      const pr = this._project(x, y, z);
      for (let gi = 0; gi < 3; gi++) {                 // a short comet trail
        const gt = Math.max(0, tt - gi * 0.05);
        const gx = p.a.x + (p.b.x - p.a.x) * gt, gy = p.a.y + (p.b.y - p.a.y) * gt - Math.sin(Math.min(1, gt) * Math.PI) * 14, gz = p.a.z + (p.b.z - p.a.z) * gt;
        const gp = this._project(gx, gy, gz);
        const rr = (3.4 + p.size * 2.2) * gp.scale * (1 - gi * 0.28);
        const grad = ctx.createRadialGradient(gp.sx, gp.sy, 0, gp.sx, gp.sy, Math.max(1, rr * 2.6));
        grad.addColorStop(0, this._rgba(p.color, 0.85 * (1 - gi * 0.3)));
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(gp.sx, gp.sy, Math.max(1, rr * 2.6), 0, TAU); ctx.fill();
      }
      void pr;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt / r.dur;
      if (r.t >= 1) { this.rings.splice(i, 1); continue; }
      const n = r.node;
      const grow = r.kind === "implode" ? (1 - r.t) : r.t;
      const rad = (n.r * 1.6 + grow * (r.kind === "spark" ? 26 : 60)) * n.scale;
      ctx.strokeStyle = this._rgba(r.color, (1 - r.t) * 0.55);
      ctx.lineWidth = 1.6 * n.scale;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, Math.max(0.5, rad), 0, TAU); ctx.stroke();
    }

    // Speaking voices ripple continuously.
    if (now - this._lastSpeakRing > 700) {
      this._lastSpeakRing = now;
      for (const c of g.clusters) {
        if (c.speaking) this.ring(this.nByTag(c.member, "m-speech") || c.anchor, PALETTE.attention, "burst", 1400);
      }
    }

    // Nodes, far to near — each a family glyph inside its colored glow.
    const order = [...g.nodes].sort((a, b) => b.sz - a.sz);
    for (const n of order) {
      const glowR = Math.max(1.5, n.r * n.scale * (2.6 + n.heat * 2.2));
      const grad = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, glowR);
      grad.addColorStop(0, this._rgba(n.color, 0.5 + Math.min(0.45, n.heat * 0.5)));
      grad.addColorStop(0.35, this._rgba(n.color, 0.16 + Math.min(0.3, n.heat * 0.3)));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, glowR, 0, TAU); ctx.fill();
      this._glyph(ctx, n);
    }

    ctx.globalCompositeOperation = "source-over";

    // Energy arcs + loop marks on the mind anchors.
    for (const c of g.clusters) {
      const a = c.anchor; if (!a) continue;
      if (typeof c.energy === "number") {
        const col = c.energy > 0.5 ? PALETTE.good : c.energy > 0.22 ? PALETTE.attention : PALETTE.bad;
        ctx.strokeStyle = this._rgba(col, 0.8);
        ctx.lineWidth = 2 * a.scale;
        ctx.beginPath(); ctx.arc(a.sx, a.sy, a.r * a.scale * 1.9, -Math.PI / 2, -Math.PI / 2 + Math.max(0.05, c.energy) * TAU); ctx.stroke();
      }
      if (c.loop) {
        ctx.strokeStyle = this._rgba(PALETTE.bad, 0.5 + 0.3 * Math.sin(now / 240));
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -(now / 40) % 9;
        ctx.lineWidth = 1.4 * a.scale;
        ctx.beginPath(); ctx.arc(a.sx, a.sy, a.r * a.scale * 2.6, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Labels: member names always; faculties when warm, hovered, or selected.
    ctx.textAlign = "center";
    for (const n of g.nodes) {
      const isAnchor = n.depth === 0 || n === g.hub;
      const active = n === this.hover || n === this.selected;
      const warm = n.heat > 0.055;
      if (!isAnchor && !warm && !active) continue;
      const label = n.name || n.tag;
      const size = isAnchor ? Math.max(10, 13 * Math.min(1.15, n.scale)) : Math.max(8.5, 10 * Math.min(1.1, n.scale));
      const alpha = isAnchor ? 0.92 : active ? 0.95 : Math.min(0.8, 0.25 + n.heat * 1.4);
      ctx.font = `${isAnchor ? "600 " : ""}${size.toFixed(1)}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = this._rgba(isAnchor ? "#e9e7e2" : n.color, alpha);
      ctx.fillText(label, n.sx, n.sy + (n.r * n.scale * 2.2) + size);
      if (active) {
        this._reticle(ctx, n, now);
        if (n.stat) {
          ctx.font = `8.5px ui-monospace, Menlo, monospace`;
          ctx.fillStyle = "rgba(153,161,180,.92)";
          ctx.fillText(n.stat.slice(0, 40), n.sx, n.sy + (n.r * n.scale * 2.2) + size + 11);
        }
      }
    }

    // Floating speech captions — the society heard from above.
    ctx.font = `11.5px system-ui, sans-serif`;
    for (const c of g.clusters) {
      const cap = c.caption; if (!cap || !c.anchor) continue;
      cap.t += dt;
      if (cap.t > cap.dur) { c.caption = null; continue; }
      const fade = Math.min(1, cap.t / 300) * Math.min(1, (cap.dur - cap.t) / 900);
      const y = c.anchor.sy - c.anchor.r * c.anchor.scale * 3 - 16 - (cap.t / cap.dur) * 12;
      ctx.strokeStyle = `rgba(5,7,12,${0.75 * fade})`;
      ctx.lineWidth = 3;
      ctx.strokeText(`“${cap.text}”`, c.anchor.sx, y);
      ctx.fillStyle = `rgba(244,227,194,${0.92 * fade})`;
      ctx.fillText(`“${cap.text}”`, c.anchor.sx, y);
    }

    // The other live minds: distant presence-orbs (click to refocus the Studio).
    ctx.textAlign = "center";
    for (const o of this.orbs) {
      const p = this._project(o.x, o.y, o.z);
      o.sx = p.sx; o.sy = p.sy; o.scale = p.scale;
      const col = o.state === "awake" ? PALETTE.good : o.state === "waking" ? PALETTE.attention : o.state === "sleeping" ? PALETTE.membrane : "#6b7387";
      const R = 5.5 * p.scale * (o === this.hover ? 1.5 : 1);
      const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, R * 3.2);
      grad.addColorStop(0, this._rgba(col, 0.6));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, R * 3.2, 0, TAU); ctx.fill();
      // A distant self: the same ringed-planet glyph the mind anchors wear.
      ctx.strokeStyle = this._rgba(col, 0.55);
      ctx.lineWidth = Math.max(0.5, R * 0.16);
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, R * 1.7, R * 0.6, -0.3, 0, TAU); ctx.stroke();
      ctx.fillStyle = this._rgba("#ffffff", 0.8);
      ctx.beginPath(); ctx.arc(p.sx, p.sy, R * 0.6, 0, TAU); ctx.fill();
      ctx.font = `10px ui-monospace, monospace`;
      ctx.fillStyle = this._rgba(col, o === this.hover ? 0.95 : 0.55);
      ctx.fillText(o.name, p.sx, p.sy + R * 3 + 10);
    }
  }

  // ------------------------------------------------------------- the glyphs
  /** A node's family silhouette: colored halo pass + white-hot core pass under
   *  additive compositing, so identity stays shiny. */
  _glyph(ctx, n) {
    const bright = 0.78 + Math.min(0.22, n.heat);
    const s = Math.max(1, n.r * n.scale * (1.05 + n.heat * 0.2));
    switch (n.shape) {
      case "self": {                                    // ringed planet — the anchor
        ctx.strokeStyle = this._rgba(n.color, 0.6);
        ctx.lineWidth = Math.max(0.6, 0.14 * s);
        ctx.beginPath(); ctx.ellipse(n.sx, n.sy, s * 1.85, s * 0.6, -0.3, 0, TAU); ctx.stroke();
        ctx.fillStyle = this._rgba(n.color, 0.5);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, s * 0.95, 0, TAU); ctx.fill();
        ctx.fillStyle = this._rgba("#ffffff", bright);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, s * 0.68, 0, TAU); ctx.fill();
        break;
      }
      case "hub": {                                     // hexagonal plaza — the commons
        ctx.strokeStyle = this._rgba(n.color, 0.85);
        ctx.lineWidth = Math.max(0.7, 0.2 * s);
        this._poly(ctx, n.sx, n.sy, s * 1.5, 6, -Math.PI / 2); ctx.stroke();
        ctx.fillStyle = this._rgba("#ffffff", bright);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, s * 0.5, 0, TAU); ctx.fill();
        break;
      }
      case "ring": {                                    // open ring — the membrane
        ctx.strokeStyle = this._rgba(n.color, 0.55);
        ctx.lineWidth = Math.max(1, s * 0.8);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, s * 0.95, 0, TAU); ctx.stroke();
        ctx.strokeStyle = this._rgba("#ffffff", bright);
        ctx.lineWidth = Math.max(0.6, s * 0.36);
        ctx.beginPath(); ctx.arc(n.sx, n.sy, s * 0.95, 0, TAU); ctx.stroke();
        break;
      }
      case "cell": {                                    // battery — fill = live energy
        const e = n.cluster && typeof n.cluster.energy === "number" ? n.cluster.energy : null;
        const w = s * 1.5, h = s * 2.4, x = n.sx - w / 2, y = n.sy - h / 2;
        ctx.fillStyle = this._rgba(n.color, 0.25);
        this._rrect(ctx, x, y, w, h, w * 0.3); ctx.fill();
        if (e != null) {
          const fh = Math.max(1, (h - 2) * Math.max(0.06, Math.min(1, e)));
          ctx.fillStyle = this._rgba(n.color, 0.95);
          this._rrect(ctx, x + 1, y + h - 1 - fh, w - 2, fh, (w - 2) * 0.3); ctx.fill();
        }
        ctx.strokeStyle = this._rgba("#ffffff", bright * 0.9);
        ctx.lineWidth = Math.max(0.5, s * 0.14);
        this._rrect(ctx, x, y, w, h, w * 0.3); ctx.stroke();
        ctx.fillStyle = this._rgba("#ffffff", bright);
        ctx.fillRect(n.sx - w * 0.22, y - s * 0.32, w * 0.44, s * 0.28);
        break;
      }
      default: {                                        // star / slab / diamond / delta
        ctx.fillStyle = this._rgba(n.color, 0.55);
        this._path(ctx, n.shape, n.sx, n.sy, s * 1.5); ctx.fill();
        ctx.fillStyle = this._rgba("#ffffff", bright);
        this._path(ctx, n.shape, n.sx, n.sy, s * 0.92); ctx.fill();
      }
    }
  }

  _path(ctx, shape, x, y, r) {
    if (shape === "slab") { this._rrect(ctx, x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.5); return; }
    ctx.beginPath();
    if (shape === "star") {
      const w = r * 0.3;
      ctx.moveTo(x, y - r); ctx.lineTo(x + w, y - w); ctx.lineTo(x + r, y); ctx.lineTo(x + w, y + w);
      ctx.lineTo(x, y + r); ctx.lineTo(x - w, y + w); ctx.lineTo(x - r, y); ctx.lineTo(x - w, y - w);
    } else if (shape === "delta") {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y + r * 0.72); ctx.lineTo(x - r * 0.9, y + r * 0.72);
    } else {                                            // diamond (and the fallback)
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    }
    ctx.closePath();
  }

  _rrect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  _poly(ctx, x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * TAU;
      i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  /** The observatory plate: surveyed rings + spokes + degree ticks on a ground
   *  plane below the constellation; each mind drops a plumb line to it. Points
   *  that cross the near plane are dropped (the pen lifts), like the dust —
   *  otherwise the clamped projection smears lines across the screen when
   *  zoomed in. */
  _chart(ctx) {
    const Y = 170, NEAR = 80;
    const proj = (r, a) => this._project(Math.cos(a) * r, Y, Math.sin(a) * r);
    ctx.lineWidth = 1;
    for (const [r, alpha] of [[90, .05], [170, .05], [260, .06], [360, .05], [470, .085]]) {
      ctx.strokeStyle = `rgba(146,168,226,${alpha})`;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 72; i++) {
        const p = proj(r, (i / 72) * TAU);
        if (p.sz < NEAR) { pen = false; continue; }
        pen ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(146,168,226,.035)";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const p1 = proj(90, a), p2 = proj(470, a);
      if (p1.sz < NEAR || p2.sz < NEAR) continue;
      ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(146,168,226,.14)";
    ctx.fillStyle = "rgba(146,168,226,.24)";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg / 360) * TAU;
      const p1 = proj(470, a), p2 = proj(deg % 90 === 0 ? 500 : 484, a);
      if (p1.sz < NEAR || p2.sz < NEAR) continue;
      ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
      if (deg % 90 === 0) { const pt = proj(526, a); if (pt.sz >= NEAR) ctx.fillText(`${deg}°`, pt.sx, pt.sy); }
    }
    // Plumb lines: every mind anchored to the plate, with a ground marker.
    for (const c of this.graph.clusters) {
      const a = c.anchor; if (!a) continue;
      const g0 = this._project(a.x, Y, a.z);
      if (g0.sz < NEAR || a.sz < NEAR) continue;
      ctx.strokeStyle = "rgba(146,168,226,.13)";
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(g0.sx, g0.sy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(146,168,226,.22)";
      ctx.beginPath(); ctx.ellipse(g0.sx, g0.sy, 7 * g0.scale, 2.6 * g0.scale, 0, 0, TAU); ctx.stroke();
    }
  }

  /** HUD corner ticks around the hovered node; the pinned selection also gets a
   *  slowly orbiting dashed ring. */
  _reticle(ctx, n, now) {
    const R = Math.max(9, n.r * n.scale * 2.1);
    const t = R * 0.45;
    ctx.strokeStyle = "rgba(242,200,121,.9)";
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = n.sx + dx * R, cy = n.sy + dy * R;
      ctx.beginPath();
      ctx.moveTo(cx, cy - dy * t); ctx.lineTo(cx, cy); ctx.lineTo(cx - dx * t, cy);
      ctx.stroke();
    }
    if (n === this.selected) {
      ctx.strokeStyle = "rgba(242,200,121,.4)";
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -(now / 60) % 9;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, R * 1.35, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _rgba(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), gr = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${gr},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  // ------------------------------------------------------------------ the HUD
  _header() {
    if (!this.nameEl) return;
    const m = this._focusedEntry();
    this.nameEl.textContent = m ? (m.name || m.file) : "no mind in focus";
    this.kindEl.hidden = !m;
    if (m) this.kindEl.textContent = m.kind || "mind";
    const bits = [];
    if (this.graph.clusters.length) bits.push(`${this.graph.clusters.length} mind${this.graph.clusters.length > 1 ? "s" : ""} · ${this.graph.nodes.length} faculties`);
    if (m && m.state) bits.push(m.state);
    if (this.orbs.length) bits.push(`${this.orbs.length} other${this.orbs.length > 1 ? "s" : ""} nearby`);
    this.metaEl.textContent = bits.join(" · ");
    if (this.plateEl) {
      const az = ((this._cam.theta * 180 / Math.PI) % 360 + 360) % 360;
      this.plateEl.textContent =
        `az ${String(Math.round(az)).padStart(3, "0")}° · alt ${Math.round(this._cam.phi * 180 / Math.PI)}° · r ${Math.round(this._cam.dist)} · ${this.pulses.length} signals`;
    }
  }

  /**
   * The inspector card. Hover shows a compact glance; CLICKING pins the full live
   * card — attrs, vitals, the per-faculty event feed, and (for the self) the last
   * assembled frame: the same live data the structure pane keeps, in space.
   * Re-rendered only when the node's version moves, so the feed stays scrollable.
   */
  _info(force) {
    const n = this.selected || this.hover;
    if (!n) {
      if (!this.infoEl.hidden) { this.infoEl.hidden = true; this.infoEl.classList.remove("pinned"); }
      this._infoKey = null;
      return;
    }
    const pinned = n === this.selected;
    const key = n.isOrb ? `orb/${n.id}/${n.state}` : `${n.id}/${n.v}/${n.cluster ? n.cluster.v : 0}/${pinned ? 1 : 0}`;
    if (!force && key === this._infoKey) return;
    this._infoKey = key;
    this.infoEl.hidden = false;
    this.infoEl.classList.toggle("pinned", pinned);
    if (n.isOrb) {
      this.infoEl.style.borderLeftColor = "";
      this.infoEl.innerHTML = `<div class="pl-head">${glyphSVG("self", PALETTE.commons, "pl-glyph")}<b>${esc(n.name)}</b> <span class="pl-tag">${esc(n.state)}</span></div><div class="pl-last">another live mind — click to focus it</div>`;
      return;
    }
    // Preserve what the reader had open before replacing the card's DOM.
    const oldFeed = this.infoEl.querySelector(".pl-feed");
    const feedScroll = oldFeed ? oldFeed.scrollTop : 0;
    const frameOpen = !!(this.infoEl.querySelector(".pl-frame") || {}).open;

    const c = n.cluster;
    const head =
      `<div class="pl-head">${glyphSVG(n.shape, n.color, "pl-glyph")}<b>${esc(n.name || n.tag)}</b>` +
      `<span class="pl-tag">${esc(n.tag)}</span>${n.member ? `<span class="pl-member">${esc(n.member)}</span>` : ""}` +
      (pinned ? `<button class="pl-x" type="button" aria-label="Deselect">×</button>` : "") + `</div>`;
    const attrs = Object.entries(n.attrs || {}).filter(([k]) => k !== "name").slice(0, pinned ? 24 : 6)
      .map(([k, v]) => `<span class="pl-attr"><b>${esc(k)}</b> ${esc(String(v).slice(0, 60))}</span>`).join("");
    let vitals = "";
    if (n.shape === "self" && c) {
      const rows = [];
      if (typeof c.energy === "number") {
        const pct = Math.round(c.energy * 100);
        rows.push(["energy", `<span class="pl-bar"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></span> ${pct}%${typeof c.spent === "number" ? ` · $${c.spent.toFixed(3)}` : ""}`]);
      }
      if (c.bursts) rows.push(["bursts", `${c.bursts}`]);
      if (c.mem) rows.push(["memory", `tail ${fmt(c.mem.tail)} · recent ${fmt(c.mem.recent)} · story ${fmt(c.mem.story)}`]);
      if (c.loop) rows.push(["loop", `<span class="bad">⟳ ${esc(c.loop.kind)}</span>`]);
      if (c.speaking) rows.push(["voice", `<span class="warn">speaking</span>`]);
      if (rows.length) vitals = `<div class="pl-vitals">${rows.map(([k, v]) => `<span class="pl-vk">${k}</span><span class="pl-vv">${v}</span>`).join("")}</div>`;
    }
    const stat = n.stat ? `<div class="pl-stat">${esc(n.stat)}</div>` : "";
    let feed = "";
    if (pinned) {
      feed = n.feed.length
        ? `<div class="pl-feed">${[...n.feed].reverse().map(e =>
            `<div class="pl-ev ${e.cls}"><span class="t">${e.t}</span> ${esc(e.text)}</div>`).join("")}</div>`
        : `<div class="pl-quiet">no events yet — this faculty hasn't spoken up</div>`;
    } else if (n.last) {
      feed = `<div class="pl-last">${esc(n.last)}</div>`;
    }
    let frame = "";
    if (pinned && n.shape === "self" && c && c.frame) {
      const body = [
        c.frame.system ? `— system —\n${c.frame.system}` : "",
        c.frame.instruction ? `— user (instruction) —\n${c.frame.instruction}` : "",
        c.frame.frame ? `— assistant (continuing) —\n${c.frame.frame}` : "",
      ].filter(Boolean).join("\n\n");
      frame = `<details class="pl-frame"${frameOpen ? " open" : ""}><summary>last frame · ${esc(c.frame.kind || "?")}</summary><pre>${esc(body)}</pre></details>`;
    }
    this.infoEl.style.borderLeftColor = n.color;
    this.infoEl.innerHTML = head + (attrs ? `<div class="pl-attrs">${attrs}</div>` : "") + vitals + stat + feed + frame;
    const newFeed = this.infoEl.querySelector(".pl-feed");
    if (newFeed && feedScroll) newFeed.scrollTop = feedScroll;
  }

  _rebuildOrbs() {
    const alive = this.roster.filter(m => m.id !== this.focusedId && (m.state === "awake" || m.state === "waking" || m.state === "sleeping"));
    this.orbs = alive.map((m, i) => {
      const ang = 0.7 + (i / Math.max(1, alive.length)) * TAU;
      return { isOrb: true, id: m.id, name: m.name, state: m.state,
        x: Math.cos(ang) * 560, y: 90 + (i % 3) * 40, z: Math.sin(ang) * 560,
        sx: 0, sy: 0, scale: 1 };
    });
  }

  // ------------------------------------------------------------- interaction
  _wireInput() {
    const cv = this.canvas;
    if (!cv || !cv.addEventListener) return;
    cv.addEventListener("pointerdown", e => {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 });
      this._lastInteract = (typeof performance !== "undefined") ? performance.now() : 0;
      cv.classList.add("dragging");
    });
    cv.addEventListener("pointermove", e => {
      this._lastInteract = (typeof performance !== "undefined") ? performance.now() : 0;
      const p = this._pointers.get(e.pointerId);
      if (!p) { this._hover(e.clientX, e.clientY); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (this._pointers.size === 1) {
        this._cam.theta += dx * 0.0052;
        this._cam.phi = Math.max(-1.2, Math.min(1.2, this._cam.phi + dy * 0.0042));
      } else if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchDist) this._cam.dist = Math.max(150, Math.min(1400, this._cam.dist * this._pinchDist / Math.max(1, d)));
        this._pinchDist = d;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => {
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      this._pinchDist = 0;
      if (!this._pointers.size) cv.classList.remove("dragging");
      if (p && p.moved < 6) this._click(e.clientX, e.clientY);   // a tap, not a drag
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      this._lastInteract = (typeof performance !== "undefined") ? performance.now() : 0;
      this._cam.dist = Math.max(150, Math.min(1400, this._cam.dist * Math.pow(1.1, e.deltaY / 100)));
    }, { passive: false });
  }

  _hit(cx, cy) {
    const rect = this.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    let best = null, bestD = 22;
    for (const n of this.graph.nodes) {
      const d = Math.hypot(n.sx - x, n.sy - y);
      const reach = Math.max(10, n.r * n.scale * 2);
      if (d < reach && d < bestD) { best = n; bestD = d; }
    }
    for (const o of this.orbs) {
      const d = Math.hypot(o.sx - x, o.sy - y);
      if (d < 20 && d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  _hover(cx, cy) { this.hover = this._hit(cx, cy); }

  _click(cx, cy) {
    const n = this._hit(cx, cy);
    if (n && n.isOrb) { command(this, "focus", { id: n.id }); return; }
    this.selected = n || null;
    this._info();
  }
}
A.define("studio-plenum", StudioPlenum);
