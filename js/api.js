/**
 * Thin client for the OpenHands Cloud V1 API.
 *
 *   GET  /api/v1/users/me
 *   GET  /api/v1/app-conversations/search
 *   GET  /api/v1/app-conversations?ids=...
 *   POST /api/v1/app-conversations                 (async -> start task)
 *   GET  /api/v1/app-conversations/start-tasks?ids=...
 *   POST /api/v1/app-conversations/{id}/send-message
 *   GET  /api/v1/conversation/{id}/events/search
 *
 * CORS on the Cloud API allows any origin, so this runs entirely client-side.
 */

import { normalizeBase, settings } from "./config.js";

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function detailToMessage(detail) {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "string" ? d : d.msg || JSON.stringify(d)))
      .join("; ");
  }
  if (typeof detail === "object") return detail.detail || JSON.stringify(detail);
  return String(detail);
}

async function request(path, { method = "GET", body, signal, timeout = 45000 } = {}) {
  const { apiKey } = settings();
  const base = normalizeBase(settings().baseUrl);
  if (!apiKey) throw new ApiError("No API key configured.", 401);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });

  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new ApiError("Request timed out.", 408);
    throw new ApiError("Could not reach the API. Check your connection.", 0);
  }
  clearTimeout(timer);

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const status = res.status;
    const detail = detailToMessage(data?.detail ?? data);
    if (status === 401) throw new ApiError("That API key was rejected.", 401, detail);
    if (status === 403) throw new ApiError("This key lacks permission.", 403, detail);
    if (status === 404) throw new ApiError("Not found.", 404, detail);
    if (status === 429) throw new ApiError("Rate limited. Try again shortly.", 429, detail);
    throw new ApiError(detail || `Request failed (${status}).`, status, detail);
  }
  return data;
}

export async function whoami() {
  return request("/api/v1/users/me");
}

export async function listConversations({ limit = 30, pageId } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (pageId) q.set("page_id", pageId);
  const data = await request(`/api/v1/app-conversations/search?${q}`);
  return data?.items ?? [];
}

export async function getConversations(ids) {
  if (!ids.length) return [];
  const q = new URLSearchParams({ ids: ids.join(",") });
  const data = await request(`/api/v1/app-conversations?${q}`);
  return Array.isArray(data) ? data.filter(Boolean) : [];
}

/** Returns the start task; poll it until it has an app_conversation_id. */
export async function startConversation({ message, repository, branch, title }) {
  const body = {
    initial_message: {
      role: "user",
      content: [{ type: "text", text: message }],
      run: true,
    },
  };
  if (repository) body.selected_repository = repository;
  if (branch) body.selected_branch = branch;
  if (title) body.title = title;
  return request("/api/v1/app-conversations", { method: "POST", body });
}

export async function getStartTask(id) {
  const q = new URLSearchParams({ ids: id });
  const data = await request(`/api/v1/app-conversations/start-tasks?${q}`);
  const list = Array.isArray(data) ? data : [data];
  return list.find(Boolean) ?? null;
}

export async function pollStartTask(id, { onTick, intervalMs = 2500, maxMs = 180000 } = {}) {
  const started = Date.now();
  let task = null;
  while (Date.now() - started < maxMs) {
    task = await getStartTask(id);
    if (onTick) onTick(task);
    if (!task) throw new ApiError("The start task disappeared.", 404);
    if (task.status === "READY" && task.app_conversation_id) return task;
    if (task.status === "ERROR") {
      throw new ApiError(task.detail || "The sandbox failed to start.", 500, task.detail);
    }
    await sleep(intervalMs);
  }
  throw new ApiError("Timed out waiting for the sandbox to start.", 408);
}

export async function sendMessage(conversationId, text, { run = true } = {}) {
  return request(`/api/v1/app-conversations/${conversationId}/send-message`, {
    method: "POST",
    body: { role: "user", content: [{ type: "text", text }], run },
  });
}

export async function searchEvents(conversationId, { limit = 100, pageId } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (pageId) q.set("page_id", pageId);
  return request(`/api/v1/conversation/${conversationId}/events/search?${q}`);
}

/** Walk pagination until we have the whole transcript (bounded). */
export async function allEvents(conversationId, { maxPages = 12 } = {}) {
  const out = [];
  let pageId = null;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await searchEvents(conversationId, { limit: 100, pageId });
    const items = data?.items ?? [];
    out.push(...items);
    pageId = data?.next_page_id ?? null;
    if (!pageId || !items.length) break;
  }
  return out;
}

export async function patchConversation(conversationId, patch) {
  return request(`/api/v1/app-conversations/${conversationId}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function stopConversation(conversationId, orgId) {
  return request(`/api/organizations/${orgId}/conversations/${conversationId}/stop`, {
    method: "POST",
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
