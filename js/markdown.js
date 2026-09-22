/**
 * Small, dependency-free Markdown renderer.
 * Everything is HTML-escaped first, so agent output cannot inject markup.
 */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Only allow http(s) and mailto links. */
function safeHref(url) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return escapeHtml(trimmed);
  return null;
}

function renderInline(raw) {
  let out = escapeHtml(raw);

  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const safe = safeHref(href);
    return safe
      ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  });
  out = out.replace(
    /(^|[\s(])(https?:\/\/[^\s<>"')]+)/g,
    (_, pre, url) =>
      `${pre}<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
  return out;
}

/** Very small fenced-code extractor so code blocks survive the line pass. */
function extractFences(src) {
  const blocks = [];
  const text = src.replace(/```([\w+-]*)\n([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
    const i = blocks.push({ lang, code: code.replace(/\n$/, "") }) - 1;
    return `\u0000FENCE${i}\u0000`;
  });
  return { text, blocks };
}

/** `lines` is [header, ...body]; the separator row is already stripped. */
function renderTable(lines) {
  const rows = lines.map((l) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim()),
  );
  const [head, ...body] = rows;
  const th = head.map((c) => `<th>${renderInline(c)}</th>`).join("");
  const tb = body
    .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
}

export function renderMarkdown(src) {
  if (!src) return "";
  const { text, blocks } = extractFences(String(src));
  const lines = text.split("\n");
  const html = [];

  let list = null; // "ul" | "ol"
  let paragraph = [];
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^\u0000FENCE(\d+)\u0000$/);
    if (fence) {
      flushAll();
      const block = blocks[Number(fence[1])];
      const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      html.push(`<pre><code${cls}>${escapeHtml(block.code)}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[-*_\s]*$/.test(line)) {
      flushAll();
      html.push("<hr />");
      continue;
    }

    // table: header row followed by a separator row
    if (line.includes("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || "")) {
      flushAll();
      const tableLines = [line];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
        tableLines.push(lines[j]);
        j += 1;
      }
      html.push(renderTable(tableLines));
      i = j - 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      flushList();
      quote.push(line.replace(/^\s*>\s?/, ""));
      continue;
    }
    flushQuote();

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        flushList();
        html.push(`<${want}>`);
        list = want;
      }
      html.push(`<li>${renderInline((ul || ol)[1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return html.join("");
}
