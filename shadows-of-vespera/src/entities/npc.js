import { clamp, damp, sign, uid, moveAxis, rectsOverlap, RNG, depenetrate } from '../engine/utils.js';
import { SOLID } from '../world/worldBuilder.js';
import { getNPC, RECRUIT_CANDIDATES } from '../data/npcs.js';
import { DIALOGUE } from '../data/dialogue.js';

/** Civilian: reacts to violence and can be used to blend in. */
export class Civilian {
  constructor(game, x, y, variant = 'worker') {
    this.game = game;
    this.id = uid('civ');
    this.kind = 'civilian';
    this.variant = variant;
    this.x = x; this.y = y;
    this.w = 22; this.h = 48;
    this.vx = 0; this.vy = 0;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.grounded = false;
    this.state = 'walk';
    this.homeX = x;
    this.targetX = x + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 200);
    this.pauseT = Math.random() * 2;
    this.speed = 44 + Math.random() * 26;
    this.fear = 0;
    this.dead = false;
    this.animTime = Math.random() * 5;
    this.helpful = false;
    this.bribed = false;
    this.hp = 20;
    this.name = variant;
    this.isCrowd = true;
  }
  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
  isAwareOfPlayer() { return this.fear > 0.5; }

  update(dt, world, player) {
    if (this.dead) return;
    this.animTime += dt;
    // React to nearby violence: panic and run.
    let threat = 0;
    for (const e of world.enemies) {
      if (e.dead && e.deadTime < 3) threat = 1;
    }
    if (player.attackTime > 0 && Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY) < 260) threat = 1;
    if (world.alertLevel >= 3) threat = Math.max(threat, 0.6);
    this.fear = clamp(this.fear + (threat > 0 ? dt * 2.2 : -dt * 0.35), 0, 1);

    if (this.fear > 0.4) {
      // flee from danger
      const awayFrom = player.centerX;
      this.facing = sign(this.centerX - awayFrom) || this.facing;
      this.vx = damp(this.vx, this.facing * this.speed * 2.2, 6, dt);
      this.state = 'flee';
      if (Math.random() < dt * 3) this.game.particles.spawn('dust', this.centerX, this.y + this.h, { vx: -this.facing * 20, vy: -10, life: 0.35, size: 2.5, color: 'rgba(190,180,160,.4)' });
    } else if (this.state === 'walk') {
      if (this.pauseT > 0) { this.pauseT -= dt; this.vx = damp(this.vx, 0, 8, dt); if (this.pauseT <= 0 && Math.random() < 0.5) this.facing *= -1; }
      else {
        const dx = this.targetX - this.centerX;
        if (Math.abs(dx) < 12) { this.pauseT = 1 + Math.random() * 2.5; this.targetX = this.homeX + (Math.random() - 0.5) * 380; }
        else { this.facing = sign(dx); this.vx = damp(this.vx, this.facing * this.speed, 5, dt); }
      }
    }
    // Avoid walking into the player's blade.
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    if (d < 30 && player.attackTime > 0 && !this.dead) {
      this.hp -= 100;
      this.dead = true;
      world.onCivilianKilled(this);
    }
    this.applyPhysics(dt, world);
  }

  applyPhysics(dt, world) {
    this.vy = Math.min(1000, this.vy + 1700 * dt);
    const b = this.body || (this.body = { x: 0, y: 0, w: this.w, h: this.h, vx: 0, vy: 0, grounded: false });
    b.x = this.x; b.y = this.y; b.w = this.w; b.h = this.h; b.vx = this.vx; b.vy = this.vy;
    const prevBottom = this.y + this.h;
    depenetrate(b, world.district.collision);
    const ignore = new Set(world.district.collision.filter((s) => rectsOverlap(b, s)));
    const list = world.district.collision.filter((s) => !ignore.has(s));
    moveAxis(b, this.vx * dt, list, 'x');
    moveAxis(b, this.vy * dt, list.filter((s) => s.type !== SOLID.PLATFORM || (this.vy > 0 && prevBottom <= s.y + 6)), 'y');
    this.x = b.x; this.y = b.y; this.vx = b.vx; this.vy = b.vy; this.grounded = b.grounded;
    this.x = clamp(this.x, 20, world.district.width - this.w - 20);
  }
}

/** Interactive NPC: merchants, informants, doctors, scholars, recruits, leaders. */
export class NPC {
  constructor(game, x, y, archetypeId, opts = {}) {
    this.game = game;
    this.id = opts.id || uid('npc');
    this.kind = 'npc';
    this.archetypeId = archetypeId;
    this.arch = getNPC(archetypeId);
    this.x = x; this.y = y;
    this.w = 24; this.h = 50;
    this.vx = 0; this.vy = 0;
    this.facing = opts.facing ?? (Math.random() < 0.5 ? -1 : 1);
    this.grounded = false;
    this.name = opts.name || this.arch.name;
    this.shopId = opts.shop || this.arch.shop;
    this.bark = 0;
    this.barkIndex = 0;
    this.animTime = Math.random() * 5;
    this.dead = false;
    this.interacted = false;
    this.kindFlag = this.arch.kind;
    this.recruitId = opts.recruitId || null;
    this.dialogueId = opts.dialogue || null;
  }
  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
  isAwareOfPlayer() { return false; }

  get interactLabel() {
    switch (this.kindFlag) {
      case 'shop': return `Trade — ${this.arch.name}`;
      case 'heal': return 'Heal — Doctor';
      case 'recruit': return 'Recruit ally';
      case 'quest': return 'Talk — Informant';
      case 'lore': return 'Talk — Scholar';
      case 'story': return 'Talk — Leader';
      default: return 'Talk';
    }
  }

  update(dt, world, player) {
    if (this.dead) return;
    this.animTime += dt;
    // Look at the player when close.
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    if (d < 200) this.facing = sign(player.centerX - this.centerX) || this.facing;
    this.vx = damp(this.vx, 0, 8, dt);
    this.bark -= dt;
    if (this.bark <= 0 && d < 170) {
      this.bark = 6 + Math.random() * 8;
      const pool = DIALOGUE[this.arch.barks?.[0]] || DIALOGUE.npc_civilian;
      this.game.world.showBark(this, pool[Math.floor(Math.random() * pool.length)]);
    }
    this.applyPhysics(dt, world);
  }

  applyPhysics(dt, world) {
    this.vy = Math.min(1000, this.vy + 1700 * dt);
    const b = this.body || (this.body = { x: 0, y: 0, w: this.w, h: this.h, vx: 0, vy: 0, grounded: false });
    b.x = this.x; b.y = this.y; b.w = this.w; b.h = this.h; b.vx = this.vx; b.vy = this.vy;
    const prevBottom = this.y + this.h;
    depenetrate(b, world.district.collision);
    const ignore = new Set(world.district.collision.filter((s) => rectsOverlap(b, s)));
    const list = world.district.collision.filter((s) => !ignore.has(s));
    moveAxis(b, this.vy * dt, list.filter((s) => s.type !== SOLID.PLATFORM || (this.vy > 0 && prevBottom <= s.y + 6)), 'y');
    this.x = b.x; this.y = b.y; this.grounded = b.grounded;
  }
}

/** Projectiles used by the player's bow / knives and enemy archers. */
export class Projectile {
  constructor(game, owner, x, y, vx, vy, damage, opts = {}) {
    this.game = game;
    this.id = uid('p');
    this.owner = owner;
    this.friendly = owner.kind === 'player';
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.life = opts.life ?? 2.2;
    this.type = opts.type || 'arrow';
    this.dead = false;
    this.gravity = opts.gravity ?? 0;
    this.w = 10; this.h = 4;
    this.rot = Math.atan2(vy, vx);
    this.trailTimer = 0;
  }

  update(dt, world) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot = Math.atan2(this.vy, this.vx);

    // Hit solid?
    for (const s of world.district.collision) {
      if (s.type === SOLID.PLATFORM) continue;
      if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + s.h) {
        this.dead = true;
        this.game.particles.burst('spark', this.x, this.y, 4, { colors: ['#eae2ce', '#9c917a'], gravity: 300 });
        return;
      }
    }
    const targets = this.friendly ? world.enemies : [world.player, ...world.allies];
    for (const t of targets) {
      if (!t || t.dead) continue;
      if (this.x > t.x && this.x < t.x + t.w && this.y > t.y && this.y < t.y + t.h) {
        this.dead = true;
        if (this.friendly && t.takeDamage) world.damageEnemy(t, this.damage, { source: this.owner, ranged: true });
        else if (!this.friendly && t.takeDamage) t.takeDamage(this.damage, this.owner, 'ranged');
        this.game.particles.cone('blood', this.x, this.y, sign(this.vx) || 1, 6, { colors: ['#9e2b25', '#d94138'] });
        return;
      }
    }
    // Out of world
    if (this.x < 0 || this.x > world.district.width || this.y > world.district.height + 200) this.dead = true;
  }
}
