/** Armor slots and sets. Each item gives a stat block; full sets give bonuses. */

export const ARMOR_SLOTS = ['hood', 'gloves', 'boots', 'chest'];

export const ARMOR = {
  // ── Hoods ──
  clothHood:   { id: 'clothHood', name: 'Cloth Hood', slot: 'hood', icon: '🧣', desc: 'Traveler\u2019s wrap. Keeps the rain off.', price: 0, rarity: 'common', stats: { detectionResist: 0.03 }, set: null },
  shadowHood:  { id: 'shadowHood', name: 'Shadow Hood', slot: 'hood', icon: '🎭', desc: 'Dye-worked to swallow candlelight.', price: 260, rarity: 'uncommon', stats: { detectionResist: 0.15 }, set: 'shadow' },
  hunterHood:  { id: 'hunterHood', name: 'Hunter\u2019s Cowl', slot: 'hood', icon: '🪶', desc: 'Wide brim, good for sightlines.', price: 280, rarity: 'uncommon', stats: { detectionResist: 0.08, rangedDamage: 0.10 }, set: 'hunter' },
  veiledHood:  { id: 'veiledHood', name: 'Veiled Cowl', slot: 'hood', icon: '❖', desc: 'Secret armor of the Veil Council. The world goes quiet.', price: 0, rarity: 'legendary', stats: { detectionResist: 0.34 }, set: 'veiled', unlock: 'secret' },

  // ── Chest ──
  paddedCoat:  { id: 'paddedCoat', name: 'Padded Coat', slot: 'chest', icon: '🧥', desc: 'Quilted wool. Better than nothing.', price: 0, rarity: 'common', stats: { maxHp: 10 }, set: null },
  shadowCoat:  { id: 'shadowCoat', name: 'Shadow Coat', slot: 'chest', icon: '🥼', desc: 'Layered silk over hardened leather.', price: 320, rarity: 'uncommon', stats: { maxHp: 15, detectionResist: 0.08 }, set: 'shadow' },
  warriorPlate:{ id: 'warriorPlate', name: 'Warrior\u2019s Plate', slot: 'chest', icon: '🛡', desc: 'Dominion surplus, repurposed.', price: 420, rarity: 'rare', stats: { maxHp: 40, damage: 0.05, moveSpeed: -0.05 }, set: 'warrior' },
  hunterVest:  { id: 'hunterVest', name: 'Hunter\u2019s Vest', slot: 'chest', icon: '🎽', desc: 'Light, quiet, full of knife loops.', price: 360, rarity: 'uncommon', stats: { maxHp: 12, rangedDamage: 0.10 }, set: 'hunter' },
  veiledRobe:  { id: 'veiledRobe', name: 'Veiled Robe', slot: 'chest', icon: '❖', desc: 'Woven with something that is not thread.', price: 0, rarity: 'legendary', stats: { maxHp: 35, detectionResist: 0.2, damage: 0.08 }, set: 'veiled', unlock: 'secret' },

  // ── Gloves ──
  leatherWrap: { id: 'leatherWrap', name: 'Leather Wraps', slot: 'gloves', icon: '🧤', desc: 'Grip for climbing wet stone.', price: 0, rarity: 'common', stats: { attackSpeed: 0.03, climbSpeed: 0.05 }, set: null },
  shadowWraps: { id: 'shadowWraps', name: 'Shadow Wraps', slot: 'gloves', icon: '🧤', desc: 'Fingers free, blade silent.', price: 230, rarity: 'uncommon', stats: { attackSpeed: 0.10, assassinationSpeed: 0.25 }, set: 'shadow' },
  warriorGaunt:{ id: 'warriorGaunt', name: 'Warrior\u2019s Gauntlets', slot: 'gloves', icon: '🥊', desc: 'Steel-knuckled. Breaks guard.', price: 340, rarity: 'rare', stats: { attackSpeed: 0.06, damage: 0.10, stagger: 0.2 }, set: 'warrior' },
  veiledGloves:{ id: 'veiledGloves', name: 'Veiled Hand Wraps', slot: 'gloves', icon: '❖', desc: 'The Hand remembers every grip.', price: 0, rarity: 'legendary', stats: { attackSpeed: 0.14, assassinationSpeed: 0.5 }, set: 'veiled', unlock: 'secret' },

  // ── Boots ──
  wornBoots:   { id: 'wornBoots', name: 'Worn Boots', slot: 'boots', icon: '🥾', desc: 'Courier issue. Still holding.', price: 0, rarity: 'common', stats: { moveSpeed: 0.03, jumpBonus: 0.03 }, set: null },
  shadowBoots: { id: 'shadowBoots', name: 'Shadowstep Boots', slot: 'boots', icon: '👟', desc: 'Soft soles. Almost no sound.', price: 280, rarity: 'uncommon', stats: { moveSpeed: 0.14, noise: -0.35 }, set: 'shadow' },
  warriorBoots:{ id: 'warriorBoots', name: 'Warrior\u2019s Sabatons', slot: 'boots', icon: '🥾', desc: 'Heavy but sure.', price: 300, rarity: 'rare', stats: { moveSpeed: 0.02, maxHp: 12, armor: 0.08 }, set: 'warrior' },
  hunterBoots: { id: 'hunterBoots', name: 'Hunter\u2019s Treads', slot: 'boots', icon: '👟', desc: 'Built for rooftops.', price: 310, rarity: 'uncommon', stats: { moveSpeed: 0.12, jumpBonus: 0.08, climbSpeed: 0.1 }, set: 'hunter' },
  veiledBoots: { id: 'veiledBoots', name: 'Veiled Steps', slot: 'boots', icon: '❖', desc: 'You leave no print. Ever.', price: 0, rarity: 'legendary', stats: { moveSpeed: 0.20, noise: -0.6, jumpBonus: 0.1 }, set: 'veiled', unlock: 'secret' },
};

export const ARMOR_ORDER = {
  hood: ['clothHood', 'shadowHood', 'hunterHood', 'veiledHood'],
  chest: ['paddedCoat', 'shadowCoat', 'hunterVest', 'warriorPlate', 'veiledRobe'],
  gloves: ['leatherWrap', 'shadowWraps', 'warriorGaunt', 'veiledGloves'],
  boots: ['wornBoots', 'shadowBoots', 'hunterBoots', 'warriorBoots', 'veiledBoots'],
};

export const ARMOR_SETS = {
  shadow: {
    name: 'Shadow Set', pieces: ['shadowHood', 'shadowCoat', 'shadowWraps', 'shadowBoots'],
    bonus: { detectionResist: 0.15, noise: -0.2 },
    desc: 'Detection resistance and near-silent movement.',
  },
  warrior: {
    name: 'Warrior Set', pieces: ['warriorPlate', 'warriorGaunt', 'warriorBoots'],
    bonus: { damage: 0.15, maxHp: 25, armor: 0.1 },
    desc: 'Straight combat power and durability.',
  },
  hunter: {
    name: 'Hunter Set', pieces: ['hunterHood', 'hunterVest', 'hunterBoots'],
    bonus: { rangedDamage: 0.25, detectionResist: 0.05 },
    desc: 'Ranged damage and rooftop mobility.',
  },
  veiled: {
    name: 'Veiled Set', pieces: ['veiledHood', 'veiledRobe', 'veiledGloves', 'veiledBoots'],
    bonus: { detectionResist: 0.25, damage: 0.2, moveSpeed: 0.1, assassinationSpeed: 0.5, maxHp: 40 },
    desc: 'Secret armor. Mastery of shadow and blade.',
  },
};

export function getArmor(id) { return ARMOR[id] || null; }

export function defaultLoadout() {
  return { hood: 'clothHood', chest: 'paddedCoat', gloves: 'leatherWrap', boots: 'wornBoots' };
}

/** Aggregate all stat modifiers from equipped armor, including set bonuses. */
export function aggregateArmor(loadout, owned) {
  const total = {
    maxHp: 0, damage: 0, armor: 0, detectionResist: 0, moveSpeed: 0,
    attackSpeed: 0, climbSpeed: 0, jumpBonus: 0, noise: 0,
    assassinationSpeed: 0, rangedDamage: 0, stagger: 0,
  };
  for (const slot of ARMOR_SLOTS) {
    const id = loadout[slot];
    const item = ARMOR[id];
    if (!item) continue;
    for (const [k, v] of Object.entries(item.stats)) total[k] = (total[k] || 0) + v;
  }
  // set bonuses
  for (const set of Object.values(ARMOR_SETS)) {
    const complete = set.pieces.every((p) => Object.values(loadout).includes(p));
    if (!complete) continue;
    for (const [k, v] of Object.entries(set.bonus)) total[k] = (total[k] || 0) + v;
  }
  return total;
}
