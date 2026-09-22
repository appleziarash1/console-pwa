import { clamp } from '../engine/utils.js';
import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js';
import { ARMOR, ARMOR_ORDER, ARMOR_SETS } from '../data/armor.js';
import { GADGETS, GADGET_ORDER } from '../data/gadgets.js';
import { TREES, findSkill } from '../data/skills.js';
import { ACHIEVEMENTS } from '../data/collectibles.js';
import { CODEX } from '../data/collectibles.js';
import { ALLY_CLASSES } from '../data/npcs.js';

/**
 * Player progression: XP/levels, currency, purchases, skill unlocks, gadget stock,
 * allies, district liberation and achievements. This is the single source of truth
 * that gets serialised into the save file.
 */

export const XP_TABLE = (() => {
  const t = [0];
  let total = 0;
  for (let lvl = 1; lvl <= 30; lvl++) {
    total += Math.round(100 * Math.pow(lvl, 1.32) + lvl * 55);
    t.push(total);
  }
  return t;
})();

export function levelForXp(xp) {
  let lvl = 1;
  for (let i = 1; i < XP_TABLE.length; i++) {
    if (xp >= XP_TABLE[i]) lvl = i; else break;
  }
  return clamp(lvl, 1, 30);
}

export function xpProgress(xp) {
  const lvl = levelForXp(xp);
  const base = XP_TABLE[lvl] || 0;
  const next = XP_TABLE[lvl + 1] ?? base + 1;
  return { level: lvl, base, next, frac: clamp((xp - base) / Math.max(1, next - base), 0, 1) };
}

export function makeSave() {
  return {
    version: undefined,        // set by SaveManager
    createdAt: Date.now(),
    slot: 0,
    playerName: 'Kael Varen',
    level: 1,
    xp: 0,
    skillPoints: 1,
    skills: [],                 // list of unlocked node ids
    coins: 120,
    tokens: 0,
    materials: 0,
    intel: 0,
    ownedWeapons: ['shortSword', 'hiddenBlade'],
    ownedArmor: ['clothHood', 'paddedCoat', 'leatherWrap', 'wornBoots'],
    weapons: ['shortSword', 'hiddenBlade'],
    loadout: { hood: 'clothHood', chest: 'paddedCoat', gloves: 'leatherWrap', boots: 'wornBoots' },
    currentWeapon: 'shortSword',
    gadgets: { smokeBomb: 3 },
    currentGadget: 'smokeBomb',
    consumables: {},
    ammo: { throwingKnife: 8 },
    boosts: {},
    allies: [],
    activeAllies: [],
    districtControl: {},
    towerStates: {},
    disabledTowers: [],
    collected: [],
    collectiblesFound: [],
    achievements: [],
    missionsCompleted: [],
    unlockedMissions: ['m01_courier'],
    unlockedFeatures: ['map'],
    currentMission: null,
    currentDistrict: 'oldQuarter',
    wanted: 0,
    stats: { kills: 0, assassinations: 0, missions: 0, deaths: 0, playtime: 0, collectibles: 0, liberated: 0, rescued: 0, sabotage: 0 },
    storyFlags: {},
    codexSeen: [],
    secretMissionsUnlocked: false,
    seenEnding: null,
    masterAssassinMode: false,
    settings: { music: true, sfx: true, difficulty: 1, showVision: true, masterAssassin: false, autoAim: true },
  };
}

export function skillEffectsOf(save) {
  const eff = {};
  for (const id of save.skills || []) {
    const f = findSkill(id);
    if (!f) continue;
    for (const [k, v] of Object.entries(f.node.effect)) {
      if (typeof v === 'boolean') eff[k] = v;
      else eff[k] = (eff[k] || 0) + v;
    }
  }
  return eff;
}

export class Progression {
  constructor(game) {
    this.game = game;
  }

  xpNeededForNext(level) { return XP_TABLE[level] ?? XP_TABLE[XP_TABLE.length - 1]; }

  addXp(amount) {
    const save = this.game.save;
    if (!amount) return;
    save.xp += amount;
    this.game.toast(`+${amount} XP`, 'xp');
    const newLevel = levelForXp(save.xp);
    while (save.level < newLevel) {
      save.level++;
      save.skillPoints++;
      this.game.audio.sfx('levelup');
      this.game.toast(`LEVEL ${save.level} — skill point earned`, 'good');
    }
    this.game.player.recompute(save);
    this.game.hud.setXp();
  }

  addCoins(n) {
    const s = this.game.save;
    s.coins = Math.max(0, s.coins + n);
    if (s.coins >= 5000) this.game.unlockAchievement('rich');
    this.game.hud.setCurrency();
  }
  addTokens(n) { this.game.save.tokens = Math.max(0, this.game.save.tokens + n); this.game.hud.setCurrency(); }
  addMaterials(n) { this.game.save.materials = Math.max(0, this.game.save.materials + n); this.game.hud.setCurrency(); }
  addIntel(n) { this.game.save.intel = Math.max(0, this.game.save.intel + n); this.game.hud.setCurrency(); }

  canAfford(currency, price) {
    const s = this.game.save;
    switch (currency) {
      case 'tokens': return s.tokens >= price;
      case 'materials': return s.materials >= price;
      default: return s.coins >= price;
    }
  }

  spend(currency, price) {
    const s = this.game.save;
    if (!this.canAfford(currency, price)) return false;
    if (currency === 'tokens') s.tokens -= price;
    else if (currency === 'materials') s.materials -= price;
    else s.coins -= price;
    this.game.hud.setCurrency();
    return true;
  }

  // ── weapons ──
  hasWeapon(id) { return this.game.save.weapons.includes(id); }
  buyWeapon(id) {
    const w = WEAPONS[id];
    if (!w || this.hasWeapon(id)) return false;
    if (!this.spend('coins', w.price)) return false;
    this.game.save.weapons.push(id);
    this.game.audio.sfx('chest');
    this.game.toast(`Acquired ${w.name}`, 'good');
    if (this.game.save.weapons.length >= Object.keys(WEAPONS).length) this.game.unlockAchievement('arsenal');
    return true;
  }
  equipWeapon(id) {
    if (!this.hasWeapon(id)) return false;
    this.game.save.currentWeapon = id;
    this.game.player.setWeapon(id);
    this.game.hud.setGear();
    return true;
  }

  // ── armor ──
  hasArmor(id) { return this.game.save.ownedArmor.includes(id); }
  buyArmor(id) {
    const a = ARMOR[id];
    if (!a || this.hasArmor(id)) return false;
    if (!this.spend('coins', a.price)) return false;
    this.game.save.ownedArmor.push(id);
    this.game.audio.sfx('chest');
    this.game.toast(`Acquired ${a.name}`, 'good');
    this.checkArmorSets();
    return true;
  }
  equipArmor(id) {
    const a = ARMOR[id];
    if (!a || !this.hasArmor(id)) return false;
    this.game.save.loadout[a.slot] = id;
    this.game.player.recompute(this.game.save);
    this.game.player.hp = Math.min(this.game.player.hp, this.game.player.maxHp);
    this.game.hud.setGear();
    this.checkArmorSets();
    return true;
  }
  checkArmorSets() {
    const lo = this.game.save.loadout;
    for (const set of Object.values(ARMOR_SETS)) {
      if (set.pieces.every((p) => Object.values(lo).includes(p))) {
        this.game.save.stats.armorSets = this.game.save.stats.armorSets || [];
        this.game.unlockAchievement('armorer');
      }
    }
  }

  // ── gadgets ──
  gadgetCount(id) { return this.game.save.gadgets[id] || 0; }
  buyGadget(id, count = 1) {
    const g = GADGETS[id];
    if (!g) return false;
    const price = g.price * count;
    if (!this.spend('coins', price)) return false;
    this.game.save.gadgets[id] = Math.min(g.maxCount, (this.game.save.gadgets[id] || 0) + count);
    this.game.audio.sfx('pickup');
    this.game.toast(`+${count} ${g.name}`, 'good');
    this.game.hud.setGear();
    return true;
  }
  useGadget(id) {
    const g = GADGETS[id];
    if (!g) return false;
    const have = this.game.save.gadgets[id] || 0;
    if (have <= 0) return false;
    this.game.save.gadgets[id] = have - 1;
    this.game.hud.setGear();
    return true;
  }
  equipGadget(id) {
    if ((this.game.save.gadgets[id] || 0) <= 0 && !GADGETS[id]) return false;
    this.game.save.currentGadget = id;
    this.game.hud.setGear();
    return true;
  }

  // ── skills ──
  canUnlockSkill(id) {
    const save = this.game.save;
    if (save.skills.includes(id)) return { ok: false, reason: 'Already unlocked' };
    const f = findSkill(id);
    if (!f) return { ok: false, reason: 'Unknown skill' };
    if (save.skillPoints < f.node.cost) return { ok: false, reason: 'Not enough skill points' };
    if (f.node.requires && !save.skills.includes(f.node.requires)) return { ok: false, reason: 'Requires earlier skill' };
    return { ok: true };
  }
  unlockSkill(id) {
    const c = this.canUnlockSkill(id);
    if (!c.ok) return false;
    const f = findSkill(id);
    this.game.save.skills.push(id);
    this.game.save.skillPoints -= f.node.cost;
    this.game.applySkills();
    this.game.audio.sfx('levelup');
    this.game.toast(`Skill unlocked: ${f.node.name}`, 'good');
    if (this.game.save.skills.length >= 20) this.game.unlockAchievement('skillMaster');
    return true;
  }
  respec() {
    const save = this.game.save;
    let refund = 0;
    for (const id of save.skills) { const f = findSkill(id); if (f) refund += f.node.cost; }
    save.skills = [];
    save.skillPoints += refund;
    this.game.applySkills();
    this.game.toast(`Respecced: ${refund} points refunded`, 'good');
  }

  // ── boosts (black tokens) ──
  buyBoost(id) {
    const boosts = {
      hp1: { price: 1, apply: (s) => { s.boosts.maxHp = (s.boosts.maxHp || 0) + 20; }, name: 'Vitality I' },
      hp2: { price: 2, apply: (s) => { s.boosts.maxHp = (s.boosts.maxHp || 0) + 20; }, name: 'Vitality II' },
      dmg1: { price: 1, apply: (s) => { s.boosts.damage = (s.boosts.damage || 0) + 0.08; }, name: 'Keen Edge I' },
      dmg2: { price: 2, apply: (s) => { s.boosts.damage = (s.boosts.damage || 0) + 0.08; }, name: 'Keen Edge II' },
      stealth1: { price: 2, apply: (s) => { s.boosts.detectionResist = (s.boosts.detectionResist || 0) + 0.15; }, name: 'Quiet Steps' },
      stamina1: { price: 1, apply: (s) => { s.boosts.maxStamina = (s.boosts.maxStamina || 0) + 25; }, name: 'Endurance' },
    };
    const b = boosts[id];
    if (!b) return false;
    if (!this.spend('tokens', b.price)) return false;
    b.apply(this.game.save);
    this.game.save.boosts[id] = (this.game.save.boosts[id] || 0) + 1;
    this.game.applySkills();
    this.game.toast(`${b.name} acquired`, 'good');
    return true;
  }
  buySkillPoint() {
    if (!this.spend('tokens', 3)) return false;
    this.game.save.skillPoints++;
    this.game.toast('+1 skill point', 'good');
    return true;
  }

  // ── allies ──
  recruit(candidateId) {
    const save = this.game.save;
    if (save.allies.find((a) => a.id === candidateId)) return false;
    const { RECRUIT_CANDIDATES } = this.game.recruitData;
    const c = RECRUIT_CANDIDATES.find((x) => x.id === candidateId);
    if (!c) return false;
    save.allies.push({ id: c.id, name: c.name, cls: c.cls, level: 1, loyalty: 1 });
    this.game.audio.sfx('chest');
    this.game.toast(`${c.name} joined the Hand`, 'good');
    if (save.allies.length >= 5) this.game.unlockAchievement('recruiter');
    return true;
  }
  levelUpAlly(id) {
    const save = this.game.save;
    const a = save.allies.find((x) => x.id === id);
    if (!a || a.level >= 5) return false;
    const cost = 2 + a.level;
    if (!this.spend('tokens', cost)) return false;
    a.level++;
    if (a.level >= 5) this.game.unlockAchievement('eliteAlly');
    this.game.toast(`${a.name} reached level ${a.level}`, 'good');
    return true;
  }
  setActiveAllies(ids) {
    const max = 1 + (this.game.player.mods.allySlots || 0);
    this.game.save.activeAllies = ids.slice(0, max);
  }

  // ── district liberation ──
  districtControlPct(districtId) {
    // Control drops as towers are disabled and posts cleared.
    const disabled = (this.game.save.disabledTowers || []).filter((t) => t.startsWith(districtId)).length;
    const d = this.game.world?.districtId === districtId ? this.game.world.district : null;
    const total = d ? Math.max(1, d.towers.length) : 4;
    const base = this.game.save.districtControl?.[districtId] ?? 1;
    return clamp(base - (disabled / total), 0, 1);
  }

  liberateDistrict(districtId) {
    const save = this.game.save;
    save.districtControl = save.districtControl || {};
    save.districtControl[districtId] = 0;
    save.stats.liberated = (save.stats.liberated || 0) + 1;
    this.game.toast(`${districtId} liberated!`, 'good');
    this.game.audio.setMood('victory');
    this.game.unlockAchievement('liberator');
    if (Object.values(save.districtControl).filter((v) => v <= 0).length >= 10) {
      this.game.unlockAchievement('masterOfVespera');
    }
  }

  checkWeaponAchievements() {
    if (this.game.save.weapons.length >= Object.keys(WEAPONS).length) this.game.unlockAchievement('arsenal');
  }
}
