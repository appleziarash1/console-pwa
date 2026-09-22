/** Weapon definitions. All combat stats live here so balance is tunable in one place. */

export const WEAPON_TYPES = {
  hiddenBlade: 'hiddenBlade',
  shortSword: 'shortSword',
  longSword: 'longSword',
  dagger: 'dagger',
  bow: 'bow',
  throwingKnife: 'throwingKnife',
};

export const WEAPONS = {
  hiddenBlade: {
    id: 'hiddenBlade', name: 'Hidden Blade', type: 'blade', icon: '🗡',
    desc: 'A wrist-mounted blade. Silent, instant, and the reason you are still alive.',
    damage: 18, speed: 1.35, range: 42, reach: 46, stagger: 0.35, comboLength: 2,
    ranged: false, silent: true, assassinate: true, price: 0, rarity: 'common',
    unlock: 'story',
  },
  shortSword: {
    id: 'shortSword', name: 'Short Sword', type: 'sword', icon: '⚔',
    desc: 'Balanced steel. Reliable in a street fight and quick enough to parry with.',
    damage: 24, speed: 1.0, range: 58, reach: 62, stagger: 0.5, comboLength: 3,
    ranged: false, silent: false, assassinate: false, price: 0, rarity: 'common',
    unlock: 'start',
  },
  longSword: {
    id: 'longSword', name: 'Long Sword', type: 'sword', icon: '🗡',
    desc: 'Heavy two-handed blade. Slower swings, brutal reach, shatters guard.',
    damage: 38, speed: 0.68, range: 76, reach: 82, stagger: 0.9, comboLength: 3,
    ranged: false, silent: false, assassinate: false, price: 450, rarity: 'uncommon',
    unlock: 'shop',
  },
  dagger: {
    id: 'dagger', name: 'Dagger', type: 'dagger', icon: '🔪',
    desc: 'Fast, quiet, close-in work. Rewards aggression and punishes hesitation.',
    damage: 15, speed: 1.75, range: 40, reach: 44, stagger: 0.28, comboLength: 4,
    ranged: false, silent: true, assassinate: true, price: 180, rarity: 'common',
    unlock: 'shop',
  },
  bow: {
    id: 'bow', name: 'Recurve Bow', type: 'bow', icon: '🏹',
    desc: 'Silent at distance. Takes time to draw, so choose your moment.',
    damage: 34, speed: 0.7, range: 520, reach: 520, stagger: 0.4, comboLength: 1,
    ranged: true, silent: true, assassinate: false, price: 520, rarity: 'uncommon',
    unlock: 'shop', drawTime: 0.55, projectileSpeed: 900,
  },
  throwingKnife: {
    id: 'throwingKnife', name: 'Throwing Knives', type: 'throw', icon: '✳',
    desc: 'Silent ranged attack. Limited supply, recovered from the fallen.',
    damage: 22, speed: 1.1, range: 340, reach: 340, stagger: 0.25, comboLength: 1,
    ranged: true, silent: true, assassinate: false, price: 320, rarity: 'uncommon',
    unlock: 'shop', ammo: 8, maxAmmo: 8, projectileSpeed: 760,
  },
  voidBlade: {
    id: 'voidBlade', name: 'Void Blade', type: 'sword', icon: '❖',
    desc: 'A secret weapon recovered from the Lost City. It cuts light itself.',
    damage: 52, speed: 1.2, range: 84, reach: 90, stagger: 1.2, comboLength: 4,
    ranged: false, silent: true, assassinate: true, price: 0, rarity: 'legendary',
    unlock: 'secret', lifesteal: 4,
  },
};

/** Ordered weapon list for shops and the inventory grid. */
export const WEAPON_ORDER = ['hiddenBlade', 'dagger', 'shortSword', 'longSword', 'throwingKnife', 'bow', 'voidBlade'];

export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.shortSword;
}

/** Compute final damage of a weapon given player stats and skills. */
export function weaponDamage(weaponId, player) {
  const w = getWeapon(weaponId);
  return w.damage * (1 + (player.damageBonus || 0));
}
