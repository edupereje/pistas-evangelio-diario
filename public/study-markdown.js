function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function inline(text, depth = 0) {
  if (depth > 3) return escape(text);
  const tokens = /\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`/g;
  let result = "";
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    result += escape(text.slice(offset, match.index));
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) {
      let safe = false;
      try { safe = ["https:", "http:"].includes(new URL(link[2]).protocol); } catch (_) {}
      result += safe
        ? `<a href="${escape(link[2])}" target="_blank" rel="noopener noreferrer">${inline(link[1], depth + 1)}</a>`
        : escape(token);
    } else if (token.startsWith("**")) {
      result += `<strong>${inline(token.slice(2, -2), depth + 1)}</strong>`;
    } else if (token.startsWith("*")) {
      result += `<em>${inline(token.slice(1, -1), depth + 1)}</em>`;
    } else {
      result += `<code>${escape(token.slice(1, -1))}</code>`;
    }
    offset = match.index + token.length;
  }
  return result + escape(text.slice(offset));
}

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((value) => value.trim());
}

function tableRule(line) {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((value) => /^:?-{3,}:?$/.test(value));
}

function special(lines, index) {
  const line = lines[index];
  return /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~)/.test(line) ||
    (index + 1 < lines.length && line.includes("|") && tableRule(lines[index + 1]));
}

// Formato editorial admitido: párrafos, títulos, listas, tablas y enlaces HTTP(S).
// El HTML del original siempre se muestra como texto; nunca se ejecuta.
export function renderStudyMarkdown(markdown, displayedTitle = "") {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  // El mismo título ya aparece como h1 en la pantalla; el original no se modifica.
  if (displayedTitle && (lines[0] === `**${displayedTitle}**` || lines[0] === `# ${displayedTitle}`)) lines.shift();
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const content = [];
      const close = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      i++;
      while (i < lines.length && !close.test(lines[i])) content.push(lines[i++]);
      if (i < lines.length) i++;
      html.push(`<pre><code>${escape(content.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.max(2, heading[1].length);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++; continue;
    }
    const boldHeading = line.match(/^\*\*((?:\d+\.|Versículo\s).+)\*\*\s*$/);
    if (boldHeading) {
      const tag = /^Versículo\s/.test(boldHeading[1]) ? "h3" : "h2";
      html.push(`<${tag}>${inline(boldHeading[1])}</${tag}>`);
      i++; continue;
    }
    if (i + 1 < lines.length && line.includes("|") && tableRule(lines[i + 1])) {
      const headers = tableCells(line);
      const originalLines = [line, lines[i + 1]];
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        originalLines.push(lines[i]);
        rows.push(tableCells(lines[i++]));
      }
      if (rows.some((row) => row.length !== headers.length)) {
        // Conservar todo el original si una tabla irregular no puede presentarse fielmente.
        html.push(`<pre>${escape(originalLines.join("\n"))}</pre>`);
        continue;
      }
      html.push(`<div class="study-table" tabindex="0" role="region" aria-label="Tabla del estudio"><table><thead><tr>${headers.map((v) => `<th scope="col">${inline(v)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, n) => `<td>${inline(row[n] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const list = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]);
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(inline(item[2])); i++;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((v) => `<li>${v}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(inline(lines[i++].replace(/^>\s?/, "")));
      html.push(`<blockquote><p>${quote.join("<br>")}</p></blockquote>`);
      continue;
    }
    const paragraph = [inline(line.replace(/\s+$/, ""))];
    i++;
    while (i < lines.length && lines[i].trim() && !special(lines, i) && !/^\*\*((?:\d+\.|Versículo\s).+)\*\*\s*$/.test(lines[i])) {
      paragraph.push(inline(lines[i++].replace(/\s+$/, "")));
    }
    html.push(`<p>${paragraph.join("<br>")}</p>`);
  }
  return html.join("\n");
}
