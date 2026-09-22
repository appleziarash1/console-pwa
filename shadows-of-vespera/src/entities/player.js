import { clamp, damp, moveAxis, rectsOverlap, sign, uid, depenetrate } from '../engine/utils.js';
import { SOLID } from '../world/worldBuilder.js';
import { getWeapon, weaponDamage } from '../data/weapons.js';
import { aggregateArmor } from '../data/armor.js';

/**
 * Player: Kael Varen.
 *
 * Handles ground/air movement, the full parkour chain (wall jump, ledge grab,
 * ledge climb, rope slide, zipline, dash, double jump), melee combos, parry,
 * block, assassination (front/rear/air/ledge/hidden/sprint/rope), gadget use
 * and the detection/noise model that the alert system reads.
 */
export class Player {
  constructor(game) {
    this.game = game;
    this.id = 'player';
    this.kind = 'player';
    this.name = 'Kael Varen';

    this.x = 0; this.y = 0; this.w = 26; this.h = 54;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.cooyote = 0;
    this.jumpBuffer = 0;

    this.baseHp = 100;
    this.hp = 100;
    this.maxHp = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.exhausted = false;

    this.state = 'idle';        // idle | run | sprint | jump | fall | climb | ledge | rope | dash | attack | block | parry | assassinate | hurt | dead | hide | zipline
    this.stateTime = 0;

    // movement tuning
    this.walkSpeed = 168;
    this.sprintSpeed = 296;
    this.accel = 1500;
    this.friction = 1900;
    this.airAccel = 900;
    this.gravity = 1760;
    this.jumpVelocity = -600;
    this.terminal = 1200;

    // parkour
    this.climbing = null;
    this.onLedge = null;
    this.onRope = null;
    this.onZipline = null;
    this.wallDir = 0;
    this.wallCooldown = 0;
    this.dashTime = 0;
    this.dashCooldown = 0;
    this.dashDir = 1;
    this.airDashUsed = 0;
    this.jumpsUsed = 0;
    this.hideSpot = null;
    this.hideAmount = 0;

    // combat
    this.weaponId = 'shortSword';
    this.attackTime = 0;
    this.attackIndex = 0;
    this.attackCooldown = 0;
    this.attackHitFrame = false;
    this.comboWindow = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.blocking = false;
    this.parryWindow = 0;
    this.parryTime = 0;
    this.invuln = 0;
    this.hurtTime = 0;
    this.staggerTime = 0;
    this.attackTargets = [];
    this.blockChip = 0;

    // assassination
    this.assassinating = null;
    this.assassinateTime = 0;
    this.chainTargets = [];

    // detection / stealth
    this.noise = 0;
    this.detection = 0;
    this.detectionState = 'safe';
    this.lastSeenAt = -99;
    this.inShadow = false;
    this.inCrowd = false;

    // modifiers (recomputed from armor + skills + level)
    this.mods = {};

    // stats for achievements
    this.stats = { rooftopDistance: 0, assassinations: 0, airAssassinations: 0, kills: 0, steps: 0, distance: 0 };

    this.gadget = { id: 'smokeBomb', count: 3, cooldown: 0 };
    this.aiming = false;
    this.zoomedOut = false;

    // animation
    this.animTime = 0;
    this.limbPhase = 0;
    this.trail = [];
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }

  /** Recompute modifiers from armor, skills, boosts and level. */
  recompute(save) {
    const armor = aggregateArmor(save.loadout, save.owned);
    const skills = save.skillEffects || {};
    const boost = save.boosts || {};
    const m = {
      maxHp: (armor.maxHp || 0) + (boost.maxHp || 0),
      damage: (armor.damage || 0) + (boost.damage || 0) + (skills.damage || 0),
      armor: (armor.armor || 0) + (skills.armor || 0),
      detectionResist: (armor.detectionResist || 0) + (skills.detectionResist || 0) + (boost.detectionResist || 0),
      moveSpeed: (armor.moveSpeed || 0) + (skills.moveSpeed || 0),
      attackSpeed: (armor.attackSpeed || 0) + (skills.attackSpeed || 0),
      climbSpeed: (armor.climbSpeed || 0) + (skills.climbSpeed || 0),
      jumpBonus: (armor.jumpBonus || 0) + (skills.jumpBonus || 0),
      noise: (armor.noise || 0) + (skills.noise || 0),
      assassinationSpeed: (armor.assassinationSpeed || 0) + (skills.assassinationSpeed || 0),
      rangedDamage: (armor.rangedDamage || 0) + (skills.rangedDamage || 0),
      stagger: (armor.stagger || 0) + (skills.stagger || 0),
      maxStamina: 100 + (boost.maxStamina || 0),
      lifeSteal: (boost.lifeSteal || 0),
    };
    this.mods = m;
    this.skillEffects = skills;
    const levelHp = (save.level - 1) * 5;
    this.baseHp = 100 + levelHp;
    const prevMax = this.maxHp;
    this.maxHp = this.baseHp + m.maxHp;
    if (this.hp > this.maxHp || this.hp <= 0) this.hp = Math.min(this.maxHp, this.hp <= 0 ? this.maxHp : this.hp);
    else if (this.maxHp !== prevMax) this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - prevMax));
    this.maxStamina = m.maxStamina;
    this.stamina = Math.min(this.stamina, this.maxStamina);
  }

  setWeapon(id) { this.weaponId = id; }

  fullHeal() { this.hp = this.maxHp; this.stamina = this.maxStamina; }

  update(dt, input, world) {
    this.stateTime += dt;
    this.animTime += dt;
    if (this.comboTimer > 0) this.comboTimer -= dt; else this.comboCount = 0;
    if (this.parryTime > 0) this.parryTime -= dt;
    if (this.parryWindow > 0) this.parryWindow -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.wallCooldown > 0) this.wallCooldown -= dt;
    if (this.gadget.cooldown > 0) this.gadget.cooldown -= dt;
    if (this.blockChip > 0) this.blockChip -= dt;

    if (this.hp <= 0) { this.state = 'dead'; return; }

    if (this.assassinating) { this.updateAssassination(dt); return; }
    if (this.onZipline) { this.updateZipline(dt, input); return; }
    if (this.onRope) { this.updateRope(dt, input); return; }
    if (this.climbing) { this.updateClimb(dt, input, world); return; }

    if (this.hurtTime > 0.18 && this.grounded) {
      this.vx = damp(this.vx, 0, 8, dt);
      this.integrate(dt, world);
      return;
    }

    // ── dash ──
    if (input.wasPressed('dash') || input.wasPressed('sprint') && input.isDown('sprint') && this.attackCooldown > 0.4) {
      /* dash handled below */
    }
    if ((input.wasPressed('dash') || (input.wasPressed('sprint') && input.moveX() !== 0 && !this.grounded)) && this.dashCooldown <= 0) {
      const airOk = this.grounded || (this.skillEffects?.airDash && this.airDashUsed < this.skillEffects.airDash);
      if (airOk) {
        this.dashTime = this.skillEffects?.airDash && !this.grounded ? 0.18 : 0.22;
        this.dashDir = input.moveX() !== 0 ? sign(input.moveX()) : this.facing;
        this.dashCooldown = 0.55;
        if (!this.grounded) this.airDashUsed++;
        this.game.audio.sfx('dash');
        this.game.particles.cone('spark', this.centerX, this.centerY, -this.dashDir, 8, { colors: ['#cfc7b4', '#8e8677'] });
      }
    }

    // ── attack ──
    if ((input.mousePressed.left || input.touchPressed.has('attack')) && this.attackCooldown <= 0 && this.dashTime <= 0) {
      this.startAttack();
    }
    if (this.attackTime > 0) { this.updateAttack(dt, world); }
    else {
      if (this.attackIndex > 0 && this.comboTimer <= 0) { this.attackIndex = 0; }
    }

    // ── block / parry ──
    const wantBlock = input.mouse.right || input.isDown('block');
    if (wantBlock && !this.attacking && this.stamina > 8) {
      if (!this.blocking) { this.parryWindow = this.skillEffects?.parryWindow ?? 0.10; }
      this.blocking = true;
      this.state = 'block';
    } else if (this.blocking) {
      this.blocking = false;
      if (this.state === 'block') this.state = 'idle';
    }
    if (this.blocking) this.stamina = Math.max(0, this.stamina - 6 * dt);

    // ── assassination attempt ──
    if (input.wasPressed('assassinate') || input.touchPressed.has('assassinate')) {
      if (this.tryAssassinate(world)) return;
    }

    // ── climbing entry ──
    if (input.isDown('up') || input.moveY() < -0.4) {
      const ladder = world.district.laddersAt(this.centerX, this.y + this.h * 0.5);
      if (ladder && !this.grounded) { this.enterClimb(ladder); return; }
      const trellis = world.district.trellisAt(this.centerX, this.centerY, this.facing);
      if (trellis && !this.grounded) { this.enterTrellis(trellis); return; }
      const rope = world.district.ropeAt(this.centerX, this.centerY);
      if (rope && !this.grounded) { this.enterRope(rope); return; }
      const zip = world.district.ziplineAt(this.centerX, this.centerY);
      if (zip && this.grounded) { this.enterZipline(zip); return; }
    }
    // Ground-level ladder climb from the street.
    if ((input.isDown('up') || input.moveY() < -0.4)) {
      const ladder = world.district.laddersAt(this.centerX, this.y + this.h * 0.4);
      if (ladder) { this.enterClimb(ladder); return; }
    }

    // ── ledge climb ──
    if (this.onLedge) {
      if (input.wasPressed('jump') || input.wasPressed('up')) { this.climbLedge(); return; }
      if (input.wasPressed('down')) { this.onLedge = null; this.vy = 40; }
    }

    // ── movement ──
    const mx = input.moveX();
    const sprinting = input.isDown('sprint') && Math.abs(mx) > 0.1 && !this.exhausted;
    let target = 0;
    if (mx !== 0) {
      target = mx * (sprinting ? this.sprintSpeed : this.walkSpeed) * (1 + this.mods.moveSpeed);
      this.facing = mx > 0 ? 1 : -1;
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDir * 620;
      this.vy = Math.min(this.vy, 20);
      this.state = 'dash';
      if (rng2(dt)) this.game.particles.spawn('spark', this.centerX, this.centerY, { vx: -this.dashDir * 60, vy: -20, life: 0.25, color: '#cfc7b4', size: 3, gravity: 40 });
      this.integrate(dt, world);
      return;
    }

    const inAir = !this.grounded;
    const a = (inAir ? this.airAccel : this.accel) * dt;
    if (target !== 0) {
      this.vx = approach(this.vx, target, a);
      if (this.grounded) {
        this.pendingStep = (this.pendingStep || 0) + Math.abs(this.vx) * dt;
        if (this.pendingStep > 46 * (sprinting ? 0.6 : 1)) {
          this.pendingStep = 0;
          this.emitFootstep(sprinting);
        }
      }
    } else if (this.grounded) {
      this.vx = approach(this.vx, 0, this.friction * dt);
    } else {
      this.vx = approach(this.vx, 0, this.airAccel * 0.25 * dt);
    }

    // Stamina: sprinting drains, standing still recovers. Hiding is not free either.
    if (sprinting && Math.abs(this.vx) > 60) this.stamina = Math.max(0, this.stamina - 17 * dt);
    else if (!this.blocking) this.stamina = Math.min(this.maxStamina, this.stamina + (this.hidden ? 8 : 24) * dt);
    this.exhausted = this.stamina <= 0.5;

    // ── jump ──
    if (input.wasPressed('jump') || input.touchPressed.has('jump')) this.jumpBuffer = 0.14;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0) {
      if (this.grounded || this.cooyote > 0) {
        this.doJump();
      } else if (this.wallDir !== 0 && this.skillEffects?.wallJump && this.wallCooldown <= 0) {
        this.doWallJump(world);
      } else if (this.skillEffects?.doubleJump && this.jumpsUsed < 1 + this.skillEffects.doubleJump) {
        this.doJump(0.86);
        this.jumpsUsed++;
      }
    }

    // ── gravity ──
    this.vy = Math.min(this.terminal, this.vy + this.gravity * dt);
    this.integrate(dt, world);

    // ── wall detection for wall jump ──
    this.wallDir = 0;
    if (!this.grounded) {
      const probe = { x: this.x + (this.facing > 0 ? this.w : -6), y: this.y + 6, w: 6, h: this.h - 12 };
      for (const s of world.district.collision) {
        if (rectsOverlap(probe, s) && s.type !== SOLID.PLATFORM) { this.wallDir = this.facing; break; }
      }
      // ── ledge grab ──
      if (this.vy > 30) {
        const facing = this.facing;
        const hand = { x: this.centerX + facing * 20, y: this.y + 8, w: 12, h: 14 };
        for (const s of world.district.collision) {
          if (s.type === SOLID.EARTH || s.type === SOLID.BEDROCK) continue;
          const topEdge = { x: s.x, y: s.y - 6, w: s.w, h: 12 };
          if (rectsOverlap(hand, topEdge)) {
            // must be a wall below the top edge to be a real ledge
            if (s.y + s.h > this.y + 20) {
              this.attachLedge(s, facing);
              break;
            }
          }
        }
      }
    } else {
      this.jumpsUsed = 0;
      this.airDashUsed = 0;
    }

    // ── hide spots ──
    const spot = world.district.hideSpotAt(this.centerX, this.y + this.h);
    if (spot && Math.abs(this.vx) < 40) {
      if (!this.hideSpot) this.hideSpot = spot;
      this.hideAmount = Math.min(1, this.hideAmount + dt / Math.max(0.05, 0.45 * (1 - (this.skillEffects?.hideSpeed || 0))));
      if (this.hideAmount >= 0.99) { this.hidden = true; this.state = 'hide'; }
    } else {
      if (this.hideSpot && !spot) this.hideSpot = null;
      this.hideAmount = Math.max(0, this.hideAmount - dt * 2.4);
      if (this.hideAmount < 0.6) this.hidden = false;
      if (this.state === 'hide' && !this.hidden) this.state = 'idle';
    }

    // ── state label ──
    if (this.hp > 0) {
      if (this.dashTime > 0) this.state = 'dash';
      else if (this.hidden) this.state = 'hide';
      else if (!this.grounded) this.state = this.vy < 0 ? 'jump' : 'fall';
      else if (this.attackTime > 0) this.state = 'attack';
      else if (this.blocking) this.state = 'block';
      else if (Math.abs(this.vx) > this.walkSpeed * 1.25) this.state = 'sprint';
      else if (Math.abs(this.vx) > 20) this.state = 'run';
      else this.state = 'idle';
    }

    // ── noise / stealth environment ──
    const speed = Math.abs(this.vx);
    let noise = 0;
    if (!this.grounded) noise = 12;
    else if (speed > 40) noise = 30 + speed * 0.12;
    if (this.grounded && speed < 20) noise = 4;
    noise *= 1 + (this.mods.noise || 0);
    if (this.hidden) noise *= 0.25;
    this.noise = clamp(damp(this.noise, noise, 8, dt), 0, 120);

    this.inShadow = world.inShadowAt(this.centerX, this.centerY);
    this.inCrowd = world.inCrowdAt(this.centerX, this.centerY);

    this.updateStats(dt);
    this.updateTrail(dt);
  }

  emitFootstep(sprinting) {
    this.game.audio.sfx('step', { volume: sprinting ? 0.7 : 0.45 });
    this.stats.steps++;
    this.game.particles.spawn('dust', this.centerX, this.y + this.h, {
      vx: (Math.random() - 0.5) * 30, vy: -18, life: 0.4, size: 3, color: 'rgba(190,180,160,.5)', gravity: 40,
    });
  }

  doJump(scale = 1) {
    this.vy = this.jumpVelocity * (1 + (this.mods.jumpBonus || 0)) * scale;
    this.grounded = false;
    this.jumpsUsed++;
    this.game.audio.sfx('jump');
    this.game.particles.burst('dust', this.centerX, this.y + this.h, 5, { colors: ['rgba(190,180,160,.6)'], gravity: 260, minSpeed: 20, maxSpeed: 70 });
  }

  doWallJump(world) {
    this.vy = this.jumpVelocity * 0.95;
    this.vx = -this.wallDir * 330;
    this.facing = -this.wallDir;
    this.wallCooldown = 0.25;
    this.game.audio.sfx('jump');
    this.game.particles.cone('dust', this.centerX, this.centerY, this.wallDir, 8, { colors: ['#b9ae98'] });
  }

  attachLedge(solid, facing) {
    this.onLedge = solid;
    this.climbing = null;
    this.onRope = null;
    this.vy = 0; this.vx = 0;
    this.grounded = false;
    this.state = 'ledge';
    if (facing > 0) this.x = solid.x - this.w + 4;
    else this.x = solid.x + solid.w - 4;
    this.y = solid.y + 6;
    this.game.audio.sfx('land', { volume: 0.5 });
  }

  climbLedge() {
    const s = this.onLedge;
    this.onLedge = null;
    this.y = s.y - this.h - 1;
    this.vy = -140;
    this.vx = this.facing * 60;
    this.state = 'jump';
    this.game.audio.sfx('climb');
    this.game.particles.burst('dust', this.centerX, s.y, 5, { colors: ['#b9ae98'] });
  }

  enterClimb(ladder) {
    this.climbing = { type: 'ladder', ref: ladder };
    this.onLedge = null; this.onRope = null; this.onZipline = null;
    this.vx = 0; this.vy = 0;
    this.x = ladder.x + (ladder.w - this.w) / 2;
    this.state = 'climb';
    this.game.audio.sfx('climb', { volume: 0.4 });
  }

  enterTrellis(t) {
    this.climbing = { type: 'trellis', ref: t };
    this.onLedge = null; this.onRope = null; this.onZipline = null;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    if (this.facing > 0) this.x = t.x - this.w + 8; else this.x = t.x + t.w - 8;
    this.state = 'climb';
  }

  updateClimb(dt, input, world) {
    const c = this.climbing;
    const speed = 118 * (1 + (this.mods.climbSpeed || 0));
    const my = input.moveY();
    let dir = 0;
    if (input.isDown('up') || my < -0.3) dir = -1;
    if (input.isDown('down') || my > 0.3) dir = 1;
    this.y += dir * speed * dt;
    this.limbPhase += Math.abs(dir) * dt * 9;

    const ref = c.ref;
    const bottom = ref.y + ref.h;
    if (this.y + this.h < ref.y - 2 && dir < 0) {
      // reached the top: climb over
      this.climbing = null;
      this.y = ref.y - this.h - 1;
      this.vy = -100;
      this.grounded = false;
      this.state = 'jump';
      this.game.audio.sfx('climb');
      return;
    }
    if (this.y > bottom - 6 && dir > 0) {
      this.climbing = null;
      this.grounded = true;
      this.state = 'idle';
      return;
    }
    // letting go with jump
    if (input.wasPressed('jump')) {
      this.climbing = null;
      this.vy = this.jumpVelocity * (1 + (this.mods.jumpBonus || 0));
      this.vx = -this.facing * 120;
      this.grounded = false;
      return;
    }
    this._climbTimer = (this._climbTimer || 0) + dt;
    if (this._climbTimer > 0.4) { this._climbTimer = 0; this.game.audio.sfx('climb', { volume: 0.3 }); }
  }

  enterRope(rope) {
    this.onRope = rope;
    this.climbing = null; this.onLedge = null; this.onZipline = null;
    this.x = rope.x + rope.w / 2 - this.w / 2;
    this.vx = 0; this.vy = 0;
    this.ropeOffset = 0;
    this.state = 'rope';
  }

  updateRope(dt, input) {
    const rope = this.onRope;
    const my = input.moveY();
    const climbSpeed = 96 * (1 + (this.mods.climbSpeed || 0) * 0.5);
    if (input.isDown('up') || my < -0.3) this.y -= climbSpeed * dt;
    if (input.isDown('down') || my > 0.3) this.y += climbSpeed * dt;
    this.ropeOffset += (input.moveX() * 40 - this.ropeOffset) * Math.min(1, dt * 3);
    this.y = clamp(this.y, rope.y - 10, rope.y + rope.h + 40);

    if (input.wasPressed('jump') || input.touchPressed.has('jump')) {
      this.onRope = null;
      this.vy = -420;
      this.vx = input.moveX() * 260 || this.facing * 160;
      this.facing = sign(this.vx) || this.facing;
      this.state = 'jump';
      this.game.audio.sfx('jump');
    }
    if (this.y + this.h > rope.y + rope.h + 30) {
      this.onRope = null;
      this.state = 'fall';
      this.vy = 60;
    }
    this._ropeTimer = (this._ropeTimer || 0) + dt;
    if (this._ropeTimer > 0.5) { this._ropeTimer = 0; this.game.audio.sfx('climb', { volume: 0.25 }); }
  }

  enterZipline(z) {
    this.onZipline = z;
    this.climbing = null; this.onLedge = null; this.onRope = null;
    this.zipT = z.x1 < z.x2 ? 0 : 1;
    this.zipDir = z.x1 < z.x2 ? 1 : -1;
    this.state = 'zipline';
    this.grounded = false;
    this.vy = 0;
    this.game.audio.sfx('whoosh');
  }

  updateZipline(dt, input) {
    const z = this.onZipline;
    const len = Math.hypot(z.x2 - z.x1, z.y2 - z.y1) || 1;
    const speed = 460 / len;
    this.zipT += this.zipDir * speed * dt;
    if (this.zipT < 0 || this.zipT > 1) {
      this.onZipline = null;
      this.grounded = false;
      this.vy = -80;
      this.vx = this.zipDir * 180;
      this.state = 'fall';
      return;
    }
    this.x = (z.x1 + (z.x2 - z.x1) * this.zipT) - this.w / 2;
    this.y = (z.y1 + (z.y2 - z.y1) * this.zipT) - this.h - 16;
    this.facing = this.zipDir;
    this._zipSpark = (this._zipSpark || 0) + dt;
    if (this._zipSpark > 0.06) {
      this._zipSpark = 0;
      this.game.particles.spawn('spark', this.centerX, this.y, { vx: -this.zipDir * 40, vy: 20, life: 0.3, color: '#f0cf6b', size: 2, gravity: 120 });
    }
    if (input.wasPressed('jump') || input.touchPressed.has('jump')) {
      this.onZipline = null;
      this.vy = this.jumpVelocity * 0.85;
      this.vx = this.facing * 200;
      this.state = 'jump';
    }
  }

  integrate(dt, world) {
    const solids = world.district.collision;
    this.grounded = false;
    this.body = this.body || { x: 0, y: 0, w: this.w, h: this.h, vx: 0, vy: 0, grounded: false };
    const b = this.body;
    b.x = this.x; b.y = this.y; b.w = this.w; b.h = this.h; b.vx = this.vx; b.vy = this.vy;
    const prevBottom = this.y + this.h;
    // Clear any spawn/step overlap first so the sweep cannot eject the player.
    depenetrate(b, solids);
    const ignore = new Set(solids.filter((s) => rectsOverlap(b, s)));
    const solidList = solids.filter((s) => !ignore.has(s));
    moveAxis(b, this.vx * dt, solidList, 'x');
    // one-way platforms: only collide when falling and above them
    const solidsY = solidList.filter((s) => {
      if (s.type !== SOLID.PLATFORM) return true;
      return this.vy > 0 && prevBottom <= s.y + 4;
    });
    moveAxis(b, this.vy * dt, solidsY, 'y');
    this.x = b.x; this.y = b.y;
    this.grounded = b.grounded;
    if (this.grounded) { this.cooyote = 0.1; this.jumpsUsed = 0; this.airDashUsed = 0; }
    else this.cooyote = Math.max(0, this.cooyote - dt);
    this.vx = b.vx; this.vy = b.vy;
    this.y = clamp(this.y, -4000, world.district.height + 400);
    this.x = clamp(this.x, 0, world.district.width - this.w);
    if (this.grounded && this.fallStart !== undefined && this.fallStart !== null) {
      const fell = this.y - this.fallStart;
      if (fell > 520) {
        const dmg = clamp((fell - 520) / 26, 0, 55) * (1 + (this.skillEffects?.fallDamage || 0));
        if (dmg > 2) this.takeDamage(dmg, null, 'fall');
      }
      this.fallStart = null;
    }
    if (!this.grounded && this.fallStart == null) this.fallStart = this.y;
  }

  startAttack() {
    const w = getWeapon(this.weaponId);
    const speedMul = 1 + (this.mods.attackSpeed || 0);
    this.attackIndex = (this.comboCount % Math.max(1, w.comboLength)) + 1;
    this.attackTime = (0.34 / (w.speed * speedMul));
    this.attackDuration = this.attackTime;
    this.attackHitFrame = false;
    this.attackCooldown = this.attackTime * 0.92;
    this.attackTargets = [];
    this.state = 'attack';
    this.comboCount++;
    this.comboTimer = 0.5;
    this.attackReach = w.reach;
    this.isRanged = w.ranged;
    this.attackDamage = w.damage * (1 + (this.mods.damage || 0));
    if (w.ranged) {
      this.drawTimer = w.drawTime || 0.35;
      this.rangedDamage = w.damage * (1 + (this.mods.damage || 0) + (this.mods.rangedDamage || 0));
    }
    this.game.audio.sfx(w.ranged ? 'arrow' : (this.comboCount % 3 === 0 ? 'swordHeavy' : 'sword'));
    if (!w.ranged) {
      this.game.particles.cone('spark', this.centerX + this.facing * 26, this.centerY - 4, this.facing, 5, { colors: ['#eae2ce', '#b8ae97'] });
    }
  }

  updateAttack(dt, world) {
    this.attackTime -= dt;
    const w = getWeapon(this.weaponId);
    const progress = 1 - this.attackTime / this.attackDuration;
    if (w.ranged) {
      if (progress > 0.55 && !this.attackHitFrame) {
        this.attackHitFrame = true;
        if (w.id === 'throwingKnife') {
          const ammo = this.game.save.ammo?.throwingKnife ?? w.maxAmmo;
          if (ammo <= 0) { this.game.toast('No knives left', 'bad'); this.attackTime = 0; return; }
          this.game.save.ammo.throwingKnife = ammo - 1;
        }
        world.spawnProjectile(this, this.facing, w);
      }
    } else if (progress > 0.32 && !this.attackHitFrame) {
      this.attackHitFrame = true;
      const reach = this.attackReach;
      const box = {
        x: this.facing > 0 ? this.centerX : this.centerX - reach,
        y: this.y + 4, w: reach, h: this.h - 8,
      };
      const hits = world.enemies.filter((e) => !e.dead && rectsOverlap(box, e));
      for (const e of hits) {
        if (this.attackTargets.includes(e.id)) continue;
        this.attackTargets.push(e.id);
        const heavy = this.comboCount % 3 === 0;
        let dmg = this.attackDamage * (heavy ? 1.6 : 1);
        if (this.mods.stagger) dmg *= 1 + this.mods.stagger * 0.3;
        world.damageEnemy(e, dmg, { source: this, heavy, pen: this.skillEffects?.armorPen || 0 });
        this.game.audio.sfx('hit');
        this.game.particles.cone('blood', e.centerX, e.centerY, this.facing, heavy ? 12 : 7, { colors: ['#9e2b25', '#d94138', '#711812'] });
        this.game.camera.shake(heavy ? 5 : 3, 0.14);
        if (this.mods.lifeSteal) this.heal(this.mods.lifeSteal * (heavy ? 2 : 1));
      }
    }
    if (this.attackTime <= 0) { this.attackTime = 0; this.state = this.grounded ? 'idle' : this.state; }
  }

  get attacking() { return this.attackTime > 0; }

  /** Try all assassination variants; returns true if one started. */
  tryAssassinate(world) {
    const w = getWeapon(this.weaponId);
    if (!w.assassinate && this.weaponId !== 'voidBlade') {
      // Allow takedown with dagger / hidden blade only.
      if (!(this.weaponId === 'dagger')) { this.game.toast('Need a blade for this', 'bad'); return false; }
    }
    // Candidate targets within reach.
    const reach = 60;
    let best = null, bestDist = 1e9, bestScore = -1e9, variant = 'rear';
    for (const e of world.enemies) {
      if (e.dead || e.assassinationImmune) continue;
      const d = Math.hypot(e.centerX - this.centerX, e.centerY - this.centerY);
      if (d > reach + Math.max(e.w, e.h) * 0.6) continue;
      const unaware = !e.isAwareOfPlayer();
      let score = 10 - d * 0.05;
      let v = 'rear';
      if (this.onLedge) v = 'ledge';
      else if (!this.grounded && this.vy > 0) v = 'air';
      else if (this.onRope) v = 'rope';
      else if (Math.abs(this.vx) > this.sprintSpeed * 0.9) v = 'sprint';
      else if (this.hidden) v = 'hidden';
      else if (e.facing === sign(this.centerX - e.centerX)) v = 'rear';
      else v = 'front';
      if (unaware) score += 20; else score -= 25;
      if (v === 'rear' || v === 'air' || v === 'hidden' || v === 'ledge' || v === 'rope') score += 8;
      if (e.seesHidden && v === 'hidden') score -= 15;
      // Prefer the closest target; use score to break ties in favour of unaware ones.
      if (d < bestDist - 6 || (Math.abs(d - bestDist) <= 6 && score > bestScore)) {
        bestDist = d; bestScore = score; best = e; variant = v;
      }
    }
    if (!best) { this.game.toast('No target', 'bad'); return false; }
    const unaware = !best.isAwareOfPlayer();
    if (!unaware) {
      if (best.counterAssassinate || best.type.counterAssassinate) {
        // Failed attempt: they turn it back on you.
        this.takeDamage(best.type.damage * 0.9, best, 'counter');
        best.stagger(0.4, this);
        this.game.toast('Countered!', 'bad');
        return true;
      }
      return false; // just a normal attack
    }
    this.assassinating = { target: best, variant, t: 0 };
    const baseDur = { front: 0.85, rear: 0.7, air: 0.95, ledge: 0.9, hidden: 0.7, sprint: 0.6, rope: 1.0 }[variant] || 0.8;
    this.assassinateDuration = baseDur / (1 + (this.mods.assassinationSpeed || 0));
    this.assassinateTime = this.assassinateDuration;
    this.vx = 0; this.vy = 0;
    this.onLedge = null; this.onRope = null; this.onZipline = null; this.climbing = null;
    this.game.audio.sfx('assassinate');
    this.game.camera.shake(6, 0.25);
    // Move into position.
    if (variant === 'air' || variant === 'ledge') {
      this.x = best.centerX - this.w / 2;
      this.y = best.y - this.h + 8;
    } else {
      this.x = best.x - this.facing * (this.w * 0.55);
    }
    this.game.slowmo(0.22, 0.28);
    return true;
  }

  updateAssassination(dt) {
    const a = this.assassinating;
    a.t += dt;
    this.assassinateTime = Math.max(0, this.assassinateTime - dt);
    this.state = 'assassinate';
    if (a.t >= this.assassinateDuration * 0.55 && !a.lethal) {
      a.lethal = true;
      const e = a.target;
      this.game.audio.sfx('blade');
      this.game.particles.cone('blood', e.centerX, e.centerY - 6, this.facing, 22, { colors: ['#9e2b25', '#d94138', '#5e1410'], minSpeed: 60, maxSpeed: 260 });
      this.game.particles.ring(e.centerX, e.centerY, { rMax: 60, color: 'rgba(217,65,56,.7)' });
      this.game.camera.shake(8, 0.3);
      this.stats.assassinations++;
      if (a.variant === 'air') this.stats.airAssassinations++;
      this.game.world.killEnemy(e, { source: this, assassination: true, variant: a.variant });
      this.game.onAssassination(a.variant);
      // Chain assassination.
      const chains = this.skillEffects?.chainAssassinate || 0;
      if (chains > 0) {
        const near = this.game.world.enemies.find((o) => !o.dead && o !== e && !o.isAwareOfPlayer()
          && Math.hypot(o.centerX - e.centerX, o.centerY - e.centerY) < 220);
        if (near) {
          this.assassinating = { target: near, variant: 'chain', t: 0, lethal: false };
          this.assassinateDuration = 0.55 / (1 + (this.mods.assassinationSpeed || 0));
          this.assassinateTime = this.assassinateDuration;
          this.x = near.x - this.facing * (this.w * 0.55);
          this.game.toast('Chain assassination!', 'good');
          return;
        }
      }
    }
    if (a.t >= this.assassinateDuration) {
      this.assassinating = null;
      this.state = this.grounded ? 'idle' : 'fall';
      this.invuln = Math.max(this.invuln, 0.3);
    }
  }

  takeDamage(amount, from, kind = 'hit') {
    if (this.invuln > 0 || this.hp <= 0) return false;
    if (this.blocking && from) {
      const toward = sign(from.centerX - this.centerX) === -this.facing;
      if (toward) {
        const perfect = this.parryWindow > 0 || this.parryTime > 0;
        if (perfect) {
          this.game.audio.sfx('parry');
          this.parryTime = 0.5 + (this.skillEffects?.parryStun || 0);
          this.parryWindow = 0;
          from.stagger(1.1 + (this.skillEffects?.parryStun || 0), this);
          this.game.particles.ring(this.centerX + this.facing * 24, this.centerY, { rMax: 70, color: 'rgba(240,207,107,.9)' });
          this.game.camera.shake(4, 0.16);
          this.game.slowmo(0.35, 0.18);
          this.game.toast('Perfect parry!', 'good');
          this.stamina = Math.min(this.maxStamina, this.stamina + 18);
          return false;
        }
        const chip = amount * 0.35;
        this.stamina = Math.max(0, this.stamina - amount * 1.6);
        this.game.audio.sfx('block');
        this.game.particles.cone('spark', this.centerX + this.facing * 20, this.centerY, -this.facing, 8, { colors: ['#f0cf6b', '#eae2ce'] });
        if (this.stamina <= 0) {
          this.hp -= chip;
          this.staggerTime = 0.55;
          this.game.audio.sfx('hurt');
          this.game.toast('Guard broken!', 'bad');
          if (this.hp <= 0) this.die();
        }
        return true;
      }
    }
    const armor = this.mods.armor || 0;
    const dmg = amount * (1 - clamp(armor, 0, 0.75));
    this.hp -= dmg;
    this.hurtTime = 0.4;
    this.invuln = 0.55;
    this.detection = 100;
    this.game.audio.sfx('hurt');
    this.game.camera.shake(6, 0.22);
    this.game.particles.cone('blood', this.centerX, this.centerY, -this.facing, 12, { colors: ['#9e2b25', '#d94138'] });
    this.game.hud.flashDamage();
    if (this.hp <= 0) this.die();
    return true;
  }

  heal(amount) {
    if (this.hp <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  die() {
    this.hp = 0;
    this.state = 'dead';
    this.game.onPlayerDeath();
  }

  stagger(t, from) {
    this.staggerTime = t;
    this.state = 'hurt';
    this.vx = from ? sign(this.centerX - from.centerX) * 90 : 0;
  }

  updateStats(dt) {
    const speed = Math.hypot(this.vx, this.vy);
    this.stats.distance += speed * dt;
    if (this.y < this.game.world.district.groundY - 60) this.stats.rooftopDistance += speed * dt;
  }

  updateTrail(dt) {
    this.trail.push({ x: this.centerX, y: this.centerY, t: 0 });
    for (const t of this.trail) t.t += dt;
    while (this.trail.length && this.trail[0].t > 0.35) this.trail.shift();
  }

  /** Detection contribution: how visible this player is right now, 0..1. */
  visibility() {
    let v = 1;
    v *= 1 - clamp(this.mods.detectionResist || 0, 0, 0.85);
    if (this.hidden) v *= 0.12;
    if (this.inShadow) v *= 1 - clamp(this.skillEffects?.shadowInvisibility ?? 0.55, 0, 0.9);
    if (this.inCrowd) v *= (this.skillEffects?.crowdBlend ? 0.2 : 0.45);
    if (this.state === 'sprint') v *= 1.25;
    if (this.state === 'idle') v *= 0.85;
    return clamp(v, 0.02, 1.5);
  }

  serialize() {
    return {
      weaponId: this.weaponId, gadgetId: this.gadget.id, gadgetCount: this.gadget.count,
      x: this.x, y: this.y, hp: this.hp,
    };
  }
}

function approach(v, target, maxDelta) {
  if (v < target) return Math.min(v + maxDelta, target);
  if (v > target) return Math.max(v - maxDelta, target);
  return v;
}

function rng2(dt) { return Math.random() < dt * 30; }
