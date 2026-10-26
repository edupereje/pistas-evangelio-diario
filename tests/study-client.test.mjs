import test from "node:test";
import assert from "node:assert/strict";
import { createStudyClient } from "../public/study-client.js";

const item = { fecha: "2026-10-27", cita: "Lc 13,18-21", titulo: "La semilla", contenidoMarkdown: "A completa\n\nOración y fuentes." };
const ok = (value) => new Response(JSON.stringify({ ok: true, item: value }), { status: 200 });

test("disponibilidad solo conserva metadatos y deduplica la petición", async () => {
  const urls = [];
  const client = createStudyClient(async (url, options) => { urls.push(url); assert.equal(options.cache, "no-store"); return ok(item); });
  const [a, b] = await Promise.all([client.summary(item.fecha), client.summary(item.fecha)]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /resumen=1$/);
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a.item), ["fecha", "cita", "titulo"]);
  assert.ok(!JSON.stringify(a).includes("A completa"));
});

test("la lectura completa es explícita y se revalida al volver a abrir", async () => {
  let calls = 0;
  const client = createStudyClient(async (url) => { calls++; assert.ok(!url.includes("resumen")); return calls === 1 ? ok(item) : new Response("", { status: 404 }); });
  assert.equal((await client.read(item.fecha)).item.contenidoMarkdown, item.contenidoMarkdown);
  assert.deepEqual(await client.read(item.fecha), { status: "missing" });
  assert.deepEqual(await client.summary(item.fecha), { status: "missing" });
  assert.equal(calls, 2);
});

test("una fecha ausente, un fallo de red y una fuente desactivada no inventan un estudio", async () => {
  for (const status of [404, 503]) {
    const client = createStudyClient(async () => new Response("", { status }));
    assert.equal((await client.read(item.fecha)).status, status === 404 ? "missing" : "error");
  }
  const client = createStudyClient(async () => { throw new Error("offline"); });
  assert.equal((await client.read(item.fecha)).status, "error");
});

test("rechaza fechas inválidas sin red y respuestas de otra fecha o sin A", async () => {
  let calls = 0;
  const invalid = createStudyClient(async () => { calls++; return ok(item); });
  assert.equal((await invalid.read("2026-02-30")).status, "missing");
  assert.equal((await invalid.read("0000-01-01")).status, "missing");
  assert.equal(calls, 0);
  assert.equal((await invalid.read("2026-10-26")).status, "error");
  const empty = createStudyClient(async () => ok({ ...item, contenidoMarkdown: " " }));
  assert.equal((await empty.read(item.fecha)).status, "error");
});
