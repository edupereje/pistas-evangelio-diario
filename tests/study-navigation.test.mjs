import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createStudyClient } from "../public/study-client.js";
import { renderStudyMarkdown } from "../public/study-markdown.js";

const appSource = (await readFile(new URL("../public/app.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\binit\(\);\s*$/, "");
const fixture = {
  fecha: "2026-10-27", titulo: "Martes, 27 de octubre", celebracion: "Tiempo ordinario", cita: "Lc 13,18-21",
  evangelioTitulo: "Evangelio según san Lucas", evangelio: "Hasta que todo fermenta.",
  pistas: "    Las Pistas aprobadas permanecen completas.", estoyEmpezando: "Antes de leer: Pide el Espíritu Santo.\nPara entender: El Reino.\nPara rezar: Escucha.",
  notificacionTitulo: "Hasta que todo fermenta", imagenDiaUrl: "", audioUrl: ""
};
const study = { fecha: fixture.fecha, cita: fixture.cita, titulo: "La promesa", contenidoMarkdown: "**La promesa**\n\n**1. Contexto**\n\nA completa.\n\n**7. Preguntas**\n\n- ¿A quién acoges?\n\n**9. Fuentes**\n\nUna fuente." };

function harness(fetcher) {
  const root = { innerHTML: "" };
  const storage = new Map([["pistasInstallDismissed", "true"]]);
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-10-27T12:00:00+01:00"])); }
    static now() { return new Date("2026-10-27T12:00:00+01:00").getTime(); }
  }
  const context = {
    createStudyClient, renderStudyMarkdown, fetch: fetcher, Date: TestDate, Intl, URL, URLSearchParams,
    console, setTimeout, clearTimeout,
    document: { getElementById: (id) => id === "app" ? root : null },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }), navigator: {}, scrollTo() {} },
    navigator: { userAgent: "Test", standalone: false },
    location: { search: "", origin: "http://localhost", href: "http://localhost/" },
    history: { replaceState() {} },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) }
  };
  vm.runInNewContext(`${appSource}\nthis.testApp = { init, render, openStudy, goHome, openPista, setTab, setPistas: (rows) => { pistas = rows; }, current: () => currentTab };`, context);
  context.testApp.setPistas([fixture]);
  return { app: context.testApp, root, context };
}

test("Hoy y lectura piden solo disponibilidad; A se obtiene al abrir Profundiza", async () => {
  const requests = [];
  const { app, root } = harness(async (url) => {
    requests.push(url);
    const item = url.includes("resumen=1") ? { fecha: study.fecha, cita: study.cita, titulo: study.titulo } : study;
    return new Response(JSON.stringify({ ok: true, item }));
  });
  app.render();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.length, 1);
  assert.match(requests[0], /resumen=1/);
  assert.ok(!root.innerHTML.includes("A completa"));
  app.openPista(fixture.fecha);
  assert.match(root.innerHTML, /Profundiza en el Evangelio/);
  assert.match(root.innerHTML, /Las Pistas aprobadas permanecen completas/);
  await app.openStudy(fixture.fecha);
  assert.equal(requests.length, 2);
  assert.ok(!requests[1].includes("resumen"));
  assert.match(root.innerHTML, /A completa/);
  assert.match(root.innerHTML, /¿A quién acoges\?/);
  assert.match(root.innerHTML, /Una fuente/);
  app.openPista(fixture.fecha);
  assert.match(root.innerHTML, /Las Pistas aprobadas permanecen completas/);
});

test("una respuesta lenta no devuelve al estudio después de salir", async () => {
  let complete;
  const { app, root } = harness(async (url) => {
    if (url.includes("resumen")) return new Response("", { status: 404 });
    return new Promise((resolve) => { complete = () => resolve(new Response(JSON.stringify({ ok: true, item: study }))); });
  });
  const pending = app.openStudy(fixture.fecha);
  assert.match(root.innerHTML, /Abriendo el estudio/);
  app.goHome();
  complete();
  await pending;
  assert.equal(app.current(), "hoy");
  assert.ok(!root.innerHTML.includes("A completa"));
});

test("no abre una fecha futura ni una Pista inexistente", async () => {
  let calls = 0;
  const { app, root } = harness(async () => { calls++; throw new Error("No debe llamarse"); });
  await app.openStudy("2026-10-28");
  await app.openStudy("2026-10-25");
  assert.equal(calls, 0);
  assert.equal(root.innerHTML, "");
});

test("un fallo ofrece reintento y una retirada de publicación no muestra A antigua", async () => {
  let fail = true;
  const { app, root } = harness(async () => {
    if (fail) throw new Error("offline");
    return new Response("", { status: 404 });
  });
  await app.openStudy(fixture.fecha);
  assert.match(root.innerHTML, /No se pudo abrir el estudio/);
  assert.match(root.innerHTML, /Volver a intentarlo/);
  fail = false;
  await app.openStudy(fixture.fecha);
  assert.match(root.innerHTML, /Estudio no disponible/);
  assert.ok(!root.innerHTML.includes("A completa"));
});

test("si el navegador rechaza el acceso sin conexión, las Pistas se siguen cargando", async () => {
  const { app, root, context } = harness(async (url) => {
    if (url.startsWith("/data/")) return new Response(JSON.stringify([fixture]));
    if (url.startsWith("/api/pistas")) return new Response(JSON.stringify({ ok: true, items: [fixture] }));
    return new Response("", { status: 404 });
  });
  context.navigator.serviceWorker = { register: async () => { throw new Error("No permitido en este contexto"); } };
  context.console = { ...console, warn() {} };
  await app.init();
  assert.match(root.innerHTML, /Martes, 27 de octubre/);
  assert.match(root.innerHTML, /Leer la Pista de hoy/);
  assert.ok(!root.innerHTML.includes("Preparando la Pista de hoy"));
});
