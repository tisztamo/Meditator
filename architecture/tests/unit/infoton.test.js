// infoton.js — the Plenum's pure physics (doc/architecture/plenum.md §3).
// One infoton = one displacement step on the receiver at delivery; the min-clamp
// subsumes the paper's TARGET_DISTANCE extinguish rule; seeds are deterministic
// so a mind wakes into the same layout without any RNG or coordination.
import { test, expect } from "bun:test";
import {
  applyStep, seedPos, anchorOnRing, falloff, envelope, extractInfoton, dist,
  SPACE_DEFAULTS, ENERGY,
} from "../../../src/mindComponents/shared/infoton.js";

const P = { I: 1, td: 40 };

test("a pull moves the receiver straight toward the source by energy·I", () => {
  const next = applyStep({ x: 0, y: 0, z: 0 }, { pos: { x: 100, y: 0, z: 0 }, energy: 5 }, P);
  expect(next.x).toBeCloseTo(5);
  expect(next.y).toBeCloseTo(0);
  expect(next.z).toBeCloseTo(0);
});

test("the clamp: a huge pull lands exactly on the TD shell, never inside it", () => {
  const next = applyStep({ x: 0, y: 0, z: 0 }, { pos: { x: 100, y: 0, z: 0 }, energy: 1e6 }, P);
  expect(next.x).toBeCloseTo(60);                        // 100 − td
  expect(dist(next, { x: 100, y: 0, z: 0 })).toBeCloseTo(P.td);
});

test("the extinguish rule: a pull from inside the TD shell moves nothing (paper-exact)", () => {
  expect(applyStep({ x: 0, y: 0, z: 0 }, { pos: { x: 30, y: 0, z: 0 }, energy: 2 }, P)).toBeNull();
});

test("a push (sign −1) moves away, and is not clamped by TD", () => {
  const next = applyStep({ x: 0, y: 0, z: 0 }, { pos: { x: 10, y: 0, z: 0 }, energy: 3, sign: -1 }, P);
  expect(next.x).toBeCloseTo(-3);
});

test("degenerate infotons move nothing: zero distance, zero/negative energy, malformed", () => {
  const me = { x: 5, y: 5, z: 5 };
  expect(applyStep(me, { pos: { x: 5, y: 5, z: 5 }, energy: 2 }, P)).toBeNull();
  expect(applyStep(me, { pos: { x: 9, y: 5, z: 5 }, energy: 0 }, P)).toBeNull();
  expect(applyStep(me, { pos: { x: 9, y: 5, z: 5 }, energy: NaN }, P)).toBeNull();
  expect(applyStep(me, null, P)).toBeNull();
  expect(applyStep(me, { energy: 2 }, P)).toBeNull();
});

test("applyStep never mutates its inputs", () => {
  const me = { x: 0, y: 0, z: 0 };
  const inf = { pos: { x: 100, y: 0, z: 0 }, energy: 5 };
  applyStep(me, inf, P);
  expect(me).toEqual({ x: 0, y: 0, z: 0 });
  expect(inf.pos).toEqual({ x: 100, y: 0, z: 0 });
});

test("convergence is the accumulation of many exchanges (the paper's regime)", () => {
  let me = { x: 0, y: 0, z: 0 };
  const src = { x: 300, y: 0, z: 0 };
  for (let i = 0; i < 30; i++) me = applyStep(me, { pos: src, energy: ENERGY.spoken }, P) || me;
  expect(dist(me, src)).toBeCloseTo(P.td);               // arrived at the shell, ~22 steps
});

test("seeds are deterministic and parent-relative", () => {
  const a = seedPos("mind/ear#3", { x: 100, y: 0, z: 0 }, 40);
  const b = seedPos("mind/ear#3", { x: 100, y: 0, z: 0 }, 40);
  expect(a).toEqual(b);
  expect(dist(a, { x: 100, y: 0, z: 0 })).toBeLessThan(40);
  expect(seedPos("mind/ear#4", { x: 100, y: 0, z: 0 }, 40)).not.toEqual(a);
});

test("society anchors ring: adjacent members sit ~5·TD apart, solo at origin", () => {
  expect(anchorOnRing(0, 1, 40)).toEqual({ x: 0, y: 0, z: 0 });
  const n = 6, td = 40;
  const ring = Array.from({ length: n }, (_, i) => anchorOnRing(i, n, td));
  for (let i = 0; i < n; i++) {
    const d = dist({ ...ring[i], y: 0 }, { ...ring[(i + 1) % n], y: 0 });
    expect(Math.abs(d - 5 * td)).toBeLessThan(1e-6);
  }
});

test("falloff is 1 inside the shell and bounded (0,1] beyond it", () => {
  expect(falloff(10, 40)).toBe(1);
  expect(falloff(40, 40)).toBe(1);
  expect(falloff(400, 40)).toBeCloseTo(0.1);
  expect(falloff(400, 0)).toBeCloseTo(SPACE_DEFAULTS.td / 400);
});

test("envelope snapshots the source position — later movement does not retro-edit the message", () => {
  const pos = { x: 1, y: 2, z: 3 };
  const env = envelope(pos, ENERGY.spoken);
  pos.x = 99;
  expect(env.pos.x).toBe(1);
  expect(env.energy).toBe(ENERGY.spoken);
  expect(envelope(null, 1)).toBeNull();
});

test("extractInfoton reads both a CustomEvent-shaped and a plain payload, rejecting malformed ones", () => {
  const inf = { pos: { x: 0, y: 0, z: 0 }, energy: 2 };
  expect(extractInfoton({ detail: { text: "hi", infoton: inf } })).toBe(inf);
  expect(extractInfoton({ text: "hi", infoton: inf })).toBe(inf);
  expect(extractInfoton({ text: "hi" })).toBeNull();
  expect(extractInfoton("hi")).toBeNull();
  expect(extractInfoton(null)).toBeNull();
  expect(extractInfoton({ infoton: { pos: { x: NaN, y: 0, z: 0 }, energy: 2 } })).toBeNull();
  expect(extractInfoton({ infoton: { pos: { x: 0, y: 0, z: 0 }, energy: 0 } })).toBeNull();
});
