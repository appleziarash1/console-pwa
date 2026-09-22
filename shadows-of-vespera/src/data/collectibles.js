/** Collectibles, lore entries, achievements and the codex. */

export const COLLECTIBLE_TYPES = {
  fragment:  { id: 'fragment',  name: 'Memory Fragment',    icon: '◆', color: '#6fc3d6', desc: 'A scrap of Kael\u2019s past recovered from the city.' },
  letter:    { id: 'letter',    name: 'Hidden Letter',      icon: '✉', color: '#e8e0cf', desc: 'Correspondence the Council failed to burn.' },
  ancientCoin:{ id: 'ancientCoin', name: 'Ancient Coin',    icon: '⛁', color: '#f0cf6b', desc: 'Minted before Vespera had its walls.' },
  document:  { id: 'document',  name: 'Lost Document',      icon: '📜', color: '#c9a227', desc: 'Paperwork that was never meant to surface.' },
  symbol:    { id: 'symbol',    name: 'Resistance Symbol',  icon: '❖', color: '#d94138', desc: 'A Hand marker left for whoever came next.' },
  artifact:  { id: 'artifact',  name: 'Historical Artifact',icon: '☗', color: '#5aa86a', desc: 'Something older than the occupation. Much older.' },
};

export const CODEX = {
  vespera: { title: 'VESPERA', body: 'A free trading city that the Dominion annexed over eleven years. Its districts were wealthy enough to be worth taking and proud enough to resist.' },
  dominion: { title: 'THE DOMINION', body: 'The military government of Vespera. Publicly it is the state. Privately it answers to the Veil Council.' },
  veiledHand: { title: 'THE VEILED HAND', body: 'A resistance organisation founded a generation ago. Its founders understood that fighting the Dominion in the open was suicide. They chose the shadow instead.' },
  gildedCircle: { title: 'THE GILDED CIRCLE', body: 'Merchants and political elites whose money funds the occupation. They prefer ledgers to swords.' },
  ashenBrotherhood: { title: 'THE ASHEN BROTHERHOOD', body: 'Criminals who will sell you anything, including information about the Dominion. They have no loyalty except to profit.' },
  veilCouncil: { title: 'THE VEIL COUNCIL', body: 'Six figures who control the Dominion, the Circle, the Cathedral and the army from behind every throne in Vespera. Their names appear in no document, except one.' },
  caelVaren: { title: 'CAEL VAREN', body: 'A courier who became a founder of the Veiled Hand. He discovered the Council and vanished below the city. The Dominion has hunted him for fourteen years without success.' },
  kaelVaren: { title: 'KAEL VAREN', body: 'Courier, then operative. Calm under pressure, occasionally sarcastic, and motivated by a single unanswered question about his family.' },
  theTunnels: { title: 'THE TUNNELS', body: 'A network of passages beneath Vespera older than the city itself. The Council believes them sealed. They are not.' },
  theLostCity: { title: 'THE LOST CITY', body: 'Beneath the tunnels, below the catacombs, there are streets. Nothing about them matches Vesperan architecture. Nobody official admits they exist.' },
  theEmptyThrone: { title: 'THE EMPTY THRONE', body: 'A chamber built to seat a ruler whose name was deliberately removed from the stone. The inscription is in a language the Hand cannot read.' },
  theVoidBlade: { title: 'THE VOID BLADE', body: 'A weapon recovered from the Lost City. It does not reflect light, and its wounds do not close properly.' },
  masterAssassin: { title: 'MASTER ASSASSIN', body: 'A discipline older than the Hand. Its practitioners hold that a city is a living thing and a blade is only one of many ways to open it.' },
};

export const ACHIEVEMENTS = [
  { id: 'firstBlood', name: 'First Blood', desc: 'Complete your first assassination.', icon: '🗡' },
  { id: 'ghost', name: 'Ghost', desc: 'Complete any mission fully undetected.', icon: '👁' },
  { id: 'masterAssassin', name: 'Master Assassin', desc: 'Earn an S rank on any mission.', icon: '❖' },
  { id: 'rooftopRunner', name: 'Rooftop Runner', desc: 'Travel 5,000 metres across rooftops.', icon: '🏃' },
  { id: 'liberator', name: 'Liberator', desc: 'Liberate your first district from Dominion control.', icon: '⚑' },
  { id: 'shadow', name: 'Shadow', desc: 'Assassinate 25 enemies.', icon: '🎭' },
  { id: 'perfectMission', name: 'Perfect Mission', desc: 'Complete a mission with every optional objective.', icon: '★' },
  { id: 'untouchable', name: 'Untouchable', desc: 'Complete a mission without taking damage.', icon: '🛡' },
  { id: 'collector', name: 'Collector', desc: 'Find 50 collectibles.', icon: '◆' },
  { id: 'masterOfVespera', name: 'Master of Vespera', desc: 'Liberate every district.', icon: '👑' },
  { id: 'noKillRuns', name: 'Mercy', desc: 'Complete three missions without killing anyone.', icon: '☮' },
  { id: 'towerClimber', name: 'Tower Climber', desc: 'Disable every watchtower.', icon: '📡' },
  { id: 'saboteur', name: 'Saboteur', desc: 'Complete 10 sabotage objectives.', icon: '💣' },
  { id: 'rescuer', name: 'Rescuer', desc: 'Free 100 prisoners.', icon: '🔓' },
  { id: 'rich', name: 'Deep Pockets', desc: 'Hold 5,000 coins at once.', icon: '⛁' },
  { id: 'armorer', name: 'Armorer', desc: 'Own a complete armor set.', icon: '🎽' },
  { id: 'arsenal', name: 'Arsenal', desc: 'Own every weapon.', icon: '⚔' },
  { id: 'skillMaster', name: 'Skill Master', desc: 'Unlock 20 skills.', icon: '✦' },
  { id: 'recruiter', name: 'Recruiter', desc: 'Recruit 5 allies.', icon: '🛡' },
  { id: 'eliteAlly', name: 'Elite Ally', desc: 'Take an ally to level 5.', icon: '⭐' },
  { id: 'bossSlayer', name: 'Boss Slayer', desc: 'Defeat your first boss.', icon: '☠' },
  { id: 'councilDown', name: 'The Council Falls', desc: 'Defeat all six Council members.', icon: '⚜' },
  { id: 'theEnd', name: 'Liberator of Vespera', desc: 'Complete the main story.', icon: '🌅' },
  { id: 'secretSeeker', name: 'Secret Seeker', desc: 'Find a secret mission.', icon: '🔍' },
  { id: 'voidBlade', name: 'Void Touched', desc: 'Recover the Void Blade.', icon: '❖' },
  { id: 'veiled', name: 'Veiled', desc: 'Complete the Veiled Armor set.', icon: '🎭' },
  { id: 'survivor', name: 'Survivor', desc: 'Complete a mission with 5% health or less.', icon: '❤' },
  { id: 'wanted', name: 'Most Wanted', desc: 'Reach Wanted Level 5.', icon: '★' },
  { id: 'parkour', name: 'Airborne', desc: 'Perform 50 air assassinations.', icon: '🪂' },
  { id: 'secondDawn', name: 'The Second Dawn', desc: 'Reach the secret ending.', icon: '☀' },
];

export function getAchievement(id) { return ACHIEVEMENTS.find((a) => a.id === id) || null; }

/** Stealth rating thresholds, from best to worst. */
export const RATINGS = [
  { grade: 'S', min: 92, color: '#f0cf6b', reward: 1.6 },
  { grade: 'A', min: 78, color: '#6fc3d6', reward: 1.35 },
  { grade: 'B', min: 62, color: '#5aa86a', reward: 1.15 },
  { grade: 'C', min: 42, color: '#e07b2a', reward: 1.0 },
  { grade: 'D', min: 0,  color: '#d94138', reward: 0.85 },
];

export function ratingFor(score) {
  return RATINGS.find((r) => score >= r.min) || RATINGS[RATINGS.length - 1];
}
