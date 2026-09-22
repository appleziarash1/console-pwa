/**
 * Settings, persisted in localStorage.
 * The API key never leaves this device except as an Authorization header to
 * the configured base URL.
 */

const KEY = "console.settings.v1";
const CACHE_KEY = "console.conversations.cache";

export const DEFAULT_BASE = "https://app.all-hands.dev";

const DEFAULTS = {
  baseUrl: DEFAULT_BASE,
  apiKey: "",
  liveUpdates: true,
  notify: false,
  sound: false,
  theme: "ink",
};

let cache = null;

export function settings() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  if (!cache.baseUrl) cache.baseUrl = DEFAULT_BASE;
  return cache;
}

export function saveSettings(patch) {
  cache = { ...settings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode: keep it in memory only */
  }
  applyTheme();
  return cache;
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  cache = { ...DEFAULTS };
  applyTheme();
  return cache;
}

export function isConnected() {
  return Boolean(settings().apiKey);
}

export function applyTheme() {
  const theme = settings().theme === "paper" ? "paper" : "ink";
  document.documentElement.dataset.theme = theme;
}

export function normalizeBase(url) {
  return (url || DEFAULT_BASE).trim().replace(/\/+$/, "");
}

/* Last known conversation list, so the app opens instantly (and offline). */

export function cachedConversations() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function cacheConversations(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items.slice(0, 60)));
  } catch {
    /* quota or private mode */
  }
}
