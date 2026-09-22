/**
 * Turns OpenHands event streams into DOM.
 *
 * Grouping rules that make an agent transcript readable:
 *  - an ActionEvent and the ObservationEvent that answer it become one row
 *    ("in" = the command/tool input, "out" = the result)
 *  - agent reasoning is collapsed into a folded "thinking" block
 *  - ConversationStateUpdateEvent / TokenEvent chatter never reaches the DOM
 */

import { renderMarkdown } from "./markdown.js";

const TOOL_LABELS = {
  terminal: "shell",
  file_editor: "edit",
  task_tracker: "plan",
  browser_tool_set: "browser",
  browser: "browser",
  invoke_skill: "skill",
  task: "subagent",
  task_tool_set: "subagent",
  grep: "grep",
  glob: "glob",
  read_file: "read",
  write_file: "write",
  edit: "edit",
  list_directory: "ls",
  planning_file_editor: "plan",
  ask_oracle: "oracle",
  workflow: "workflow",
};

const SNIPPET_KINDS = new Set(["message", "terminal", "file_editor"]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function timeOf(event) {
  const raw = event.timestamp;
  if (!raw) return "";
  const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function textOfContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (typeof c === "string" ? c : c?.text ?? ""))
    .filter(Boolean)
    .join("\n");
}

function messageText(event) {
  const msg = event.llm_message || event.message || {};
  return textOfContent(msg.content);
}

export function eventText(event) {
  if (event.kind === "MessageEvent") return messageText(event);
  if (event.kind === "ActionEvent") return actionInput(event);
  return "";
}

/* ----------------------------------------------------------- action helpers */

function actionOf(event) {
  return event.action || {};
}

export function actionInput(event) {
  const action = actionOf(event);
  const kind = action.kind || "";
  if (action.command != null) return String(action.command);
  if (kind === "FileEditorAction" || action.path != null) {
    const bits = [];
    if (action.command) bits.push(action.command);
    if (action.path) bits.push(action.path);
    return bits.join(" ") || JSON.stringify(action).slice(0, 400);
  }
  return action.kind || event.tool_name || "action";
}

function observationText(event) {
  const obs = event.observation || {};
  if (obs.content) {
    const t = textOfContent(obs.content);
    if (t) return t;
  }
  if (typeof obs.text === "string") return obs.text;
  return typeof obs === "string" ? obs : "";
}

function isErrorRow(action, observation) {
  if (!observation) return false;
  // `is_error` is authoritative; a bare non-zero exit code is not treated as a
  // failure because plenty of healthy commands (grep with no match, `git log`
  // before the first commit) exit non-zero. The code is still shown on the row.
  const payload = observation.observation ?? observation;
  return Boolean(payload.is_error);
}

function exitCodeOf(observation) {
  const payload = observation?.observation ?? observation;
  const code = payload?.exit_code;
  return typeof code === "number" && code !== 0 ? code : null;
}

/* ----------------------------------------------------------------- renderers */

function toolLabel(toolName) {
  const key = String(toolName || "").replace(/Tool$/, "").toLowerCase();
  return TOOL_LABELS[key] || key || "tool";
}

export function toolSummary(event) {
  const action = actionOf(event);
  const raw =
    action.command ||
    action.path ||
    action.kind ||
    event.tool_name ||
    "action";
  const flat = String(raw).replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

function renderToolRow(action, observation) {
  const wrap = el("div", "act");
  const errored = isErrorRow(action, observation);
  const code = exitCodeOf(observation);
  if (errored) wrap.dataset.state = "error";

  const head = el("button", "act__head");
  head.type = "button";
  head.setAttribute("aria-expanded", "false");
  head.append(
    el("span", "act__caret"),
    el("span", "act__tool", toolLabel(action.tool_name)),
    el("span", "act__label", toolSummary(action)),
  );
  if (errored) head.append(el("span", "act__flag", "failed"));
  else if (code) head.append(el("span", "act__flag", `exit ${code}`));
  head.append(el("span", "act__time", timeOf(action)));

  const body = el("div", "act__body");
  const inner = el("div", "act__body-inner");
  const split = el("div", "act__split");

  const input = actionInput(action);
  if (input && action.tool_name !== "terminal") {
    split.append(el("div", "act__split-label", "in"));
    const pre = el("pre", "code code--in");
    pre.textContent = input;
    split.append(pre);
  } else if (input) {
    const pre = el("pre", "code code--in");
    pre.textContent = `$ ${input}`;
    split.append(pre);
  }

  const output = observation ? observationText(observation) : "";
  if (output) {
    if (input && action.tool_name !== "terminal") {
      split.append(el("div", "act__split-label", "out"));
    }
    const pre = el("pre", "code code--out");
    pre.textContent = output.length > 40000 ? `${output.slice(0, 40000)}\n… truncated` : output;
    split.append(pre);
  } else if (!observation) {
    split.append(el("pre", "code code--out", "(waiting for a result)"));
  } else {
    split.append(el("pre", "code code--out", "(no output)"));
  }

  inner.append(split);
  body.append(inner);
  wrap.append(head, body);

  head.addEventListener("click", () => {
    const open = wrap.dataset.open === "true";
    wrap.dataset.open = open ? "false" : "true";
    head.setAttribute("aria-expanded", String(!open));
  });

  return wrap;
}

function renderThinking(event) {
  const reasoning = event.reasoning_content || "";
  const thought = textOfContent(event.thought);
  const body = [thought, reasoning].filter(Boolean).join("\n\n");
  if (!body.trim()) return null;

  const wrap = el("div", "think");
  const head = el("button", "think__head");
  head.type = "button";
  head.setAttribute("aria-expanded", "false");
  head.append(el("span", "act__caret"), el("span", null, "thinking"));
  const bodyEl = el("div", "think__body", body.length > 6000 ? `${body.slice(0, 6000)}\n…` : body);
  wrap.append(head, bodyEl);
  head.addEventListener("click", () => {
    const open = wrap.dataset.open === "true";
    wrap.dataset.open = open ? "false" : "true";
    head.setAttribute("aria-expanded", String(!open));
  });
  return wrap;
}

function renderUserBubble(event) {
  const wrap = el("div", "msg msg--user");
  const head = el("div", "msg__head");
  head.append(el("span", "msg__who", "you"), el("span", "msg__time", timeOf(event)));
  const bubble = el("div", "msg__bubble", messageText(event));
  wrap.append(head, bubble);
  return wrap;
}

function renderAgentMessage(event, { final = false } = {}) {
  const wrap = el("div", `msg msg--agent${final ? " msg--final" : ""}`);
  const head = el("div", "msg__head");
  head.append(
    el("span", "msg__who", final ? "agent · done" : event.source === "user" ? "you" : "agent"),
    el("span", "msg__time", timeOf(event)),
  );
  const body = el("div", "msg__body prose");
  body.innerHTML = renderMarkdown(messageText(event));
  wrap.append(head, body);
  return wrap;
}

function renderDivider(text) {
  return el("div", "divider", text);
}

/* ------------------------------------------------------------------ pipeline */

function pairEvents(events) {
  const observations = new Map();
  for (const e of events) {
    if (e.kind === "ObservationEvent" && e.action_id) observations.set(e.action_id, e);
  }
  const rows = [];
  for (const e of events) {
    if (e.kind === "ActionEvent") {
      rows.push({ type: "action", action: e, observation: observations.get(e.id) || null });
    } else if (e.kind === "ObservationEvent") {
      if (!rows.some((r) => r.type === "action" && r.action.id === e.action_id)) {
        rows.push({ type: "observation", observation: e });
      }
    } else {
      rows.push({ type: e.kind, event: e });
    }
  }
  return rows;
}

export function buildTranscript(events) {
  const rows = pairEvents(events);
  const frag = document.createDocumentFragment();
  let emittedAnything = false;

  for (const row of rows) {
    if (row.type === "action") {
      // One collapsed row per tool call: at a glance you see what the agent
      // did and which step failed, without the whole run collapsing into a
      // single opaque summary.
      const thinking = renderThinking(row.action);
      if (thinking) frag.append(thinking);
      frag.append(renderToolRow(row.action, row.observation));
      emittedAnything = true;
      continue;
    }
    if (row.type === "observation") {
      // An observation whose action predates the page window: show it alone.
      frag.append(renderToolRow(row.observation, row.observation));
      emittedAnything = true;
      continue;
    }
    if (row.type === "MessageEvent") {
      const role = row.event.llm_message?.role;
      if (role === "user") frag.append(renderUserBubble(row.event));
      else frag.append(renderAgentMessage(row.event));
      emittedAnything = true;
      continue;
    }
    if (row.type === "SystemPromptEvent") {
      frag.append(renderDivider("session started"));
      continue;
    }
    if (row.type === "ConversationErrorEvent" || row.type === "AgentErrorEvent") {
      frag.append(
        el("div", "conn conn--error", row.event.detail || row.event.code || "Error"),
      );
      emittedAnything = true;
      continue;
    }
    if (row.type === "InterruptEvent" || row.type === "PauseEvent") {
      frag.append(renderDivider(row.type === "PauseEvent" ? "paused" : "interrupted"));
      continue;
    }
    if (row.type === "CondensationSummaryEvent" || row.type === "Condensation") {
      frag.append(renderDivider("context condensed"));
      continue;
    }
    // ConversationStateUpdateEvent, TokenEvent, StreamingDeltaEvent, ... are noise
  }

  return { frag, empty: !emittedAnything };
}

/** Short line for the conversation rail. */
export function summarise(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.kind === "MessageEvent") {
      const t = messageText(e).replace(/\s+/g, " ").trim();
      if (t) return e.llm_message?.role === "user" ? `You: ${t}` : t;
    }
    if (e.kind === "ActionEvent" && SNIPPET_KINDS.has(e.tool_name)) {
      const t = toolSummary(e).replace(/\s+/g, " ");
      if (t) return `$ ${t}`;
    }
  }
  return "";
}

export function agentSaid(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.kind === "MessageEvent" && e.llm_message?.role !== "user") {
      const t = messageText(e).trim();
      if (t) return t;
    }
  }
  return "";
}

export { observationText, textOfContent };
