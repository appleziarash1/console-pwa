/** Gadgets: throwables and tools usable with the F key / GAD touch button. */

export const GADGETS = {
  smokeBomb: {
    id: 'smokeBomb', name: 'Smoke Bomb', icon: '💨',
    desc: 'Bursts into thick smoke. Breaks line of sight and lets you vanish.',
    price: 60, maxCount: 5, cooldown: 3.5, category: 'stealth',
    effect: { type: 'smoke', radius: 130, duration: 4.2 },
  },
  fireBomb: {
    id: 'fireBomb', name: 'Fire Bomb', icon: '🔥',
    desc: 'Burns an area, damaging anyone caught inside. Loud.',
    price: 120, maxCount: 3, cooldown: 6, category: 'offense',
    effect: { type: 'fire', radius: 110, duration: 5, dps: 14 },
  },
  noiseMaker: {
    id: 'noiseMaker', name: 'Noise Maker', icon: '🔔',
    desc: 'Thrown to a point, it pulls guards toward the sound.',
    price: 45, maxCount: 5, cooldown: 4, category: 'stealth',
    effect: { type: 'distract', radius: 260, duration: 3.5 },
  },
  poisonDart: {
    id: 'poisonDart', name: 'Poison Dart', icon: '🧪',
    desc: 'Disables a target briefly. If nobody sees them fall, nobody knows.',
    price: 100, maxCount: 4, cooldown: 5, category: 'stealth',
    effect: { type: 'poison', radius: 0, duration: 6 },
  },
  ropeHook: {
    id: 'ropeHook', name: 'Rope Hook', icon: '🪝',
    desc: 'Grapple to a distant ledge. Opens the rooftop route.',
    price: 280, maxCount: 99, cooldown: 1.2, category: 'movement',
    effect: { type: 'grapple', radius: 420, duration: 0 },
  },
  distractionCoin: {
    id: 'distractionCoin', name: 'Distraction Coin', icon: '🪙',
    desc: 'Bounce a coin down an alley. People look; you move.',
    price: 20, maxCount: 12, cooldown: 1, category: 'stealth',
    effect: { type: 'distract', radius: 180, duration: 3 },
  },
};

export const GADGET_ORDER = ['smokeBomb', 'noiseMaker', 'distractionCoin', 'poisonDart', 'fireBomb', 'ropeHook'];

export function getGadget(id) { return GADGETS[id] || null; }
