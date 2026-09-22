/** Shared math, RNG, and small utility helpers. */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2;

/** Shortest signed angular difference from a to b, in radians. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Deterministic PRNG so a district seed always rebuilds the same city. */
export class RNG {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x || 1;
    return this.s / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

let _uid = 0;
export const uid = (prefix = 'e') => `${prefix}${++_uid}`;

export const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
};

export const titleCase = (s) => s.replace(/(^|\s|-)\w/g, (c) => c.toUpperCase());

/** Rect-vs-rect overlap test using {x,y,w,h} with x,y as top-left. */
export const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px, py, r) =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** Sweep a single axis and resolve against a list of static solids. */
export function moveAxis(body, dx, solids, axis) {
  if (dx === 0) return false;
  const step = Math.sign(dx);
  let remaining = Math.abs(dx);
  let hit = false;
  while (remaining > 1e-6) {
    const move = Math.min(remaining, 4);
    remaining -= move;
    if (axis === 'x') body.x += step * move; else body.y += step * move;
    for (const s of solids) {
      if (!rectsOverlap(body, s)) continue;
      hit = true;
      if (axis === 'x') {
        body.x = step > 0 ? s.x - body.w : s.x + s.w;
        body.vx = 0;
      } else {
        body.y = step > 0 ? s.y - body.h : s.y + s.h;
        body.vy = 0;
        body.grounded = step > 0;
      }
      return hit;
    }
  }
  return hit;
}

/**
 * Resolve a body out of any solid it deeply overlaps, choosing the shallowest
 * push that does not land it inside another solid. Bodies that spawn with a 1-2px
 * overlap (standing exactly on a slab, or nudged into a wall) are cleared before
 * the movement sweep runs, which otherwise makes the axis resolver fling them to
 * the far side of the solid.
 *
 * Shallow contact (within CONTACT_EPS) is left to `moveAxis`: a body resting
 * against a wall touches it every frame and must not have its velocity zeroed.
 */
const CONTACT_EPS = 1.5;

function pushInDirection(body, s, dir) {
  switch (dir) {
    case 'up': body.y = s.y - body.h; if (body.vy > 0) body.vy = 0; body.grounded = true; return;
    case 'down': body.y = s.y + s.h; if (body.vy < 0) body.vy = 0; return;
    case 'left': body.x = s.x - body.w; body.vx = 0; return;
    default: body.x = s.x + s.w; body.vx = 0;
  }
}

function overlapsAny(body, solids) {
  for (const o of solids) if (rectsOverlap(body, o)) return true;
  return false;
}

export function depenetrate(body, solids) {
  const probe = { x: 0, y: 0, w: body.w - CONTACT_EPS * 2, h: body.h - CONTACT_EPS * 2 };
  if (probe.w <= 0 || probe.h <= 0) return false;
  let moved = false;

  for (let pass = 0; pass < 4; pass++) {
    let resolvedAny = false;
    for (const s of solids) {
      probe.x = body.x + CONTACT_EPS; probe.y = body.y + CONTACT_EPS;
      if (!rectsOverlap(probe, s)) continue;
      const left = (body.x + body.w) - s.x;
      const right = (s.x + s.w) - body.x;
      const up = (body.y + body.h) - s.y;
      const down = (s.y + s.h) - body.y;
      // Try directions shallowest-first, skipping any that would push the body
      // straight into something else.
      const options = [
        ['up', up], ['down', down], ['left', left], ['right', right],
      ].sort((a, b) => a[1] - b[1]);

      const snapshot = { x: body.x, y: body.y, vx: body.vx, vy: body.vy };
      let chosen = null;
      for (const [dir] of options) {
        body.x = snapshot.x; body.y = snapshot.y; body.vx = snapshot.vx; body.vy = snapshot.vy;
        pushInDirection(body, s, dir);
        if (!overlapsAny(body, solids)) { chosen = dir; break; }
      }
      if (!chosen) {
        // Every direction collides (a genuinely enclosed pocket). Fall back to
        // the shallowest push and let the sweep sort it out next frame.
        body.x = snapshot.x; body.y = snapshot.y; body.vx = snapshot.vx; body.vy = snapshot.vy;
        pushInDirection(body, s, options[0][0]);
      }
      moved = true;
      resolvedAny = true;
    }
    if (!resolvedAny) break;
  }
  return moved;
}

/**
 * Combined physics step: depenetrate, then sweep each axis. Solids the body is
 * still inside after depenetration are skipped so they cannot eject it.
 */
export function physicsStep(body, solids, dt) {
  const solidsY = solids.filter((s) => s.oneWay !== true);
  depenetrate(body, solids);
  const ignore = new Set(solids.filter((s) => rectsOverlap(body, s)));
  const solidList = solids.filter((s) => !ignore.has(s));
  moveAxis(body, body.vx * dt, solidList, 'x');
  moveAxis(body, body.vy * dt, solidList.filter((s) => solidsY.includes(s)), 'y');
  return body;
}

/** Weighted random choice: entries of [value, weight]. */
export function weighted(rng, entries) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rng.next() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
