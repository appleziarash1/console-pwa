import { clamp, damp, sign, uid, moveAxis, rectsOverlap, depenetrate } from '../engine/utils.js';
import { SOLID } from '../world/worldBuilder.js';
import { ALLY_CLASSES, getAllyClass } from '../data/npcs.js';

/**
 * Boss entity. Extends the enemy behaviour with scripted phases, arena hazards,
 * summons, and a telegraph-driven move set. Phases are triggered by health
 * thresholds as defined in data/bosses.js.
 */
export class Boss {
  constructor(game, def, x, y) {
    this.game = game;
    this.id = uid('boss');
    this.kind = 'boss';
    this.def = def;
    this.type = {
      id: def.id, name: def.name, hp: def.hp, damage: def.damage,
      speed: def.speed, chaseSpeed: def.chaseSpeed,
      visionRange: def.visionRange, visionAngle: def.visionAngle,
      detectionSpeed: def.detectionSpeed, hearingRadius: def.hearingRadius,
      attackRange: def.attackRange, attackCooldown: def.attackCooldown,
      telegraph: def.telegraph, recovery: def.recovery,
      weapon: def.weapon, poise: def.poise, armor: 0,
      height: def.height, width: def.width,
      drops: def.reward, ranged: def.ranged, projectileSpeed: def.projectileSpeed,
      tier: 9,
    };
    this.x = x; this.y = y;
    this.w = def.width; this.h = def.height;
    this.vx = 0; this.vy = 0;
    this.facing = -1;
    this.grounded = false;
    this.maxHp = def.hp; this.hp = def.hp;
    this.phaseIndex = 0;
    this.phase = def.phases[0];
    this.state = 'intro';
    this.stateTime = 0;
    this.detection = 100;
    this.attackCooldown = 1.2;
    this.attackTime = 0;
    this.attackWindup = 0;
    this.moveIndex = 0;
    this.currentMove = null;
    this.stunTime = 0;
    this.staggerResist = def.staggerResist || 0.7;
    this.dead = false;
    this.deadTime = 0;
    this.hitFlash = 0;
    this.chaseTimeout = 0;
    this.summoned = new Set();
    this.hazards = [];
    this.animTime = 0;
    this.smokeClouds = [];
    this.invuln = 0;
    this.dashTime = 0;
    this.dashDir = 0;
    this.trapTimer = 3;
    this.chargeTime = 0;
    this.introDone = false;
    this.isBoss = true;
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
  get hpFrac() { return clamp(this.hp / this.maxHp, 0, 1); }
  isAwareOfPlayer() { return true; }

  begin() {
    this.state = 'intro';
    this.stateTime = 0;
    this.game.cutsceneBanner(this.def.name, this.def.title);
    this.game.audio.setMood('boss');
  }

  update(dt, world, player) {
    if (this.dead) { this.deadTime += dt; return; }
    this.stateTime += dt;
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    // ── phase transitions ──
    const nextPhase = this.def.phases.findIndex((p) => this.hpFrac > p.hpAbove);
    const targetIdx = nextPhase === -1 ? this.def.phases.length - 1 : Math.min(nextPhase, this.def.phases.length - 1);
    if (targetIdx > this.phaseIndex) {
      this.phaseIndex = targetIdx;
      this.phase = this.def.phases[targetIdx];
      this.onPhaseEnter(world, player);
    }

    if (this.stunTime > 0) {
      this.stunTime -= dt;
      this.vx = damp(this.vx, 0, 7, dt);
      this.applyPhysics(dt, world);
      return;
    }

    if (this.state === 'intro') {
      this.vx = 0;
      if (this.stateTime > 2.0) { this.state = 'combat'; this.stateTime = 0; }
      this.applyPhysics(dt, world);
      return;
    }
    if (this.state === 'defeated') {
      this.vx = damp(this.vx, 0, 6, dt);
      this.applyPhysics(dt, world);
      return;
    }
    if (this.state === 'chase') {
      this.tickChaseAway(dt, world, player);
      return;
    }

    this.tickPhaseBehaviour(dt, world, player);
    this.tickHazards(dt, world, player);
    this.applyPhysics(dt, world);
  }

  onPhaseEnter(world, player) {
    const p = this.phase;
    this.game.cutsceneBanner(this.def.name, p.name);
    this.game.audio.sfx('alarm');
    this.game.camera.shake(9, 0.5);
    if (p.summons) {
      for (const s of p.summons) {
        for (let i = 0; i < s.count; i++) {
          const sx = this.centerX + (i % 2 === 0 ? -1 : 1) * (140 + i * 60);
          world.spawnEnemy(s.type, sx, this.y, { zone: 'boss' });
        }
      }
      this.game.toast(`${this.def.name} calls reinforcements`, 'bad');
    }
    if (p.hazard === 'groundSlam') world.addHazard('slam', this);
    if (p.hazard === 'fireTraps') world.spawnHazards('fireTraps', 4);
    if (p.hazard === 'bombs') world.spawnHazards('bombs', 3);
    if (p.hazard === 'traps') world.spawnHazards('traps', 5);
    if (p.hazard === 'voidRifts') world.spawnHazards('voidRifts', 3);
    if (p.chase) {
      this.game.startBossChase(this);
    }
    if (p.defeat) this.defeat(world, player);
  }

  tickPhaseBehaviour(dt, world, player) {
    const p = this.phase;
    const speedMul = p.speedMul || 1;
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);

    if (this.attackTime > 0) {
      this.attackTime -= dt;
      this.executeMove(dt, world, player);
      return;
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDir * 520 * speedMul;
      this.vy = Math.min(this.vy, 30);
      this.game.particles.cone('spark', this.centerX, this.centerY, -this.dashDir, 3, { colors: ['rgba(255,120,90,.7)'] });
      if (this.dashTime <= 0) this.setState('combat');
      return;
    }
    if (this.chargeTime > 0) {
      this.chargeTime -= dt;
      this.vx = this.facing * this.type.chaseSpeed * 1.6;
      return;
    }

    this.facing = sign(player.centerX - this.centerX) || this.facing;

    // Reposition.
    if (d > this.type.attackRange * 0.85) {
      if (p.stealth && Math.random() < dt * 0.7) this.vanish(world);
      const wantVx = this.facing * this.type.chaseSpeed * speedMul;
      this.vx = damp(this.vx, wantVx, 8, dt);
      // Hop obstacles.
      if (this.grounded && this.wallAhead(world)) { this.vy = -560; this.grounded = false; }
      if (this.grounded) {
        const ahead = { x: this.facing > 0 ? this.x + this.w + 6 : this.x - 20, y: this.y + this.h + 6, w: 16, h: 40 };
        if (!world.district.collision.some((s) => rectsOverlap(ahead, s))) { this.vy = -500; this.grounded = false; }
      }
    } else {
      this.vx = damp(this.vx, 0, 10, dt);
      if (this.attackCooldown <= 0) {
        this.chooseMove(world, player);
      }
    }
  }

  chooseMove(world, player) {
    const moves = this.phase.moves;
    const move = moves[this.moveIndex % moves.length];
    this.moveIndex++;
    this.currentMove = move;
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    switch (move) {
      case 'slash': this.beginMove('slash', this.type.telegraph, 0.32, () => this.meleeHit(world, player, 1)); break;
      case 'sweep': this.beginMove('sweep', this.type.telegraph * 1.3, 0.42, () => this.meleeHit(world, player, 1.35, true)); break;
      case 'thrust': this.beginMove('thrust', this.type.telegraph * 0.85, 0.26, () => this.meleeHit(world, player, 1.1, false, 1.5)); break;
      case 'slam': this.beginMove('slam', this.type.telegraph * 1.6, 0.5, () => this.slam(world, player)); break;
      case 'charge':
        this.beginMove('charge', this.type.telegraph * 0.9, 0.3, () => { this.chargeTime = 0.6; this.game.audio.sfx('whoosh'); });
        break;
      case 'dashSlash':
        this.beginMove('dashSlash', this.type.telegraph * 0.6, 0.2, () => {
          this.dashTime = 0.22; this.dashDir = this.facing;
          this.game.audio.sfx('dash');
        });
        break;
      case 'shoot':
        this.beginMove('shoot', this.type.telegraph, 0.25, () => {
          world.spawnEnemyProjectile(this, player, { projectileSpeed: this.type.projectileSpeed || 620, damage: this.type.damage * 0.8 });
          this.game.audio.sfx('arrow');
        });
        break;
      case 'bomb':
        this.beginMove('bomb', this.type.telegraph, 0.3, () => {
          world.throwBomb(this, player.centerX, player.centerY - 30);
          this.game.audio.sfx('fire');
        });
        break;
      case 'throwKnife':
        this.beginMove('throwKnife', this.type.telegraph * 0.7, 0.2, () => {
          world.spawnEnemyProjectile(this, player, { projectileSpeed: 780, damage: this.type.damage * 0.6 });
        });
        break;
      case 'trapSet':
        this.beginMove('trapSet', this.type.telegraph, 0.3, () => {
          world.spawnHazards('traps', 2);
          this.game.toast('Traps set!', 'bad');
        });
        break;
      case 'backstep':
        this.beginMove('backstep', 0.15, 0.2, () => {
          this.vx = -this.facing * 300; this.vy = -260;
        });
        break;
      case 'counter':
        this.blockTime = 0.9;
        this.attackCooldown = this.type.attackCooldown * 1.4;
        if (d < this.type.attackRange * 1.5) this.meleeHit(world, player, 1.4);
        break;
      default:
        this.attackCooldown = this.type.attackCooldown;
    }
  }

  beginMove(name, windup, active, effect) {
    this.currentMoveName = name;
    this.attackDuration = windup + active;
    this.attackTime = this.attackDuration;
    this.attackWindup = windup;
    this.pendingEffect = effect;
    this.moveFired = false;
    this.game.audio.sfx('whoosh', { volume: 0.6 });
  }

  executeMove(dt, world, player) {
    this.vx = damp(this.vx, 0, 6, dt);
    this.attackWindup -= dt;
    if (this.attackWindup <= 0 && !this.moveFired) {
      this.moveFired = true;
      if (this.pendingEffect) this.pendingEffect();
      this.attackCooldown = this.type.attackCooldown / (this.phase.speedMul || 1);
    }
    if (this.attackTime <= 0) {
      this.attackTime = 0;
      this.pendingEffect = null;
    }
  }

  meleeHit(world, player, mul, wide = false, reachMul = 1) {
    const reach = this.type.attackRange * reachMul;
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    const verticalOk = Math.abs(player.centerY - this.centerY) < this.h * 1.1;
    this.game.particles.cone('spark', this.centerX + this.facing * reach * 0.7, this.centerY, this.facing, wide ? 14 : 8, { colors: ['#f0cf6b', '#eae2ce', '#d94138'] });
    this.game.audio.sfx('sword');
    if (d <= reach && verticalOk) {
      player.takeDamage(this.type.damage * mul * (this.phase.damageMul || 1), this, 'boss');
    }
  }

  slam(world, player) {
    this.game.camera.shake(16, 0.5);
    this.game.audio.sfx('explosion');
    this.game.particles.ring(this.centerX, this.y + this.h, { rMax: 200, life: 0.4, color: 'rgba(224,123,42,.9)', width: 5 });
    world.addHazard('slamWave', { x: this.centerX, y: this.y + this.h, dir: this.facing, life: 1.2, damage: this.type.damage });
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    if (d < 150 && player.grounded) player.takeDamage(this.type.damage * 1.2, this, 'slam');
  }

  vanish(world) {
    this.game.particles.burst('smoke', this.centerX, this.centerY, 14, { colors: ['#4a4650', '#2b2731'], gravity: -20, maxSpeed: 90 });
    this.x = clamp(this.x + (Math.random() < 0.5 ? -1 : 1) * 260, world.district.bounds.x + 60, world.district.width - 120);
    this.game.particles.burst('smoke', this.centerX, this.centerY, 10, { colors: ['#4a4650'] });
  }

  tickChaseAway(dt, world, player) {
    // Seradin phase 4: run to the next arena.
    this.vx = this.facing * this.type.chaseSpeed * 1.2;
    this.x += this.vx * dt;
    this.chaseTimeout -= dt;
    if (this.chaseTimeout <= 0 || this.x > world.district.width - 200 || this.x < 150) {
      this.state = 'combat';
      this.phase = { ...this.phase, moves: this.def.phases[this.def.phases.length - 1].moves };
      this.game.endBossChase();
    }
  }

  tickHazards(dt, world, player) {
    for (const h of this.hazards) {
      h.life -= dt;
      if (h.update) h.update(dt, world, player);
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);
  }

  wallAhead(world) {
    const probe = { x: this.facing > 0 ? this.x + this.w : this.x - 14, y: this.y + 8, w: 14, h: this.h - 16 };
    return world.district.collision.some((s) => s.type !== SOLID.PLATFORM && rectsOverlap(probe, s));
  }

  applyPhysics(dt, world) {
    const solids = world.district.collision;
    this.vy = Math.min(1200, this.vy + 1700 * dt);
    const b = this.body || (this.body = { x: 0, y: 0, w: this.w, h: this.h, vx: 0, vy: 0, grounded: false });
    b.x = this.x; b.y = this.y; b.w = this.w; b.h = this.h; b.vx = this.vx; b.vy = this.vy;
    const prevBottom = this.y + this.h;
    depenetrate(b, solids);
    const ignore = new Set(solids.filter((s) => rectsOverlap(b, s)));
    const list = solids.filter((s) => !ignore.has(s));
    moveAxis(b, this.vx * dt, list, 'x');
    const sy = list.filter((s) => s.type !== SOLID.PLATFORM || (this.vy > 0 && prevBottom <= s.y + 6));
    moveAxis(b, this.vy * dt, sy, 'y');
    this.x = b.x; this.y = b.y; this.vx = b.vx; this.vy = b.vy; this.grounded = b.grounded;
    this.x = clamp(this.x, 40, world.district.width - this.w - 40);
  }

  setState(s) { this.state = s; this.stateTime = 0; }

  takeDamage(amount, source, opts = {}) {
    if (this.dead || this.invuln > 0) return;
    let dmg = amount * (1 - this.staggerResist * 0.12);
    this.hp -= dmg;
    this.hitFlash = 0.14;
    this.game.particles.cone('blood', this.centerX, this.centerY, this.facing, 8, { colors: ['#9e2b25', '#d94138'] });
    this.game.audio.sfx('hit', { volume: 0.7 });
    const st = (opts.heavy ? 0.3 : 0.1) * (1 - this.staggerResist);
    if (st > 0.02) this.stunTime = Math.max(this.stunTime, st);
    if (this.hp <= 0) this.defeat(this.game.world, source);
  }

  defeat(world, source) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'defeated';
    this.hp = 0;
    this.game.camera.shake(18, 0.9);
    this.game.audio.sfx('death');
    this.game.audio.setMood('victory');
    this.game.onBossDefeated(this, source);
  }

  stagger(t, source) {
    if (this.dead) return;
    this.stunTime = Math.max(this.stunTime, t * (1 - this.staggerResist));
  }
}

/**
 * Ally entity. Follows the player, fights with a class-specific skill and can be
 * given the command set from the design doc (attack / distract / scout / protect /
 * assassinate).
 */
export class Ally {
  constructor(game, data, x, y) {
    this.game = game;
    this.id = uid('ally');
    this.kind = 'ally';
    this.data = data;
    this.cls = getAllyClass(data.cls);
    this.name = data.name;
    this.x = x; this.y = y;
    this.w = 24; this.h = 50;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.level = data.level || 1;
    this.maxHp = this.cls.hp[this.level - 1] * (1 + (game.player.mods.allyHealth || 0));
    this.hp = this.maxHp;
    this.damage = this.cls.damage[this.level - 1] * (1 + (game.player.mods.allyDamage || 0));
    this.defense = this.cls.defense[this.level - 1];
    this.command = 'attack';
    this.cooldown = 0;
    this.attackCooldown = 0;
    this.dead = false;
    this.animTime = 0;
    this.hitFlash = 0;
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
  isAwareOfPlayer() { return true; }

  update(dt, world, player) {
    if (this.dead) return;
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Find a target.
    const target = world.enemies.find((e) => !e.dead && Math.hypot(e.centerX - this.centerX, e.centerY - this.centerY) < 420);
    const homeDist = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);

    if (this.command === 'protect' && homeDist > 200) {
      this.moveToward(dt, player.centerX, world, 1.15);
    } else if (target) {
      const d = Math.hypot(target.centerX - this.centerX, target.centerY - this.centerY);
      this.facing = sign(target.centerX - this.centerX) || this.facing;
      if (d > 60) this.moveToward(dt, target.centerX, world, 1);
      else {
        this.vx = damp(this.vx, 0, 8, dt);
        if (this.attackCooldown <= 0) {
          world.damageEnemy(target, this.damage, { source: this, heavy: false });
          this.attackCooldown = 1.0;
          this.game.particles.cone('spark', this.centerX + this.facing * 24, this.centerY, this.facing, 6, { colors: this.cls.color });
        }
      }
    } else {
      if (homeDist > 120) this.moveToward(dt, player.centerX, world, 1.25);
      else this.vx = damp(this.vx, 0, 6, dt);
    }

    // Skill use.
    if (this.cooldown <= 0 && this.cls.skill) this.useSkill(world, player, target);

    this.applyPhysics(dt, world);
  }

  moveToward(dt, tx, world, mul = 1) {
    const dx = tx - this.centerX;
    this.facing = sign(dx) || this.facing;
    const speed = 190 * mul;
    if (Math.abs(dx) > 20) {
      // Simple obstacle hop.
      const probe = { x: this.facing > 0 ? this.x + this.w : this.x - 12, y: this.y + 8, w: 12, h: this.h - 16 };
      if (this.grounded && world.district.collision.some((s) => s.type !== SOLID.PLATFORM && rectsOverlap(probe, s))) this.vy = -520;
      this.vx = damp(this.vx, this.facing * speed, 8, dt);
    } else this.vx = damp(this.vx, 0, 8, dt);
  }

  useSkill(world, player, target) {
    const cd = this.cls.cooldown * (1 - (this.game.player.mods.allyCooldown || 0));
    switch (this.cls.id) {
      case 'scout':
        world.revealEnemies(8);
        this.game.toast(`${this.name}: area revealed`, 'good');
        break;
      case 'archer': {
        const targets = world.enemies.filter((e) => !e.dead).slice(0, 3);
        for (const t of targets) world.damageEnemy(t, this.damage * 1.3, { source: this, heavy: true });
        this.game.toast(`${this.name}: volley`, 'good');
        break;
      }
      case 'warrior': {
        for (const e of world.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.centerX - this.centerX, e.centerY - this.centerY) < 160) {
            world.damageEnemy(e, this.damage * 1.4, { source: this, heavy: true });
            e.detection = Math.max(e.detection, 60);
          }
        }
        this.game.toast(`${this.name}: cleave`, 'good');
        break;
      }
      case 'assassin': {
        const unaware = world.enemies.find((e) => !e.dead && !e.isAwareOfPlayer());
        if (unaware) { world.killEnemy(unaware, { source: this, assassination: true }); this.game.toast(`${this.name}: silent kill`, 'good'); }
        break;
      }
      case 'medic':
        player.heal(45);
        this.game.toast(`${this.name}: field dressing`, 'good');
        break;
      case 'saboteur':
        world.spawnHazards('bombs', 1, this.centerX + this.facing * 120);
        this.game.toast(`${this.name}: charge planted`, 'good');
        break;
      default: break;
    }
    this.cooldown = cd;
  }

  takeDamage(amount, source) {
    this.hp -= amount * (1 - this.defense);
    this.hitFlash = 0.15;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.game.toast(`${this.name} is down!`, 'bad'); }
  }

  heal(a) { this.hp = Math.min(this.maxHp, this.hp + a); }

  applyPhysics(dt, world) {
    const solids = world.district.collision;
    this.vy = Math.min(1100, this.vy + 1700 * dt);
    const b = this.body || (this.body = { x: 0, y: 0, w: this.w, h: this.h, vx: 0, vy: 0, grounded: false });
    b.x = this.x; b.y = this.y; b.w = this.w; b.h = this.h; b.vx = this.vx; b.vy = this.vy;
    const prevBottom = this.y + this.h;
    depenetrate(b, solids);
    const ignore = new Set(solids.filter((s) => rectsOverlap(b, s)));
    const list = solids.filter((s) => !ignore.has(s));
    moveAxis(b, this.vx * dt, list, 'x');
    moveAxis(b, this.vy * dt, list.filter((s) => s.type !== SOLID.PLATFORM || (this.vy > 0 && prevBottom <= s.y + 6)), 'y');
    this.x = b.x; this.y = b.y; this.vx = b.vx; this.vy = b.vy; this.grounded = b.grounded;
  }
}
