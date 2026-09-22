import { RNG, clamp, uid, rectsOverlap } from '../engine/utils.js';
import { getDistrict, DISTRICTS } from '../data/districts.js';
import { COLLECTIBLE_TYPES } from '../data/collectibles.js';

/**
 * Procedural district builder.
 *
 * A district is built as stacked bands so every section can offer a ground route,
 * a rooftop route and a secret route (design rule 55):
 *
 *   sky            ropes, ziplines, tower spires, collectibles
 *   rooftop band   building tops, plank bridges
 *   facade band    balconies, ledges, ladders, trellises, awnings
 *   street band    ground floor, doorways, crowds, hide spots
 *   earth band     solid rock between street and tunnels
 *   tunnel band    sewers / catacombs / secret route
 *
 * Everything is deterministic from the district seed, so a district looks the same
 * every time it is entered.
 */

export const SOLID = { GROUND: 'ground', WALL: 'wall', BUILDING: 'building', PLATFORM: 'platform', ROOF: 'roof', BEDROCK: 'bedrock', EARTH: 'earth' };

const GROUND_H = 40;          // thickness of the street slab
const EARTH_GAP = 250;        // rock between street slab and tunnel ceiling
const TUNNEL_H = 132;         // tunnel headroom
const BEDROCK_H = 220;

export class District {
  constructor(def) {
    this.id = def.id;
    this.def = def;
    this.name = def.name;
    this.width = def.width;
    this.height = def.height;
    this.palette = def.palette;
    this.solids = [];
    this.buildings = [];
    this.platforms = [];
    this.ladders = [];
    this.trellises = [];
    this.ropes = [];
    this.ziplines = [];
    this.ledges = [];
    this.hideSpots = [];
    this.awning = [];
    this.decor = [];
    this.lights = [];
    this.towers = [];
    this.collectibles = [];
    this.spawnPoints = [];
    this.rooftops = [];
    this.landmarks = { shops: [], safehouse: null, exits: [], tunnelEntrances: [] };
    this.control = 1;                 // 1 = full Dominion control, 0 = liberated
    this.revealed = 0;                // metres of map revealed by towers
    this.bounds = { x: 0, y: 0, w: def.width, h: def.height };
    this.groundY = def.underground ? 700 : 300;
  }

  addSolid(x, y, w, h, type = SOLID.BUILDING, extra = {}) {
    const s = { x, y, w, h, type, id: uid('s'), ...extra };
    this.solids.push(s);
    return s;
  }

  /** All climbable verticals usable at (x, y). */
  laddersAt(x, y) {
    for (const l of this.ladders) {
      if (x > l.x - 14 && x < l.x + l.w + 14 && y >= l.y - 6 && y <= l.y + l.h + 6) return l;
    }
    return null;
  }

  /** Trellis / climbable facade at (x,y), used when pressing up against the wall. */
  trellisAt(x, y, facing) {
    for (const t of this.trellises) {
      if (y < t.y - 8 || y > t.y + t.h + 8) continue;
      if (facing > 0 && x > t.x - 22 && x < t.x + t.w + 6) return t;
      if (facing < 0 && x < t.x + t.w + 22 && x > t.x - 6) return t;
    }
    return null;
  }

  /** Rope whose grab band contains the point. */
  ropeAt(x, y) {
    for (const r of this.ropes) {
      if (x > r.x - 20 && x < r.x + r.w + 20 && y > r.y - 10 && y < r.y + r.h + 10) return r;
    }
    return null;
  }

  ziplineAt(x, y) {
    for (const z of this.ziplines) {
      if (x > Math.min(z.x1, z.x2) - 20 && x < Math.max(z.x1, z.x2) + 20 && Math.abs(y - z.y) < 42) return z;
    }
    return null;
  }

  ledgeAt(x, y, facing) {
    for (const l of this.ledges) {
      const top = l.y;
      if (y > top + 6 || y < top - 62) continue;
      if (facing > 0 && x > l.x - 26 && x < l.x + 10) return l;
      if (facing < 0 && x < l.x + l.w + 26 && x > l.x + l.w - 10) return l;
    }
    return null;
  }

  hideSpotAt(x, y) {
    for (const h of this.hideSpots) {
      if (x + 12 > h.x && x - 12 < h.x + h.w && y + 46 > h.y && y < h.y + h.h) return h;
    }
    return null;
  }

  /** True when a character-sized box at (x, y) overlaps no blocking solid. */
  isFreeAt(x, y, w, h) {
    const box = { x, y, w, h };
    for (const s of this.solids) {
      if (s.type === SOLID.PLATFORM) continue;
      if (rectsOverlap(box, s)) return false;
    }
    return true;
  }

  /** True when a character can stand at (x, y) and also take a few steps both ways. */
  isRoomyAt(x, y, w, h, room = 70) {
    return this.isFreeAt(x - room, y, w, h) && this.isFreeAt(x + room, y, w, h)
      && this.isFreeAt(x, y, w, h);
  }

  /**
   * Nearest free standing position to (x, y), searched horizontally along the
   * ground and then across the district's declared exits. Guarantees a spot to
   * place the player on arrival even if a building sits on the intended entry.
   */
  freeSpotNear(x, y, w, h) {
    if (this.isRoomyAt(x, y, w, h)) return { x, y };
    // Prefer a spot with clearance on both sides, so the player is not parked in
    // a slot between two buildings with nowhere to walk.
    for (let step = 24; step <= this.width; step += 24) {
      for (const dir of [1, -1]) {
        const nx = clamp(x + dir * step, 20, this.width - w - 20);
        if (this.isRoomyAt(nx, y, w, h)) return { x: nx, y };
      }
    }
    for (let step = 24; step <= this.width; step += 24) {
      for (const dir of [1, -1]) {
        const nx = clamp(x + dir * step, 20, this.width - w - 20);
        if (this.isFreeAt(nx, y, w, h)) return { x: nx, y };
      }
    }
    for (const e of this.landmarks.exits) {
      const nx = e.x + e.w / 2 - w / 2;
      const ny = this.groundY - h - 2;
      if (this.isFreeAt(nx, ny, w, h)) return { x: nx, y: ny };
    }
    return { x: clamp(x, 20, this.width - w - 20), y: this.groundY - h - 2 };
  }

  /**
   * Validated arrival point for a district. Prefers the west entrance, but walks
   * eastward until it finds a spot with clear ground on both sides: spawning in a
   * pocket between a building and the world edge would trap the player.
   */
  entryPoint(w, h) {
    const y = this.groundY - h - 2;
    const west = this.landmarks.exits.find((e) => e.dir === -1) || this.landmarks.exits[0];
    const startX = west ? west.x + west.w / 2 - w / 2 : 160;
    for (let x = startX; x < this.width - w - 60; x += 20) {
      if (this.isRoomyAt(x, y, w, h)) return { x, y };
    }
    for (let x = startX; x < this.width - w - 60; x += 20) {
      if (this.isFreeAt(x, y, w, h)) return { x, y };
    }
    return this.freeSpotNear(startX, y, w, h);
  }

  /** Solid nearest to a point, used by AI and the camera. */
  solidBelow(x, y) {
    let best = null;
    for (const s of this.solids) {
      if (x < s.x || x > s.x + s.w) continue;
      if (s.y < y) continue;
      if (!best || s.y < best.y) best = s;
    }
    return best;
  }
}

function buildStreet(ctx, rng, d, def) {
  const groundY = d.groundY;
  // Street slab spans the district. Kept thin so the tunnels sit underneath.
  d.addSolid(0, groundY, d.width, GROUND_H, SOLID.GROUND);
  // Kerb decorations and street furniture every so often.
  let x = 120;
  while (x < d.width - 120) {
    const roll = rng.next();
    if (roll < 0.16) d.decor.push({ type: 'lamp', x, y: groundY, h: 90 });
    else if (roll < 0.26) d.decor.push({ type: 'crate', x, y: groundY, w: rng.int(24, 34), h: rng.int(24, 36) });
    else if (roll < 0.34) d.decor.push({ type: 'barrel', x, y: groundY, r: rng.int(12, 17) });
    else if (roll < 0.40) d.decor.push({ type: 'tree', x, y: groundY, h: rng.int(90, 150) });
    else if (roll < 0.48) d.decor.push({ type: 'bush', x, y: groundY, w: rng.int(40, 70), h: rng.int(22, 34) });
    else if (roll < 0.54) d.decor.push({ type: 'haycart', x, y: groundY, w: 74, h: 44 });
    else if (roll < 0.60) d.decor.push({ type: 'bench', x, y: groundY, w: 56, h: 16 });
    else if (roll < 0.65) d.decor.push({ type: 'fountain', x, y: groundY, w: rng.int(70, 110), h: 46 });
    x += rng.range(90, 220);
  }
}

function buildBuildings(ctx, rng, d, def) {
  const groundY = d.groundY;
  const maxRoof = groundY - 400;
  let x = 140;
  const gapMin = def.streetWidth * 0.7;
  const gapMax = def.streetWidth * 1.25;
  let lastRoof = null;

  while (x < d.width - 240) {
    const w = rng.range(130, 300) * (0.85 + def.density * 0.4);
    const h = rng.range(170, 470);
    const topY = groundY - h;
    const id = uid('b');
    const b = { id, x, y: topY, w, h, roofY: topY, floors: Math.max(1, Math.round(h / 96)), hasLadder: false, hasTrellis: false };
    d.addSolid(x, topY, w, h, SOLID.BUILDING, { building: id });
    d.buildings.push(b);
    d.rooftops.push({ x: x + 8, y: topY, w: w - 16, h: 16, building: id });

    // ── Facade features: balconies that step up to the roof ──
    const balconyCount = rng.int(1, 3);
    let by = groundY - rng.range(90, 150);
    for (let i = 0; i < balconyCount && by > topY + 70; i++) {
      const bw = rng.range(60, 110);
      const bx = rng.chance(0.5) ? x - 12 : x + w - bw + 12;
      d.addSolid(bx, by, bw, 12, SOLID.PLATFORM);
      d.platforms.push({ x: bx, y: by, w: bw, h: 12, building: id });
      d.ledges.push({ x: bx, y: by, w: bw, h: 12, building: id });
      by -= rng.range(96, 132);
    }

    // ── Vertical access ──
    const access = rng.next();
    if (access < 0.42) {
      // Ladder bolted to the wall.
      const lx = rng.chance(0.5) ? x + 6 : x + w - 22;
      d.ladders.push({ x: lx, y: topY, w: 16, h: h + 4, building: id });
      b.hasLadder = true;
    } else if (access < 0.66) {
      // Trellis: climbable facade (must hug the wall).
      const tx = x + rng.range(0.15, 0.7) * w;
      d.trellises.push({ x: tx, y: topY, w: 34, h: h + 4, building: id });
      b.hasTrellis = true;
    } else if (access < 0.80) {
      // Rope from the roof.
      const rx = x + rng.range(0.2, 0.8) * w;
      const rl = h * rng.range(0.55, 0.95);
      d.ropes.push({ x: rx, y: topY, w: 8, h: rl, building: id });
    }
    // Awnings near street level double as a first step up.
    if (rng.chance(0.5)) {
      const aw = rng.range(70, 120);
      const ax = clamp(x + rng.range(-20, w - aw + 20), 10, d.width - aw - 10);
      const ay = groundY - rng.range(74, 104);
      d.addSolid(ax, ay, aw, 10, SOLID.PLATFORM);
      d.platforms.push({ x: ax, y: ay, w: aw, h: 10, building: id, awning: true });
      d.awning.push({ x: ax, y: ay, w: aw, h: 10 });
    }

    // ── Roof connections ──
    if (lastRoof) {
      const gap = x - (lastRoof.x + lastRoof.w);
      const dy = Math.abs(lastRoof.y - topY);
      if (gap > 0 && gap < 190 && dy < 90) {
        // Plank bridge.
        const by2 = Math.min(lastRoof.y, topY) - 6;
        d.addSolid(lastRoof.x + lastRoof.w - 6, by2, gap + 12, 10, SOLID.PLATFORM);
        d.platforms.push({ x: lastRoof.x + lastRoof.w - 6, y: by2, w: gap + 12, h: 10, bridge: true });
      } else if (gap >= 190) {
        // Zipline or rope bridge across the street.
        if (rng.chance(0.55)) {
          const y1 = lastRoof.y - rng.range(0, 40);
          const y2 = topY - rng.range(0, 40);
          d.ziplines.push({ x1: lastRoof.x + lastRoof.w, y1, x2: x, y2, building: id });
        } else {
          const rx = (lastRoof.x + lastRoof.w + x) / 2;
          d.ropes.push({ x: rx, y: Math.min(lastRoof.y, topY) - 80, w: 8, h: 90, swing: true });
        }
      }
    }
    lastRoof = { x, y: topY, w };
    x += w + rng.range(gapMin, gapMax);
  }
  d.streetEnd = x;
}

function buildHideSpots(rng, d, def) {
  const groundY = d.groundY;
  // Ground cover: grass, bushes, hay carts, shadowed alcoves, benches, crowds.
  let x = 100;
  while (x < d.width - 100) {
    const roll = rng.next();
    if (roll < 0.30) {
      const w = rng.range(70, 150);
      d.hideSpots.push({ x, y: groundY - 30, w, h: 34, kind: 'grass', label: 'Tall Grass' });
      x += w + rng.range(30, 90);
    } else if (roll < 0.44) {
      const w = rng.range(60, 100);
      d.hideSpots.push({ x, y: groundY - 42, w, h: 46, kind: 'cart', label: 'Hay Cart' });
      x += w + rng.range(40, 110);
    } else if (roll < 0.56) {
      const w = rng.range(80, 140);
      d.hideSpots.push({ x, y: groundY - 56, w, h: 60, kind: 'shadow', label: 'Deep Shadow' });
      x += w + rng.range(50, 120);
    } else {
      x += rng.range(100, 260);
    }
  }
  // Rooftop hiding: chimneys, laundry, rooftop sheds.
  for (const roof of d.rooftops) {
    if (rng.chance(0.5)) {
      d.hideSpots.push({
        x: roof.x + rng.range(0, Math.max(1, roof.w - 70)),
        y: roof.y - 58, w: rng.range(56, 78), h: 60, kind: 'rooftop', label: 'Rooftop Cover', elevated: true,
      });
    }
  }
  // Tunnel hiding.
  for (const c of d.tunnelCorridors || []) {
    if (rng.chance(0.45)) {
      d.hideSpots.push({ x: c.x + rng.range(20, Math.max(21, c.w - 80)), y: c.y + c.h - 58, w: 70, h: 60, kind: 'shadow', label: 'Tunnel Dark', tunnel: true });
    }
  }
}

function buildTunnels(rng, d, def) {
  const groundY = d.groundY;
  const ceilingTop = groundY + GROUND_H;
  const corridorTop = groundY + GROUND_H + EARTH_GAP;
  const corridorBottom = corridorTop + TUNNEL_H;

  // Shaft positions where the street connects down to the tunnels.
  const shaftCount = def.underground ? 0 : rng.int(2, 4);
  const shafts = [];
  for (let i = 0; i < shaftCount; i++) {
    const sx = rng.range(420, d.width - 420);
    if (shafts.some((s) => Math.abs(s - sx) < 380)) continue;
    shafts.push(sx);
  }
  shafts.sort((a, b) => a - b);

  // Ceiling slab as segments between shafts (a shaft is an open column).
  let cursor = 0;
  const shaftW = 60;
  for (const s of shafts) {
    d.addSolid(cursor, ceilingTop, (s - shaftW / 2) - cursor, EARTH_GAP, SOLID.EARTH);
    cursor = s + shaftW / 2;
    d.landmarks.tunnelEntrances.push({ x: s, y: groundY, kind: 'shaft' });
    d.ladders.push({ x: s - 12, y: corridorBottom - 90, w: 18, h: EARTH_GAP + 90, tunnel: true });
  }
  d.addSolid(cursor, ceilingTop, d.width - cursor, EARTH_GAP, SOLID.EARTH);

  // Bedrock under everything.
  d.addSolid(0, corridorBottom, d.width, BEDROCK_H, SOLID.BEDROCK);

  // Tunnel corridor walls: solid plugs create dead ends and branch points.
  d.tunnelCorridors = [];
  let x = 60;
  while (x < d.width - 80) {
    const seg = rng.range(320, 760);
    const open = rng.chance(0.72);
    if (open) {
      d.tunnelCorridors.push({ x, y: corridorTop, w: seg, h: TUNNEL_H });
    } else {
      d.addSolid(x, corridorTop, seg, TUNNEL_H, SOLID.EARTH);
    }
    x += seg + rng.range(0, 90);
  }
  // Tunnel pillars for cover.
  for (const c of d.tunnelCorridors) {
    if (rng.chance(0.5) && c.w > 220) {
      const px = c.x + rng.range(60, c.w - 100);
      d.addSolid(px, c.y, 40, TUNNEL_H, SOLID.WALL);
    }
  }
  // Tunnel collectibles and enemy posts.
  for (const c of d.tunnelCorridors) {
    if (rng.chance(0.4)) {
      d.collectibles.push({
        type: rng.pick(Object.keys(COLLECTIBLE_TYPES)),
        x: c.x + rng.range(30, Math.max(31, c.w - 40)),
        y: c.y + c.h - 28,
        taken: false, id: uid('c'),
      });
    }
    if (rng.chance(0.35)) {
      d.spawnPoints.push({
        x: c.x + rng.range(40, Math.max(41, c.w - 60)), y: c.y + c.h - 52,
        type: rng.chance(0.6) ? 'guard' : 'hunter', patrol: 120, zone: 'tunnel',
      });
    }
  }
}

function buildTowers(rng, d, def) {
  if (!def.watchtower && def.id !== 'fortress') return;
  const groundY = d.groundY;
  const count = def.towers;
  for (let i = 0; i < count; i++) {
    const tx = Math.round(((i + 0.5) / count) * d.width + rng.range(-80, 80));
    const th = 520 + rng.range(0, 160);
    const tw = 76;
    const topY = groundY - th;
    d.addSolid(tx - tw / 2, topY, tw, th, SOLID.BUILDING, { tower: true });
    const tower = {
      id: uid('t'), x: tx - tw / 2, y: topY, w: tw, h: th, beaconY: topY - 26,
      disabled: false, revealRadius: 760, index: i, district: d.id,
    };
    // Spiral climbing: ladder on alternating sides plus ledges.
    d.ladders.push({ x: tx - tw / 2 + 6, y: topY + 120, w: 16, h: th - 124, tower: tower.id });
    for (let k = 0; k < 4; k++) {
      const ly = groundY - 90 - k * (th / 5);
      const side = k % 2 === 0 ? 1 : -1;
      const lx = side > 0 ? tx + tw / 2 - 10 : tx - tw / 2 - 46;
      d.addSolid(lx, ly, 56, 12, SOLID.PLATFORM);
      d.platforms.push({ x: lx, y: ly, w: 56, h: 12, tower: true });
      d.ledges.push({ x: lx, y: ly, w: 56, h: 12, tower: true });
    }
    d.towers.push(tower);
    d.rooftops.push({ x: tower.x + 4, y: topY, w: tw - 8, h: 14, tower: tower.id });
    // Beacon frame + guard detail on the balconies.
    d.spawnPoints.push({ x: tx - 26, y: topY - 52, type: 'archer', patrol: 60, zone: 'tower' });
    d.spawnPoints.push({ x: tx + 10, y: topY - 52, type: 'guard', patrol: 60, zone: 'tower' });
  }
}

function buildLandmarks(rng, d, def) {
  const groundY = d.groundY;
  // Shops: cluster in the middle third of the district.
  const shopTypes = def.id === 'industrial' ? ['smith', 'gadgeteer', 'merchant']
    : def.id === 'nobleHeights' ? ['armorer', 'merchant', 'informant']
    : def.id === 'harbor' ? ['merchant', 'informant', 'gadgeteer']
    : def.id === 'cathedral' ? ['doctor', 'scholar', 'armorer']
    : ['merchant', 'smith', 'armorer', 'gadgeteer'];
  const shopCount = clamp(Math.round(def.width / 900), 2, 4);
  for (let i = 0; i < shopCount; i++) {
    const sx = Math.round(d.width * (0.16 + (i / Math.max(1, shopCount)) * 0.66) + rng.range(-70, 70));
    d.landmarks.shops.push({ id: uid('sh'), kind: shopTypes[i % shopTypes.length], x: sx, y: groundY, name: null });
    d.lights.push({ x: sx, y: groundY - 70, r: 130, color: 'rgba(240,207,107,.16)' });
  }
  // Safehouse.
  if (def.safehouse) {
    const hx = Math.round(d.width * rng.range(0.3, 0.7));
    d.landmarks.safehouse = { x: hx, y: groundY, name: 'Safehouse' };
    d.lights.push({ x: hx, y: groundY - 60, r: 110, color: 'rgba(111,195,214,.14)' });
  }
  // Exits at both ends.
  d.landmarks.exits.push({ x: 40, y: groundY - 120, w: 70, h: 130, dir: -1, to: null });
  d.landmarks.exits.push({ x: d.width - 110, y: groundY - 120, w: 70, h: 130, dir: 1, to: null });
  // District-specific landmark: gallows, cathedral, fortress gate.
  if (def.id === 'oldQuarter') d.landmarks.gallows = { x: Math.round(d.width * 0.5), y: groundY, built: false };
  if (def.id === 'cathedral') d.landmarks.belfry = { x: Math.round(d.width * 0.45), y: groundY - 420, w: 120, h: 420 };
  if (def.id === 'fortress') d.landmarks.keep = { x: Math.round(d.width * 0.72), y: groundY - 520, w: 320, h: 520 };
  if (def.id === 'royal') d.landmarks.palace = { x: Math.round(d.width * 0.6), y: groundY - 460, w: 280, h: 460 };
}

function buildCiviliansAndNPCs(rng, d, def) {
  const groundY = d.groundY;
  for (let i = 0; i < def.civCount; i++) {
    const x = rng.range(260, d.width - 260);
    d.spawnPoints.push({
      x, y: groundY - 46, type: 'civilian', patrol: rng.range(90, 320),
      variant: rng.pick(['merchant', 'worker', 'noble', 'child', 'beggar', 'courier']),
    });
  }
  const npcCount = clamp(Math.round(def.width / 1400), 1, 3);
  for (let i = 0; i < npcCount; i++) {
    d.spawnPoints.push({
      x: rng.range(300, d.width - 300), y: groundY - 48, type: 'npc',
      archetype: rng.pick(['informant', 'doctor', 'scholar', 'recruit']),
    });
  }
}

function buildEnemies(rng, d, def) {
  const groundY = d.groundY;
  const mix = def.guardMix;
  let total = 0;
  for (const [, w] of mix) total += w;
  const posts = clamp(Math.round(def.width / (def.control === 0 ? 520 : 360)), 5, 22);
  for (let i = 0; i < posts; i++) {
    const x = rng.range(220, d.width - 220);
    // 65% street patrol, 35% rooftop sentry → makes rooftop route contested.
    if (rng.chance(0.33)) {
      const roof = d.rooftops[rng.int(0, d.rooftops.length - 1)];
      if (roof) {
        d.spawnPoints.push({ x: roof.x + roof.w / 2, y: roof.y - 52, type: 'guard', patrol: rng.range(80, 180), zone: 'roof' });
        continue;
      }
    }
    let r = rng.next() * total;
    let type = mix[0][0];
    for (const [t, w] of mix) { r -= w; if (r <= 0) { type = t; break; } }
    d.spawnPoints.push({ x, y: groundY - 52, type, patrol: rng.range(90, 260), zone: 'street' });
  }
  // Guard posts near landmarks.
  for (const shop of d.landmarks.shops) {
    d.spawnPoints.push({ x: shop.x + rng.range(-70, 70), y: groundY - 52, type: 'guard', patrol: 70, zone: 'shop' });
  }
  if (d.landmarks.safehouse) {
    d.spawnPoints.push({ x: d.landmarks.safehouse.x + rng.range(-120, -60), y: groundY - 52, type: 'guard', patrol: 90, zone: 'safehouse' });
  }
}

function buildCollectibles(rng, d, def) {
  const target = def.secrets + 3;
  let placed = 0, guard = 0;
  while (placed < target && guard++ < 400) {
    const roll = rng.next();
    let x, y;
    if (roll < 0.4 && d.rooftops.length) {
      const r = d.rooftops[rng.int(0, d.rooftops.length - 1)];
      x = r.x + rng.range(4, Math.max(5, r.w - 8)); y = r.y - 34;
    } else if (roll < 0.7) {
      x = rng.range(120, d.width - 120); y = d.groundY - 34;
    } else if (d.tunnelCorridors?.length) {
      const c = d.tunnelCorridors[rng.int(0, d.tunnelCorridors.length - 1)];
      x = c.x + rng.range(20, Math.max(21, c.w - 40)); y = c.y + c.h - 30;
    } else continue;
    d.collectibles.push({ type: rng.pick(Object.keys(COLLECTIBLE_TYPES)), x, y, taken: false, id: uid('c') });
    placed++;
  }
}


/**
 * Underground districts (sewers, catacombs) are a different shape entirely:
 * a walkable cavern floor, a ceiling, supporting pillars, side galleries and
 * dead-end chambers. There is no sky and no street band.
 */
function buildUnderground(rng, d, def) {
  // The walkable floor is the district's ground level: every spawn placer, hide
  // spot builder and landmark builder reads d.groundY, so this must be correct
  // before they run.
  const headroom = 230;
  const floorY = d.groundY + 220;
  d.groundY = floorY;
  const ceilY = floorY - headroom;

  d.addSolid(0, floorY, d.width, 80, SOLID.GROUND);
  d.addSolid(0, ceilY - 90, d.width, 90, SOLID.EARTH);
  d.addSolid(0, floorY + 80, d.width, 220, SOLID.BEDROCK);
  d.tunnelCorridors = [];

  let x = 240;
  while (x < d.width - 240) {
    const roll = rng.next();
    if (roll < 0.48) {
      const w = rng.range(60, 130);
      d.addSolid(x, ceilY, w, headroom, SOLID.WALL);
      d.ledges.push({ x: x - 46, y: ceilY + 55, w: 46, h: 12, tunnel: true });
      d.addSolid(x - 46, ceilY + 55, 46, 12, SOLID.PLATFORM);
      d.ledges.push({ x: x + w, y: ceilY + 120, w: 46, h: 12, tunnel: true });
      d.addSolid(x + w, ceilY + 120, 46, 12, SOLID.PLATFORM);
    } else if (roll < 0.74) {
      const pw = rng.range(180, 300);
      const py = ceilY + rng.range(70, 130);
      d.addSolid(x, py, pw, 14, SOLID.PLATFORM);
      d.ledges.push({ x, y: py, w: pw, h: 14, tunnel: true });
      d.ladders.push({ x: x + 14, y: py, w: 16, h: floorY - py, tunnel: true });
      x += pw;
    } else if (roll < 0.92) {
      const cw = rng.range(300, 520);
      d.tunnelCorridors.push({ x, y: ceilY, w: cw, h: headroom });
      x += cw;
    }
    x += rng.range(150, 300);
  }
  d.streetEnd = d.width;

  // The whole cavern floor is walkable, so register it as one long corridor and
  // let the chambers above subdivide it for cover/hide placement.
  d.tunnelCorridors.unshift({ x: 60, y: ceilY, w: d.width - 120, h: headroom, main: true });
  if (!d.tunnelCorridors.some((c) => !c.main)) d.tunnelCorridors.push({ x: 200, y: ceilY, w: d.width - 400, h: headroom });

  let dx = 160;
  while (dx < d.width - 160) {
    const roll = rng.next();
    if (roll < 0.22) d.decor.push({ type: 'crate', x: dx, y: floorY, w: rng.int(26, 38), h: rng.int(26, 40) });
    else if (roll < 0.34) d.decor.push({ type: 'barrel', x: dx, y: floorY, r: rng.int(12, 18) });
    else if (roll < 0.44) d.decor.push({ type: 'fountain', x: dx, y: floorY, w: rng.int(80, 130), h: 40 });
    if (rng.chance(0.3)) d.lights.push({ x: dx, y: ceilY + 30, r: 170, color: 'rgba(90,168,106,.18)' });
    dx += rng.range(120, 280);
  }

  for (let i = 0; i < 6; i++) {
    const lx = rng.range(200, d.width - 200);
    d.ladders.push({ x: lx, y: ceilY + 40, w: 16, h: headroom - 40, tunnel: true });
  }

  for (let i = 0; i < 3; i++) {
    const tx = Math.round(d.width * (0.2 + i * 0.3));
    d.landmarks.tunnelEntrances.push({ x: tx, y: ceilY, kind: 'shaft' });
  }
}

/** Build (or rebuild) a district definition into a live District instance. */
export function buildDistrict(districtId) {
  const def = getDistrict(districtId);
  const rng = new RNG(def.seed);
  const d = new District(def);
  if (def.underground) {
    buildUnderground(rng, d, def);
  } else {
    buildStreet({}, rng, d, def);
    buildBuildings({}, rng, d, def);
    buildTunnels(rng, d, def);
  }
  buildHideSpots(rng, d, def);
  buildTowers(rng, d, def);
  buildLandmarks(rng, d, def);
  buildCiviliansAndNPCs(rng, d, def);
  buildEnemies(rng, d, def);
  buildCollectibles(rng, d, def);
  // Characters must never start inside geometry: relocate any spawn point that
  // lands in a solid before the district is handed to the world.
  clearSpawnPoints(d, rng);
  // Bake a static collision list. Dynamic doors are added at runtime.
  d.collision = d.solids.slice();
  return d;
}

/**
 * True when a character-sized box at (x, y) overlaps no solid. Used to validate
 * generated spawn points so entities never begin the game embedded in a wall.
 */
export function isSpawnFree(d, x, y, w, h) {
  const box = { x, y, w, h };
  for (const s of d.solids) {
    if (s.type === SOLID.PLATFORM) continue;   // one-way platforms are fine to start on
    if (rectsOverlap(box, s)) return false;
  }
  return true;
}

/**
 * Walk each spawn point to the nearest free position, preferring to keep the
 * entity's feet at its intended height (so rooftop sentries stay on rooftops
 * and street patrols stay on the street).
 */
export function clearSpawnPoints(d, rng) {
  const SIZES = { civilian: [22, 48], npc: [24, 50], default: [26, 52] };
  for (const sp of d.spawnPoints) {
    const [w, h] = SIZES[sp.type] || SIZES.default;
    const y = sp.y;
    if (isSpawnFree(d, sp.x, y, w, h)) continue;
    // Search outward in widening steps for a free column at the same height.
    let found = false;
    for (let step = 30; step <= 900 && !found; step += 30) {
      for (const dir of [1, -1]) {
        const nx = clamp(sp.x + dir * step, 24, d.width - w - 24);
        if (isSpawnFree(d, nx, y, w, h)) { sp.x = nx; found = true; break; }
      }
    }
    if (!found) {
      // Try lifting the entity onto the nearest rooftop or platform instead.
      for (const r of d.rooftops) {
        const nx = clamp(sp.x, r.x + 4, r.x + r.w - w - 4);
        const ny = r.y - h - 2;
        if (isSpawnFree(d, nx, ny, w, h)) { sp.x = nx; sp.y = ny; sp.zone = sp.zone || 'roof'; found = true; break; }
      }
    }
    if (!found) {
      // Last resort: place it on the street at the least-bad free column, or
      // drop it if the district is somehow fully solid at that height.
      sp.x = clamp(sp.x, 40, d.width - 60);
      sp.y = d.groundY - h - 2;
      if (!isSpawnFree(d, sp.x, sp.y, w, h)) sp.drop = true;
    }
  }
  // Remove any spawn points we could not place at all.
  d.spawnPoints = d.spawnPoints.filter((sp) => !sp.drop);
  // Same treatment for collectibles, which otherwise sit inside walls.
  for (const c of d.collectibles) {
    if (isSpawnFree(d, c.x - 12, c.y - 12, 24, 24)) continue;
    let found = false;
    for (let step = 20; step <= 600 && !found; step += 20) {
      for (const dir of [1, -1]) {
        const nx = clamp(c.x + dir * step, 30, d.width - 30);
        if (isSpawnFree(d, nx - 12, c.y - 12, 24, 24)) { c.x = nx; found = true; break; }
      }
    }
  }
}

export const ALL_DISTRICTS = DISTRICTS;
