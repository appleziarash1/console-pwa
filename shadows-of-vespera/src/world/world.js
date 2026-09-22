import { clamp, damp, sign, uid, rectsOverlap, RNG, dist2 } from '../engine/utils.js';
import { buildDistrict, SOLID } from './worldBuilder.js';
import { Enemy } from '../entities/enemy.js';
import { Boss, Ally } from '../entities/boss.js';
import { Civilian, NPC, Projectile } from '../entities/npc.js';
import { getEnemyType } from '../data/enemies.js';
import { getDistrict } from '../data/districts.js';
import { RECRUIT_CANDIDATES, getNPC } from '../data/npcs.js';
import { getBoss } from '../data/bosses.js';
import { COLLECTIBLE_TYPES } from '../data/collectibles.js';

/**
 * World: owns the live district, all entities, hazards, weather, the alert ladder
 * and the wanted system. The game loop talks to this and it talks back through
 * callbacks on the Game object.
 */
export class World {
  constructor(game) {
    this.game = game;
    this.district = null;
    this.districtId = null;
    this.player = null;
    this.enemies = [];
    this.civilians = [];
    this.npcs = [];
    this.allies = [];
    this.projectiles = [];
    this.hazards = [];
    this.smokeClouds = [];
    this.fireZones = [];
    this.barks = [];
    this.boss = null;
    this.alertLevel = 0;
    this.alertTimer = 0;
    this.wanted = 0;
    this.wantedDecay = 0;
    this.lockdown = false;
    this.reinforcements = [];
    this.reinforcementTimer = 0;
    this.weather = 'clear';
    this.timeOfDay = 'day';
    this.isNight = false;
    this.revealedUntil = 0;
    this.collectedThisRun = 0;
    this.environmentTimer = 0;
    this.kills = 0;
    this.killLog = [];
    this.blockedSightCache = 0;
  }

  get districtDef() { return getDistrict(this.districtId); }

  // ───────────────────────────── loading ─────────────────────────────
  loadDistrict(districtId, opts = {}) {
    this.districtId = districtId;
    this.district = buildDistrict(districtId);
    const def = this.districtDef;
    this.district.control = this.game.save.districtControl?.[districtId] ?? 1;
    this.enemies.length = 0;
    this.civilians.length = 0;
    this.npcs.length = 0;
    this.projectiles.length = 0;
    this.hazards.length = 0;
    this.smokeClouds.length = 0;
    this.fireZones.length = 0;
    this.barks.length = 0;
    this.boss = null;
    this.alertLevel = 0;
    this.lockdown = false;
    this.reinforcements.length = 0;

    // Player placement. Entrances are validated against geometry: a fixed
    // coordinate can easily fall inside a building, which would leave the player
    // stuck in a wall on arrival.
    if (opts.entryX !== undefined) {
      this.player.x = opts.entryX;
      this.player.y = opts.entryY ?? this.district.groundY - this.player.h - 2;
    } else if (this.player.x === 0 && this.player.y === 0) {
      const spawn = this.district.entryPoint(this.player.w, this.player.h);
      this.player.x = spawn.x;
      this.player.y = spawn.y;
    }
    // Nudge out of geometry if the chosen entrance is somehow still occupied.
    this.player.x = this.district.freeSpotNear(
      this.player.x, this.player.y, this.player.w, this.player.h,
    ).x;
    this.player.vx = 0; this.player.vy = 0;
    this.player.grounded = false;
    this.player.fallStart = null;

    // Spawn entities from the generation spawn points.
    for (const sp of this.district.spawnPoints) {
      if (sp.type === 'civilian') {
        this.civilians.push(new Civilian(this.game, sp.x, sp.y, sp.variant));
      } else if (sp.type === 'npc') {
        this.npcs.push(new NPC(this.game, sp.x, sp.y, sp.archetype, {}));
      } else {
        if (this.district.control <= 0 && Math.random() < 0.75) continue; // liberated districts are safer
        this.enemies.push(new Enemy(this.game, getEnemyType(sp.type), sp.x, sp.y, sp));
      }
    }
    // Shops and safehouse NPCs.
    for (const shop of this.district.landmarks.shops) {
      this.npcs.push(new NPC(this.game, shop.x, this.district.groundY - 50, shop.kind, { shop: getNPC(shop.kind).shop }));
    }
    if (this.district.landmarks.safehouse) {
      const sh = this.district.landmarks.safehouse;
      this.npcs.push(new NPC(this.game, sh.x + 40, this.district.groundY - 50, 'leader', { id: 'safehouseLeader' }));
      // Recruit candidates for this district.
      const cands = RECRUIT_CANDIDATES.filter((c) => c.district === districtId);
      cands.forEach((c, i) => {
        this.npcs.push(new NPC(this.game, sh.x - 60 - i * 50, this.district.groundY - 50, 'recruit', {
          recruitId: c.id, name: c.name, id: `recruit_${c.id}`,
        }));
      });
    }
    // Tutorial/gallows landmark from the mission.
    this.buildMissionProps(opts);

    // Weather and time.
    this.setWeather(opts.weather || this.rollWeather(def), opts.time || this.rollTime(def));

    // Restore collected collectibles.
    for (const c of this.district.collectibles) {
      if (this.game.save.collected?.includes(`${districtId}:${c.id}`)) c.taken = true;
    }
    // Restore disabled towers.
    for (const t of this.district.towers) {
      if (this.game.save.disabledTowers?.includes(`${districtId}:${t.index}`)) t.disabled = true;
    }
    this.game.backdrop.rebuild(new RNG(def.seed), def.palette, def.seed);
    this.game.camera.setBounds(this.district.bounds);
  }

  buildMissionProps(opts) {
    const mission = opts.mission || this.game.missions.active;
    if (!mission) return;
    const d = this.district;
    const gy = d.groundY;
    const rng = new RNG(getDistrict(this.districtId).seed + mission.number);

    // Clear props from a previous mission so starting or retrying one does not
    // stack duplicate targets, prisoners and bosses on top of each other.
    this.missionMarkers = [];
    this.enemies = this.enemies.filter((e) => e.zone !== 'target');
    this.civilians = this.civilians.filter((c) => !c.isRescue);
    if (this.boss && !this.boss.dead) this.boss = null;
    this.rescueTargets = [];

    // Place objective markers so the mission is playable in the generated city.
    const markers = [];
    const objs = [...mission.objectives, ...(mission.optional || [])];
    objs.forEach((obj, i) => {
      const x = clamp(d.width * (0.16 + (i + 1) / (objs.length + 1) * 0.7) + rng.range(-60, 60), 120, d.width - 140);
      let y = gy - 40;
      if (obj.type === 'climb' || obj.type === 'disable') {
        const tower = d.towers.find((t) => !t.disabled);
        if (tower) { markers.push({ x: tower.x + tower.w / 2, y: tower.beaconY, obj, id: uid('o'), kind: 'tower' }); return; }
        y = gy - 380;
      }
      if (obj.type === 'investigate' || obj.type === 'steal' || obj.type === 'collect') {
        y = gy - 40;
      }
      markers.push({ x, y, obj, id: uid('o'), kind: obj.type });
    });

    // Targets: named enemies placed at their markers.
    for (const marker of markers) {
      if (marker.obj.type === 'assassinate' || marker.obj.type === 'kill' || marker.obj.type === 'chase') {
        marker.kind = 'target';
      }
    }
    this.missionMarkers = markers;

    // Spawn named targets as tougher enemies near their markers.
    for (const m of markers) {
      if (m.kind !== 'target') continue;
      const t = m.obj.target;
      if (t && t !== mission.boss) {
        const e = new Enemy(this.game, getEnemyType('captain'), m.x, gy - 60, { patrol: 120, zone: 'target' });
        e.isTarget = true;
        e.targetId = t;
        e.name = t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        e.type = { ...e.type, hp: 150, name: e.name };
        e.hp = e.maxHp = 150;
        this.enemies.push(e);
      }
    }

    // Boss mission: spawn the boss in an arena.
    if (mission.boss) {
      const def = getBoss(mission.boss);
      this.boss = new Boss(this.game, def, d.width * 0.7, gy - def.height - 2);
      this.boss.begin();
      this.game.hud.setBoss(this.boss);
    }
    // Prisoners / civilians to rescue.
    this.rescueTargets = [];
    const rescues = objs.filter((o) => o.type === 'rescue' || o.type === 'escort');
    rescues.forEach((obj, i) => {
      const count = obj.type === 'escort' ? 1 : 5;
      for (let k = 0; k < count; k++) {
        const x = clamp(d.width * (0.2 + i * 0.2) + k * 40, 120, d.width - 120);
        const c = new Civilian(this.game, x, gy - 48, obj.type === 'escort' ? 'noble' : 'worker');
        c.isRescue = true;
        c.rescued = false;
        c.following = false;
        c.name = obj.type === 'escort' ? 'VIP' : 'Prisoner';
        this.rescueTargets.push(c);
        this.civilians.push(c);
      }
    });
  }

  rollWeather(def) {
    if (def.id === 'harbor' || def.id === 'cathedral') return Math.random() < 0.5 ? 'fog' : 'clear';
    if (def.id === 'industrial') return Math.random() < 0.4 ? 'rain' : 'clear';
    const r = Math.random();
    if (r < 0.55) return 'clear';
    if (r < 0.75) return 'rain';
    if (r < 0.88) return 'fog';
    return 'storm';
  }

  rollTime(def) {
    return Math.random() < 0.45 ? 'day' : 'night';
  }

  setWeather(weather, time) {
    this.weather = weather;
    this.timeOfDay = time;
    this.isNight = time === 'night';
    this.game.audio.setMood(this.isNight ? 'stealth' : 'exploration');
    this.game.hud.setEnvironment(this);
  }

  // ───────────────────────────── queries ─────────────────────────────
  hasLineOfSight(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 26);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (const s of this.district.collision) {
        if (s.type === SOLID.PLATFORM) continue;
        if (px > s.x && px < s.x + s.w && py > s.y && py < s.y + s.h) return false;
      }
    }
    return true;
  }

  inShadowAt(x, y) {
    // Shadow from point: nearby tall solid to the "light direction" plus night.
    if (this.isNight) return true;
    for (const s of this.district.collision) {
      if (s.type === SOLID.PLATFORM || s.type === SOLID.GROUND) continue;
      if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h + 90) return true;
    }
    return false;
  }

  inCrowdAt(x, y) {
    let count = 0;
    for (const c of this.civilians) {
      if (c.dead || c.fear > 0.4) continue;
      if (Math.abs(c.centerX - x) < 90 && Math.abs(c.centerY - y) < 70) count++;
    }
    return count >= 2;
  }

  inSmoke(x, y, resist = 0) {
    for (const s of this.smokeClouds) {
      if (s.life <= 0) continue;
      if (Math.hypot(s.x - x, s.y - y) < s.r * (1 - resist * 0.6)) return true;
    }
    return false;
  }

  inFire(x, y) {
    return this.fireZones.find((f) => f.life > 0 && Math.hypot(f.x - x, f.y - y) < f.r);
  }

  /** Nearest interactable thing to the player. */
  nearestInteractable() {
    const p = this.player;
    let best = null, bestD = 1e9;
    const consider = (obj, label, range = 70) => {
      const d = Math.hypot(obj.centerX - p.centerX, obj.centerY - p.centerY);
      if (d < range && d < bestD) { bestD = d; best = { obj, label }; }
    };
    for (const n of this.npcs) if (!n.dead) consider(n, n.interactLabel);
    for (const c of this.district.collectibles) {
      if (c.taken) continue;
      const d = Math.hypot(c.x - p.centerX, c.y - p.centerY);
      if (d < 56 && d < bestD) { bestD = d; best = { obj: c, label: 'Collect', collectible: true }; }
    }
    if (this.district.landmarks.safehouse) {
      const sh = this.district.landmarks.safehouse;
      const d = Math.hypot(sh.x - p.centerX, (sh.y - 40) - p.centerY);
      if (d < 110 && d < bestD) { bestD = d; best = { obj: sh, label: 'Enter Safehouse', safehouse: true }; }
    }
    for (const t of this.district.towers) {
      if (t.disabled) continue;
      const d = Math.hypot((t.x + t.w / 2) - p.centerX, t.beaconY - p.centerY);
      if (d < 80 && d < bestD) { bestD = d; best = { obj: t, label: 'Disable Beacon', tower: true, towerObj: t }; }
    }
    // Exits / district travel
    for (const ex of this.district.landmarks.exits) {
      const d = Math.hypot((ex.x + 35) - p.centerX, (ex.y + 65) - p.centerY);
      if (d < 130 && d < bestD) { bestD = d; best = { obj: ex, label: ex.dir < 0 ? 'Travel — previous district' : 'Travel — next district', exit: true, exitObj: ex }; }
    }
    if (this.district.landmarks.tunnelEntrances) {
      for (const te of this.district.landmarks.tunnelEntrances) {
        const d = Math.hypot(te.x - p.centerX, te.y - p.centerY);
        if (d < 60 && d < bestD) { bestD = d; best = { obj: te, label: 'Descend into tunnels', tunnel: true, tunnelObj: te }; }
      }
    }
    for (const r of this.rescueTargets) {
      if (r.rescued || r.dead) continue;
      const d = Math.hypot(r.centerX - p.centerX, r.centerY - p.centerY);
      if (d < 64 && d < bestD) { bestD = d; best = { obj: r, label: 'Free prisoner', rescue: true, rescueObj: r }; }
    }
    return best;
  }

  // ───────────────────────────── combat ─────────────────────────────
  damageEnemy(e, dmg, opts = {}) {
    if (!e || e.dead) return;
    const before = e.hp;
    e.takeDamage(dmg, opts.source || this.player, opts);
    this.game.ui.showDamageNumber?.(e.centerX, e.top ?? e.centerY - 20, Math.round(dmg), opts);
    if (e.hp <= 0 && before > 0) this.kills++;
  }

  killEnemy(e, opts = {}) {
    if (!e || e.dead) return;
    e.dead = true;
    e.hp = 0;
    this.onEnemyDeath(e, opts.source || this.player, opts);
  }

  onEnemyDeath(e, source, opts = {}) {
    const def = e.type;
    const drops = def.drops || {};
    const prog = this.game.progression;
    if (drops.coins) prog.addCoins(Math.round(drops.coins[0] + Math.random() * (drops.coins[1] - drops.coins[0])));
    if (drops.xp) prog.addXp(drops.xp);
    if (drops.tokens) prog.addTokens(drops.tokens);
    for (let i = 0; i < 5; i++) {
      this.game.particles.spawn('coin', e.centerX, e.centerY - 10, {
        vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 80,
        life: 0.7, size: 4, color: '#f0cf6b', gravity: 620, spin: 12,
      });
    }
    this.game.audio.sfx('coin', { volume: 0.5 });
    this.game.onEnemyKilled(e, opts);
    if (e.isBoss || e.kind === 'boss') return;
  }

  onCivilianKilled(civ) {
    this.game.onCivilianKilled(civ);
  }

  spawnEnemy(typeId, x, y, opts = {}) {
    const e = new Enemy(this.game, getEnemyType(typeId), x, y, opts);
    this.enemies.push(e);
    return e;
  }

  /** Called by an enemy that reached 100% detection. */
  alertAt(x, y, source) {
    this.enemies.forEach((e) => {
      if (e.dead || e === source) return;
      const d = Math.hypot(e.centerX - x, e.centerY - y);
      if (d < 620) {
        e.detection = Math.max(e.detection, d < 300 ? 88 : 45);
        if (!e.lastKnown && this.player) e.lastKnown = { x: this.player.centerX, y: this.player.centerY, t: 0 };
      }
    });
    this.raiseAlert(1);
  }

  raiseAlert(amount) {
    const before = this.alertLevel;
    this.alertLevel = clamp(this.alertLevel + amount, 0, 5);
    this.alertTimer = 14;
    if (this.alertLevel >= 3 && before < 3) {
      this.game.audio.setMood('combat');
      this.game.hud.alertBanner(true);
      this.game.onCombatStart();
    }
    if (this.alertLevel >= 5 && !this.lockdown) this.enterLockdown();
    this.game.hud.setAlert(this.alertLevel);
  }

  calmAlert() {
    this.alertLevel = Math.max(0, this.alertLevel - 1);
    if (this.alertLevel < 3) {
      this.game.hud.alertBanner(false);
      this.game.audio.setMood(this.isNight ? 'stealth' : 'exploration');
    }
    this.game.hud.setAlert(this.alertLevel);
  }

  enterLockdown() {
    this.lockdown = true;
    this.game.toast('CITY LOCKDOWN', 'bad');
    this.game.audio.sfx('alarm');
    for (let i = 0; i < 4; i++) this.spawnEnemy('elite', this.player.centerX + (i % 2 ? 300 : -300) + i * 30, this.district.groundY - 60, { zone: 'reinforcement' });
  }

  requestReinforcements(source) {
    if (this.reinforcementTimer > 0) return;
    this.reinforcementTimer = 10;
    const lvl = this.alertLevel;
    const mix = lvl >= 4
      ? ['elite', 'inquisitor', 'hunter']
      : lvl >= 3 ? ['heavy', 'hunter', 'guard', 'guard']
      : ['guard', 'guard', 'archer'];
    this.game.toast('Reinforcements incoming', 'bad');
    for (const t of mix) {
      const x = source.centerX + (Math.random() < 0.5 ? -1 : 1) * (260 + Math.random() * 200);
      const e = this.spawnEnemy(t, clamp(x, 60, this.district.width - 80), this.district.groundY - 80, { zone: 'reinforcement' });
      e.detection = 90;
      e.lastKnown = { x: this.player.centerX, y: this.player.centerY, t: 0 };
    }
  }

  // ───────────────────────────── player abilities ─────────────────────────────
  spawnProjectile(owner, dir, weapon) {
    const speed = weapon.projectileSpeed || 800;
    const vx = dir * speed;
    const vy = -30;
    const p = new Projectile(this.game, owner, owner.centerX + dir * 18, owner.centerY - 4, vx, vy,
      weapon.damage * (1 + (owner.mods?.damage || 0) + (owner.mods?.rangedDamage || 0)),
      { type: weapon.id, life: 2.4, gravity: weapon.id === 'bow' ? 260 : 40 });
    this.projectiles.push(p);
    this.game.audio.sfx('arrow');
    return p;
  }

  spawnEnemyProjectile(enemy, player, type) {
    const speed = type.projectileSpeed || 520;
    const dx = player.centerX - enemy.centerX;
    const dy = player.centerY - enemy.centerY;
    const len = Math.hypot(dx, dy) || 1;
    const p = new Projectile(this.game, enemy, enemy.centerX + sign(dx) * 16, enemy.centerY - 6,
      (dx / len) * speed, (dy / len) * speed - 40,
      type.damage || enemy.type.damage,
      { type: 'arrow', life: 3, gravity: 180 });
    this.projectiles.push(p);
  }

  throwBomb(owner, tx, ty) {
    const dx = tx - owner.centerX;
    const dy = ty - owner.centerY;
    const t = 0.9;
    const vx = dx / t;
    const vy = dy / t - 0.5 * 900 * t;
    const p = new Projectile(this.game, owner, owner.centerX, owner.centerY, vx, vy, 0, { type: 'bomb', life: t, gravity: 900 });
    p.isBomb = true;
    p.bombRadius = 110;
    p.bombDamage = 26;
    this.projectiles.push(p);
  }

  addHazard(kind, data) {
    const h = { kind, life: data.life ?? 1.5, damage: data.damage ?? 15, ...data, hit: new Set() };
    if (kind === 'slamWave') {
      h.update = (dt, world, player) => {
        h.x += (h.dir || 1) * 520 * dt;
        if (Math.abs(player.centerX - h.x) < 40 && player.grounded) player.takeDamage(h.damage * 0.8, null, 'wave');
        this.game.particles.spawn('dust', h.x, h.y, { vx: 0, vy: -60, life: 0.4, size: 5, color: '#c8b9a4', gravity: 300 });
      };
    }
    this.hazards.push(h);
    return h;
  }

  spawnHazards(kind, count, atX) {
    const rng = new RNG((Math.random() * 1e9) | 0);
    for (let i = 0; i < count; i++) {
      const x = atX !== undefined ? atX + i * 60 : rng.range(200, this.district.width - 200);
      const y = this.district.groundY;
      if (kind === 'fireTraps') {
        this.hazards.push({ kind: 'fire', x, y, r: 60, life: 14, damage: 16, tick: 0, hit: new Set() });
      } else if (kind === 'bombs') {
        this.hazards.push({ kind: 'bomb', x, y, r: 90, life: 3.5, damage: 40, exploded: false, hit: new Set() });
      } else if (kind === 'traps') {
        this.hazards.push({ kind: 'trap', x, y, r: 46, life: 26, damage: 26, armed: true, hit: new Set() });
      } else if (kind === 'voidRifts') {
        this.hazards.push({ kind: 'rift', x, y, r: 70, life: 8, damage: 22, hit: new Set() });
      }
    }
  }

  // ───────────────────────────── throwables / gadgets ─────────────────────────────
  useGadget(gadget, aimX, aimY) {
    const p = this.player;
    const fx = gadget.effect;
    switch (fx.type) {
      case 'smoke':
        this.smokeClouds.push({ x: aimX, y: aimY, r: fx.radius, life: fx.duration, maxLife: fx.duration, visionBlock: 1 });
        this.game.audio.sfx('smoke');
        this.game.particles.burst('smoke', aimX, aimY, 26, { colors: ['#5b5660', '#3d3944', '#2b2731'], gravity: -30, maxSpeed: 90, minSize: 6, maxSize: 16, minLife: 1.2, maxLife: 4 });
        break;
      case 'fire':
        this.fireZones.push({ x: aimX, y: aimY, r: fx.radius, life: fx.duration, dps: fx.dps, tick: 0 });
        this.game.audio.sfx('fire');
        break;
      case 'distract':
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.centerX - aimX, e.centerY - aimY);
          if (d < fx.radius) {
            e.lastKnown = { x: aimX, y: aimY, t: 0 };
            if (e.state === 'patrol' || e.state === 'idle') e.setState('search');
            e.detection = Math.max(e.detection, 30);
          }
        }
        for (const c of this.civilians) {
          if (Math.hypot(c.centerX - aimX, c.centerY - aimY) < fx.radius) c.targetX = aimX;
        }
        break;
      case 'poison': {
        const target = this.enemies.find((e) => !e.dead && Math.hypot(e.centerX - aimX, e.centerY - aimY) < 90);
        if (target) { target.stunTime = fx.duration; target.poisoned = true; }
        break;
      }
      case 'grapple': {
        // Pull the player toward the aim point if there is a surface to attach to.
        const dx = aimX - p.centerX;
        const dy = aimY - p.centerY;
        const len = Math.hypot(dx, dy) || 1;
        if (len < fx.radius) {
          p.vx = (dx / len) * 760;
          p.vy = Math.min(-380, (dy / len) * 640 - 200);
          p.onRope = null; p.climbing = null; p.onZipline = null;
          p.grounded = false;
          this.game.audio.sfx('whoosh');
          this.game.particles.cone('spark', p.centerX, p.centerY, sign(dx) || 1, 10, { colors: ['#cfc7b4'] });
        }
        break;
      }
      default: break;
    }
  }

  /** Reveal enemies for a duration (scout skill). */
  revealEnemies(seconds) {
    this.revealedUntil = Math.max(this.revealedUntil, this.game.time + seconds);
  }

  resetEnemyAwareness() {
    for (const e of this.enemies) { e.detection = 0; e.alerted = false; e.lastKnown = null; e.setState('patrol'); }
    this.alertLevel = 0;
    this.lockdown = false;
    this.game.hud.setAlert(0);
    this.game.hud.alertBanner(false);
  }

  showBark(entity, text) {
    this.barks.push({ x: entity.centerX, y: entity.y - 10, text, life: 2.6, maxLife: 2.6 });
    if (this.barks.length > 8) this.barks.shift();
  }

  // ───────────────────────────── update ─────────────────────────────
  update(dt) {
    const p = this.player;
    if (!this.active) return;
    // collectibles
    for (const c of this.district.collectibles) {
      if (c.taken) continue;
      if (Math.abs(c.x - p.centerX) < 30 && Math.abs(c.y - p.centerY) < 44) {
        c.taken = true;
        this.game.collectItem(this.districtId, c);
      }
    }
    // entities
    for (const e of this.enemies) e.update(dt, this, p);
    if (this.boss && !this.boss.dead) this.boss.update(dt, this, p);
    for (const c of this.civilians) c.update(dt, this, p);
    for (const n of this.npcs) n.update(dt, this, p);
    for (const a of this.allies) a.update(dt, this, p);
    for (const pr of this.projectiles) pr.update(dt, this);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // hazards
    for (const h of this.hazards) {
      h.life -= dt;
      if (h.kind === 'fire' || h.kind === 'rift') {
        if (Math.abs(p.centerX - h.x) < h.r && Math.abs(p.centerY - h.y) < h.r * 1.4) {
          p.takeDamage(h.damage * dt * 1.6, null, 'fire');
        }
        for (const e of this.enemies) if (!e.dead && Math.abs(e.centerX - h.x) < h.r * 0.8) e.takeDamage(h.damage * dt, null);
        this.game.particles.spawn('ember', h.x + (Math.random() - 0.5) * h.r, h.y - 10, { vy: -50, life: 0.5, size: 3, color: h.kind === 'rift' ? '#6fc3d6' : '#e07b2a', gravity: -30 });
      } else if (h.kind === 'bomb') {
        if (h.life <= 0 && !h.exploded) {
          h.exploded = true;
          this.game.particles.ring(h.x, h.y, { rMax: h.r, color: 'rgba(224,123,42,.9)', width: 6 });
          this.game.particles.burst('ember', h.x, h.y, 26, { colors: ['#e07b2a', '#f0cf6b', '#d94138'], maxSpeed: 300, gravity: 100 });
          this.game.audio.sfx('explosion');
          this.game.camera.shake(12, 0.4);
          if (Math.abs(p.centerX - h.x) < h.r && Math.abs(p.centerY - h.y) < h.r) p.takeDamage(h.damage, null, 'bomb');
          for (const e of this.enemies) if (!e.dead && Math.abs(e.centerX - h.x) < h.r) this.damageEnemy(e, h.damage, {});
        }
      } else if (h.kind === 'trap') {
        if (h.life > 0 && h.armed && Math.abs(p.centerX - h.x) < 24 && Math.abs(p.centerY - h.y) < 46) {
          h.armed = false;
          p.takeDamage(h.damage, null, 'trap');
          this.game.particles.burst('spark', h.x, h.y, 12, { colors: ['#f0cf6b', '#d94138'] });
          this.game.audio.sfx('hit');
        }
      }
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);

    // smoke / fire expiry
    for (const s of this.smokeClouds) s.life -= dt;
    this.smokeClouds = this.smokeClouds.filter((s) => s.life > 0);
    for (const f of this.fireZones) {
      f.life -= dt;
      f.tick += dt;
      if (f.tick > 0.4) {
        f.tick = 0;
        if (Math.abs(p.centerX - f.x) < f.r * 0.7) p.takeDamage(f.dps * 0.4, null, 'fire');
      }
    }
    this.fireZones = this.fireZones.filter((f) => f.life > 0);

    // barks
    for (const b of this.barks) { b.life -= dt; b.y -= dt * 14; }
    this.barks = this.barks.filter((b) => b.life > 0);

    // alert decay
    this.alertTimer -= dt;
    if (this.alertTimer <= 0 && this.alertLevel > 0) {
      const anyAware = this.enemies.some((e) => !e.dead && e.isAwareOfPlayer());
      if (!anyAware) this.calmAlert();
      else this.alertTimer = 4;
    }
    if (this.reinforcementTimer > 0) this.reinforcementTimer -= dt;
    if (this.alertLevel > 0) {
      this.wantedDecay += dt;
      if (this.wantedDecay > 90 && this.wanted > 0) { this.wanted--; this.wantedDecay = 0; }
    }

    // distance culling: enemies far away update cheaply
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.centerX - p.centerX, e.centerY - p.centerY);
      if (d > 1800) { e.update(0.05, this, p); }
    }

    // environment mood: rising tension changes music
    if (this.alertLevel >= 3) this.game.audio.setMood('combat');
    else if (this.alertLevel >= 1) this.game.audio.setMood('stealth');
  }

  cleanupDead() {
    this.enemies = this.enemies.filter((e) => !e.dead || e.deadTime < 12);
    this.civilians = this.civilians.filter((c) => !c.dead || (c.deadTime = (c.deadTime || 0) + 1) < 200);
    this.allies = this.allies.filter((a) => !a.dead);
  }

  addWanted(n) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    if (this.wanted !== before) {
      this.game.hud.setWanted(this.wanted);
      if (this.wanted >= 5) this.game.unlockAchievement('wanted');
      if (this.wanted > before) this.game.toast(`Wanted level ${this.wanted}`, 'bad');
    }
  }

  reduceWanted(n) {
    this.wanted = clamp(this.wanted - n, 0, 5);
    this.game.hud.setWanted(this.wanted);
  }
}
