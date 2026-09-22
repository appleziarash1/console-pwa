import { clamp, damp, sign, moveAxis, rectsOverlap, uid, angleDiff, depenetrate } from '../engine/utils.js';
import { SOLID } from '../world/worldBuilder.js';
import { getEnemyType, AI_STATE } from '../data/enemies.js';

/**
 * Enemy AI.
 *
 * Full state machine (design doc §18):
 *   IDLE → PATROL → SUSPICIOUS → SEARCH → ALERT → CHASE → ATTACK → STUNNED → RECOVER → SEARCH → PATROL
 *
 * Vision is a cone with a range and angle, plus a hearing radius that reacts to the
 * player's noise value. Detection fills a meter at a per-type rate scaled by how
 * visible the player is. Awareness is shared with nearby allies when alertCall is set.
 */
export class Enemy {
  constructor(game, def, x, y, opts = {}) {
    this.game = game;
    this.id = uid('e');
    this.kind = 'enemy';
    this.type = def;
    this.typeId = def.id;
    this.name = def.name;
    this.x = x; this.y = y;
    this.w = def.width || 26;
    this.h = def.height || 52;
    this.vx = 0; this.vy = 0;
    this.facing = opts.facing ?? (Math.random() < 0.5 ? -1 : 1);
    this.grounded = false;

    this.maxHp = def.hp; this.hp = def.hp;
    this.state = AI_STATE.PATROL;
    this.stateTime = 0;
    this.detection = 0;
    this.alerted = false;
    this.lastKnown = null;
    this.searchTimer = 0;
    this.attackCooldown = Math.random() * 0.6;
    this.attackTime = 0;
    this.attackWindup = 0;
    this.attackHit = false;
    this.stunTime = 0;
    this.dead = false;
    this.deadTime = 0;
    this.patrolOrigin = { x, y };
    this.patrolTarget = opts.patrol ? x + (Math.random() < 0.5 ? -1 : 1) * opts.patrol : x;
    this.patrolDist = opts.patrol || 0;
    this.patrolPause = 0;
    this.zone = opts.zone || 'street';
    this.awareness = 0;             // 0..1 permanent suspicion ramp
    this.attackIndex = 0;
    this.dodgeCooldown = 0;
    this.blockTime = 0;
    this.reinforcementCalled = false;
    this.recentDamage = 0;
    this.hitFlash = 0;
    this.animTime = Math.random() * 4;
    this.speakCooldown = 0;
    this.lastDamageFrom = null;
    this.tier = def.tier || 1;
    this.isBoss = false;
    this._path = [];
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }

  isAwareOfPlayer() {
    return this.state === AI_STATE.CHASE || this.state === AI_STATE.ATTACK
      || this.state === AI_STATE.ALERT || this.detection >= 70;
  }

  /** Can this enemy see the player right now? Handles hiding, shadows, stealth. */
  canSee(player, world) {
    if (player.hp <= 0) return 0;
    if (player.hidden && !this.type.seesHidden) return 0;
    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    const d = Math.hypot(dx, dy);
    let range = this.type.visionRange;
    if (world.weather === 'fog') range *= 0.55;
    if (world.weather === 'storm') range *= 0.85;
    if (world.isNight) range *= 0.88;
    if (d > range) return 0;
    const angle = Math.atan2(dy, dx);
    const facingAngle = this.facing > 0 ? 0 : Math.PI;
    const diff = Math.abs(angleDiff(facingAngle, angle));
    let cone = this.type.visionAngle / 2;
    // Close range grants peripheral vision.
    if (d < 70) cone += 0.75;
    if (diff > cone) return 0;
    // Smell of blood: recently damaged enemies are hyper-aware.
    let strength = 1 - d / range;
    if (world.hasLineOfSight(this.centerX, this.centerY, player.centerX, player.centerY)) {
      strength *= 1.0;
    } else {
      strength *= 0.35;
    }
    if (world.inSmoke(this.centerX, this.centerY, this.type.smokeResist || 0)) return 0;
    if (player.inShadow) strength *= 0.5;
    if (player.inCrowd) strength *= 0.6;
    return clamp(strength * player.visibility(), 0, 1);
  }

  hears(player) {
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    let radius = this.type.hearingRadius;
    if (this.game.world.weather === 'rain') radius *= 0.7;
    if (this.game.world.weather === 'storm') radius *= 0.55;
    if (this.zone === 'tunnel') radius *= 1.2;
    const exposure = (player.noise / 120) * radius;
    return d < exposure && !player.hidden;
  }

  update(dt, world, player) {
    if (this.dead) { this.deadTime += dt; return; }
    this.stateTime += dt;
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.speakCooldown > 0) this.speakCooldown -= dt;
    if (this.recentDamage > 0) this.recentDamage -= dt * 10;

    if (this.stunTime > 0) {
      this.stunTime -= dt;
      this.state = AI_STATE.STUNNED;
      this.vx = damp(this.vx, 0, 6, dt);
      this.applyPhysics(dt, world);
      if (this.stunTime <= 0) this.setState(AI_STATE.RECOVER);
      return;
    }

    const seeStrength = this.canSee(player, world);
    const heard = this.hears(player);

    // ── detection meter ──
    if (seeStrength > 0) {
      const rate = this.type.detectionSpeed * (0.4 + seeStrength * 1.6) * (1 - clamp(player.mods.detectionResist || 0, 0, 0.8));
      this.detection = clamp(this.detection + rate * 100 * dt, 0, 100);
      this.lastKnown = { x: player.centerX, y: player.centerY, t: 0 };
    } else {
      const decay = this.state === AI_STATE.SEARCH ? 6 : 22;
      this.detection = clamp(this.detection - decay * dt, 0, 100);
    }
    if (heard) {
      this.detection = clamp(this.detection + 26 * dt, 0, 100);
      this.lastKnown = { x: player.centerX, y: player.centerY, t: 0 };
      if (this.state === AI_STATE.PATROL || this.state === AI_STATE.IDLE) this.setState(AI_STATE.SUSPICIOUS);
    }
    if (this.lastKnown) this.lastKnown.t += dt;

    this.awareness = clamp(this.awareness + (seeStrength > 0.2 ? 0.3 : -0.05) * dt, 0, 1);

    // ── state transitions on detection thresholds ──
    if (this.detection >= 100) {
      if (this.state !== AI_STATE.CHASE && this.state !== AI_STATE.ATTACK && this.state !== AI_STATE.ALERT) {
        this.setState(AI_STATE.ALERT);
        this.callReinforcements(world);
      }
    } else if (this.detection >= 55) {
      if (this.state === AI_STATE.PATROL || this.state === AI_STATE.IDLE) this.setState(AI_STATE.SUSPICIOUS);
      else if (this.state === AI_STATE.SUSPICIOUS && this.stateTime > 1.2) this.setState(AI_STATE.SEARCH);
    } else if (this.detection >= 22) {
      if (this.state === AI_STATE.PATROL || this.state === AI_STATE.IDLE) this.setState(AI_STATE.SUSPICIOUS);
    }

    switch (this.state) {
      case AI_STATE.IDLE: this.tickIdle(dt); break;
      case AI_STATE.PATROL: this.tickPatrol(dt, world, player); break;
      case AI_STATE.SUSPICIOUS: this.tickSuspicious(dt, world, player, seeStrength); break;
      case AI_STATE.SEARCH: this.tickSearch(dt, world, player); break;
      case AI_STATE.ALERT: this.tickAlert(dt, world, player); break;
      case AI_STATE.CHASE: this.tickChase(dt, world, player); break;
      case AI_STATE.ATTACK: this.tickAttack(dt, world, player); break;
      case AI_STATE.RECOVER: this.tickRecover(dt); break;
      default: this.tickPatrol(dt, world, player); break;
    }

    this.applyPhysics(dt, world);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s === AI_STATE.ALERT || s === AI_STATE.CHASE) {
      this.alerted = true;
      if (this.type.alertCall && this.speakCooldown <= 0) {
        this.speakCooldown = 3.5;
        this.game.audio.sfx('alert', { volume: this.zone === 'street' ? 1 : 0.6 });
        this.game.world.alertAt(this.centerX, this.centerY, this);
      }
    }
  }

  tickIdle(dt) {
    this.vx = damp(this.vx, 0, 5, dt);
    if (this.stateTime > 1.5) this.setState(AI_STATE.PATROL);
  }

  tickPatrol(dt, world, player) {
    if (!this.patrolDist) {
      this.vx = damp(this.vx, 0, 6, dt);
      // Slow scan of the area.
      if (Math.random() < dt * 0.6) this.facing *= -1;
      return;
    }
    if (this.patrolPause > 0) {
      this.patrolPause -= dt;
      this.vx = damp(this.vx, 0, 8, dt);
      return;
    }
    const targetX = this.patrolTarget;
    const dx = targetX - this.centerX;
    if (Math.abs(dx) < 14) {
      this.patrolPause = 0.8 + Math.random() * 1.6;
      // swap direction around origin
      const other = this.patrolOrigin.x - (targetX - this.patrolOrigin.x);
      this.patrolTarget = other;
      this.facing *= -1;
      return;
    }
    this.facing = sign(dx);
    const blocked = this.wallAhead(world);
    if (blocked) { this.patrolTarget = this.centerX - sign(dx) * this.patrolDist; this.facing *= -1; this.patrolPause = 0.5; }
    this.vx = damp(this.vx, this.facing * this.type.speed, 6, dt);
    // Guards on roofs look down; tunnel guards sweep narrow.
    if (this.zone === 'roof' && Math.random() < dt * 1.4) this.facing *= -1;
  }

  wallAhead(world) {
    const probe = {
      x: this.facing > 0 ? this.x + this.w : this.x - 12,
      y: this.y + 8, w: 12, h: this.h - 16,
    };
    for (const s of world.district.collision) {
      if (s.type === SOLID.PLATFORM) continue;
      if (rectsOverlap(probe, s)) return true;
    }
    // Cliff ahead? (no ground)
    const foot = { x: this.facing > 0 ? this.x + this.w + 2 : this.x - 14, y: this.y + this.h + 4, w: 12, h: 24 };
    for (const s of world.district.collision) if (rectsOverlap(foot, s)) return false;
    return true;
  }

  tickSuspicious(dt, world, player, seeStrength) {
    this.vx = damp(this.vx, 0, 7, dt);
    // Turn toward the last known position.
    if (this.lastKnown) {
      const dx = this.lastKnown.x - this.centerX;
      if (Math.abs(dx) > 8) this.facing = sign(dx);
    }
    if (this.stateTime > 0.6 + Math.random() * 0.4) {
      if (this.detection > 45 || seeStrength > 0.25) this.setState(AI_STATE.SEARCH);
      else if (this.detection < 15) this.setState(AI_STATE.PATROL);
    }
  }

  tickSearch(dt, world, player) {
    const speed = this.type.speed * 1.25;
    if (this.lastKnown) {
      const dx = this.lastKnown.x - this.centerX;
      if (Math.abs(dx) > 26) {
        this.facing = sign(dx);
        if (!this.wallAhead(world)) this.vx = damp(this.vx, this.facing * speed, 6, dt);
        else this.vx = damp(this.vx, 0, 8, dt);
      } else {
        this.vx = damp(this.vx, 0, 8, dt);
        this.searchTimer += dt;
        if (this.searchTimer > 0.7) { this.searchTimer = 0; this.lastKnown.x += (Math.random() - 0.5) * 200; this.facing *= -1; }
      }
    }
    if (this.detection >= 100) this.setState(AI_STATE.CHASE);
    else if (this.detection < 8 && this.stateTime > 3.5) this.setState(AI_STATE.RETURN);
    else if (this.stateTime > 12) this.setState(AI_STATE.RETURN);
  }

  tickAlert(dt, world, player) {
    this.vx = damp(this.vx, 0, 8, dt);
    if (this.stateTime > 0.45) this.setState(AI_STATE.CHASE);
  }

  tickChase(dt, world, player) {
    if (!this.lastKnown) { this.setState(AI_STATE.SEARCH); return; }
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    const chaseRange = this.type.visionRange * 1.3;
    if (this.canSee(player, world) > 0) {
      this.lastKnown = { x: player.centerX, y: player.centerY, t: 0 };
    }
    if (d <= this.type.attackRange * 0.92 && Math.abs(player.centerY - this.centerY) < this.h) {
      this.setState(AI_STATE.ATTACK);
      return;
    }
    if (this.lastKnown.t > 6) { this.setState(AI_STATE.SEARCH); return; }
    const dx = this.lastKnown.x - this.centerX;
    const dy = this.lastKnown.y - this.centerY;
    this.facing = sign(dx) || this.facing;

    // Enemies keep their feet on narrow surfaces rather than walking off.
    const wantVx = this.facing * this.type.chaseSpeed;
    if (this.wallAhead(world) && this.grounded) {
      // Try to hop the obstruction.
      if (this.grounded) { this.vy = -520; this.grounded = false; }
      this.vx = damp(this.vx, 0, 4, dt);
    } else {
      this.vx = damp(this.vx, wantVx, 9, dt);
    }
    // Check for a ground gap and jump it.
    if (this.grounded) {
      const ahead = { x: this.facing > 0 ? this.x + this.w + 6 : this.x - 20, y: this.y + this.h + 6, w: 16, h: 40 };
      const ground = world.district.collision.some((s) => rectsOverlap(ahead, s));
      if (!ground) { this.vy = -470; this.grounded = false; }
    }
    // Archers/ranged keep distance instead of closing.
    if (this.type.prefersDistance) {
      if (d < this.type.attackRange * 0.5) this.vx = damp(this.vx, -this.facing * this.type.speed * 0.9, 6, dt);
    }
    // Vertical pursuit: if the player is above and there is a platform, climb it.
    if (player.centerY < this.y - 30 && this.grounded) {
      this._climbCheck = (this._climbCheck || 0) + dt;
      if (this._climbCheck > 0.7) { this._climbCheck = 0; this.vy = -560; this.grounded = false; }
    }
  }

  tickAttack(dt, world, player) {
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    this.facing = sign(player.centerX - this.centerX) || this.facing;
    if (this.attackTime > 0) {
      this.attackTime -= dt;
      this.vx = damp(this.vx, 0, 10, dt);
      const t = 1 - this.attackTime / this.attackDuration;
      if (this.attackWindup > 0) {
        this.attackWindup -= dt;
        if (this.attackWindup <= 0) this.performAttack(world, player);
      }
      return;
    }
    if (d > this.type.attackRange) { this.setState(AI_STATE.CHASE); return; }
    if (this.attackCooldown > 0) {
      this.vx = damp(this.vx, 0, 6, dt);
      // Blocking enemies guard while waiting.
      if (this.type.canBlock && Math.random() < dt * 3) this.blockTime = 0.4;
      if (this.blockTime > 0) this.blockTime -= dt;
      return;
    }
    // Telegraph, then strike. Never instant (design rule 54).
    this.attackDuration = this.type.telegraph + 0.18;
    this.attackTime = this.attackDuration;
    this.attackWindup = this.type.telegraph;
    this.attackHit = false;
    this.attackIndex++;
    this.game.audio.sfx('whoosh', { volume: 0.5 });
  }

  performAttack(world, player) {
    if (this.dead) return;
    const d = Math.hypot(player.centerX - this.centerX, player.centerY - this.centerY);
    const reach = this.type.attackRange + 10;
    if (this.type.ranged) {
      world.spawnEnemyProjectile(this, player, this.type);
      this.attackCooldown = this.type.attackCooldown;
      return;
    }
    if (d <= reach) {
      player.takeDamage(this.type.damage, this, 'melee');
    } else {
      this.game.particles.cone('spark', this.centerX + this.facing * 30, this.centerY, this.facing, 4, { colors: ['#9c917a'] });
    }
    this.attackCooldown = this.type.attackCooldown;
  }

  tickRecover(dt) {
    this.vx = damp(this.vx, 0, 8, dt);
    if (this.stateTime > 0.5) {
      if (this.detection > 50) this.setState(AI_STATE.CHASE); else this.setState(AI_STATE.SEARCH);
    }
  }

  applyPhysics(dt, world) {
    const solids = world.district.collision;
    this.vy = Math.min(1100, this.vy + 1700 * dt);
    const b = this.body || (this.body = { x: 0, y: 0, w: this.w, h: this.h, vx: 0, vy: 0, grounded: false });
    b.x = this.x; b.y = this.y; b.w = this.w; b.h = this.h; b.vx = this.vx; b.vy = this.vy;
    const prevBottom = this.y + this.h;
    depenetrate(b, solids);
    const ignore = new Set(solids.filter((s) => rectsOverlap(b, s)));
    const solidList = solids.filter((s) => !ignore.has(s));
    moveAxis(b, this.vx * dt, solidList, 'x');
    const solidsY = solidList.filter((s) => {
      if (s.type !== SOLID.PLATFORM) return true;
      return this.vy > 0 && prevBottom <= s.y + 6;
    });
    moveAxis(b, this.vy * dt, solidsY, 'y');
    this.x = b.x; this.y = b.y; this.vx = b.vx; this.vy = b.vy; this.grounded = b.grounded;
    if (this.y > world.district.height + 200) { this.hp = 0; this.die(world, null); }
    this.x = clamp(this.x, 0, world.district.width - this.w);
  }

  takeDamage(amount, source, opts = {}) {
    if (this.dead) return;
    let dmg = amount;
    const armor = (this.type.armor || 0) * (1 - (opts.pen || 0));
    // Back attacks ignore armor (weakness).
    const fromBehind = source && sign(source.centerX - this.centerX) === -this.facing;
    if (!fromBehind) dmg *= 1 - clamp(armor, 0, 0.8);
    else dmg *= 1 + (this.type.weakness === 'back' ? 0.5 : 0.15);
    if (opts.heavy) dmg *= 1.15;
    this.hp -= dmg;
    this.hitFlash = 0.16;
    this.recentDamage = 1;
    this.lastDamageFrom = source || null;
    this.detection = Math.max(this.detection, 100);
    this.lastKnown = source ? { x: source.centerX, y: source.centerY, t: 0 } : this.lastKnown;
    if (!this.dead) this.setState(AI_STATE.CHASE);
    const staggerAmt = ((opts.heavy ? 0.8 : 0.35) + (this.game.player?.mods?.stagger || 0) * 0.5) / Math.max(0.4, this.type.poise);
    this.stagger(clamp(staggerAmt, 0, 1.4), source);
    if (this.hp <= 0) this.die(this.game.world, source);
  }

  stagger(t, source) {
    if (this.dead) return;
    this.stunTime = Math.max(this.stunTime, t);
    if (source) this.vx = sign(this.centerX - source.centerX) * 110;
  }

  die(world, source) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.state = 'dead';
    this.game.audio.sfx('death', { volume: 0.6 });
    this.game.particles.burst('blood', this.centerX, this.centerY, 16, { colors: ['#9e2b25', '#d94138', '#5e1410'], maxSpeed: 180 });
    this.game.camera.shake(4, 0.18);
    world.onEnemyDeath(this, source);
  }

  callReinforcements(world) {
    if (this.reinforcementCalled) return;
    this.reinforcementCalled = true;
    world.requestReinforcements(this);
  }
}
