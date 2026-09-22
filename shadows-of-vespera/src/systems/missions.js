import { clamp, dist } from '../engine/utils.js';
import { getMission, MISSIONS, OBJECTIVE } from '../data/missions.js';
import { RATINGS, ratingFor } from '../data/collectibles.js';
import { getDialogue } from '../data/dialogue.js';

/**
 * Mission system. Owns activation, objective tracking, optional objective
 * evaluation, the timer, failure conditions, rating and rewards.
 *
 * Objective completion is inferred from world state every frame:
 *   reach/climb/escape   → player enters the marker radius
 *   assassinate/kill     → target enemy dies
 *   steal/collect/…      → player enters radius (flavoured as looting)
 *   rescue/escort        → all rescue targets freed
 *   sabotage/disable     → tower disabled or hazard destroyed
 *   survive/defend       → survived a timed window
 *   deliver              → reach the delivery marker
 */
export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.state = 'idle';            // idle | briefing | active | complete | failed
    this.objectives = [];
    this.elapsed = 0;
    this.timeLimit = 0;
    this.timerRunning = false;
    this.results = {};
    this.completed = new Set();
    this.failed = new Set();
    this.rating = null;
    this.rewardGiven = false;
    this.defendWaves = 0;
    this.defendTimer = 0;
    this.surviveTimer = 0;
    this.pendingCutscene = null;
    this.bossRef = null;
  }

  get isActive() { return this.state === 'active'; }
  get isBossMission() { return !!(this.active && this.active.boss); }

  /** Missions currently selectable at a safehouse. */
  availableMissions() {
    const save = this.game.save;
    const out = [];
    for (const m of Object.values(MISSIONS)) {
      if (m.secret) {
        const cond = m.unlockCondition;
        if (!cond) continue;
        const found = (save.collectiblesFound || []).length;
        if (found >= (cond.collectibles || 0) && save.secretMissionsUnlocked) out.push(m);
        continue;
      }
      if (save.missionsCompleted.includes(m.id)) continue;
      const prereqOk = !m.unlocks || true;
      const prev = Object.values(MISSIONS).find((x) => x.unlocks?.includes(m.id));
      if (prev && !save.missionsCompleted.includes(prev.id)) continue;
      out.push(m);
    }
    return out.sort((a, b) => a.number - b.number);
  }

  /** Auto-select the next story mission when the player enters a district. */
  nextStoryMission() {
    const save = this.game.save;
    const list = this.availableMissions();
    return list.find((m) => !m.secret) || list[0] || null;
  }

  start(missionId) {
    const mission = getMission(missionId);
    if (!mission) return false;
    this.active = mission;
    this.state = 'active';
    this.elapsed = 0;
    this.results = {};
    this.rating = null;
    this.rewardGiven = false;
    this.defendWaves = 0;
    this.surviveTimer = 0;
    this.completed.clear();

    this.objectives = mission.objectives.map((o) => ({ ...o, done: false, progress: 0 }));
    if (mission.optional) {
      for (const o of mission.optional) this.objectives.push({ ...o, done: false, optional: true, progress: 0 });
    }

    // Time limits from flagged optional objectives.
    const timerOpt = this.objectives.find((o) => o.flag === 'timer');
    this.timeLimit = timerOpt?.seconds || 0;
    this.timerRunning = this.timeLimit > 0;

    this.game.stealth.reset();
    this.game.hud.setObjective(mission, this.objectives);
    this.game.world.missionMarkers = this.game.world.missionMarkers || [];

    // Briefing dialogue, if the mission has one.
    const dlgId = mission.dialogue;
    if (dlgId) {
      const dlg = getDialogue(dlgId);
      if (dlg && dlg.nodes.start && !mission.boss) {
        // Boss mission dialogue fires when the boss starts instead.
      }
    }
    this.game.toast(`MISSION START: ${mission.name}`, 'good');
    this.game.audio.sfx('objective');
    this.game.save.currentMission = mission.id;
    return true;
  }

  update(dt) {
    if (this.state !== 'active' || !this.active) return;
    this.elapsed += dt;
    const world = this.game.world;
    const player = world.player;

    if (this.timerRunning) {
      this.timeLimit -= dt;
      if (this.timeLimit <= 0) { this.fail('Out of time'); return; }
    }

    for (const obj of this.objectives) {
      if (obj.done) continue;
      if (obj.optional && obj.flag) continue; // optional flags are evaluated at the end
      // Markers are matched by objective text: the mission system clones its
      // objective objects, so identity comparison would never match.
      const marker = (world.missionMarkers || []).find((m) => m.obj === obj || (m.obj && m.obj.text === obj.text));
      const d = marker ? dist(player.centerX, player.centerY, marker.x, marker.y) : 1e9;

      switch (obj.type) {
        case OBJECTIVE.REACH:
        case OBJECTIVE.CLIMB:
        case OBJECTIVE.INVESTIGATE:
        case OBJECTIVE.STEAL:
        case OBJECTIVE.COLLECT:
        case OBJECTIVE.DELIVER:
        case OBJECTIVE.ESCAPE: {
          const radius = obj.type === OBJECTIVE.CLIMB ? 90 : 80;
          if (d < radius) this.completeObjective(obj);
          break;
        }
        case OBJECTIVE.ASSASSINATE:
        case OBJECTIVE.KILL: {
          if (obj.target && obj.target === this.active.boss) {
            if (this.game.world.boss?.dead) this.completeObjective(obj);
          } else {
            const t = world.enemies.find((e) => e.targetId === obj.target);
            if (!t || t.dead) this.completeObjective(obj);
            else if (d < 200) obj.progress = 1;
          }
          break;
        }
        case OBJECTIVE.CHASE: {
          // Completed when the boss enters its chase phase and survives it.
          if (this.game.bossChasing) obj.progress = 1;
          if (obj.progress && !this.game.bossChasing) this.completeObjective(obj);
          break;
        }
        case OBJECTIVE.RESCUE: {
          const targets = world.rescueTargets || [];
          if (targets.length) {
            const freed = targets.filter((t) => t.rescued).length;
            obj.progress = freed / targets.length;
            if (freed >= targets.length) this.completeObjective(obj);
          } else if (d < 90) this.completeObjective(obj);
          break;
        }
        case OBJECTIVE.ESCORT: {
          const t = (world.rescueTargets || [])[0];
          if (t && t.rescued) this.completeObjective(obj);
          break;
        }
        case OBJECTIVE.SABOTAGE: {
          const tower = world.district.towers.find((x) => !x.disabled);
          if (!tower || d < 100) this.completeObjective(obj);
          break;
        }
        case OBJECTIVE.DISABLE: {
          if (world.district.towers.every((t) => t.disabled)) this.completeObjective(obj);
          else if (d < 120) {
            const tower = world.district.towers.find((t) => dist(t.x + t.w / 2, t.beaconY, player.centerX, player.centerY) < 120);
            if (tower && !tower.disabled) {
              tower.disabled = true;
              this.game.save.disabledTowers = this.game.save.disabledTowers || [];
              this.game.save.disabledTowers.push(`${world.districtId}:${tower.index}`);
              this.game.audio.sfx('explosion');
              this.game.unlockAchievementMaybe();
            }
          }
          break;
        }
        case OBJECTIVE.SURVIVE: {
          obj.progress = clamp(this.surviveTimer / 30, 0, 1);
          this.surviveTimer += dt;
          if (this.surviveTimer > 30) this.completeObjective(obj);
          break;
        }
        case OBJECTIVE.DEFEND: {
          // Waves of enemies; completed when 3 waves are cleared.
          if (world.enemies.filter((e) => !e.dead).length === 0) {
            this.defendTimer -= dt;
            if (this.defendTimer <= 0) {
              this.defendWaves++;
              this.defendTimer = 6;
              if (this.defendWaves >= 3) this.completeObjective(obj);
              else {
                this.game.toast(`Wave ${this.defendWaves} cleared`, 'good');
                for (let i = 0; i < 3 + this.defendWaves; i++) {
                  world.spawnEnemy(this.defendWaves === 2 ? 'elite' : 'guard',
                    player.centerX + (i % 2 ? 1 : -1) * (260 + i * 40), world.district.groundY - 90, { zone: 'wave' });
                }
              }
            }
          }
          break;
        }
        default: break;
      }
    }

    this.game.hud.setObjective(this.active, this.objectives, this.timeLimit);

    if (this.objectives.filter((o) => !o.optional).every((o) => o.done)) this.complete();
  }

  completeObjective(obj) {
    if (obj.done) return;
    obj.done = true;
    this.game.audio.sfx('objective');
    this.game.toast(obj.optional ? `Optional: ${obj.text}` : `Objective complete: ${obj.text}`, 'good');
    if (obj.type === OBJECTIVE.SABOTAGE || obj.type === OBJECTIVE.DISABLE) {
      this.game.stats.sabotage = (this.game.stats.sabotage || 0) + 1;
    }
    if (obj.type === OBJECTIVE.RESCUE) this.game.stats.rescued = (this.game.stats.rescued || 0) + 10;
    this.game.world.missionMarkers?.forEach((m) => { if (m.obj === obj || (m.obj && m.obj.text === obj.text)) m.done = true; });
  }

  /** Evaluate optional objectives at mission end. */
  evaluateOptional() {
    const world = this.game.world;
    const flags = this.game.stealth.flags(this.active);
    const targets = world.rescueTargets || [];
    flags.rescueAll = targets.length ? targets.every((t) => !t.dead) : true;
    flags.rescuePrisoners = targets.length ? targets.every((t) => t.rescued) : true;
    for (const obj of this.objectives.filter((o) => o.optional)) {
      if (obj.flag) {
        const val = flags[obj.flag];
        obj.done = val === true;
        this.results[obj.text] = obj.done;
      } else if (obj.type === OBJECTIVE.SURVIVE || obj.type === OBJECTIVE.COLLECT || obj.type === OBJECTIVE.INVESTIGATE || obj.type === OBJECTIVE.RESCUE) {
        this.results[obj.text] = obj.done;
      } else {
        this.results[obj.text] = obj.done;
      }
    }
    return this.results;
  }

  complete() {
    if (this.state !== 'active') return;
    this.state = 'complete';
    this.evaluateOptional();

    const mission = this.active;
    const score = this.game.stealth.score(mission, this.elapsed, this.results);
    this.rating = ratingFor(score);

    // Reward multipliers from rating.
    const r = { ...(mission.reward || {}) };
    const mul = this.rating.reward;
    r.xp = Math.round((r.xp || 0) * mul);
    r.coins = Math.round((r.coins || 0) * mul);
    if (mission.boss) {
      const bossDef = this.game.world.boss?.def;
      if (bossDef?.reward) {
        r.xp = Math.round((bossDef.reward.xp || 0));
        r.coins = Math.round((bossDef.reward.coins || 0));
        r.tokens = bossDef.reward.tokens || 0;
        r.skill = bossDef.reward.skill || 0;
      }
    }

    // Optional objective rewards.
    for (const obj of this.objectives.filter((o) => o.optional && o.done)) {
      if (obj.reward) {
        r.xp = (r.xp || 0) + (obj.reward.xp || 0);
        r.coins = (r.coins || 0) + (obj.reward.coins || 0);
        r.tokens = (r.tokens || 0) + (obj.reward.tokens || 0);
        r.intel = (r.intel || 0) + (obj.reward.intel || 0);
      }
    }

    this.game.onMissionComplete(mission, r, this.rating, score, this.objectives);

    // Unlock following missions and features.
    if (mission.unlocks) {
      for (const u of mission.unlocks) this.game.save.unlockedMissions.push(u);
    }
    if (mission.unlocksFeatures) {
      for (const f of mission.unlocksFeatures) this.game.save.unlockedFeatures.push(f);
    }
    if (!this.game.save.missionsCompleted.includes(mission.id)) {
      this.game.save.missionsCompleted.push(mission.id);
    }
    this.game.save.currentMission = null;
    this.game.checkAchievements();
    this.game.autosave();
  }

  fail(reason) {
    if (this.state !== 'active') return;
    this.state = 'failed';
    this.failReason = reason;
    this.game.audio.sfx('fail');
    this.game.audio.setMood('defeat');
    this.game.onMissionFailed(this.active, reason);
    this.game.save.currentMission = null;
  }

  abandon() {
    this.active = null;
    this.state = 'idle';
    this.objectives = [];
    this.game.save.currentMission = null;
  }

  serialize() {
    return {
      active: this.active?.id || null,
      state: this.state,
      elapsed: this.elapsed,
      objectives: this.objectives.map((o) => ({ text: o.text, done: o.done })),
    };
  }
}
