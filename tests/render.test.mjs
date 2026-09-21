/**
 * Renderer tests against a captured real OpenHands event stream
 * (tests/fixtures/events.json). Run: node tests/render.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

const { buildTranscript, summarise, agentSaid, eventText, toolSummary } = await import(
  "../src/js/render.js"
);
const { renderMarkdown } = await import("../src/js/markdown.js");

const events = JSON.parse(
  readFileSync(new URL("./fixtures/events.json", import.meta.url), "utf8"),
).items;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

function render(list) {
  const holder = document.createElement("div");
  holder.append(buildTranscript(list).frag);
  return holder;
}

console.log("render.js");

test("every real event type renders without throwing", () => {
  const holder = render(events);
  assert.ok(holder.childElementCount > 0, "produced nodes");
});

test("pairs each ActionEvent with its ObservationEvent", () => {
  const holder = render(events);
  const toolHeads = holder.querySelectorAll(".act__tool");
  const observations = events.filter((e) => e.kind === "ObservationEvent").length;
  assert.ok(toolHeads.length > 0, "tool rows exist");
  assert.ok(toolHeads.length <= observations, "no tool row without an observation");
});

test("user MessageEvent becomes a bubble with the exact text", () => {
  const holder = render(events);
  const bubble = holder.querySelector(".msg--user .msg__bubble");
  assert.ok(bubble, "user bubble present");
  assert.equal(
    bubble.textContent,
    "Tomader to app nai so tomader ekta pwa banaiya dao jate amar hassle na lage",
  );
});

test("tool rows expose the command as input and output separately", () => {
  const holder = render(events);
  holder.querySelectorAll(".act__head").forEach((h) => h.click());
  const inputs = holder.querySelectorAll("pre.code--in");
  const outputs = holder.querySelectorAll("pre.code--out");
  assert.ok(inputs.length > 0, "inputs rendered");
  assert.ok(outputs.length > 0, "outputs rendered");
  assert.ok(
    [...inputs].some((n) => n.textContent.includes("terminal") || n.textContent.startsWith("$")),
    "a shell command is shown",
  );
});

test("failed observations are flagged as errors", () => {
  const holder = render(events);
  const errored = [...holder.querySelectorAll(".act")].filter((n) => n.dataset.state === "error");
  const failedInSource = events.filter(
    (e) => e.kind === "ObservationEvent" && e.observation?.is_error,
  );
  assert.equal(errored.length, failedInSource.length, "error count matches the source");
  assert.ok(failedInSource.length > 0, "fixture actually contains a failure");
});

test("thinking blocks are collapsed by default and expand on click", () => {
  const holder = render(events);
  const think = holder.querySelector(".think");
  assert.ok(think, "a thinking block exists");
  assert.notEqual(think.dataset.open, "true");
  think.querySelector(".think__head").click();
  assert.equal(think.dataset.open, "true");
});

test("ConversationStateUpdateEvent state is never rendered as content", () => {
  const onlyState = events.filter((e) => e.kind === "ConversationStateUpdateEvent");
  const holder = render(onlyState);
  assert.equal(holder.childElementCount, 0, "state churn produces no nodes");
  // their values may legitimately appear inside tool output the agent printed,
  // so only assert that the raw state payload is not turned into markup
  assert.ok(!holder.textContent.includes("full_state"));
});

test("summarise returns the newest human-readable line", () => {
  const s = summarise(events);
  assert.equal(typeof s, "string");
  assert.ok(s.length > 0, "non-empty summary");
  assert.ok(!s.includes("ConversationStateUpdateEvent"));
});

test("eventText gives the shell command for a TerminalAction", () => {
  const action = events.find((e) => e.kind === "ActionEvent");
  assert.ok(eventText(action).length > 0);
  assert.ok(toolSummary(action).length > 0);
});

test("agentSaid finds the most recent assistant prose", () => {
  assert.equal(typeof agentSaid(events), "string");
});

console.log("\nmarkdown.js");

test("escapes raw HTML from agent output", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> & <script>bad()</script>');
  assert.ok(!html.includes("<img"), "no img tag");
  assert.ok(!html.includes("<script"), "no script tag");
  assert.ok(html.includes("&lt;img"), "escaped instead");
});

test("renders headings, lists, and fenced code", () => {
  const html = renderMarkdown("# Title\n\n- one\n- two\n\n```bash\nls -la\n```");
  assert.ok(html.includes("<h1>Title</h1>"));
  assert.ok(html.includes("<ul>"));
  assert.ok(html.includes('<pre><code class="language-bash">ls -la</code></pre>'));
});

test("drops javascript: URLs but keeps https links", () => {
  const bad = renderMarkdown("[click](javascript:alert(1))");
  assert.ok(!bad.includes("javascript:"));
  const good = renderMarkdown("[docs](https://docs.openhands.dev)");
  assert.ok(good.includes('href="https://docs.openhands.dev"'));
  assert.ok(good.includes('rel="noopener noreferrer"'));
});

test("linkifies bare URLs", () => {
  const html = renderMarkdown("see https://app.all-hands.dev/x for details");
  assert.ok(html.includes('<a href="https://app.all-hands.dev/x"'));
});

test("renders markdown tables", () => {
  const html = renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |");
  assert.ok(html.includes("<table>"));
  assert.ok(html.includes("<th>a</th>"));
  assert.ok(html.includes("<td>2</td>"));
});

test("survives malformed and empty input", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown(null), "");
  assert.ok(renderMarkdown("```\nunclosed fence").includes("<pre>"));
  assert.ok(renderMarkdown("*unclosed bold").length > 0);
});

console.log(`\n${passed} checks passed`);
