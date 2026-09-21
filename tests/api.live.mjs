/**
 * Integration check for src/js/api.js against the real OpenHands Cloud API.
 *
 * Run:  OPENHANDS_CLOUD_API_KEY=... node tests/api.live.mjs
 * Needs network + a valid key. Read-only: it never starts a conversation
 * unless you pass --start.
 *
 * The point is to prove the client's request shaping, pagination, and error
 * mapping work against the live service rather than a mock.
 */

import assert from "node:assert/strict";

const KEY = process.env.OPENHANDS_CLOUD_API_KEY || process.env.OPENHANDS_API_KEY || "";
if (!KEY) {
  console.error("Set OPENHANDS_CLOUD_API_KEY (or OPENHANDS_API_KEY) first.");
  process.exit(2);
}

/* --- minimal browser shims so config.js can run under node --- */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { documentElement: { dataset: {} } };

const cfg = await import("../src/js/config.js");
const api = await import("../src/js/api.js");
const { ApiError } = api;

cfg.saveSettings({ apiKey: KEY, baseUrl: cfg.DEFAULT_BASE });

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

console.log(`api.js → ${cfg.normalizeBase(cfg.settings().baseUrl)}\n`);

await test("whoami returns the account and an org id", async () => {
  const me = await api.whoami();
  assert.ok(me.email, "has an email");
  assert.ok(me.org_id, "has an org_id");
  globalThis.__me = me;
});

await test("listConversations returns shaped records", async () => {
  const items = await api.listConversations({ limit: 5 });
  assert.ok(Array.isArray(items));
  if (items.length) {
    const c = items[0];
    for (const field of ["id", "title", "execution_status", "updated_at"]) {
      assert.ok(field in c, `record has ${field}`);
    }
  }
  globalThis.__sample = items[0];
});

await test("getConversations batch-fetches by id", async () => {
  const sample = globalThis.__sample;
  if (!sample) return; // no conversations on this account
  const [conv] = await api.getConversations([sample.id]);
  assert.equal(conv.id, sample.id);
});

await test("allEvents pages through a real transcript", async () => {
  const sample = globalThis.__sample;
  if (!sample) return;
  const events = await api.allEvents(sample.id, { maxPages: 3 });
  assert.ok(Array.isArray(events));
  globalThis.__events = events;
});

await test("events contain the kinds the renderer depends on", async () => {
  const events = globalThis.__events || [];
  if (!events.length) return;
  const kinds = new Set(events.map((e) => e.kind));
  assert.ok(kinds.size > 0);
  const paired =
    kinds.has("ActionEvent") && events.some((e) => e.kind === "ObservationEvent");
  if (kinds.has("ActionEvent")) assert.ok(paired, "actions come with observations");
});

await test("a malformed key surfaces as a clean 401 ApiError", async () => {
  cfg.saveSettings({ apiKey: "oh-definitely-not-valid" });
  await assert.rejects(
    () => api.whoami(),
    (err) => {
      assert.ok(err instanceof ApiError, "is an ApiError");
      assert.equal(err.status, 401);
      assert.ok(err.message.length > 0, "has a human message");
      assert.ok(!err.message.includes("oh-definitely"), "never echoes the key");
      return true;
    },
  );
  cfg.saveSettings({ apiKey: KEY });
});

await test("an unreachable base URL becomes a friendly network error", async () => {
  cfg.saveSettings({ baseUrl: "https://127.0.0.1:1" });
  await assert.rejects(
    () => api.whoami(),
    (err) => {
      assert.equal(err.status, 0);
      assert.match(err.message, /reach the API/i);
      return true;
    },
  );
  cfg.saveSettings({ baseUrl: cfg.DEFAULT_BASE });
});

await test("trailing slashes in the base URL are normalised", async () => {
  cfg.saveSettings({ baseUrl: "https://app.all-hands.dev///" });
  const me = await api.whoami();
  assert.ok(me.email);
  cfg.saveSettings({ baseUrl: cfg.DEFAULT_BASE });
});

await test("an unknown conversation yields an empty transcript, not an error", async () => {
  // the API answers 200 with no items, so the UI can show an empty state
  const events = await api.allEvents("00000000-0000-0000-0000-000000000000", { maxPages: 1 });
  assert.deepEqual(events, []);
  const found = await api.getConversations(["00000000-0000-0000-0000-000000000000"]);
  assert.deepEqual(found, [], "missing ids are filtered out of the batch result");
});

if (process.argv.includes("--start")) {
  console.log("\n(creating a real conversation — this costs money)");
  await test("startConversation + pollStartTask + sendMessage round-trip", async () => {
    const task = await api.startConversation({
      message: "Reply with exactly: pong. Do not use any tools.",
      title: "Console PWA integration probe",
    });
    assert.ok(task.id, "start task returned an id");
    const ready = await api.pollStartTask(task.id, { maxMs: 240000, intervalMs: 3000 });
    assert.ok(ready.app_conversation_id, "sandbox became READY");
    const cid = ready.app_conversation_id;
    console.log(`      conversation ${cid}`);

    await api.sendMessage(cid, "Now reply with exactly: ping. No tools.", { run: true });
    await new Promise((r) => setTimeout(r, 20000));
    const events = await api.allEvents(cid, { maxPages: 4 });
    const texts = events
      .filter((e) => e.kind === "MessageEvent")
      .map((e) => (e.llm_message?.content || []).map((c) => c.text || "").join(""));
    assert.ok(texts.some((t) => /ping|pong/i.test(t)), "the exchange is in the transcript");
    globalThis.__created = cid;
  });
}

console.log(`\n${passed} checks passed`);
