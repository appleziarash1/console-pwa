/** NPC archetypes, shop inventories and recruit options. */

export const NPC_ARCHETYPES = {
  merchant: {
    id: 'merchant', name: 'Merchant', icon: '🧺', kind: 'shop', shop: 'general',
    palette: { body: '#7a5a30', trim: '#c9a227' },
    barks: ['npc_merchant'],
  },
  smith: {
    id: 'smith', name: 'Blacksmith', icon: '⚒', kind: 'shop', shop: 'weapons',
    palette: { body: '#4a4038', trim: '#e07b2a' },
    barks: ['npc_merchant'],
  },
  armorer: {
    id: 'armorer', name: 'Armorer', icon: '🛡', kind: 'shop', shop: 'armor',
    palette: { body: '#494455', trim: '#6fc3d6' },
    barks: ['npc_merchant'],
  },
  gadgeteer: {
    id: 'gadgeteer', name: 'Gadgeteer', icon: '🧪', kind: 'shop', shop: 'gadgets',
    palette: { body: '#3e3a35', trim: '#5aa86a' },
    barks: ['npc_merchant'],
  },
  informant: {
    id: 'informant', name: 'Informant', icon: '👤', kind: 'quest', shop: null,
    palette: { body: '#33303a', trim: '#c9a227' },
    barks: ['npc_civilian'],
  },
  doctor: {
    id: 'doctor', name: 'Doctor', icon: '✚', kind: 'heal', shop: null,
    palette: { body: '#565061', trim: '#e8e0cf' },
    barks: ['npc_civilian'],
  },
  recruit: {
    id: 'recruit', name: 'Resistance Recruit', icon: '⚑', kind: 'recruit', shop: null,
    palette: { body: '#45403c', trim: '#d94138' },
    barks: ['npc_recruit'],
  },
  scholar: {
    id: 'scholar', name: 'Scholar', icon: '📖', kind: 'lore', shop: null,
    palette: { body: '#423d47', trim: '#6fc3d6' },
    barks: ['npc_scholar'],
  },
  leader: {
    id: 'leader', name: 'Resistance Leader', icon: '✦', kind: 'story', shop: null,
    palette: { body: '#33303a', trim: '#f0cf6b' },
    barks: ['npc_recruit'],
  },
};

export const SHOPS = {
  general: {
    id: 'general', name: 'Merchant', currency: 'coins',
    stock: [
      { kind: 'consumable', id: 'healthPotion', name: 'Health Draught', price: 45, desc: 'Restores 60 health.', icon: '🧴' },
      { kind: 'consumable', id: 'staminaTonic', name: 'Stamina Tonic', price: 30, desc: 'Refills stamina instantly.', icon: '🍶' },
      { kind: 'gadget', id: 'smokeBomb', price: 60, count: 1 },
      { kind: 'gadget', id: 'distractionCoin', price: 20, count: 3 },
      { kind: 'gadget', id: 'noiseMaker', price: 45, count: 1 },
      { kind: 'intel', id: 'intelBuy', name: 'District Intel', price: 120, desc: 'Reveals mission details and collectible hints.', icon: '◈' },
    ],
  },
  weapons: {
    id: 'weapons', name: 'Weaponsmith', currency: 'coins',
    stock: [
      { kind: 'weapon', id: 'dagger' },
      { kind: 'weapon', id: 'longSword' },
      { kind: 'weapon', id: 'throwingKnife' },
      { kind: 'weapon', id: 'bow' },
    ],
  },
  armor: {
    id: 'armor', name: 'Armorer', currency: 'coins',
    stock: [
      { kind: 'armor', id: 'shadowHood' }, { kind: 'armor', id: 'shadowCoat' },
      { kind: 'armor', id: 'shadowWraps' }, { kind: 'armor', id: 'shadowBoots' },
      { kind: 'armor', id: 'warriorPlate' }, { kind: 'armor', id: 'warriorGaunt' },
      { kind: 'armor', id: 'warriorBoots' }, { kind: 'armor', id: 'hunterHood' },
      { kind: 'armor', id: 'hunterVest' }, { kind: 'armor', id: 'hunterBoots' },
    ],
  },
  gadgets: {
    id: 'gadgets', name: 'Gadgeteer', currency: 'coins',
    stock: [
      { kind: 'gadget', id: 'poisonDart', price: 100, count: 1 },
      { kind: 'gadget', id: 'fireBomb', price: 120, count: 1 },
      { kind: 'gadget', id: 'ropeHook', price: 280, count: 1 },
      { kind: 'gadget', id: 'smokeBomb', price: 60, count: 2 },
    ],
  },
  blackTokens: {
    id: 'blackTokens', name: 'Black Market', currency: 'tokens',
    stock: [
      { kind: 'boost', id: 'hp1', name: 'Vitality I', price: 1, desc: '+20 max health.', icon: '❤' },
      { kind: 'boost', id: 'hp2', name: 'Vitality II', price: 2, desc: '+20 max health.', icon: '❤' },
      { kind: 'boost', id: 'dmg1', name: 'Keen Edge I', price: 1, desc: '+8% weapon damage.', icon: '⚔' },
      { kind: 'boost', id: 'dmg2', name: 'Keen Edge II', price: 2, desc: '+8% weapon damage.', icon: '⚔' },
      { kind: 'boost', id: 'stealth1', name: 'Quiet Steps', price: 2, desc: '-15% detection buildup.', icon: '👤' },
      { kind: 'boost', id: 'stamina1', name: 'Endurance', price: 1, desc: '+25% stamina.', icon: '⚡' },
      { kind: 'skillpoint', id: 'sp', name: 'Skill Point', price: 3, desc: 'One additional skill point.', icon: '✦' },
    ],
  },
};

/** Recruitable ally classes with their per-level growth. */
export const ALLY_CLASSES = {
  scout: {
    id: 'scout', name: 'Scout', icon: '👁', desc: 'Marks enemies through walls and increases detection range against you.',
    hp: [60, 75, 95, 115, 140], damage: [10, 14, 18, 23, 30], defense: [0.05, 0.08, 0.12, 0.16, 0.22],
    skill: 'Reveal', skillDesc: 'Reveals all enemies in a wide radius for 8 seconds.',
    cooldown: 22, color: '#6fc3d6',
    roles: ['scout'],
  },
  archer: {
    id: 'archer', name: 'Archer', icon: '🏹', desc: 'Ranged support. Covers you from rooftops.',
    hp: [55, 70, 85, 105, 130], damage: [16, 21, 28, 36, 46], defense: [0.03, 0.06, 0.09, 0.13, 0.18],
    skill: 'Volley', skillDesc: 'Fires a volley at up to three targets.',
    cooldown: 18, color: '#c9a227',
    roles: ['distract', 'attack'],
  },
  warrior: {
    id: 'warrior', name: 'Warrior', icon: '⚔', desc: 'Holds a line and draws attention.',
    hp: [110, 135, 165, 200, 245], damage: [14, 19, 25, 32, 41], defense: [0.16, 0.22, 0.28, 0.35, 0.44],
    skill: 'Taunt & Cleave', skillDesc: 'Draws all nearby enemies and cleaves them.',
    cooldown: 20, color: '#d94138',
    roles: ['attack', 'protect'],
  },
  assassin: {
    id: 'assassin', name: 'Assassin', icon: '🗡', desc: 'Removes a single target silently, if you set it up.',
    hp: [65, 80, 100, 125, 155], damage: [24, 31, 40, 52, 66], defense: [0.04, 0.07, 0.1, 0.14, 0.2],
    skill: 'Shadow Kill', skillDesc: 'Instantly kills one unaware enemy.',
    cooldown: 30, color: '#9e2b25',
    roles: ['assassinate'],
  },
  medic: {
    id: 'medic', name: 'Medic', icon: '✚', desc: 'Heals you in the field.',
    hp: [70, 85, 105, 130, 160], damage: [8, 11, 15, 19, 25], defense: [0.08, 0.12, 0.16, 0.21, 0.27],
    skill: 'Field Dressing', skillDesc: 'Restores 45 health over 4 seconds.',
    cooldown: 25, color: '#5aa86a',
    roles: ['protect'],
  },
  saboteur: {
    id: 'saboteur', name: 'Saboteur', icon: '💣', desc: 'Plants charges and disables devices.',
    hp: [75, 90, 110, 135, 165], damage: [12, 16, 21, 27, 35], defense: [0.06, 0.09, 0.13, 0.17, 0.23],
    skill: 'Charge', skillDesc: 'Plants an explosive that damages a large area.',
    cooldown: 28, color: '#e07b2a',
    roles: ['distract', 'attack'],
  },
};

export const ALLY_ORDER = ['scout', 'archer', 'warrior', 'assassin', 'medic', 'saboteur'];

/** Named recruit candidates, unlocked by recruiting at safehouses. */
export const RECRUIT_CANDIDATES = [
  { id: 'nyra',  name: 'Nyra',  cls: 'scout',   district: 'oldQuarter',  blurb: 'A rooftop courier who knows every plank in the Old Quarter.' },
  { id: 'brann', name: 'Brann', cls: 'warrior', district: 'industrial', blurb: 'Foundry worker. Broke a guard\u2019s jaw with a chain hook.' },
  { id: 'sella', name: 'Sella', cls: 'archer',  district: 'harbor',      blurb: 'Dockwatch. Can hit a lantern at two hundred paces.' },
  { id: 'mott',  name: 'Mott',  cls: 'medic',   district: 'cathedral',   blurb: 'Barber-surgeon who patches Hand members for free.' },
  { id: 'kessa', name: 'Kessa', cls: 'assassin',district: 'nobleHeights',blurb: 'Former Circle housemaid. Knows six ways out of every manor.' },
  { id: 'devik', name: 'Devik', cls: 'saboteur',district: 'merchant',    blurb: 'Demolitions. Laughs at the wrong moments.' },
  { id: 'orsa',  name: 'Orsa',  cls: 'warrior', district: 'fortress',    blurb: 'Deserted from the Dominion. Wants to earn it back.' },
  { id: 'pell',  name: 'Pell',  cls: 'scout',   district: 'underground', blurb: 'Lives in the tunnels. Maps them by memory.' },
];

export function getNPC(id) { return NPC_ARCHETYPES[id] || NPC_ARCHETYPES.merchant; }
export function getShop(id) { return SHOPS[id] || SHOPS.general; }
export function getAllyClass(id) { return ALLY_CLASSES[id] || ALLY_CLASSES.warrior; }
