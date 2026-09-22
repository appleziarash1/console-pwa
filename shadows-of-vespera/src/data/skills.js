/** Ability trees. Skill points are earned per level; nodes unlock in sequence. */

export const TREES = [
  {
    id: 'assassin', name: 'ASSASSIN', icon: '🗡',
    nodes: [
      { id: 'silentKill', name: 'Silent Kill', cost: 1, desc: 'Assassinations are always silent.', effect: { silentAssassinate: true } },
      { id: 'fasterAssassination', name: 'Faster Assassination', cost: 1, desc: '+35% assassination speed.', effect: { assassinationSpeed: 0.35 }, requires: 'silentKill' },
      { id: 'airKill', name: 'Air Kill', cost: 2, desc: 'Assassinate from above.', effect: { airAssassinate: true }, requires: 'fasterAssassination' },
      { id: 'chainAssassination', name: 'Chain Assassination', cost: 2, desc: 'Chain to a second nearby unaware target.', effect: { chainAssassinate: 1 }, requires: 'airKill' },
      { id: 'doubleKill', name: 'Double Kill', cost: 3, desc: 'Chain up to three targets.', effect: { chainAssassinate: 2, assassinationDamage: 0.5 }, requires: 'chainAssassination' },
    ],
  },
  {
    id: 'warrior', name: 'WARRIOR', icon: '⚔',
    nodes: [
      { id: 'heavyStrike', name: 'Heavy Strike', cost: 1, desc: '+25% heavy attack damage.', effect: { heavyDamage: 0.25 } },
      { id: 'counter', name: 'Counter', cost: 1, desc: 'Attack out of a parry for bonus damage.', effect: { counterDamage: 0.6 }, requires: 'heavyStrike' },
      { id: 'perfectParry', name: 'Perfect Parry', cost: 2, desc: 'Wider parry window, longer stun.', effect: { parryWindow: 0.12, parryStun: 0.5 }, requires: 'counter' },
      { id: 'armorBreak', name: 'Armor Break', cost: 2, desc: 'Heavy attacks ignore 60% of enemy armor.', effect: { armorPen: 0.6 }, requires: 'perfectParry' },
      { id: 'execution', name: 'Execution', cost: 3, desc: 'Finishers on staggered enemies restore health.', effect: { executionHeal: 18 }, requires: 'armorBreak' },
    ],
  },
  {
    id: 'parkour', name: 'PARKOUR', icon: '🧗',
    nodes: [
      { id: 'fasterClimb', name: 'Faster Climb', cost: 1, desc: '+30% climb speed.', effect: { climbSpeed: 0.30 } },
      { id: 'wallJump', name: 'Wall Jump', cost: 1, desc: 'Kick off walls to reach higher.', effect: { wallJump: true }, requires: 'fasterClimb' },
      { id: 'longJump', name: 'Long Jump', cost: 2, desc: '+18% jump height.', effect: { jumpBonus: 0.18 }, requires: 'wallJump' },
      { id: 'airDash', name: 'Air Dash', cost: 2, desc: 'Dash once while airborne.', effect: { airDash: 1 }, requires: 'longJump' },
      { id: 'recovery', name: 'Ledge Recovery', cost: 2, desc: 'Catch yourself after a fall.', effect: { ledgeRecovery: true, fallDamage: -0.5 }, requires: 'airDash' },
      { id: 'doubleJump', name: 'Double Jump', cost: 3, desc: 'One extra jump in the air.', effect: { doubleJump: 1 }, requires: 'recovery' },
    ],
  },
  {
    id: 'stealth', name: 'STEALTH', icon: '👤',
    nodes: [
      { id: 'fasterHide', name: 'Faster Hide', cost: 1, desc: 'Enter hiding spots instantly.', effect: { hideSpeed: 0.6 } },
      { id: 'reducedDetection', name: 'Reduced Detection', cost: 1, desc: '-25% enemy detection buildup.', effect: { detectionResist: 0.25 }, requires: 'fasterHide' },
      { id: 'silentMovement', name: 'Silent Movement', cost: 2, desc: 'Sprinting is much quieter.', effect: { noise: -0.4 }, requires: 'reducedDetection' },
      { id: 'crowdBlend', name: 'Crowd Blend', cost: 2, desc: 'Crowds hide you even under suspicion.', effect: { crowdBlend: true }, requires: 'silentMovement' },
      { id: 'shadowStep', name: 'Shadow Step', cost: 3, desc: 'Become near-invisible in shadows.', effect: { shadowInvisibility: 0.8 }, requires: 'crowdBlend' },
    ],
  },
  {
    id: 'command', name: 'COMMAND', icon: '🛡',
    nodes: [
      { id: 'recruitAlly', name: 'Recruit Ally', cost: 1, desc: 'Unlock ally recruitment at safehouses.', effect: { recruit: true } },
      { id: 'allyDamage', name: 'Ally Damage', cost: 1, desc: '+25% ally damage.', effect: { allyDamage: 0.25 }, requires: 'recruitAlly' },
      { id: 'allyDefense', name: 'Ally Defense', cost: 2, desc: '+30% ally health.', effect: { allyHealth: 0.30 }, requires: 'allyDamage' },
      { id: 'allyCooldown', name: 'Ally Cooldown', cost: 2, desc: 'Allies act more often.', effect: { allyCooldown: 0.3 }, requires: 'allyDefense' },
      { id: 'multiAllyAttack', name: 'Multi-Ally Attack', cost: 3, desc: 'Take two allies on missions.', effect: { allySlots: 1 }, requires: 'allyCooldown' },
    ],
  },
];

export function findSkill(id) {
  for (const tree of TREES) for (const n of tree.nodes) if (n.id === id) return { node: n, tree };
  return null;
}

export function skillTreeOf(id) {
  const f = findSkill(id);
  return f ? f.tree : null;
}
