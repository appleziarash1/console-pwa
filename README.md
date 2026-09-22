# Console — OpenHands, anywhere

An installable Progressive Web App for OpenHands Cloud. It does one thing well:
you open it, see your agents, send a message, and close it. No tab hunting, no
re-login dance, no app store.

Talk to it in **English or Bangla** — the UI is built with `Anek Bangla` among its
fonts, and the transcript renders both cleanly.

---

## Quickstart (বাংলা)

```bash
npm install          # jsdom + puppeteer-core, শুধু টেস্টের জন্য
npm run serve        # http://localhost:12000
```

তারপর ব্রাউজারে `http://localhost:12000` খুলুন, **Connect account** চাপুন, আর
আপনার OpenHands Cloud API key বসান। ইনস্টল করতে অ্যাড্রেস বারের পাশে
**Install** আইকনে চাপুন — হোম স্ক্রিনে অ্যাপ হিসেবে বসে যাবে।

> API key কোথায় পাবেন: OpenHands Cloud → Settings → API Keys.

---

## Quickstart (English)

```bash
npm install
npm run serve            # static server on :12000
npm run mock             # optional: fake API on :12001, no key needed
```

Open <http://localhost:12000>, hit **Connect account**, and paste an OpenHands
Cloud API key. Use the browser's install affordance (or the in-app **Install**
banner) to add it to your dock/home screen.

To develop the UI without a real key, run `npm run mock` and set the API base URL
to `http://localhost:12001` with any key value.

---

## What it does

- **Your tasks, one list.** Running / Done filters, search, and colour-coded
  status dots so you can see at a glance what is still working.
- **A readable transcript.** Thinking blocks are collapsed, tool calls get one
  compact row each (input + output on expand), failures are flagged, and markdown
  — including tables and code fences — renders properly.
- **Live updates.** Polls the conversation list and the open transcript, pausing
  while the tab is hidden.
- **Reply from anywhere.** The composer posts a message straight to the agent.
- **Works offline.** The app shell is precached, so it opens instantly and still
  shows the last transcript it saw when the network drops.
- **Installable.** Proper manifest, maskable icons, standalone display, app
  shortcuts, and a themed status bar.

## API key handling

The key lives in `localStorage` on your device and is sent only to the API base
URL you configure (default `https://app.all-hands.dev/api/v1`). It never leaves
the browser except to that host. **Forget** in settings clears it.

This is a client-side app; treat the key like a password. Do not deploy it
somewhere untrusted, and prefer a key with the narrowest scope available.

## Layout

```
src/
  index.html              app shell
  app.css                 warm ink & amber theme (ink + paper palettes)
  manifest.webmanifest    installability
  sw.js                   precache shell, never cache API traffic
  js/app.js               boot, state, rail, transcript, composer, install
  js/api.js               OpenHands Cloud V1 client + error mapping
  js/render.js            event → DOM (tool rows, thinking, messages)
  js/markdown.js          dependency-free markdown → HTML
  js/config.js            settings, persistence, theme
tools/
  serve.py                static server with PWA-correct headers
  mock-api.py             fixture-backed fake API for offline UI work
  make-icons.py           regenerate icons
  fetch-fonts.py          self-host the webfonts
tests/
  render.test.mjs         jsdom renderer units
  ui.e2e.mjs              real Chromium: layout, SW, offline, install
  api.live.mjs            live checks against the real Cloud API
```

## Tests

```bash
npm test            # renderer + browser end-to-end
npm run test:api    # live Cloud API round-trip (needs a key)
```

`ui.e2e.mjs` starts its own server and mock API if they are not already
running, and asserts on computed styles — which is how the
`display:flex`-beats-`[hidden]` class of bug gets caught.

## Deploying it permanently

The app is pure static files, so hosting is a copy — no build step. GitHub Pages
is the free option with HTTPS and a stable URL.

**One-time setup** (~2 minutes, has to happen once from your account because the
repo does not exist yet):

1. Create the repo: <https://github.com/new> → name it `console-pwa` → **Public** →
   *do not* add a README.
2. From this folder, push it:

   ```bash
   git remote add origin https://github.com/appleziarash1/console-pwa.git
   git push -u origin main
   ```

3. In the repo: **Settings → Pages → Source → GitHub Actions**. Nothing to
   configure otherwise; `.github/workflows/pages.yml` handles the rest.

Your app then lives at **<https://appleziarash1.github.io/console-pwa/>** and
updates itself on every push to `main`.

If you have a token that can create repos (classic PAT with `repo` + `workflow`),
the whole thing collapses to one command:

```bash
GH_PAT=ghp_... ./tools/deploy.sh
```

Any other static host works too — Netlify, Cloudflare Pages, Vercel — just point
it at `src/` as the publish directory.

## Notes

- The app shell is served over HTTPS by the work-* host, so the service worker
  and install prompt are available in production. On plain `localhost` it also
  counts as a secure context.
- `sw.js` and the manifest are served `no-store`, and same-origin assets are
  network-first with a cache fallback, so a redeploy takes effect on the next
  load instead of being pinned by a stale cache.
