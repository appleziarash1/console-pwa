import { clamp, damp, RNG, uid } from './engine/utils.js';
import { Input } from './engine/input.js';
import { Camera, Backdrop } from './engine/camera.js';
import { ParticleSystem } from './engine/particles.js';
import { audio } from './engine/audio.js';
import { saves, SaveManager } from './engine/save.js';
import { Player } from './entities/player.js';
import { Ally } from './entities/boss.js';
import { World } from './world/world.js';
import { Renderer } from './systems/renderer.js';
import { StealthSystem } from './systems/stealth.js';
import { MissionSystem } from './systems/missions.js';
import { Progression, makeSave, levelForXp, skillEffectsOf, xpProgress } from './systems/progression.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { ALLY_CLASSES, RECRUIT_CANDIDATES } from './data/npcs.js';
import { getGadget } from './data/gadgets.js';
import { getWeapon, WEAPONS } from './data/weapons.js';
import { DISTRICTS, DISTRICT_ORDER } from './data/districts.js';
import { MISSIONS } from './data/missions.js';
import { COLLECTIBLE_TYPES, ACHIEVEMENTS } from './data/collectibles.js';
import { CUTSCENES, ACT_TRANSITIONS, getCutscene, BOOT_LINES } from './content/story.js';

/**
 * Game: the top-level orchestrator. Owns the loop, the state machine
 * (boot → menu → cutscene → playing → paused → menus/dialogue/shop → end),
 * save/load, and the callbacks that the world and systems call back into.
 */
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.input = new Input(this.canvas);
    this.camera = new Camera();
    this.backdrop = new Backdrop();
    this.particles = new ParticleSystem();
    this.audio = audio;
    this.saves = saves;

    this.world = new World(this);
    this.stealth = new StealthSystem(this);
    this.missions = new MissionSystem(this);
    this.progression = new Progression(this);
    this.hud = new HUD(this);
    this.screens = new Screens(this);
    this.renderer = new Renderer(this.canvas, this);

    this.player = new Player(this);
    this.world.player = this.player;

    this.state = 'boot';
    this.save = makeSave();
    this.recruitData = { RECRUIT_CANDIDATES };
    this.time = 0;
    this.slowmoAmount = 0;
    this.slowmoTimer = 0;
    this.timeScale = 1;
    this.bossChasing = false;
    this.stats = { sabotage: 0, rescued: 0 };
    this.lastFrame = 0;
    this.accumulator = 0;
    this.fps = 60;
    this.pendingBossStart = null;
    this.missionApproach = null;
    this.paused = false;
    this.masterMode = false;

    this.ui = { showDamageNumber: () => {} };
    this.bindGlobalKeys();
  }

  // ───────────────────────────── boot ─────────────────────────────
  async boot() {
    const note = document.getElementById('loadNote');
    const fill = document.getElementById('loadFill');
    /** Yield to the browser so the loading screen can animate. */
    const step = async (i, text) => {
      note.textContent = text || BOOT_LINES[i] || 'Loading…';
      fill.style.width = `${((i + 1) / BOOT_LINES.length) * 100}%`;
      await new Promise((r) => setTimeout(r, 90));
    };

    for (let i = 0; i < BOOT_LINES.length; i++) await step(i);

    // Settings
    const settings = this.saves.loadSettings();
    if (settings) this.save.settings = { ...this.save.settings, ...settings };

    this.hud.setXp();
    this.hud.setCurrency();
    this.hud.setGear();
    this.hud.setWanted(0);

    await step(BOOT_LINES.length - 1, 'Ready.');
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('buildTag').textContent = `v1.0 · ${DISTRICT_ORDER.length} districts · ${Object.keys(MISSIONS).length} missions`;

    this.openMainMenu();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ───────────────────────────── state helpers ─────────────────────────────
  openMainMenu() {
    this.state = 'menu';
    this.world.active = false;
    this.hud.hide();
    this.screens.openMainMenu();
    this.audio.setMood('menu');
    document.getElementById('game').style.filter = 'blur(3px) brightness(.45)';
  }

  startPlayState() {
    this.state = 'playing';
    this.world.active = true;
    this.hud.show();
    this.screens.hideAll();
    document.getElementById('game').style.filter = '';
    this.lastFrame = performance.now();
  }

  resume() {
    if (!this.world.district) return;
    this.startPlayState();
  }

  pause() {
    if (this.state === 'playing') { this.state = 'paused'; this.screens.openPause(); }
    else if (this.state === 'paused') this.resume();
  }

  closeMenus() { if (this.world.district) this.resume(); else this.openMainMenu(); }
  closeShop() { if (this.world.district) this.resume(); else this.openMainMenu(); }
  closeSafehouse() { if (this.world.district) this.resume(); else this.openMainMenu(); }

  quitToMenu() {
    this.world.active = false;
    this.openMainMenu();
  }

  // ───────────────────────────── new game / load ─────────────────────────────
  newGame(slot = 0) {
    this.save = makeSave();
    this.save.slot = slot;
    this.save.settings = { music: true, sfx: true, difficulty: 1, showVision: true, masterAssassin: false, autoAim: true };
    this.player.hp = 100;
    this.applySaveToPlayer();
    this.audio.init();
    this.audio.resume();
    this.screens.playCutscene({
      ...CUTSCENES.prologue,
      onEnd: () => {
        // No hardcoded entry coordinate: the district picks a validated spot.
        this.enterDistrict('oldQuarter', {});
        this.missions.start('m01_courier');
        this.screens.playCutscene({ ...CUTSCENES.act1, mood: 'exploration', onEnd: () => this.startPlayState() });
      },
    });
  }

  continueGame() {
    const slot = this.saves.newestSlot();
    if (slot === null) { this.newGame(); return; }
    this.loadGame(slot);
  }

  loadGame(slot) {
    const data = this.saves.read(slot);
    if (!data || data._incompatible) { this.toast('Save is incompatible', 'bad'); return; }
    this.save = { ...makeSave(), ...data };
    this.save.pendingCutscene = null;
    this.audio.init();
    this.audio.resume();
    this.applySaveToPlayer();
    const district = this.save.currentDistrict || 'oldQuarter';
    this.enterDistrict(district, {});
    if (this.save.currentMission && MISSIONS[this.save.currentMission]) {
      this.missions.start(this.save.currentMission);
    }
    this.syncAllies();
    this.hud.setXp();
    this.hud.setCurrency();
    this.hud.setGear();
    this.hud.setWanted(this.world.wanted);
    this.startPlayState();
    this.toast('Game loaded', 'good');
  }

  saveGame(slot = 0) {
    const snap = this.serialize();
    const ok = this.saves.write(slot, snap);
    this.toast(ok ? `Saved to slot ${slot + 1}` : 'Save failed', ok ? 'good' : 'bad');
  }

  autosave() {
    this.save.currentDistrict = this.world.districtId;
    this.saves.write('auto', this.serialize());
  }

  serialize() {
    const s = this.save;
    s.level = levelForXp(s.xp);
    s.currentDistrict = this.world.districtId || s.currentDistrict;
    s.wanted = this.world.wanted;
    return JSON.parse(JSON.stringify(s));
  }

  applySaveToPlayer() {
    const s = this.save;
    s.unlockedFeatures = s.unlockedFeatures || [];
    s.boosts = s.boosts || {};
    s.ammo = s.ammo || { throwingKnife: 8 };
    s.stats = s.stats || {};
    s.districtControl = s.districtControl || {};
    s.disabledTowers = s.disabledTowers || [];
    s.collected = s.collected || [];
    s.collectiblesFound = s.collectiblesFound || [];
    s.achievements = s.achievements || [];
    s.missionsCompleted = s.missionsCompleted || [];
    s.unlockedMissions = s.unlockedMissions || ['m01_courier'];
    s.skills = s.skills || [];
    s.gadgets = s.gadgets || { smokeBomb: 3 };
    s.weapons = s.weapons || ['shortSword', 'hiddenBlade'];
    s.ownedArmor = s.ownedArmor || ['clothHood', 'paddedCoat', 'leatherWrap', 'wornBoots'];
    s.allies = s.allies || [];
    s.activeAllies = s.activeAllies || [];
    s.codexSeen = s.codexSeen || [];
    s.storyFlags = s.storyFlags || {};
    this.save = s;

    this.player.setWeapon(s.currentWeapon);
    this.player.gadget.id = s.currentGadget || 'smokeBomb';
    this.player.gadget.count = s.gadgets[this.player.gadget.id] || 0;
    this.applySkills();
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
  }

  applySkills() {
    this.save.skillEffects = skillEffectsOf(this.save);
    this.player.recompute(this.save);
    // apply skill-derived flags the player reads directly
    const e = this.save.skillEffects;
    this.player.skillEffects = e;
  }

  // ───────────────────────────── district travel ─────────────────────────────
  enterDistrict(districtId, opts = {}) {
    if (!DISTRICTS[districtId]) districtId = 'oldQuarter';
    this.world.loadDistrict(districtId, opts);
    this.save.currentDistrict = districtId;
    this.player.recompute(this.save);
    this.camera.snapTo(this.player.centerX, this.player.centerY);
    this.hud.setEnvironment(this.world);
    this.hud.setWanted(this.world.wanted);
    const def = DISTRICTS[districtId];
    this.toast(`${def.name} — ${def.blurb}`, 'good');
    // Auto-unlock the next story mission for this district if nothing is active.
    if (!this.missions.isActive && !this.save.currentMission) {
      const candidate = this.missions.availableMissions().find((m) => m.district === districtId && !m.secret);
      if (candidate) this.hud.subtitle(`Mission available: ${candidate.name} — visit a safehouse`);
    }
    this.syncAllies();
  }

  travelTo(districtId) {
    if (this.missions.isActive) { this.toast('Cannot fast travel during a mission', 'bad'); return; }
    const target = DISTRICTS[districtId];
    if (target.watchtower && !(this.save.disabledTowers || []).some((t) => t.startsWith(districtId))) {
      this.toast('Disable the district watchtower first', 'bad');
      return;
    }
    this.enterDistrict(districtId, {});
  }

  syncAllies() {
    this.world.allies.length = 0;
    for (const id of this.save.activeAllies) {
      const a = this.save.allies.find((x) => x.id === id);
      if (!a) continue;
      const ally = new Ally(this, a, this.player.centerX - 60, this.player.y);
      this.world.allies.push(ally);
    }
  }

  // ───────────────────────────── mission flow ─────────────────────────────
  startMissionFromMenu(missionId) {
    const m = MISSIONS[missionId];
    if (!m) return;
    // Move the player into the mission's district, then start it. The mission is
    // passed into the district load so objective markers, targets, prisoners and
    // the boss are built for THIS mission rather than the previously active one.
    if (this.world.districtId !== m.district) this.enterDistrict(m.district, { mission: m });
    else this.world.buildMissionProps({ mission: m });
    this.screens.hideAll();
    const dlgId = m.dialogue;
    const begin = () => {
      this.missions.start(missionId);
      this.missionApproach = null;
      this.startPlayState();
    };
    if (dlgId && !m.boss) {
      const opened = this.screens.startDialogue(dlgId, begin);
      if (!opened) begin();
    } else begin();
    if (m.time) this.world.setWeather(m.weather || this.world.weather, m.time);
  }

  retryMission() {
    const id = this.save.currentMission || this.missions.active?.id;
    this.missions.abandon();
    if (id) {
      const m = MISSIONS[id];
      this.enterDistrict(m?.district || this.save.currentDistrict, { mission: m });
      this.missions.start(id);
    }
    this.player.fullHeal();
    this.startPlayState();
  }

  onMissionComplete(mission, reward, rating, score, objectives) {
    const g = this.progression;
    if (reward.xp) g.addXp(reward.xp);
    if (reward.coins) g.addCoins(reward.coins);
    if (reward.tokens) g.addTokens(reward.tokens);
    if (reward.intel) g.addIntel(reward.intel);
    if (reward.skill) { this.save.skillPoints += reward.skill; this.toast(`+${reward.skill} skill point`, 'good'); }
    this.save.stats.missions = (this.save.stats.missions || 0) + 1;

    // Achievements
    if (rating.grade === 'S') this.unlockAchievement('masterAssassin');
    const allOptional = objectives.filter((o) => o.optional).every((o) => o.done);
    if (allOptional && objectives.some((o) => o.optional)) this.unlockAchievement('perfectMission');
    if (this.stealth.peakDetection < 12 && this.stealth.timesSpotted === 0) this.unlockAchievement('ghost');
    if (this.stealth.damageTaken <= 0.5) this.unlockAchievement('untouchable');
    if (this.stealth.civKills === 0 && this.stealth.killsThisMission === 0) {
      this.save.stats.noKillRuns = (this.save.stats.noKillRuns || 0) + 1;
      if (this.save.stats.noKillRuns >= 3) this.unlockAchievement('noKillRuns');
    }
    if (reward.weapon && !this.save.weapons.includes(reward.weapon)) {
      this.save.weapons.push(reward.weapon);
      this.toast(`Weapon acquired: ${getWeapon(reward.weapon).name}`, 'good');
    }
    this.checkAchievements();

    // Show the results screen via a cutscene-like panel then return to play.
    const lines = [
      { text: `RATING ${rating.grade}  ·  SCORE ${score}`, style: 'strong' },
      `XP ${reward.xp || 0}   COINS ${reward.coins || 0}   TOKENS ${reward.tokens || 0}`,
    ];
    for (const o of objectives.filter((x) => x.optional)) {
      lines.push({ text: `${o.done ? '✓' : '✕'} ${o.text}`, style: o.done ? 'strong' : 'whisper' });
    }
    this.screens.playCutscene({
      title: `MISSION COMPLETE — ${mission.name}`,
      lines,
      mood: 'victory',
      onEnd: () => {
        // Act transition cutscene when the act rolls over.
        const nextMission = this.missions.nextStoryMission();
        const transition = nextMission && nextMission.act !== mission.act ? ACT_TRANSITIONS[nextMission.act] : null;
        if (mission.id === 'm35_lastNight') { this.playEnding(); return; }
        if (transition) {
          this.screens.playCutscene({ ...getCutscene(transition), onEnd: () => this.startPlayState() });
        } else this.startPlayState();
      },
    });
    this.audio.setMood('victory');
  }

  onMissionFailed(mission, reason) {
    this.screens.showEnd('MISSION FAILED', `${reason}\n\n${mission.name} — you can try again from the start of the mission.`);
  }

  onPlayerDeath() {
    this.save.stats.deaths = (this.save.stats.deaths || 0) + 1;
    this.audio.sfx('death');
    setTimeout(() => {
      if (this.save.settings?.masterAssassin && this.save.settings?.permadeath) {
        this.screens.showEnd('PERMADEATH', 'Master Assassin mode does not forgive. Your save has been erased.', { noRetry: true });
      } else {
        this.screens.showEnd('CAUGHT', this.missions.isActive ? 'You died. The Dominion does not take prisoners from the Hand.' : 'You died in the streets of Vespera.');
      }
    }, 900);
  }

  onBossDefeated(boss, source) {
    this.unlockAchievement('bossSlayer');
    this.hud.setBoss(null);
    // The mission system will detect the target death and complete.
  }

  playEnding() {
    this.save.seenEnding = 'main';
    this.screens.playCutscene({
      ...CUTSCENES.ending,
      onEnd: () => {
        this.screens.playCutscene({
          ...CUTSCENES.postCredits,
          onEnd: () => {
            this.unlockAchievement('theEnd');
            this.save.storyFlags.completed = true;
            this.save.secretMissionsUnlocked = true;
            this.autosave();
            this.screens.showEnd('SHADOWS OF VESPERA', 'The city is liberated. The Council is broken. \n\nBut Vespera was never the whole battlefield.\n\nFree roam is now unlocked, along with secret missions and the true ending.', { noRetry: true });
          },
        });
      },
    });
  }

  playSecretEnding() {
    this.save.seenEnding = 'secondDawn';
    this.screens.playCutscene({
      ...CUTSCENES.secretEnding,
      onEnd: () => {
        this.unlockAchievement('secondDawn');
        this.autosave();
        this.startPlayState();
      },
    });
  }

  // ───────────────────────────── callbacks from world ─────────────────────────────
  onEnemyKilled(enemy, opts) {
    this.save.stats.kills = (this.save.stats.kills || 0) + 1;
    if (opts.assassination) {
      this.save.stats.assassinations = (this.save.stats.assassinations || 0) + 1;
      this.stealth.recordKill('assassination');
      if (this.save.stats.assassinations >= 25) this.unlockAchievement('shadow');
      if (this.save.stats.assassinations === 1) this.unlockAchievement('firstBlood');
    } else {
      this.stealth.recordKill('combat');
      this.world.addWanted(1);
    }
    // Target tracking for missions.
    this.checkAchievements();
  }

  onAssassination(variant) {
    this.hud.subtitle(`${variant.charAt(0).toUpperCase() + variant.slice(1)} assassination`, 1400);
    if (this.player.stats.airAssassinations >= 50) this.unlockAchievement('parkour');
  }

  onCivilianKilled(civ) {
    this.stealth.recordCivilianHarm();
    this.world.addWanted(2);
    this.toast('Civilian killed — wanted level up', 'bad');
  }

  onSpotted() {
    this.toast('You have been seen!', 'bad');
    this.camera.shake(5, 0.3);
  }

  onCombatStart() {
    this.hud.alertBanner(true);
  }

  onEnemyDeath(enemy, source) { /* handled in onEnemyKilled for stats */ }

  slowmo(amount, duration) {
    this.slowmoAmount = Math.max(this.slowmoAmount, amount);
    this.slowmoTimer = Math.max(this.slowmoTimer, duration);
  }

  cutsceneBanner(name, subtitle) {
    this.hud.subtitle(`${name} — ${subtitle}`, 2600);
  }

  startBossChase(boss) {
    this.bossChasing = true;
    this.audio.setMood('chase');
    this.toast('CHASE!', 'bad');
    this.hud.subtitle('Seradin is running. Follow him.', 3000);
  }

  endBossChase() {
    this.bossChasing = false;
    this.audio.setMood('boss');
  }

  collectItem(districtId, item) {
    const key = `${districtId}:${item.id}`;
    if (!this.save.collected.includes(key)) this.save.collected.push(key);
    const tag = `${item.type}:${key}`;
    if (!this.save.collectiblesFound.includes(tag)) this.save.collectiblesFound.push(tag);
    this.save.stats.collectibles = this.save.collectiblesFound.length;
    const info = COLLECTIBLE_TYPES[item.type];
    this.progression.addXp(25);
    this.progression.addCoins(10);
    this.toast(`Found ${info?.name || 'collectible'} (${this.save.collectiblesFound.length})`, 'good');
    this.audio.sfx('pickup');
    if (this.save.collectiblesFound.length >= 50) this.unlockAchievement('collector');
    this.checkSecretUnlocks();
    this.checkAchievements();
  }

  checkSecretUnlocks() {
    const n = this.save.collectiblesFound.length;
    if (n >= 40 && !this.save.secretMissionsUnlocked) {
      this.save.secretMissionsUnlocked = true;
      this.toast('Secret missions unlocked', 'good');
      this.unlockAchievement('secretSeeker');
    }
  }

  unlockCodex(id) {
    if (!this.save.codexSeen.includes(id)) {
      this.save.codexSeen.push(id);
      this.toast(`Codex: ${id}`, 'good');
    }
  }

  // ───────────────────────────── achievements ─────────────────────────────
  unlockAchievement(id) {
    if (!id) return;
    if (!this.save.achievements.includes(id)) {
      this.save.achievements.push(id);
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) {
        this.toast(`🏆 ${a.name}`, 'good');
        this.audio.sfx('levelup', { volume: 0.6 });
      }
    }
  }

  unlockAchievementMaybe() { this.unlockAchievement('towerClimber'); }

  checkAchievements() {
    const s = this.save;
    if (s.coins >= 5000) this.unlockAchievement('rich');
    if ((s.collectiblesFound || []).length >= 50) this.unlockAchievement('collector');
    if (s.weapons.length >= Object.keys(getWeaponTable()).length) this.unlockAchievement('arsenal');
    if (s.skills.length >= 20) this.unlockAchievement('skillMaster');
    if (s.allies.length >= 5) this.unlockAchievement('recruiter');
    if ((s.disabledTowers || []).length >= 8) this.unlockAchievement('towerClimber');
    if ((s.stats.sabotage || 0) >= 10) this.unlockAchievement('saboteur');
    if ((s.stats.rescued || 0) >= 100) this.unlockAchievement('rescuer');
    if ((s.stats.liberated || 0) >= 1) this.unlockAchievement('liberator');
  }

  toast(text, kind) { this.hud.toast(text, kind); }

  // ───────────────────────────── input & loop ─────────────────────────────
  bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      // Global keys that work in most states.
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        else if (['menus', 'shop', 'safehouse', 'panel'].includes(this.screens.current)) {
          if (this.world.district) this.resume(); else this.openMainMenu();
        }
        return;
      }
      if (['menus', 'shop', 'safehouse'].includes(this.screens.current) && e.code === 'KeyM') {
        this.resume(); return;
      }
    });
  }

  handlePlayingInput() {
    const input = this.input;
    const w = this.world;
    // Menu toggles
    if (input.wasPressed('map') || input.wasPressed('inventory') || input.wasPressed('skills') || input.wasPressed('quests') || input.wasPressed('codex')) {
      const tab = input.wasPressed('map') ? 'map' : input.wasPressed('inventory') ? 'inventory'
        : input.wasPressed('skills') ? 'skills' : input.wasPressed('quests') ? 'quests' : 'codex';
      this.state = 'menus';
      this.screens.openMenus(tab);
      return;
    }
    if (input.wasPressed('pause')) { this.pause(); return; }

    // Interaction
    if (input.wasPressed('interact') || input.touchPressed.has('interact')) this.doInteract();

    // Gadget
    if (input.wasPressed('gadget') || input.touchPressed.has('gadget')) this.useCurrentGadget();

    // Ally commands (1..5) handled through dialogue-free quick command.
    // Boss trigger from dialogue.
    if (this.pendingBossStart) {
      const id = this.pendingBossStart;
      this.pendingBossStart = null;
      if (w.boss) w.boss.begin();
    }
  }

  doInteract() {
    const hit = this.world.nearestInteractable();
    if (!hit) { this.toast('Nothing to interact with', 'bad'); return false; }
    if (hit.collectible) {
      hit.obj.taken = true;
      this.collectItem(this.world.districtId, hit.obj);
      return true;
    }
    if (hit.safehouse) { this.state = 'safehouse'; this.screens.openSafehouse(); return true; }
    if (hit.exit) {
      const i = DISTRICT_ORDER.indexOf(this.world.districtId);
      const next = DISTRICT_ORDER[clamp(i + hit.exitObj.dir, 0, DISTRICT_ORDER.length - 1)];
      if (next === this.world.districtId) { this.toast('The road ends here', 'bad'); return true; }
      this.enterDistrict(next, {});
      return true;
    }
    if (hit.tunnel) {
      // Drop into the tunnel network.
      const te = hit.tunnelObj;
      this.player.x = te.x - this.player.w / 2;
      this.player.y = this.world.district.groundY + 40 + 250 + 132 - this.player.h - 4;
      this.player.vy = 0; this.player.grounded = false;
      this.player.fallStart = null;
      this.toast('Descending into the tunnels', 'good');
      this.audio.sfx('door');
      return true;
    }
    if (hit.rescue) {
      hit.rescueObj.rescued = true;
      hit.rescueObj.following = true;
      this.progression.addXp(30);
      this.toast('Prisoner freed', 'good');
      this.save.stats.rescued = (this.save.stats.rescued || 0) + 1;
      this.audio.sfx('chest');
      return true;
    }
    if (hit.tower) {
      const t = hit.towerObj;
      t.disabled = true;
      this.save.disabledTowers.push(`${this.world.districtId}:${t.index}`);
      this.audio.sfx('explosion');
      this.camera.shake(10, 0.5);
      this.toast('Beacon disabled — map area revealed', 'good');
      this.unlockAchievement('towerClimber');
      // Autoliberate the district if all towers are down.
      const allDown = this.world.district.towers.every((x) => x.disabled);
      if (allDown) this.progression.liberateDistrict(this.world.districtId);
      this.autosave();
      return true;
    }
    // NPC
    const npc = hit.obj;
    switch (npc.kindFlag) {
      case 'shop':
        this.state = 'shop';
        this.screens.openShop(npc.shopId || 'general', npc.name);
        return true;
      case 'heal':
        this.player.fullHeal();
        this.toast('The doctor patches you up', 'good');
        this.audio.sfx('chest');
        return true;
      case 'recruit': {
        const cand = RECRUIT_CANDIDATES.find((c) => c.id === npc.recruitId) || { id: npc.recruitId, name: npc.name, cls: 'warrior', blurb: '' };
        if (this.save.allies.find((a) => a.id === cand.id)) { this.toast('Already recruited', 'bad'); return true; }
        this.save.allies.push({ id: cand.id, name: cand.name, cls: cand.cls, level: 1, loyalty: 1 });
        this.toast(`${cand.name} (${ALLY_CLASSES[cand.cls].name}) joined the Hand`, 'good');
        this.audio.sfx('levelup');
        if (this.save.allies.length >= 5) this.unlockAchievement('recruiter');
        this.checkAchievements();
        return true;
      }
      default: {
        // Generic talk: open a short bark dialogue.
        this.screens.startDialogue({
          id: 'bark',
          nodes: { start: { speaker: npc.name, portrait: npc.arch.icon, lines: [this.randomBark(npc)], end: true } },
        });
        return true;
      }
    }
  }

  randomBark(npc) {
    const pools = [
      'Keep moving. Curfew is enforced with rope in this district.',
      'You didn\u2019t see me. I didn\u2019t see you. That is how we stay alive.',
      'The Hand pays in hope. I would prefer coin.',
      'They posted a new list this morning. Your face is not on it. Yet.',
      'Go up. Rooftops are the only road the Dominion forgot to tax.',
    ];
    return pools[Math.floor(Math.random() * pools.length)];
  }

  useCurrentGadget() {
    const id = this.save.currentGadget;
    const g = getGadget(id);
    if (!g) return;
    const count = this.save.gadgets[id] || 0;
    if (count <= 0) { this.toast(`No ${g.name} left`, 'bad'); return; }
    if (this.player.gadget.cooldown > 0) return;
    // Aim: toward the mouse in world space, else in front of the player.
    const wm = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    let tx = wm.x, ty = wm.y;
    if (Math.hypot(tx - this.player.centerX, ty - this.player.centerY) < 30) {
      tx = this.player.centerX + this.player.facing * 200;
      ty = this.player.centerY;
    }
    this.world.useGadget(g, tx, ty);
    this.save.gadgets[id] = count - 1;
    this.player.gadget.cooldown = g.cooldown;
    this.hud.setGear();
    this.audio.sfx('ui');
  }

  // ───────────────────────────── update per state ─────────────────────────────
  update(dt) {
    const input = this.input;
    this.time += dt;

    // Slowmo decay
    if (this.slowmoTimer > 0) {
      this.slowmoTimer -= dt;
      this.slowmoAmount = damp(this.slowmoAmount, 0, 4, dt);
      if (this.slowmoTimer <= 0) this.slowmoAmount = 0;
    }

    if (this.state === 'menu' || this.state === 'boot') { return; }

    this.screens.updateCutscene(dt, input);
    this.screens.updateDialogue(input);

    if (this.state === 'playing') {
      this.handlePlayingInput();
      if (this.state !== 'playing') return;   // a menu opened
      const scaled = dt * (1 - this.slowmoAmount * 0.75);
      this.player.update(scaled, input, this.world);
      this.world.update(scaled);
      this.world.cleanupDead();
      this.stealth.update(dt);
      this.missions.update(dt);
      this.particles.update(scaled);
      this.camera.follow(this.player, dt);
      // Respawns / cleanup
      if (this.player.y > this.world.district.height + 300) {
        this.player.takeDamage(999, null, 'void');
      }
      // Wanted decay over time when calm
      if (this.world.alertLevel === 0 && this.world.wanted > 0) {
        this.world.wantedDecay += dt * 0.2;
        if (this.world.wantedDecay > 90) { this.world.reduceWanted(1); this.world.wantedDecay = 0; }
      }
    } else if (this.state === 'paused' || this.state === 'menus' || this.state === 'shop' || this.state === 'safehouse') {
      // Keep particles and audio alive but freeze the simulation.
      this.particles.update(dt * 0.2);
      this.camera.follow(this.player, dt * 0.4);
    }
    if (this.audio.ctx) this.save.stats.playtime = (this.save.stats.playtime || 0) + dt;
  }

  loop(now) {
    const rawDt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fps = damp(this.fps, 1 / Math.max(0.001, rawDt), 3, rawDt);

    this.update(rawDt);
    this.renderer.debug = false;
    this.renderer.render(rawDt);
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'menus' || this.state === 'shop' || this.state === 'safehouse') {
      this.hud.update(rawDt);
    }

    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }
}

function getWeaponTable() {
  return WEAPONS;
}

const game = new Game();
window.__SOV__ = game;
game.boot();

export default game;
