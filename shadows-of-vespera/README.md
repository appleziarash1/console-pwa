# Shadows of Vespera

A self-contained 2D browser stealth-action game. No build step, no bundler —
serve the folder and play.

**Play:** https://appleziarash1.github.io/console-pwa/shadows-of-vespera/

## Running locally

Any static server works:

```bash
npx serve .
# or
python3 -m http.server
```

A server is needed rather than opening the file directly, because the game
loads ES modules, which `file://` blocks.

## What's in it

- **Movement / parkour** — walk, sprint, jump, double jump, wall jump, ledge
  grab/climb, ropes, ziplines, ladders, trellises, drop, roll, air dash.
- **Stealth** — vision cones, hearing, detection meter (safe → suspicious →
  alert → combat), hiding in grass/shadows/crowds/hide spots, weather and
  day/night modifiers.
- **Assassination** — front, rear, air, ledge, hidden, sprint and rope variants,
  with counter-assassination against alerted enemies.
- **Combat** — light/heavy attacks, combos, block, parry, dodge, counter,
  stagger, finishers, and 8+ enemy archetypes that telegraph their attacks.
- **RPG systems** — XP and levels, five ability trees, weapons, armor sets,
  gadgets, shops, recruits/allies, quests, and dialogue with choices.
- **World** — 10 districts (including a generated Underground), watchtowers with
  map reveal and fast travel, district liberation, wanted level, weather.
- **Missions** — 30+ story missions across 6 acts with optional objectives and
  stealth ratings (S–D), plus 5 bosses and secret content.
- **Save system** — slot-based saves plus autosave, achievements, collectibles.

## Layout

```
index.html            entry point
styles/               base, hud, menus
src/
  main.js             Game orchestrator: loop, state machine, save/load
  engine/             input, camera, audio, particles, save, math utils
  entities/           player, enemy, boss, npc
  world/              world.js (runtime) + worldBuilder.js (generation)
  systems/            renderer, stealth, missions, progression
  ui/                 hud, screens (menus, dialogue, shop, map)
  data/               districts, missions, enemies, weapons, armor, skills...
  content/            story cutscenes and dialogue
tools/                smoketest.mjs, browsertest.mjs, livetest.mjs
```

## Tests

```bash
node tools/smoketest.mjs    # headless logic and generation checks
node tools/browsertest.mjs  # Playwright: boots the real page and plays it
node tools/livetest.mjs     # Playwright against the deployed URL
```

Playwright is the only dependency (`npm i`).
