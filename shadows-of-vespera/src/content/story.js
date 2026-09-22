/**
 * Story content: cutscenes, act transitions, endings, and the post-credits stinger.
 * Kept separate from the mission data so narrative text is easy to rewrite.
 */

export const CUTSCENES = {
  prologue: {
    title: 'VESPERA — FOURTEEN YEARS AGO',
    lines: [
      { text: 'The Dominion came quietly first. A garrison. A curfew. A list.', style: 'strong' },
      'Then they came loudly: public hangings in the Old Quarter square, at dawn, on schedule.',
      'They took Kael\u2019s family on a Tuesday. Nobody wrote down why.',
      { text: 'He was ten years old and he has been counting the days since.', style: 'whisper' },
    ],
    mood: 'story',
  },
  act1: {
    title: 'ACT I — THE SPARK',
    lines: [
      'A courier runs packages across a city he no longer trusts.',
      'The Dominion owns the streets. The Veiled Hand lives in the gaps.',
      { text: 'Tonight, the gap is exactly one roof wide.', style: 'whisper' },
    ],
    mood: 'exploration',
  },
  act2: {
    title: 'ACT II — THE RESISTANCE',
    lines: [
      { text: 'Kael joins the Veiled Hand.', style: 'strong' },
      'Liberate districts. Break watchtowers. Starve the Dominion of information.',
      'The Hand does not win fights. It wins silences.',
    ],
    mood: 'stealth',
  },
  act3: {
    title: 'ACT III — THE GILDED CIRCLE',
    lines: [
      'Gold does not fight. Gold pays for the fighting.',
      'The merchants of the Circle fund the occupation and call it order.',
      { text: 'Follow the money until it stops moving. Then kill whoever is holding it.', style: 'whisper' },
    ],
    mood: 'story',
  },
  act4: {
    title: 'ACT IV — THE TRUTH',
    lines: [
      'Kael\u2019s father was not a victim. He was a founder.',
      'He did not disappear because the Dominion caught him.',
      { text: 'He disappeared because he found something above them.', style: 'strong' },
      'The Dominion was only ever the public face.',
      { text: 'THE VEIL COUNCIL.', style: 'whisper' },
    ],
    mood: 'story',
  },
  act5: {
    title: 'ACT V — THE VEIL COUNCIL',
    lines: [
      'Six names. Six districts. Six fortresses.',
      'The Strategist. The Banker. The Inquisitor. The Architect. The Spymaster.',
      { text: 'And the Chancellor.', style: 'strong' },
      'The city has been governed from the shadows for a generation.',
    ],
    mood: 'boss',
  },
  act6: {
    title: 'ACT VI — FALL OF VESPERA',
    lines: [
      'The Council knows. The curfew becomes martial law.',
      'The resistance is exposed, the gates are locked, the artillery is sighted.',
      { text: 'One night. Everything.', style: 'whisper' },
    ],
    mood: 'chase',
  },
  ending: {
    title: 'DAWN',
    lines: [
      'Seradin falls. The bells ring, and they are not for him.',
      'The gates open. The prisoners walk out into rain that feels like permission.',
      'Kael finds a letter in the throne room — old paper, his father\u2019s hand.',
      { text: '"If you found this, then you have already walked farther than I ever could."', style: 'strong' },
      { text: '"Vespera was never the whole battlefield."', style: 'strong' },
    ],
    mood: 'victory',
  },
  postCredits: {
    title: '',
    lines: [
      'A distant city. Different walls, different bells.',
      'A masked figure reads a letter by candlelight.',
      { text: '"The heir has awakened."', style: 'whisper' },
    ],
    mood: 'story',
  },
  secretEnding: {
    title: 'THE SECOND DAWN',
    lines: [
      'The Pale Assassin\u2019s mask cracks and there is nothing human behind it.',
      'Kael takes the Void Blade from the floor of the Lost City.',
      'Above him, two thousand years of Vespera are a ceiling of stone.',
      { text: 'The war was never in the city. The city was the door.', style: 'strong' },
      { text: 'THE SECOND DAWN begins.', style: 'whisper' },
    ],
    mood: 'victory',
  },
};

export const ACT_TRANSITIONS = { 1: 'act1', 2: 'act2', 3: 'act3', 4: 'act4', 5: 'act5', 6: 'act6' };

export const LETTER_FROM_FATHER = `If you found this, then you have already walked farther than I ever could.

Do not grieve for me. I have been below the city, reading what it was built on. The Council is not a government. It is a habit — a way for a small number of people to keep a large number of people tired.

I found the ledger. I wrote down six names and then I ran, because writing down a name is the only weapon they have never learned to defend against.

You are better at this than I was. You always were quieter.

Vespera was never the whole battlefield.

— C. Varen`;

export const FINAL_LETTER = `If you found this, then you have already walked farther than I ever could.

Vespera was never the whole battlefield.`;

/** Intro boot sequence lines while assets initialise. */
export const BOOT_LINES = [
  'Waking the city…',
  'Raising the Old Quarter…',
  'Posting the Dominion watch…',
  'Hiding the Veiled Hand…',
  'Lighting the lamps…',
  'Sharpening the blade…',
];

export function getCutscene(id) { return CUTSCENES[id] || null; }
