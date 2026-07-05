/**
 * infoton.js — the pure math of the Plenum (doc/architecture/plenum.md).
 *
 * Infoton optimization (Schäffer & Sidló 2021), applied inward: a position is
 * private state of each component, an infoton `{pos, energy, sign}` rides each
 * message, and the RECEIVER applies one displacement step at delivery time.
 * Nobody owns the space; there is no tick and no persistent force — everything
 * here is a pure function so the physics is unit-testable without a mind
 * (the loopMath.js precedent).
 */

/** Space parameters (doc §3.4). Units are arbitrary but shared per space;
 *  overridable via `spaceI` / `spaceTd` attrs on the space root. */
export const SPACE_DEFAULTS = { I: 1, td: 40 };

/** Default energies per carrier (doc §3.4) — one step per message, the traffic-
 *  rate difference lives in the dose, stamped at the origin. */
export const ENERGY = { implicit: 0.5, stimulus: 2, deed: 4, spoken: 12 };

/** Deterministic 0..1 from a string (FNV-1a) — stable seeds across wakes, no RNG. */
export function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/** Deterministic seed position: a box jitter of ±spread/2 around a parent
 *  position (components spawn near their creator). `around` may be null (origin). */
export function seedPos(path, around, spread) {
  const a = around || { x: 0, y: 0, z: 0 };
  return {
    x: a.x + (hash01(path + "x") - 0.5) * spread,
    y: a.y + (hash01(path + "y") - 0.5) * spread * 0.7,
    z: a.z + (hash01(path + "z") - 0.5) * spread,
  };
}

/**
 * Deterministic anchor for the i-th of n society members: a ring around the
 * origin sized so adjacent anchors sit ~5·TD apart (doc §3.1 "a few TD between
 * neighbours") — the runtime twin of the viewer's cluster ring. One member
 * sits at the origin.
 */
export function anchorOnRing(index, count, td) {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const R = (5 * td) / (2 * Math.sin(Math.PI / count));
  const ang = -Math.PI / 2 + (index / count) * 2 * Math.PI;
  return { x: Math.cos(ang) * R, y: (index % 2 ? 1 : -1) * td * 0.4, z: Math.sin(ang) * R };
}

/**
 * Apply one infoton to a position — the whole physics (doc §3.3).
 *
 *   pull (sign +): step = min(energy·I, max(0, d − TD))   // never inside the TD shell
 *   push (sign −): step = energy·I, away from the source
 *
 * The min-clamp is the paper's TARGET_DISTANCE extinguish rule made safe for
 * large steps: at unit energies it degenerates to exactly the paper's
 * behaviour; at our sparse-traffic energies it prevents overshooting past the
 * source. Approach asymptotes at the TD shell instead of freezing inside it.
 *
 * Returns the new position, or null when the infoton moves nothing (already at
 * the shell, zero distance, or a malformed infoton). Never mutates its inputs.
 */
export function applyStep(pos, infoton, params) {
  if (!pos || !infoton || !infoton.pos) return null;
  const { I, td } = { ...SPACE_DEFAULTS, ...params };
  const energy = Number(infoton.energy);
  if (!(energy > 0)) return null;
  const sign = infoton.sign === -1 ? -1 : 1;
  const dx = infoton.pos.x - pos.x, dy = infoton.pos.y - pos.y, dz = infoton.pos.z - pos.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!(d > 1e-9)) return null;                       // direction undefined at the source
  const step = sign === 1 ? Math.min(energy * I, Math.max(0, d - td)) : energy * I;
  if (!(step > 0)) return null;
  const s = (sign * step) / d;
  return { x: pos.x + dx * s, y: pos.y + dy * s, z: pos.z + dz * s };
}

/** Distance falloff for couplings (doc §6): 1 inside the TD shell, decaying
 *  as TD/d beyond it — bounded (0, 1], so proximity can only restore authored
 *  salience, never amplify it. */
export function falloff(d, td) {
  const t = td > 0 ? td : SPACE_DEFAULTS.td;
  return t / Math.max(d, t);
}

/** Build an envelope from a live position: a SNAPSHOT (copied, not referenced),
 *  so the stamped message keeps the source's position at send time even after
 *  the source moves — the paper-exact explicit carrier (doc §3.2). */
export function envelope(pos, energy, sign = 1) {
  if (!pos) return null;
  return { pos: { x: pos.x, y: pos.y, z: pos.z }, energy, sign };
}

/** Extract a valid infoton envelope from a delivered value — tolerates both a
 *  CustomEvent (payload in `.detail`) and a plain payload. Null when absent or
 *  malformed. */
export function extractInfoton(raw) {
  const carrier = raw && typeof raw === "object" ? (raw.detail ?? raw) : null;
  const inf = carrier && typeof carrier === "object" ? carrier.infoton : null;
  if (!inf || !inf.pos) return null;
  const { x, y, z } = inf.pos;
  if (![x, y, z].every(Number.isFinite) || !(Number(inf.energy) > 0)) return null;
  return inf;
}

/** Euclidean distance between two positions. */
export function dist(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
