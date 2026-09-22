import { clamp, damp } from '../engine/utils.js';
import { DETECT } from '../data/enemies.js';

/**
 * Stealth system: aggregates every enemy's detection into one player-facing meter,
 * drives the detection state label, catches, mission stealth scoring and the
 * optional-objective flags (noDetect / ghost / noKill / noAlarm / onlyTarget …).
 */
export class StealthSystem {
  constructor(game) {
    this.game = game;
    this.level = 0;              // 0..100 aggregate exposure
    this.state = DETECT.SAFE;
    this.peakDetection = 0;
    this.timesSpotted = 0;
    this.everFullAlert = false;
    this.alarmRaised = false;
    this.civiliansHarmed = 0;
    this.killsThisMission = 0;
    this.civKills = 0;
    this.assassinationKills = 0;
    this.damageTaken = 0;
    this.wasOnRooftop = false;
    this.crowdBlends = 0;
    this.hideTime = 0;
  }

  reset() {
    this.level = 0; this.state = DETECT.SAFE; this.peakDetection = 0;
    this.timesSpotted = 0; this.everFullAlert = false; this.alarmRaised = false;
    this.civiliansHarmed = 0; this.killsThisMission = 0; this.civKills = 0;
    this.assassinationKills = 0; this.damageTaken = 0; this.crowdBlends = 0; this.hideTime = 0;
  }

  update(dt) {
    const world = this.game.world;
    const player = world.player;
    if (!world.active) return;

    // Aggregate: the highest detection among enemies that can plausibly see you,
    // weighted by proximity so distant searchers matter less.
    let max = 0;
    let anyChasing = false;
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (e.state === 'chase' || e.state === 'attack') anyChasing = true;
      const d = Math.hypot(e.centerX - player.centerX, e.centerY - player.centerY);
      const weight = d < 600 ? 1 : d < 1200 ? 0.5 : 0.2;
      max = Math.max(max, e.detection * weight);
    }
    if (world.boss && !world.boss.dead) max = Math.max(max, 100);
    this.level = damp(this.level, max, 8, dt);
    this.peakDetection = Math.max(this.peakDetection, this.level);

    if (anyChasing || world.alertLevel >= 3) this.state = DETECT.COMBAT;
    else if (this.level >= 95) this.state = DETECT.ALERT;
    else if (this.level >= 45) this.state = DETECT.SEARCHING;
    else if (this.level >= 12) this.state = DETECT.SUSPICIOUS;
    else this.state = DETECT.SAFE;

    if (this.state === DETECT.ALERT && !this.everFullAlert) {
      this.everFullAlert = true;
      this.alarmRaised = true;
      this.timesSpotted++;
      this.game.onSpotted();
    }
    if (player.hidden) this.hideTime += dt;
    if (player.inCrowd) this.crowdBlends += dt;
    if (player.y < world.district.groundY - 180) this.wasOnRooftop = true;
  }

  /** Chance an enemy notices the player as they enter its cone for the first time. */
  onEnemyGainSight(enemy) {
    this.timesSpotted++;
  }

  recordDamage(amount) { this.damageTaken += amount; }
  recordKill(kind) {
    if (kind === 'assassination') this.assassinationKills++;
    else this.killsThisMission++;
  }
  recordCivilianHarm() { this.civKills++; }

  /** Score the mission 0..100 for the S/A/B/C/D rating. */
  score(mission, elapsed, optionalResults) {
    let score = 100;
    score -= clamp(this.peakDetection, 0, 100) * 0.30;
    score -= this.timesSpotted * 6;
    score -= this.civKills * 14;
    score -= clamp(this.killsThisMission * 1.2, 0, 18);
    score -= clamp(this.damageTaken * 0.12, 0, 14);
    if (mission?.stealthRatingTarget) {
      const target = mission.stealthRatingTarget;
      if (elapsed > target) score -= clamp((elapsed - target) / 8, 0, 16);
    }
    // Optional objectives are worth real points.
    const opts = mission?.optional || [];
    for (const o of opts) {
      const res = optionalResults?.[o.text];
      if (res === true) score += 9;
      else if (res === false) score -= 4;
    }
    return clamp(Math.round(score), 0, 100);
  }

  /** Build the flags object consumed by optional objective evaluation. */
  flags(mission) {
    return {
      noDetect: this.peakDetection < 40 && this.timesSpotted === 0,
      ghost: this.timesSpotted === 0 && this.peakDetection < 12,
      noKill: this.killsThisMission === 0 && this.assassinationKills === 0,
      noAlarm: !this.alarmRaised,
      onlyTarget: this.killsThisMission === 0,
      noCivilians: this.civKills === 0,
      noDamage: this.damageTaken <= 0.5,
      rescueAll: true, // overridden by mission system
      noDetectPeak: this.peakDetection,
      civiliansHarmed: this.civKills,
      kills: this.killsThisMission + this.assassinationKills,
    };
  }
}
