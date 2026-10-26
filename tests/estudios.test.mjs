import test from "node:test";
import assert from "node:assert/strict";
import { parsePistasCsv } from "../netlify/functions/_content.mjs";
import { ESTUDIOS_HEADERS, estudiosCsvUrl, isIsoCalendarDate, parseEstudiosCsv } from "../netlify/functions/_estudios.mjs";
import { createEstudiosHandler } from "../netlify/functions/estudios.mjs";

const TODAY = "2026-10-26";
const NOW = new Date("2026-10-26T12:00:00Z");
const SOURCE = "https://public.example.invalid/estudios.csv";
const study = { fecha: TODAY, cita: "Lc 13,18-21", titulo: "La semilla", contenidoMarkdown: "  **Estudio de prueba**\r\n\r\nUna cita: «Crece», y una coma, con \"comillas\".\n\n- Oración\n- Síntesis  " };
const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csvRows = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
const row = (item = study, publicar = "sí") => [...Object.values(item), publicar];
const csv = (rows = [row()], headers = ESTUDIOS_HEADERS) => csvRows([headers, ...rows]);

function setup({ text = csv(), source = SOURCE, now = NOW, fetcher } = {}) {
  const calls = [];
  const readKeys = [];
  const handler = createEstudiosHandler({
    readEnv: (name) => { readKeys.push(name); return source; },
    now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return fetcher ? fetcher(url, options) : new Response(text, { headers: { "content-type": "text/csv; charset=utf-8" } });
    }
  });
  return { calls, readKeys, request: async (query = `fecha=${TODAY}`, method = "GET") => {
    const response = await handler(new Request(`https://app.example.invalid/api/estudios?${query}`, { method }));
    return { response, body: response.status === 204 ? null : await response.json() };
  } };
}

test("desactivado sin URL explícita y sin consultar otra fuente", async () => {
  for (const source of [undefined, null, "", "  "]) {
    const app = setup({ source: source === undefined ? null : source });
    const { response, body } = await app.request();
    assert.equal(response.status, 503);
    assert.deepEqual(body, { ok: false, error: "unavailable" });
    assert.deepEqual(app.readKeys, ["PISTAS_ESTUDIOS_CSV_URL"]);
    assert.equal(app.calls.length, 0);
  }
  assert.equal(estudiosCsvUrl(() => undefined), null);
});

test("rechaza fechas ausentes, repetidas y calendarios imposibles antes de leer la fuente", async () => {
  const app = setup();
  for (const query of ["", "fecha=", "fecha=2026-2-03", "fecha=2026-02-29", "fecha=2026-04-31", "fecha=0000-01-01", `fecha=${TODAY}&fecha=${TODAY}`]) {
    const { response, body } = await app.request(query);
    assert.equal(response.status, 400, query);
    assert.deepEqual(body, { ok: false, error: "invalid_date" });
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.readKeys.length, 0);
  assert.equal(isIsoCalendarDate("2024-02-29"), true);
  assert.equal(isIsoCalendarDate("2100-02-29"), false);
  assert.equal(isIsoCalendarDate("2000-02-29"), true);
});

test("resumen exige parámetro válido para no descargar A por un error de escritura", async () => {
  const app = setup();
  for (const value of ["", "true", "01", "1&resumen=1"]) {
    const { response, body } = await app.request(`fecha=${TODAY}&resumen=${value}`);
    assert.equal(response.status, 400);
    assert.deepEqual(body, { ok: false, error: "invalid_request" });
  }
  assert.equal(app.calls.length, 0);
});

test("lectura completa conserva A carácter por carácter y expone solo cuatro campos", async () => {
  const app = setup();
  for (const suffix of ["", "&resumen=0"]) {
    const { response, body } = await app.request(`fecha=${TODAY}${suffix}`);
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, item: study });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(app.calls[0].url, SOURCE);
  assert.equal(app.calls[0].options.cache, "no-store");
  assert.ok(app.calls[0].options.signal instanceof AbortSignal);
});

test("resumen contiene exactamente fecha, cita y titulo, sin A ni campos de publicación", async () => {
  const { response, body } = await setup().request(`fecha=${TODAY}&resumen=1`);
  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, item: { fecha: study.fecha, cita: study.cita, titulo: study.titulo } });
  assert.deepEqual(Object.keys(body.item), ["fecha", "cita", "titulo"]);
  assert.ok(!JSON.stringify(body).includes("contenidoMarkdown"));
});

test("no trunca un estudio largo ni cambia comillas, Markdown o saltos de línea", async () => {
  const longStudy = { ...study, contenidoMarkdown: "# Prueba\n\n" + "á, \"b\" y oración.\r\n".repeat(2000) + "\nFin. " };
  const { body, response } = await setup({ text: csv([row(longStudy)]) }).request();
  assert.equal(response.status, 200);
  assert.equal(body.item.contenidoMarkdown, longStudy.contenidoMarkdown);
  assert.ok(body.item.contenidoMarkdown.length > 30000);
});

test("sin coincidencia exacta devuelve 404, sin reutilizar estudios de otro día", async () => {
  const rows = [row({ ...study, fecha: "2026-10-25" }), row({ ...study, fecha: "2026-10-27" })];
  for (const text of [csv(rows), csv([]), csv([row(study, "no")])]) {
    const { response, body } = await setup({ text }).request();
    assert.equal(response.status, 404);
    assert.deepEqual(body, { ok: false, error: "not_found" });
  }
});

test("solo publica sí/si explícitos y descarta borradores incluso con campos incompletos", () => {
  for (const value of ["sí", "si", " SÍ ", "Si", "si\u0301"]) assert.deepEqual(parseEstudiosCsv(csv([row(study, value)]), { today: TODAY }), [study]);
  for (const value of ["no", "true", "yes", "1", "s", ""]) assert.deepEqual(parseEstudiosCsv(csv([row(study, value)]), { today: TODAY }), []);
  assert.deepEqual(parseEstudiosCsv(csv([["", "", "", "", "no"]]), { today: TODAY }), []);
});

test("no solicita una fecha futura a la fuente y respeta el día civil de Madrid", async () => {
  const app = setup();
  const result = await app.request("fecha=2026-10-27");
  assert.equal(result.response.status, 404);
  assert.equal(app.calls.length, 0);
  for (const [instant, expected] of [["2026-10-26T22:59:59Z", 404], ["2026-10-26T23:00:00Z", 200]]) {
    const { response } = await setup({ now: new Date(instant), text: csv([row({ ...study, fecha: "2026-10-27" })]) }).request("fecha=2026-10-27");
    assert.equal(response.status, expected, instant);
  }
  const summer = setup({ now: new Date("2026-07-01T22:30:00Z"), text: csv([row({ ...study, fecha: "2026-07-02" })]) });
  assert.equal((await summer.request("fecha=2026-07-02")).response.status, 200);
});

test("cabecera estricta de cinco campos, sin columnas privadas ni columnas adicionales", async () => {
  const headers = [
    [...ESTUDIOS_HEADERS, "originalDriveId"],
    ESTUDIOS_HEADERS.map((value) => value === "titulo" ? "Título" : value),
    ["cita", "fecha", ...ESTUDIOS_HEADERS.slice(2)]
  ];
  for (const header of headers) {
    const { response } = await setup({ text: csv([], header) }).request();
    assert.equal(response.status, 503);
  }
  assert.deepEqual(parseEstudiosCsv("\uFEFF" + csv(), { today: TODAY }), [study]);
});

test("rechaza CSV roto, filas con ancho incorrecto y fechas publicadas duplicadas", async () => {
  const malformed = [
    csvRows([ESTUDIOS_HEADERS]) + '\n"sin cerrar',
    csvRows([ESTUDIOS_HEADERS]) + '\nfecha"incorrecta",cita,titulo,A,sí',
    csvRows([ESTUDIOS_HEADERS]) + '\n"fecha"sobrante,cita,titulo,A,sí',
    csv([[...row(), "extra"]]), csv([row().slice(0, -1)]), csv([row(), row()])
  ];
  for (const text of malformed) assert.equal((await setup({ text }).request()).response.status, 503);
});

test("rechaza contenido publicado incompleto o mayor que la celda de Sheets, sin recortarlo", async () => {
  for (const item of [
    { ...study, fecha: "2026-02-30" }, { ...study, cita: " " }, { ...study, titulo: "" },
    { ...study, contenidoMarkdown: "\n " }, { ...study, contenidoMarkdown: "a".repeat(50001) }
  ]) assert.equal((await setup({ text: csv([row(item)]) }).request()).response.status, 503);
});

test("no sirve Parte B ni rótulos de taller con formato Markdown", async () => {
  for (const marker of ["**PARTE B. TALLER PARA PISTAS**", "## PARTE B — Taller", "> **B. TALLER PARA ELABORAR LAS PISTAS**", "TALLER EXCLUSIVO PARA PISTAS"]) {
    const item = { ...study, contenidoMarkdown: study.contenidoMarkdown + "\n\n" + marker + "\nContenido interno de prueba." };
    const { response, body } = await setup({ text: csv([row(item)]) }).request();
    assert.equal(response.status, 503, marker);
    assert.ok(!JSON.stringify(body).includes("Contenido interno"));
  }
});

test("no expone referencias internas en A, título o cita ni URL de documentos", async () => {
  const refs = ['{"originalDriveId":"TEST_PRIVATE_REFERENCE"}', "originalUrl: TEST_PRIVATE_REFERENCE", "**notasInternas**: prueba", "https://drive.google.com/file/d/TEST_REFERENCE/view", "https://docs.google.com/document/d/TEST_REFERENCE/edit", "project-file:prueba", "library-file:prueba", "file:///C:/prueba.txt"];
  for (const ref of refs) {
    for (const field of ["cita", "titulo", "contenidoMarkdown"]) {
      const { response, body } = await setup({ text: csv([row({ ...study, [field]: ref })]) }).request();
      assert.equal(response.status, 503, `${field}: ${ref}`);
      assert.deepEqual(body, { ok: false, error: "unavailable" });
    }
  }
});

test("errores de proveedor, HTML de acceso y excepciones devuelven 503 sin secretos", async () => {
  for (const fetcher of [
    async () => new Response("provider-secret", { status: 403 }),
    async () => new Response("<html>provider-secret</html>", { headers: { "content-type": "text/html" } }),
    async () => new Response('{"provider-secret":true}', { headers: { "content-type": "application/json" } }),
    async () => { throw new Error("provider-secret https://private.example.invalid/?token=secret"); }
  ]) {
    const { response, body } = await setup({ fetcher }).request();
    assert.equal(response.status, 503);
    assert.deepEqual(body, { ok: false, error: "unavailable" });
    assert.ok(!JSON.stringify(body).includes("secret"));
  }
});

test("una URL explícita insegura o inválida no llega a la red", async () => {
  for (const source of ["http://example.invalid/estudios.csv", "https://user:password@example.invalid/estudios.csv", "not a URL"]) {
    const app = setup({ source });
    assert.equal((await app.request()).response.status, 503);
    assert.equal(app.calls.length, 0);
  }
});

test("OPTIONS y métodos no admitidos no leen material", async () => {
  const app = setup();
  const options = await app.request("", "OPTIONS");
  assert.equal(options.response.status, 204);
  assert.equal(options.body, null);
  const { response, body } = await app.request("", "POST");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET,OPTIONS");
  assert.deepEqual(body, { ok: false, error: "method_not_allowed" });
  assert.equal(app.calls.length, 0);
});

test("la exportación del parser no cambia la interpretación vigente de Pistas", () => {
  const source = csvRows([["fecha", "publicar", "titulo", "pistas", "fraseDestacada"], ["26/10/2026", "sí", " Lunes ", "Pista, con \"cita\".\r\nOración.", "La frase aprobada"]]);
  const [item] = parsePistasCsv(source);
  assert.equal(item.fecha, TODAY);
  assert.equal(item.titulo, "Lunes");
  assert.equal(item.pistas, "Pista, con \"cita\".\nOración.");
  assert.equal(item.fraseDestacada, "La frase aprobada");
  assert.equal(Object.keys(item).length, 15);
});
