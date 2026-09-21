/**
 * End-to-end UI checks in real Chromium against the mock API.
 *
 *   python3 tools/mock-api.py 12001 &
 *   python3 tools/serve.py 12000 &
 *   node tests/ui.e2e.mjs
 *
 * These assert on computed styles and service-worker behaviour, which a
 * markup-level check cannot see (e.g. `display:flex` beating [hidden]).
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.env.APP_URL || "http://localhost:12000/";
const API = process.env.API_BASE || "http://localhost:12001";

// Start the static server and mock API unless the caller already has them up.
const servers = [];
function start(args) {
  const p = spawn("python3", args, { cwd: ROOT, stdio: "ignore" });
  servers.push(p);
  return p;
}
async function portUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(700) });
    return res.status > 0;
  } catch {
    return false;
  }
}
if (!(await portUp(APP))) start(["tools/serve.py", "12000"]);
if (!(await portUp(`${API}/api/v1/users/me`)) && !(await portUp(API))) {
  start(["tools/mock-api.py", "12001"]);
}
for (let i = 0; i < 40; i += 1) {
  if (await portUp(APP)) break;
  await new Promise((r) => setTimeout(r, 250));
}
const shutdown = () => servers.forEach((p) => p.kill());
process.on("exit", shutdown);

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

// Pre-seed settings so the app boots connected.
await page.evaluateOnNewDocument(
  (base) => {
    localStorage.setItem(
      "console.settings.v1",
      JSON.stringify({
        apiKey: "mock-key",
        baseUrl: base,
        liveUpdates: true,
        notify: false,
        sound: false,
        theme: "ink",
      }),
    );
    window.__installPromptFired = false;
    addEventListener("beforeinstallprompt", () => {
      window.__installPromptFired = true;
    });
  },
  API,
);

await page.goto(APP, { waitUntil: "networkidle2" });

// offsetParent is null for position:fixed elements, so test the computed
// display directly instead.
const visible = (sel) =>
  page.$eval(sel, (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  });

console.log(`ui.e2e → ${APP}\n`);

await test("the offline banner stays hidden once the API answers", async () => {
  assert.equal(await visible("#offline-banner"), false);
});

await test("the rail loaded real conversations from the API", async () => {
  const titles = await page.$$eval(".conv", (n) => n.map((e) => e.textContent));
  assert.ok(titles.length >= 3, `expected >=3 conversations, saw ${titles.length}`);
  assert.ok(titles.some((t) => t.includes("PWA")), "sample title present");
});

await test("selecting a conversation renders its transcript", async () => {
  await page.click(".conv");
  await page.waitForSelector(".act, .msg--user", { timeout: 8000 });
  const nodes = await page.$$eval(".act, .msg", (n) => n.length);
  assert.ok(nodes > 3, `transcript has nodes (${nodes})`);
});

await test("a tool row expands to reveal input and output", async () => {
  assert.equal(await page.$eval(".act", (e) => e.dataset.open), undefined, "starts collapsed");
  await page.click(".act__head");
  await page.waitForFunction(
    () => document.querySelector(".act")?.dataset.open === "true",
    { timeout: 5000 },
  );
  const pre = await page.$eval(".act .act__body-inner", (e) => ({
    inputs: e.querySelectorAll("pre.code--in").length,
    outputs: e.querySelectorAll("pre.code--out").length,
  }));
  assert.ok(pre.inputs > 0, "input shown");
  assert.ok(pre.outputs > 0, "output shown");
});

await test("a collapsed row keeps its body out of view", async () => {
  const h = await page.$eval(".act .act__body", (e) => e.getBoundingClientRect().height);
  assert.ok(h < 2, `collapsed body has no height (${h})`);
});

await test("status dots are colour-coded, not uniform", async () => {
  // the status is a coloured dot, so compare background, not text colour
  const colors = await page.$$eval(".conv__status", (n) =>
    [...new Set(n.map((e) => getComputedStyle(e).backgroundColor))],
  );
  assert.ok(colors.length >= 2, `distinct status colours: ${colors.length}`);
});

await test("the filter tabs narrow the list", async () => {
  const all = await page.$$eval(".conv", (n) => n.length);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Done")?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  const done = await page.$$eval(".conv", (n) => n.length);
  assert.ok(done < all, `Done filter narrowed ${all} -> ${done}`);
  assert.ok(done > 0, "but still shows finished tasks");
});

await test("search filters by title", async () => {
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "All")?.click();
  });
  await page.type("#search-input", "incident");
  await new Promise((r) => setTimeout(r, 300));
  const titles = await page.$$eval(".conv", (n) => n.map((e) => e.textContent));
  assert.equal(titles.length, 1, `expected 1 hit, saw ${titles.length}`);
  assert.ok(titles[0].includes("incident"));
  await page.$eval("#search-input", (e) => {
    e.value = "";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

await test("theme toggle switches the palette", async () => {
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(dark, paper, "background changed with the theme");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "ink";
  });
});

await test("the settings sheet opens and closes", async () => {
  await page.evaluate(() => document.querySelector("#settings-button").click());
  await page.waitForSelector("#settings-sheet:not([hidden])", { timeout: 3000 });
  assert.equal(await visible("#settings-sheet"), true);
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await visible("#settings-sheet"), false);
});

await test("the composer sends a message and hits the API", async () => {
  const requests = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /send-message|message/.test(r.url())) requests.push(r.url());
  });
  await page.click("#composer-input");
  await page.type("#composer-input", "Reply with pong only.");
  await page.click("#send-button");
  await new Promise((r) => setTimeout(r, 1200));
  assert.ok(requests.length > 0, `a send request was issued (saw ${requests.length})`);
});

await test("the install prompt is offered when the browser fires beforeinstallprompt", async () => {
  const fired = await page.evaluate(() => !!window.__installPromptFired);
  const shown = await visible("#install-banner");
  assert.equal(fired, true, "chromium fired beforeinstallprompt");
  assert.equal(shown, true, "banner is offered after the event");
});

await test("dismissing the install banner persists the choice", async () => {
  await page.click("#install-dismiss");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await visible("#install-banner"), false, "hidden immediately");
  const stored = await page.evaluate(() => localStorage.getItem("console.install.dismissed"));
  assert.equal(stored, "1", "choice is remembered");
});

await test("the service worker registers and controls the page", async () => {
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, active: !!r.active };
  });
  assert.ok(reg.active, "a SW is active");
  assert.match(reg.scope, /localhost:12000|127\.0\.0\.1:12000/);
});

await test("the shell is precached for offline use", async () => {
  const keys = await page.evaluate(async () => {
    const names = await caches.keys();
    const out = {};
    for (const n of names) out[n] = (await (await caches.open(n)).keys()).map((r) => r.url);
    return out;
  });
  const urls = Object.values(keys).flat();
  for (const needed of ["app.css", "js/app.js", "js/render.js", "manifest.webmanifest"]) {
    assert.ok(
      urls.some((u) => u.endsWith(needed)),
      `${needed} is cached (have: ${urls.length} entries)`,
    );
  }
});

await test("the app still renders with the network cut (offline path)", async () => {
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app", { timeout: 8000 });
  const shell = await page.$eval(".rail, #rail-list", (e) => !!e);
  assert.ok(shell, "rail markup present offline");
  assert.equal(await visible("#offline-banner"), true, "banner tells the user");
  await page.setOfflineMode(false);
});

await test("no uncaught page errors along the way", () => {
  const real = consoleErrors.filter(
    (e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|ERR_FAILED/i.test(e),
  );
  assert.deepEqual(real, []);
});

await test("mobile viewports do not overflow horizontally", async () => {
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
  await mobile.evaluateOnNewDocument((base) => {
    localStorage.setItem(
      "console.settings.v1",
      JSON.stringify({
        apiKey: "mock-key",
        baseUrl: base,
        liveUpdates: false,
        notify: false,
        sound: false,
        theme: "ink",
      }),
    );
  }, API);
  await mobile.goto(APP, { waitUntil: "networkidle2" });
  const r = await mobile.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    rail: document.querySelector("#app")?.dataset.rail,
    toggle: !!document.querySelector("#rail-toggle")?.offsetParent,
  }));
  assert.equal(r.overflow, false, "no horizontal scrollbar on a 390px viewport");
  assert.equal(r.rail, "closed", "rail starts collapsed on mobile");
  assert.equal(r.toggle, true, "the rail toggle is reachable");
  await mobile.close();
});

console.log(`\n${passed} checks passed`);
await browser.close();
