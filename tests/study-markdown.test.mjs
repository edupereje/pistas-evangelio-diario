import test from "node:test";
import assert from "node:assert/strict";
import { renderStudyMarkdown } from "../public/study-markdown.js";

test("conserva las secciones, preguntas y fuentes de un estudio extenso", () => {
  const paragraph = "Una explicación completa que conserva el acento y las comillas «del texto». ";
  const source = `**Título aprobado**\n\n**Martes 27 · Lc 13,18-21**\n\n**1. Contexto**\n\n${paragraph.repeat(240)}\n\n**Versículo 18. El Reino**\n\n| Dato | Sentido |\n|---|---|\n| Semilla | **Confianza** |\n\n**7. Preguntas para la oración**\n\n- ¿Dónde reconoces a Dios?\n- ¿A quién acoges?\n\n**9. Fuentes**\n\n- [Texto de Lucas](https://www.conferenciaepiscopal.es/biblia/lucas/)\n- *Tratado de la oración*, 25,1-3.`;
  const html = renderStudyMarkdown(source, "Título aprobado");
  assert.equal((html.match(/Una explicación/g) || []).length, 240);
  assert.match(html, /<h2>1\. Contexto<\/h2>/);
  assert.match(html, /<h3>Versículo 18\. El Reino<\/h3>/);
  assert.match(html, /<table>/);
  assert.match(html, /<strong>Confianza<\/strong>/);
  assert.match(html, /¿Dónde reconoces a Dios\?/);
  assert.match(html, /<em>Tratado de la oración<\/em>, 25,1-3\./);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.ok(!html.includes("Título aprobado"), "solo se omite el título exacto ya mostrado por la pantalla");
  assert.ok(source.startsWith("**Título aprobado**"), "la fuente permanece intacta");
});

test("escapa HTML en párrafos, títulos, tablas, listas y código", () => {
  const html = renderStudyMarkdown('# <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n- <svg/onload=alert(1)>\n\n| Dato | Texto |\n|---|---|\n| <iframe src=x> | `</code><script>` |\n\n```html\n</code><img src=x>\n```');
  assert.ok(!/<(?:img|svg|script|iframe)\b/i.test(html));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;iframe src=x&gt;/);
  assert.match(html, /<code>&lt;\/code&gt;&lt;script&gt;<\/code>/);
});

test("rechaza enlaces ejecutables y escapa atributos sin suprimir el texto", () => {
  const html = renderStudyMarkdown('[Peligro](javascript:alert%281%29) [Datos](data:text/html,evil) [Correcto](https://example.org/?q="x"&a=1)');
  assert.ok(!/href="(?:javascript|data):/.test(html));
  assert.match(html, /\[Peligro\]\(javascript:alert%281%29\)/);
  assert.match(html, /href="https:\/\/example.org\/\?q=&quot;x&quot;&amp;a=1"/);
});

test("solo elimina un título duplicado exacto, sin borrar una apertura diferente", () => {
  assert.match(renderStudyMarkdown("**Otro título**\n\nTexto completo", "Título"), /Otro título/);
  assert.match(renderStudyMarkdown("# Título\n\nTexto completo", "Título"), /Texto completo/);
  assert.match(renderStudyMarkdown("Texto\r\n\r\nÚltimo párrafo"), /Último párrafo/);
});

test("una tabla irregular conserva todas sus celdas y escapa el original", () => {
  const source = "| A | B |\n|---|---|\n|uno|dos|tres <img src=x>|";
  const html = renderStudyMarkdown(source);
  assert.match(html, /<pre>/);
  assert.match(html, /uno\|dos\|tres &lt;img src=x&gt;/);
  assert.ok(!html.includes("<img"));
  assert.match(renderStudyMarkdown("| A | B |\n|---|---|\n|uno|"), /\|uno\|/);
});
