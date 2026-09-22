/**
 * Console — app shell.
 * Wires the OpenHands Cloud V1 API into a focused mobile-first PWA.
 */

import * as api from "./api.js";
import { ApiError } from "./api.js";
import * as cfg from "./config.js";
import {
  agentSaid,
  buildTranscript,
  eventText,
  summarise,
  textOfContent,
} from "./render.js";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 15000;
const TERMINAL = new Set(["finished", "error", "stuck", "stopped"]);
const RUNNING = new Set(["running", "starting", "paused"]);

const state = {
  me: null,
  conversations: [],
  activeId: null,
  events: [],
  lastStatus: new Map(),
  filter: "all",
  query: "",
  busy: false,
  pollTimer: null,
  listTimer: null,
  autoScroll: true,
  fetchingEvents: false,
};

/* ------------------------------------------------------------------ utilities */

function toast(message, kind = "info", ttl = 5200) {
  const node = el("div", `toast${kind === "error" ? " toast--error" : kind === "ok" ? " toast--ok" : ""}`);
  node.append(el("span", "toast__mark", kind === "error" ? "!" : kind === "ok" ? "✓" : "·"));
  node.append(el("span", null, message));
  $("toasts").append(node);
  setTimeout(() => {
    node.classList.add("toast--out");
    setTimeout(() => node.remove(), 260);
  }, ttl);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.round(secs / 86400)}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function openSheet(id) {
  $("scrim").hidden = false;
  $(id).hidden = false;
}

function closeSheet(id) {
  $(id).hidden = true;
  if ($("settings-sheet").hidden && $("new-sheet").hidden) $("scrim").hidden = true;
}

function isMobile() {
  return window.matchMedia("(max-width: 860px)").matches;
}

/** Trust a successful request over navigator.onLine, which lies in sandboxes
 *  and behind captive portals. */
function setOffline(offline) {
  $("offline-banner").hidden = !offline;
}

function noteOnline() {
  if (!$("offline-banner").hidden) setOffline(false);
}

/* ------------------------------------------------------------------- connect */

async function connect({ silent = false } = {}) {
  const status = $("connection-status");
  try {
    const me = await api.whoami();
    noteOnline();
    state.me = me;
    $("user-label").textContent = me.email || me.org_name || "Connected";
    $("user-avatar").textContent = (me.email || "?").slice(0, 1).toUpperCase();
    cfg.saveSettings({ orgId: me.org_id, email: me.email });
    if (!silent) {
      status.hidden = false;
      status.className = "conn";
      status.textContent = `Connected as ${me.email}`;
    }
    $("api-host-label").textContent = cfg.normalizeBase(cfg.settings().baseUrl).replace(/^https?:\/\//, "");
    return true;
  } catch (err) {
    state.me = null;
    $("user-label").textContent = "Connect account";
    $("user-avatar").textContent = "!";
    if (!silent) {
      status.hidden = false;
      status.className = "conn conn--error";
      status.textContent =
        err instanceof ApiError ? err.message : "Could not connect. Check the key and base URL.";
    }
    if (err instanceof ApiError && err.status === 0) setOffline(true);
    return false;
  }
}

/* ---------------------------------------------------------- conversation list */

function renderRail() {
  const list = $("list");
  const items = filteredConversations();
  list.replaceChildren();

  if (!items.length) {
    const msg = state.query
      ? "No tasks match that search."
      : state.filter !== "all"
        ? `Nothing ${state.filter} right now.`
        : "No conversations yet. Start one with +.";
    list.append(el("p", "rail__empty", msg));
    return;
  }

  const groups = [
    ["Running", items.filter((c) => RUNNING.has(c.execution_status))],
    ["Today", items.filter((c) => !RUNNING.has(c.execution_status) && withinDays(c, 1))],
    ["Earlier", items.filter((c) => !RUNNING.has(c.execution_status) && !withinDays(c, 1))],
  ];

  let index = 0;
  for (const [label, group] of groups) {
    if (!group.length) continue;
    list.append(el("div", "rail__group", label));
    for (const conv of group) {
      const node = $("tpl-conversation").content.firstElementChild.cloneNode(true);
      node.dataset.id = conv.id;
      node.classList.toggle("conv--active", conv.id === state.activeId);
      node.style.animationDelay = `${Math.min(index * 22, 260)}ms`;
      index += 1;

      node.querySelector(".conv__title").textContent = conv.title || "Untitled task";
      node.querySelector(".conv__status").dataset.status = conv.execution_status || "unknown";
      const snippet = conv.__snippet || conv.selected_repository || "";
      const snipEl = node.querySelector(".conv__snippet");
      if (snippet) snipEl.textContent = snippet;
      else snipEl.remove();

      const repoEl = node.querySelector(".conv__repo");
      if (conv.selected_repository) repoEl.textContent = conv.selected_repository;
      else repoEl.remove();

      node.querySelector(".conv__time").textContent = relativeTime(conv.updated_at);
      node.addEventListener("click", () => selectConversation(conv.id));
      list.append(node);
    }
  }
}

function withinDays(conv, days) {
  const t = new Date(conv.updated_at || conv.created_at || 0).getTime();
  return Date.now() - t < days * 86400000;
}

function filteredConversations() {
  const q = state.query.trim().toLowerCase();
  return state.conversations.filter((c) => {
    if (state.filter === "running" && !RUNNING.has(c.execution_status)) return false;
    if (state.filter === "finished" && !["finished", "idle"].includes(c.execution_status))
      return false;
    if (!q) return true;
    return [c.title, c.selected_repository, c.__snippet]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
}

async function loadConversations({ silent = false } = {}) {
  if (!cfg.isConnected()) {
    state.conversations = cfg.cachedConversations().map((c) => ({ ...c, __cached: true }));
    renderRail();
    return;
  }
  try {
    const items = await api.listConversations({ limit: 40 });
    noteOnline();
    const previous = new Map(state.conversations.map((c) => [c.id, c]));
    state.conversations = items.map((c) => ({
      ...c,
      __snippet: previous.get(c.id)?.__snippet || "",
    }));
    cfg.cacheConversations(state.conversations);
    renderRail();
    announceFinishes(items);
  } catch (err) {
    if (!silent) toast(err.message, "error");
    // a genuinely unreachable API is what the offline banner is for
    if (err instanceof ApiError && err.status === 0) setOffline(true);
    if (!state.conversations.length) {
      state.conversations = cfg.cachedConversations();
      renderRail();
    }
  }
}

/** Fire a notification when a task we were watching flips to a terminal state. */
function announceFinishes(items) {
  const s = cfg.settings();
  for (const conv of items) {
    const before = state.lastStatus.get(conv.id);
    const now = conv.execution_status;
    state.lastStatus.set(conv.id, now);
    const justFinished = TERMINAL.has(now) && before && RUNNING.has(before);
    if (!justFinished) continue;
    if (conv.id === state.activeId) continue;
    if (s.notify && "Notification" in window && Notification.permission === "granted") {
      new Notification(conv.title || "Task finished", {
        body: `${conv.title || "Your task"} is ${now}.`,
        icon: "./icons/icon-192.png",
        badge: "./icons/badge-96.png",
        tag: conv.id,
      });
    }
    if (s.sound) chime();
    toast(`${conv.title || "Task"} ${now === "finished" ? "finished" : now}.`, "ok");
  }
  for (const conv of items) {
    if (!state.lastStatus.has(conv.id)) state.lastStatus.set(conv.id, conv.execution_status);
  }
}

let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.42);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.45);
    });
  } catch {
    /* audio unavailable */
  }
}

/* ---------------------------------------------------------------- transcript */

async function selectConversation(id, { push = true } = {}) {
  state.activeId = id;
  if (isMobile()) $("app").dataset.rail = "closed";
  renderRail();
  renderStageHead();
  $("transcript").replaceChildren(el("div", "rail__skeleton"));
  stopPolling();
  await loadEvents({ scrollToEnd: true });
  startPollingIfNeeded();
  void push;
}

function activeConversation() {
  return state.conversations.find((c) => c.id === state.activeId) || null;
}

function renderStageHead() {
  const conv = activeConversation();
  $("stage-title").textContent = conv?.title || (conv ? "Task" : "Console");

  const meta = $("stage-meta");
  meta.replaceChildren();
  if (conv) {
    const status = conv.execution_status || "unknown";
    meta.append(el("span", `tag tag--${status}`, status));
    if (conv.llm_model) meta.append(el("span", "tag", conv.llm_model.replace(/^.*\//, "")));
    if (conv.selected_repository) meta.append(el("span", "tag", conv.selected_repository));
    if (conv.updated_at) meta.append(el("span", "tag", `updated ${relativeTime(conv.updated_at)}`));
  }

  $("export-button").hidden = !conv;
  const canStop = conv && RUNNING.has(conv.execution_status);
  $("stop-button").hidden = !canStop;
  $("composer").hidden = !conv;
  // the empty state is removed (not just hidden) once a conversation is open,
  // so it may legitimately be absent on later renders
  const empty = $("empty-state");
  if (empty && conv) empty.remove();
}

async function loadEvents({ scrollToEnd = false } = {}) {
  if (!state.activeId || state.fetchingEvents) return;
  state.fetchingEvents = true;
  try {
    const events = await api.allEvents(state.activeId);
    state.events = events;

    const conv = activeConversation();
    if (conv) {
      const snippet = summarise(events);
      if (snippet) conv.__snippet = snippet;
      const said = agentSaid(events);
      if (said) conv.__lastAgent = said;
      renderRail();
    }

    renderTranscript({ scrollToEnd });
  } catch (err) {
    const box = $("transcript");
    box.replaceChildren();
    const wrap = el("div", "empty");
    wrap.append(el("h2", "empty__title", "Couldn't load this transcript"));
    wrap.append(el("p", "empty__body", err.message));
    const row = el("div", "empty__row");
    const retry = el("button", "btn btn--amber", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => loadEvents({ scrollToEnd: true }));
    row.append(retry);
    wrap.append(row);
    box.append(wrap);
  } finally {
    state.fetchingEvents = false;
  }
}

function renderTranscript({ scrollToEnd = false } = {}) {
  const box = $("transcript");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const { frag, empty } = buildTranscript(state.events);
  const inner = el("div", "transcript__inner");

  if (empty) {
    inner.append(
      el("p", "rail__empty", "Nothing here yet — send a message to wake the agent up."),
    );
  }
  inner.append(frag);

  const conv = activeConversation();
  if (conv && RUNNING.has(conv.execution_status)) inner.append(renderLive(conv));

  box.replaceChildren(inner);
  if (scrollToEnd || nearBottom) {
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
    });
  }
}

function renderLive(conv) {
  const wrap = el("div", "live");
  const dots = el("span", "live__dots");
  for (let i = 0; i < 3; i += 1) dots.append(el("i"));
  wrap.append(dots);
  const last = conv.__lastAgent ? conv.__lastAgent.replace(/\s+/g, " ").slice(0, 110) : "";
  wrap.append(
    el("span", null, last ? `Working — ${last}${last.length >= 110 ? "…" : ""}` : "Working…"),
  );
  return wrap;
}

/* -------------------------------------------------------------------- polling */

function startPollingIfNeeded() {
  stopPolling();
  const conv = activeConversation();
  if (!conv || !cfg.settings().liveUpdates) return;
  if (!RUNNING.has(conv.execution_status)) return;
  state.pollTimer = setInterval(() => {
    if (document.hidden || !navigator.onLine) return;
    void refreshActive();
  }, 4000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function refreshActive() {
  const id = state.activeId;
  if (!id) return;
  try {
    const [conv] = await api.getConversations([id]);
    if (conv) {
      const idx = state.conversations.findIndex((c) => c.id === id);
      if (idx >= 0) state.conversations[idx] = { ...state.conversations[idx], ...conv };
      else state.conversations.unshift(conv);
      renderStageHead();
    }
    if (state.activeId === id) await loadEvents();
    const now = state.conversations.find((c) => c.id === id)?.execution_status;
    if (now && !RUNNING.has(now)) {
      stopPolling();
      renderTranscript();
      toast("Task is no longer running. Live updates paused.", "ok");
    }
  } catch {
    /* transient; the next tick retries */
  }
}

/* ------------------------------------------------------------------- composer */

async function send() {
  const input = $("composer-input");
  const text = input.value.trim();
  if (!text || !state.activeId || state.busy) return;

  state.busy = true;
  setComposerHint("Sending…", true);
  try {
    await api.sendMessage(state.activeId, text, { run: $("composer-run").checked });
    input.value = "";
    autogrow();
    const conv = activeConversation();
    if (conv) conv.__snippet = `You: ${text.replace(/\s+/g, " ")}`;
    renderRail();
    await loadEvents({ scrollToEnd: true });
    const updated = activeConversation();
    if (updated) {
      updated.execution_status = "running";
      renderStageHead();
    }
    startPollingIfNeeded();
    setComposerHint("Sent. Live updates are on.", true);
  } catch (err) {
    toast(err.message, "error");
    setComposerHint("Couldn't send.", true);
  } finally {
    state.busy = false;
    setTimeout(() => setComposerHint("⌘⏎ to send", false), 2600);
  }
}

function setComposerHint(text, busy) {
  const hint = $("composer-hint");
  hint.textContent = text;
  hint.parentElement.classList.toggle("composer__foot--busy", Boolean(busy));
}

function autogrow() {
  const ta = $("composer-input");
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 190)}px`;
}

/* --------------------------------------------------------------- new task flow */

async function startTask() {
  const prompt = $("new-prompt").value.trim();
  const errorBox = $("new-error");
  errorBox.hidden = true;

  if (!prompt) {
    errorBox.hidden = false;
    errorBox.textContent = "Tell the agent what to do first.";
    return;
  }
  if (!cfg.isConnected()) {
    closeSheet("new-sheet");
    openSheet("settings-sheet");
    return;
  }

  const button = $("new-start");
  button.disabled = true;
  button.textContent = "Starting…";

  try {
    const task = await api.startConversation({
      message: prompt,
      repository: $("new-repo").value.trim() || undefined,
      branch: $("new-branch").value.trim() || undefined,
      title: $("new-title-input").value.trim() || undefined,
    });

    let conversationId = task.app_conversation_id;
    if (!conversationId) {
      button.textContent = "Booting sandbox…";
      const ready = await api.pollStartTask(task.id, {
        onTick: (t) => {
          if (t?.status) button.textContent = `${t.status.toLowerCase()}…`;
        },
      });
      conversationId = ready.app_conversation_id;
    }

    closeSheet("new-sheet");
    $("new-prompt").value = "";
    $("new-repo").value = "";
    $("new-branch").value = "";
    $("new-title-input").value = "";
    toast("Task started. The sandbox is warming up.", "ok");
    await loadConversations({ silent: true });
    await selectConversation(conversationId);
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "Start task";
  }
}

/* --------------------------------------------------------------------- export */

function exportMarkdown() {
  const conv = activeConversation();
  if (!conv) return;
  const lines = [
    `# ${conv.title || "Task"}`,
    "",
    `- status: ${conv.execution_status}`,
    `- model: ${conv.llm_model || "n/a"}`,
    `- repository: ${conv.selected_repository || "n/a"}`,
    `- conversation: ${cfg.normalizeBase(cfg.settings().baseUrl)}/conversations/${conv.id}`,
    `- exported: ${new Date().toISOString()}`,
    "",
    "---",
    "",
  ];
  for (const e of state.events) {
    if (e.kind === "MessageEvent") {
      const role = e.llm_message?.role === "user" ? "You" : "Agent";
      lines.push(`### ${role} · ${e.timestamp || ""}`, "", textOfContent(e.llm_message?.content), "");
    } else if (e.kind === "ActionEvent") {
      const text = eventText(e);
      if (text) lines.push("```", String(text).slice(0, 4000), "```", "");
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(conv.title || "task").replace(/[^\w-]+/g, "-").slice(0, 48)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------- wiring */

function wire() {
  $("new-button").addEventListener("click", () => {
    if (!cfg.isConnected()) return openSheet("settings-sheet");
    openSheet("new-sheet");
    setTimeout(() => $("new-prompt").focus(), 60);
  });
  $("empty-new").addEventListener("click", () => $("new-button").click());
  $("empty-settings").addEventListener("click", () => openSheet("settings-sheet"));
  $("settings-button").addEventListener("click", () => {
    const s = cfg.settings();
    $("api-key-input").value = s.apiKey;
    $("api-base-input").value = cfg.normalizeBase(s.baseUrl);
    $("opt-poll").checked = s.liveUpdates;
    $("opt-notify").checked = s.notify;
    $("opt-sound").checked = s.sound;
    $("opt-theme").checked = s.theme === "paper";
    $("connection-status").hidden = !cfg.isConnected();
    openSheet("settings-sheet");
  });
  $("refresh-button").addEventListener("click", async () => {
    await loadConversations();
    if (state.activeId) await loadEvents();
    toast("Refreshed.", "ok", 1800);
  });
  $("export-button").addEventListener("click", exportMarkdown);
  $("stop-button").addEventListener("click", async () => {
    const conv = activeConversation();
    if (!conv || !state.me?.org_id) return;
    try {
      await api.stopConversation(conv.id, state.me.org_id);
      toast("Stopping the run…", "ok");
      setTimeout(() => refreshActive(), 1500);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  for (const btn of document.querySelectorAll("[data-close]")) {
    btn.addEventListener("click", () => closeSheet(btn.dataset.close));
  }
  $("scrim").addEventListener("click", () => {
    closeSheet("settings-sheet");
    closeSheet("new-sheet");
  });

  $("save-settings").addEventListener("click", async () => {
    const key = $("api-key-input").value.trim();
    cfg.saveSettings({
      apiKey: key,
      baseUrl: cfg.normalizeBase($("api-base-input").value),
      liveUpdates: $("opt-poll").checked,
      notify: $("opt-notify").checked,
      sound: $("opt-sound").checked,
      theme: $("opt-theme").checked ? "paper" : "ink",
    });
    if ($("opt-notify").checked && "Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    const ok = await connect();
    if (ok) {
      toast("Connected.", "ok");
      await loadConversations({ silent: true });
      closeSheet("settings-sheet");
    }
  });

  $("forget-button").addEventListener("click", () => {
    cfg.clearSettings();
    state.me = null;
    state.conversations = [];
    state.activeId = null;
    state.events = [];
    renderRail();
    $("api-key-input").value = "";
    $("user-label").textContent = "Connect account";
    $("user-avatar").textContent = "·";
    toast("API key removed from this device.", "ok");
  });

  $("api-key-toggle").addEventListener("click", () => {
    const input = $("api-key-input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    $("api-key-toggle").textContent = show ? "Hide" : "Show";
  });

  $("new-start").addEventListener("click", startTask);
  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    void send();
  });

  const input = $("composer-input");
  input.addEventListener("input", autogrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  });

  $("search-input").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderRail();
  });

  $("filters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    for (const c of $("filters").querySelectorAll(".chip")) {
      c.classList.toggle("chip--active", c === chip);
      c.setAttribute("aria-selected", String(c === chip));
    }
    renderRail();
  });

  $("rail-toggle").addEventListener("click", () => {
    const app = $("app");
    app.dataset.rail = app.dataset.rail === "open" ? "closed" : "open";
  });

  $("install-dismiss").addEventListener("click", () => {
    $("install-banner").hidden = true;
    try {
      localStorage.setItem("console.install.dismissed", "1");
    } catch {
      /* ignore */
    }
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("search-input").focus();
      $("search-input").select();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      $("new-button").click();
    } else if (e.key === "Escape") {
      closeSheet("settings-sheet");
      closeSheet("new-sheet");
    }
  });

  // keep the transcript pinned to the bottom while the agent works
  $("transcript").addEventListener("scroll", () => {
    const box = $("transcript");
    state.autoScroll = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  });

  window.addEventListener("online", () => {
    setOffline(false);
    void loadConversations({ silent: true });
    if (state.activeId) void refreshActive();
  });
  window.addEventListener("offline", () => setOffline(true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void loadConversations({ silent: true });
      if (state.activeId) void refreshActive();
    }
  });

  window.addEventListener("app:select", (e) => {
    if (e.detail?.id) void selectConversation(e.detail.id);
  });
}

/* ------------------------------------------------------------------ install */

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem("console.install.dismissed") === "1";
  } catch {
    /* ignore */
  }
  if (!dismissed) $("install-banner").hidden = false;
});
$("install-accept")?.addEventListener("click", async () => {
  if (!deferredPrompt) {
    toast("Use your browser menu → “Install app”.", undefined, 7000);
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("install-banner").hidden = true;
});
window.addEventListener("appinstalled", () => {
  $("install-banner").hidden = true;
  toast("Console installed. Look for it on your home screen.", "ok");
});

/* --------------------------------------------------------------------- boot */

async function boot() {
  cfg.applyTheme();
  wire();
  if (cfg.isConnected()) setOffline(false); // assume reachable; a failed call re-flags it
  if (isMobile()) $("app").dataset.rail = "closed";

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      reg.addEventListener("updatefound", () => {});
    } catch {
      /* SW is an enhancement, not a requirement */
    }
  }

  if (!cfg.isConnected()) {
    state.conversations = cfg.cachedConversations();
    renderRail();
    renderStageHead();
    $("composer").hidden = true;
    if (!state.conversations.length) openSheet("settings-sheet");
    else toast("Add your API key to load live tasks.", undefined, 7000);
    return;
  }

  const ok = await connect({ silent: true });
  if (ok) await loadConversations({ silent: true });

  const first = filteredConversations()[0];
  if (first) await selectConversation(first.id);
  else renderStageHead();

  state.listTimer = setInterval(() => {
    if (document.hidden || !navigator.onLine) return;
    void loadConversations({ silent: true });
  }, REFRESH_MS);
}

boot();
