/**
 * Enemy archetypes. Each entry drives HP, damage, AI tuning (vision cone, hearing,
 * detection speed), weapons and loot. Bosses are described in bosses.js.
 */
export const ENEMY_TYPES = {
  guard: {
    id: 'guard', name: 'Dominion Guard', icon: '🛡',
    hp: 55, damage: 9, speed: 92, chaseSpeed: 150,
    visionRange: 320, visionAngle: 1.15, detectionSpeed: 0.62, hearingRadius: 190,
    attackRange: 52, attackCooldown: 1.5, telegraph: 0.42, recovery: 0.5,
    weapon: 'shortSword', stagger: 0.4, poise: 1.0,
    drops: { coins: [8, 18], xp: 18 }, height: 52, width: 26,
    canBlock: false, canParry: false, alertCall: true, tier: 1,
  },
  archer: {
    id: 'archer', name: 'Dominion Archer', icon: '🏹',
    hp: 40, damage: 12, speed: 78, chaseSpeed: 110,
    visionRange: 420, visionAngle: 1.0, detectionSpeed: 0.7, hearingRadius: 170,
    attackRange: 430, attackCooldown: 2.1, telegraph: 0.6, recovery: 0.6,
    weapon: 'bow', ranged: true, projectileSpeed: 520, stagger: 0.3, poise: 0.7,
    drops: { coins: [10, 22], xp: 24 }, height: 50, width: 24,
    prefersDistance: true, alertCall: true, tier: 2,
  },
  heavy: {
    id: 'heavy', name: 'Heavy Guard', icon: '🪓',
    hp: 130, damage: 20, speed: 62, chaseSpeed: 118,
    visionRange: 280, visionAngle: 1.0, detectionSpeed: 0.5, hearingRadius: 150,
    attackRange: 66, attackCooldown: 2.2, telegraph: 0.72, recovery: 0.85,
    weapon: 'longSword', stagger: 1.2, poise: 2.4,
    drops: { coins: [20, 40], xp: 45 }, height: 62, width: 34,
    armor: 0.35, weakness: 'back', alertCall: true, tier: 3,
  },
  hunter: {
    id: 'hunter', name: 'Hunter', icon: '👁',
    hp: 75, damage: 16, speed: 118, chaseSpeed: 190,
    visionRange: 460, visionAngle: 1.35, detectionSpeed: 1.15, hearingRadius: 300,
    attackRange: 58, attackCooldown: 1.15, telegraph: 0.32, recovery: 0.4,
    weapon: 'dagger', stagger: 0.5, poise: 1.2, seesHidden: true,
    drops: { coins: [25, 45], xp: 60 }, height: 54, width: 27,
    canDodge: true, tier: 3,
  },
  captain: {
    id: 'captain', name: 'Dominion Captain', icon: '⭐',
    hp: 190, damage: 22, speed: 100, chaseSpeed: 168,
    visionRange: 400, visionAngle: 1.3, detectionSpeed: 0.95, hearingRadius: 260,
    attackRange: 62, attackCooldown: 1.4, telegraph: 0.4, recovery: 0.5,
    weapon: 'longSword', stagger: 0.9, poise: 3.0,
    drops: { coins: [60, 110], xp: 140, tokens: 1 }, height: 60, width: 30,
    canBlock: true, canParry: true, canRally: true, armor: 0.25, tier: 4,
  },
  inquisitor: {
    id: 'inquisitor', name: 'Inquisitor', icon: '☩',
    hp: 210, damage: 24, speed: 132, chaseSpeed: 205,
    visionRange: 470, visionAngle: 1.4, detectionSpeed: 1.35, hearingRadius: 320,
    attackRange: 64, attackCooldown: 1.05, telegraph: 0.3, recovery: 0.35,
    weapon: 'shortSword', stagger: 0.7, poise: 2.6,
    drops: { coins: [80, 140], xp: 200, tokens: 2 }, height: 58, width: 29,
    canDodge: true, canParry: true, smokeResist: 0.6, canDash: true, armor: 0.2, tier: 5,
  },
  assassinHunter: {
    id: 'assassinHunter', name: 'Assassin Hunter', icon: '🗡',
    hp: 150, damage: 30, speed: 150, chaseSpeed: 230,
    visionRange: 380, visionAngle: 1.5, detectionSpeed: 1.5, hearingRadius: 360,
    attackRange: 56, attackCooldown: 0.95, telegraph: 0.26, recovery: 0.3,
    weapon: 'dagger', stagger: 0.6, poise: 1.8, seesHidden: true,
    drops: { coins: [90, 160], xp: 220, tokens: 2 }, height: 56, width: 28,
    counterAssassinate: true, canDodge: true, silentAlert: true, tier: 6,
  },
  elite: {
    id: 'elite', name: 'Elite Guard', icon: '⚜',
    hp: 240, damage: 28, speed: 108, chaseSpeed: 182,
    visionRange: 430, visionAngle: 1.35, detectionSpeed: 1.1, hearingRadius: 280,
    attackRange: 70, attackCooldown: 1.25, telegraph: 0.38, recovery: 0.45,
    weapon: 'longSword', stagger: 1.0, poise: 3.4,
    drops: { coins: [70, 130], xp: 180, tokens: 1 }, height: 62, width: 32,
    canBlock: true, canParry: true, armor: 0.3, canRally: true, tier: 5,
  },
};

export const ENEMY_ORDER = ['guard', 'archer', 'heavy', 'hunter', 'captain', 'inquisitor', 'assassinHunter', 'elite'];

export function getEnemyType(id) { return ENEMY_TYPES[id] || ENEMY_TYPES.guard; }

/** Detection states shared by AI and the HUD meter. */
export const DETECT = {
  SAFE: 'safe', SUSPICIOUS: 'suspicious', SEARCHING: 'searching', ALERT: 'alert', COMBAT: 'combat',
};

export const AI_STATE = {
  IDLE: 'idle', PATROL: 'patrol', SUSPICIOUS: 'suspicious', SEARCH: 'search',
  ALERT: 'alert', CHASE: 'chase', ATTACK: 'attack', STUNNED: 'stunned',
  RECOVER: 'recover', RETURN: 'return', TALK: 'talk', FLEE: 'flee',
};
