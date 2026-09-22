/** Dialogue scripts. Nodes key into NPC conversation and story beats. */

export const DIALOGUE = {
  m03_intro: {
    id: 'm03_intro',
    nodes: {
      start: {
        speaker: 'FENN', portrait: 'F',
        lines: [
          'You\u2019re the courier. The one who keeps surviving.',
          'That mark you found? Don\u2019t say it out loud. Don\u2019t draw it again.',
        ],
        choices: [
          { text: 'Investigate — "Who puts marks like that on a wall?"', goto: 'investigate', effect: { intel: 1 } },
          { text: 'Threaten — "Talk, or I\u2019ll let the guard find you with it."', goto: 'threaten' },
          { text: 'Persuade — "I\u2019m not Dominion. I lost people too."', goto: 'persuade', effect: { relationship: 1 } },
          { text: 'Leave', goto: 'end' },
        ],
      },
      investigate: {
        speaker: 'FENN', portrait: 'F',
        lines: [
          'The Hand. The Veiled Hand. They were here before the Dominion, and they\u2019ll be here after.',
          'They mark doors when someone inside is worth saving. That mark was on your street.',
        ],
        goto: 'end',
      },
      threaten: {
        speaker: 'FENN', portrait: 'F',
        lines: [
          'Then we both die, and you die without the answer.',
          'Try kindness. It\u2019s cheaper than it looks.',
        ],
        goto: 'end',
      },
      persuade: {
        speaker: 'FENN', portrait: 'F',
        lines: [
          '\u2026Yeah. Everyone here has.',
          'Go to the night market. Ask for the fence with the burned hand. Say the mark out loud once, and only once.',
        ],
        goto: 'end',
      },
      end: { speaker: 'FENN', portrait: 'F', lines: ['Move fast. The patrol changes at the second bell.'], end: true },
    },
  },

  m04_intro: {
    id: 'm04_intro',
    nodes: {
      start: {
        speaker: 'KAEL', portrait: 'K',
        lines: [
          'Officer Havel. Four couriers, one square, and a rope he\u2019s proud of.',
          'He drinks alone at the fountain after the second patrol. He always does.',
        ],
        choices: [
          { text: 'Wait for him on the watchtower ledge.', goto: 'ledge' },
          { text: 'Walk the square and take him head-on.', goto: 'direct' },
        ],
      },
      ledge: {
        speaker: 'KAEL', portrait: 'K',
        lines: ['High ground, one guard below, and a fall he won\u2019t survive. Good.'],
        end: true, setApproach: 'stealth',
      },
      direct: {
        speaker: 'KAEL', portrait: 'K',
        lines: ['Four guards, one officer, and a square full of civilians. Fine. Faster, at least.'],
        end: true, setApproach: 'combat',
      },
    },
  },

  m05_safehouse: {
    id: 'm05_safehouse',
    nodes: {
      start: {
        speaker: 'LEADER', portrait: 'L',
        lines: [
          'You killed Draeven\u2019s officer.',
          'Good. That wasn\u2019t the difficult part.',
        ],
        choices: [
          { text: '"What was?"', goto: 'what' },
          { text: '"I didn\u2019t come here to be tested."', goto: 'tested' },
        ],
      },
      what: {
        speaker: 'LEADER', portrait: 'L',
        lines: [
          'Havel knew your father\u2019s name. He said it out loud in the square, twice.',
          'You were never told the truth about your family.',
        ],
        goto: 'listen',
      },
      tested: {
        speaker: 'LEADER', portrait: 'L',
        lines: [
          'No. You came here because the Dominion took everyone you had, and you want to know why.',
          'Sit down. I\u2019ll tell you what I know.',
        ],
        goto: 'listen',
      },
      listen: {
        speaker: 'LEADER', portrait: 'L',
        lines: [
          'Your father was one of the founders of the Veiled Hand.',
          'He did not disappear because he was arrested. He disappeared because of what he found.',
        ],
        end: true,
        effect: { intel: 2, story: 'fatherFounder' },
      },
    },
  },

  boss_draeven: {
    id: 'boss_draeven',
    nodes: {
      start: {
        speaker: 'CAPTAIN DRAEVEN', portrait: 'D',
        lines: [
          'The courier. I wondered which of the thirty would bring you.',
          'Your father begged better than you\u2019ll manage. He still ended up in the ground.',
        ],
        choices: [
          { text: '"Say his name again."', goto: 'name' },
          { text: '(Draw the blade.)', goto: 'fight' },
        ],
      },
      name: {
        speaker: 'CAPTAIN DRAEVEN', portrait: 'D',
        lines: [
          'Varen. Kael Varen, son of Cael Varen, traitor.',
          'I memorised it. I memorise all the important ones.',
        ],
        goto: 'fight',
      },
      fight: { speaker: 'CAPTAIN DRAEVEN', portrait: 'D', lines: ['Come on then, courier. Let\u2019s see what he taught you.'], end: true, startBoss: 'draeven' },
    },
  },

  boss_varra: {
    id: 'boss_varra',
    nodes: {
      start: {
        speaker: 'INQUISITOR VARRA', portrait: 'V',
        lines: [
          'You burned my depot. You emptied my prison. You are becoming a filing problem.',
          'Your father was a filing problem too. He took longer to solve.',
        ],
        choices: [
          { text: '"You have his file?"', goto: 'file' },
          { text: '(Set the archive alight.)', goto: 'fight' },
        ],
      },
      file: {
        speaker: 'INQUISITOR VARRA', portrait: 'V',
        lines: [
          'I wrote it. Every line. He was the best of them, and I was proud of that entry.',
          'You will not get to read it.',
        ],
        goto: 'fight',
      },
      fight: { speaker: 'INQUISITOR VARRA', portrait: 'V', lines: ['Come. Let\u2019s see if you burn as well as he did.'], end: true, startBoss: 'varra' },
    },
  },

  boss_caldris: {
    id: 'boss_caldris',
    nodes: {
      start: {
        speaker: 'LORD CALDRIS', portrait: 'C',
        lines: [
          'Ah. The courier with opinions.',
          'Do you know what the Dominion costs me per month? Less than my stables. Do you know what it returns? Everything.',
        ],
        choices: [
          { text: '"You funded the purge."', goto: 'purge' },
          { text: '"How much would you pay to live?"', goto: 'bribe' },
        ],
      },
      purge: {
        speaker: 'LORD CALDRIS', portrait: 'C',
        lines: ['I fund order. Order purges. I do not sign the lists — I only pay for the pens.'],
        goto: 'fight',
      },
      bribe: {
        speaker: 'LORD CALDRIS', portrait: 'C',
        lines: [
          'More than you can imagine. Name it. A district? A title? Your father\u2019s grave, better kept?',
          'No? Then we do this the other way.',
        ],
        goto: 'fight',
      },
      fight: { speaker: 'LORD CALDRIS', portrait: 'C', lines: ['Guards! Kill this one slowly — I want to watch.'], end: true, startBoss: 'caldris' },
    },
  },

  m24_reveal: {
    id: 'm24_reveal',
    nodes: {
      start: {
        speaker: 'KAEL', portrait: 'K',
        lines: [
          'Purge file. Column four: "Security Risk — Veiled Hand, founding circle."',
          'Name: Cael Varen. Status: at large. Last seen: below the city.',
        ],
        choices: [
          { text: '"At large. He wasn\u2019t executed."', goto: 'alive' },
          { text: '"Below the city \u2014 the tunnels."', goto: 'tunnels' },
        ],
      },
      alive: {
        speaker: 'KAEL', portrait: 'K',
        lines: [
          'Fourteen years. Fourteen years of thinking I was the last one.',
          'The Dominion has been hunting him the whole time, and they never caught him.',
        ],
        goto: 'end',
      },
      tunnels: {
        speaker: 'KAEL', portrait: 'K',
        lines: [
          'The old tunnel network. The ones he used to map for the couriers.',
          'He\u2019s been down there. I know where to start.',
        ],
        goto: 'end',
      },
      end: { speaker: 'KAEL', portrait: 'K', lines: ['One more thing the Dominion doesn\u2019t know: I\u2019m not the only Varen left.'], end: true, effect: { intel: 3 } },
    },
  },

  m26_truth: {
    id: 'm26_truth',
    nodes: {
      start: {
        speaker: 'THE OLD MASTER', portrait: 'M',
        lines: [
          'You have your father\u2019s way of standing in a doorway. Waiting to be seen, hoping not to be.',
          'Sit. You have questions, and I am old, so we only have time for the good ones.',
        ],
        choices: [
          { text: '"Who is the Veil Council?"', goto: 'council' },
          { text: '"Is my father alive?"', goto: 'father' },
          { text: '"Why did the Hand abandon him?"', goto: 'abandon' },
        ],
      },
      council: {
        speaker: 'THE OLD MASTER', portrait: 'M',
        lines: [
          'Six people. No names in any record, no faces in any portrait. Dominion, Circle, Church, Army — all rows in the same ledger.',
          'Your father found the ledger. That is the whole of it.',
        ],
        goto: 'end',
      },
      father: {
        speaker: 'THE OLD MASTER', portrait: 'M',
        lines: [
          'I believe so. I believe that is worse news than the alternative, and I am sorry for that.',
          'He went below, to the empty throne, to read what the Council came from.',
        ],
        goto: 'end',
      },
      abandon: {
        speaker: 'THE OLD MASTER', portrait: 'M',
        lines: [
          'We did not abandon him. He walked out of our reach, and then a traitor sold the rendezvous.',
          'The traitor is still walking around in this city. You will meet them soon.',
        ],
        goto: 'end',
      },
      end: { speaker: 'THE OLD MASTER', portrait: 'M', lines: ['The Council knows you exist now. There is no version of this where you get to be careful.'], end: true, effect: { intel: 4 } },
    },
  },

  m29_veilCouncil: {
    id: 'm29_veilCouncil',
    nodes: {
      start: {
        speaker: 'KAEL', portrait: 'K',
        lines: [
          'The Dominion was never the enemy. It was the visible half.',
          'The Veil Council ran the occupation, the Circle, the Church, and the army. And my father wrote their names down.',
        ],
        choices: [
          { text: 'Read the list aloud.', goto: 'list' },
          { text: 'Pocket the list and go.', goto: 'go' },
        ],
      },
      list: {
        speaker: 'KAEL', portrait: 'K',
        lines: [
          'The Strategist. The Banker. The Inquisitor. The Architect. The Spymaster.',
          'And the Chancellor. Seradin.',
        ],
        goto: 'end',
      },
      go: {
        speaker: 'KAEL', portrait: 'K',
        lines: ['Six names. Six districts. One night at a time.'],
        goto: 'end',
      },
      end: { speaker: 'KAEL', portrait: 'K', lines: ['Father, if you\u2019re down there — I\u2019m coming the long way.'], end: true, effect: { intel: 5 } },
    },
  },

  final_duel: {
    id: 'final_duel',
    nodes: {
      start: {
        speaker: 'CHANCELLOR SERADIN', portrait: 'S',
        lines: [
          'Kael Varen. You look like the portrait of your father I keep in a drawer.',
          'He made it to this room, you know. He stood exactly there. He had the same expression.',
        ],
        choices: [
          { text: '"What did you do to him?"', goto: 'what' },
          { text: '"He walked out. I\u2019m walking through."', goto: 'through' },
        ],
      },
      what: {
        speaker: 'CHANCELLOR SERADIN', portrait: 'S',
        lines: [
          'Nothing. That is the thing you will not believe: I offered him everything and he simply left.',
          'He said Vespera was never the whole battlefield. I have spent twenty years finding out he was right.',
        ],
        goto: 'fight',
      },
      through: {
        speaker: 'CHANCELLOR SERADIN', portrait: 'S',
        lines: [
          'Yes. That is exactly what he said.',
          'And the city will do to you exactly what it did to him. Come. Let me demonstrate.',
        ],
        goto: 'fight',
      },
      fight: { speaker: 'CHANCELLOR SERADIN', portrait: 'S', lines: ['Raise your blade, heir of Varen.'], end: true, startBoss: 'seradin' },
    },
  },

  // Ambient NPC barks
  npc_civilian: ['Move along, friend.', 'Curfew\u2019s in an hour.', 'You didn\u2019t see me.', 'Prices are worse than the raids.', 'Keep your hood up.'],
  npc_guard: ['Move!', 'Hold there.', 'Nothing to see.', 'Back to your homes.', 'Curfew. Now.'],
  npc_child: ['Are you a soldier?', 'Mama says don\u2019t talk to hoods.', 'Do you have a coin?'],
  npc_beggar: ['A coin, hooded one?', 'The well\u2019s dry and the guards are thirsty.', 'They took my stall.'],
  npc_merchant: ['Fine blades, best price in the district!', 'You look like you need better boots.', 'No credit. Ever.'],
  npc_scholar: ['The archives are closed to the public.', 'History is written by whoever is still standing.', 'There were ten districts always. Ask why.'],
  npc_recruit: ['You\u2019re Hand?', 'I can fight. Give me a reason.', 'I\u2019ve been waiting for someone like you.'],
};

export function getDialogue(id) { return DIALOGUE[id] || null; }
