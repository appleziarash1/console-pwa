# AGENTS.md

## What this is

Console — a dependency-free, installable PWA front end for OpenHands Cloud.
Plain ES modules + one CSS file. No build step, no framework, no bundler.
`src/` is served directly.

## Commands

```bash
npm install
npm run serve        # static server, http://localhost:12000 (tools/serve.py)
npm run mock         # fixture-backed fake API, http://localhost:12001
npm test             # renderer units + real-Chromium e2e
npm run test:api     # live checks against https://app.all-hands.dev (needs a key)
```

`tests/ui.e2e.mjs` spawns its own server and mock API if the ports are free, so
`node tests/ui.e2e.mjs` works standalone. It uses system Chromium at
`/usr/bin/chromium` via `puppeteer-core`.

## Conventions

- Modules are ES modules (`"type": "module"`); tests are `*.mjs`.
- All data access goes through `src/js/api.js`; UI code must not `fetch` directly.
- Rendering goes through `src/js/render.js`, which returns DOM nodes; it must
  escape text (never `innerHTML` with agent output). `markdown.js` is
  dependency-free on purpose.
- Any state toggled by the `hidden` attribute must have an explicit
  `[hidden] { display: none !important }` in CSS. A `display: flex/grid` rule
  silently overrides the attribute and the element never disappears — this has
  caused a real bug here.

## Gotchas

- Never cache API traffic in `sw.js`. `isApi()` matches `/api/` on our own
  origin, and treats *other* `*.all-hands.dev` hosts as API — but it must not
  treat our own origin as API, or nothing gets cached offline.
- Same-origin assets are network-first with a cache fallback, so redeploys are
  picked up on the next load. Bump `VERSION` in `sw.js` when changing strategy.
- `offsetParent` is null for `position: fixed` elements; compute `display`
  instead when testing visibility of sheets/banners.
- `evaluateOnNewDocument` re-runs on every navigation — guard localStorage
  seeding so a reload does not clobber state under test.
- Throwing requests must surface as a friendly `ApiError` with `status === 0`
  for network failures; `connect()` flags offline on that, not on
  `navigator.onLine`.
