/**
 * Boss definitions. Each boss is a normal enemy config plus a multi-phase script.
 * Phases are entered by health thresholds; each phase can add reinforcements,
 * change attack set, and toggle arena hazards.
 */
export const BOSSES = {
  draeven: {
    id: 'draeven', name: 'Captain Draeven', title: 'THE IRON HAND',
    act: 1, hp: 620, damage: 26, speed: 96, chaseSpeed: 165,
    visionRange: 900, visionAngle: 3.2, detectionSpeed: 4, hearingRadius: 900,
    attackRange: 84, attackCooldown: 1.35, telegraph: 0.5, recovery: 0.6,
    weapon: 'longSword', staggerResist: 0.85, poise: 99, height: 74, width: 40,
    arena: { w: 1600, h: 720 },
    intro: 'Draeven steps into the courtyard light and drags his greatsword a slow line across the flagstones.',
    defeat: 'Draeven falls to one knee, breathing hard, and laughs. "He knew your father\'s name," he says. Then nothing.',
    reward: { xp: 1200, coins: 400, tokens: 2, skill: 1, weapon: 'hiddenBlade' },
    phases: [
      {
        name: 'Phase 1 — Steel', hpAbove: 0.66,
        moves: ['slash', 'slash', 'thrust', 'sweep'],
        speedMul: 1, damageMul: 1, note: 'Straightforward swordwork. Learn the sweep telegraph.',
      },
      {
        name: 'Phase 2 — The Guard', hpAbove: 0.33,
        moves: ['sweep', 'thrust', 'charge'],
        speedMul: 1.12, damageMul: 1.1, summons: [{ type: 'guard', count: 2 }],
        note: 'Draeven calls two guards and fights behind them.',
      },
      {
        name: 'Phase 3 — Rage', hpAbove: 0,
        moves: ['charge', 'sweep', 'slam', 'thrust'],
        speedMul: 1.3, damageMul: 1.25, hazard: 'groundSlam',
        note: 'Wounded and furious. Glowing red, wide slams that crack the ground.',
      },
    ],
  },

  varra: {
    id: 'varra', name: 'Inquisitor Varra', title: 'THE QUIET FLAME',
    act: 2, hp: 780, damage: 30, speed: 148, chaseSpeed: 235,
    visionRange: 900, visionAngle: 3.2, detectionSpeed: 5, hearingRadius: 900,
    attackRange: 70, attackCooldown: 0.9, telegraph: 0.3, recovery: 0.34,
    weapon: 'shortSword', staggerResist: 0.7, poise: 99, height: 64, width: 30,
    arena: { w: 1500, h: 720 },
    intro: 'Varra does not draw a weapon. She steps into the chamber and the torches bend away from her.',
    defeat: 'Varra collapses against the archive shelves, and for one second she looks almost relieved.',
    reward: { xp: 1800, coins: 600, tokens: 3, skill: 1 },
    phases: [
      {
        name: 'Phase 1 — Smoke and Steel', hpAbove: 0.6,
        moves: ['dashSlash', 'slash', 'dashSlash', 'thrust'],
        speedMul: 1, damageMul: 1, smoke: true,
        note: 'She dashes through her own smoke and strikes from behind it.',
      },
      {
        name: 'Phase 2 — The Trap', hpAbove: 0.25,
        moves: ['trapSet', 'dashSlash', 'thrust', 'counter'],
        speedMul: 1.15, damageMul: 1.15, hazard: 'fireTraps', summons: [{ type: 'inquisitor', count: 1 }],
        note: 'Fire traps ignite, and a second Inquisitor joins her.',
      },
      {
        name: 'Phase 3 — Burn', hpAbove: 0,
        moves: ['dashSlash', 'counter', 'slash', 'slam'],
        speedMul: 1.35, damageMul: 1.3, hazard: 'fireTraps', burnAura: true,
        note: 'She sets the archive alight and fights inside the flames.',
      },
    ],
  },

  caldris: {
    id: 'caldris', name: 'Lord Caldris', title: 'THE GILDED HAND',
    act: 3, hp: 900, damage: 32, speed: 88, chaseSpeed: 150,
    visionRange: 900, visionAngle: 3.2, detectionSpeed: 4, hearingRadius: 900,
    attackRange: 66, attackCooldown: 1.25, telegraph: 0.45, recovery: 0.55,
    weapon: 'shortSword', staggerResist: 0.8, poise: 99, height: 68, width: 34,
    arena: { w: 1700, h: 720 }, ranged: true, projectileSpeed: 640,
    intro: 'Caldris sets down his wine, straightens his collar, and draws a dueling pistol.',
    defeat: 'Caldris, bleeding on his own marble floor, tries to buy you. He gets three words out.',
    reward: { xp: 2400, coins: 900, tokens: 4, skill: 1 },
    phases: [
      {
        name: 'Phase 1 — Pistol and Duel', hpAbove: 0.6,
        moves: ['shoot', 'slash', 'shoot', 'backstep'],
        speedMul: 1, damageMul: 1, summons: [{ type: 'elite', count: 2 }],
        note: 'Pistol volleys while two elites close you down.',
      },
      {
        name: 'Phase 2 — Bombs', hpAbove: 0.25,
        moves: ['bomb', 'shoot', 'slash', 'bomb'],
        speedMul: 1.2, damageMul: 1.2, hazard: 'bombs',
        note: 'He throws fire bombs and lets the room burn.',
      },
      {
        name: 'Phase 3 — Cornered Noble', hpAbove: 0,
        moves: ['slash', 'bomb', 'shoot', 'slam'],
        speedMul: 1.3, damageMul: 1.35, hazard: 'bombs', summons: [{ type: 'elite', count: 2 }],
        note: 'Cornered, loud, and dangerous.',
      },
    ],
  },

  theHunter: {
    id: 'theHunter', name: 'The Hunter', title: 'THE ONE WHO SEES',
    act: 3, hp: 760, damage: 34, speed: 172, chaseSpeed: 260,
    visionRange: 900, visionAngle: 3.2, detectionSpeed: 6, hearingRadius: 900,
    attackRange: 62, attackCooldown: 0.85, telegraph: 0.26, recovery: 0.3,
    weapon: 'dagger', staggerResist: 0.5, poise: 99, height: 60, width: 28,
    arena: { w: 1500, h: 720 }, seesHidden: true,
    intro: 'The Hunter was already waiting. "You move like your father," they say. "He was faster."',
    defeat: 'The Hunter drops their blade and vanishes into the dark, wounded and unhurried.',
    reward: { xp: 2200, coins: 750, tokens: 3, skill: 1 },
    phases: [
      {
        name: 'Phase 1 — Stalk', hpAbove: 0.6,
        moves: ['dashSlash', 'throwKnife', 'dashSlash'],
        speedMul: 1, damageMul: 1, stealth: true,
        note: 'They vanish and reappear. Watch for the shimmer.',
      },
      {
        name: 'Phase 2 — Traps', hpAbove: 0.25,
        moves: ['trapSet', 'throwKnife', 'dashSlash', 'counter'],
        speedMul: 1.15, damageMul: 1.15, hazard: 'traps',
        note: 'The rooftops are seeded with traps you cannot see.',
      },
      {
        name: 'Phase 3 — No More Games', hpAbove: 0,
        moves: ['dashSlash', 'counter', 'throwKnife', 'slam'],
        speedMul: 1.4, damageMul: 1.35, hazard: 'traps',
        note: 'Fast, relentless, and completely silent.',
      },
    ],
  },

  seradin: {
    id: 'seradin', name: 'Chancellor Seradin', title: 'THE VEIL ITSELF',
    act: 6, hp: 1400, damage: 38, speed: 120, chaseSpeed: 210,
    visionRange: 900, visionAngle: 3.2, detectionSpeed: 6, hearingRadius: 900,
    attackRange: 88, attackCooldown: 1.1, telegraph: 0.38, recovery: 0.42,
    weapon: 'longSword', staggerResist: 0.9, poise: 99, height: 76, width: 38,
    arena: { w: 1900, h: 720 },
    intro: 'Seradin is older than the portraits. He looks at Kael the way a man looks at a ledger he has already balanced.',
    defeat: 'Seradin falls. The city bells begin to ring — not for him. For the dawn.',
    reward: { xp: 5000, coins: 2500, tokens: 10, skill: 3 },
    phases: [
      {
        name: 'Phase 1 — Chancellor of Blades', hpAbove: 0.75,
        moves: ['slash', 'thrust', 'sweep', 'slash'],
        speedMul: 1, damageMul: 1,
        note: 'Textbook Dominion fencing. Perfect, and perfectly readable.',
      },
      {
        name: 'Phase 2 — The Guard', hpAbove: 0.5,
        moves: ['sweep', 'thrust', 'charge'],
        speedMul: 1.1, damageMul: 1.1, summons: [{ type: 'elite', count: 3 }],
        note: 'Three Elite Guards enter and form a wall around him.',
      },
      {
        name: 'Phase 3 — The Arena', hpAbove: 0.3,
        moves: ['trapSet', 'bomb', 'slash', 'slam'],
        speedMul: 1.2, damageMul: 1.2, hazard: 'traps', summons: [{ type: 'inquisitor', count: 1 }],
        note: 'The throne room becomes a trap-filled killing floor.',
      },
      {
        name: 'Phase 4 — Rooftops', hpAbove: 0.14,
        moves: ['charge', 'dashSlash', 'sweep'],
        speedMul: 1.45, damageMul: 1.25, hazard: 'wind', chase: true,
        note: 'He breaks through the wall and runs. Chase him across the roofs.',
      },
      {
        name: 'Phase 5 — The Last Duel', hpAbove: 0,
        moves: ['slash', 'thrust', 'sweep', 'slam', 'counter'],
        speedMul: 1.5, damageMul: 1.4, hazard: null, duel: true,
        note: 'No guards. No traps. Nothing left but the two of you.',
      },
    ],
  },

  paleAssassin: {
    id: 'paleAssassin', name: 'The Pale Assassin', title: 'SECRET BOSS',
    act: 99, hp: 1200, damage: 44, speed: 200, chaseSpeed: 300,
    visionRange: 900, visionAngle: 3.2, detectionSpeed: 8, hearingRadius: 900,
    attackRange: 66, attackCooldown: 0.7, telegraph: 0.2, recovery: 0.22,
    weapon: 'voidBlade', staggerResist: 0.6, poise: 99, height: 66, width: 30,
    arena: { w: 1600, h: 720 }, seesHidden: true,
    intro: 'They have no face, only a pale mask. "You were not supposed to find this place."',
    defeat: 'The mask cracks. Behind it: nothing you can name. The Void Blade is yours.',
    reward: { xp: 6000, coins: 3000, tokens: 12, skill: 3, weapon: 'voidBlade' },
    phases: [
      { name: 'Phase 1 — Blade', hpAbove: 0.5, moves: ['dashSlash', 'slash', 'counter'], speedMul: 1, damageMul: 1, note: 'Counter-happy. Bait them.' },
      { name: 'Phase 2 — Void', hpAbove: 0.2, moves: ['dashSlash', 'slam', 'counter', 'throwKnife'], speedMul: 1.3, damageMul: 1.2, hazard: 'voidRifts', note: 'Reality tears open around them.' },
      { name: 'Phase 3 — The Second Dawn', hpAbove: 0, moves: ['dashSlash', 'counter', 'slam', 'sweep'], speedMul: 1.5, damageMul: 1.4, hazard: 'voidRifts', note: 'Nothing held back.' },
    ],
  },
};

export function bossForAct(act) {
  return Object.values(BOSSES).find((b) => b.act === act) || null;
}
export function getBoss(id) { return BOSSES[id] || null; }
