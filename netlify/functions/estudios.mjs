import { estudiosCsvUrl, fetchEstudio, isIsoCalendarDate } from "./_estudios.mjs";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
  "x-content-type-options": "nosniff"
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export function createEstudiosHandler({ readEnv, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  return async function handler(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405, headers: { ...HEADERS, allow: "GET,OPTIONS" }
      });
    }
    const query = new URL(req.url).searchParams;
    const fecha = query.get("fecha");
    if (query.getAll("fecha").length !== 1 || !isIsoCalendarDate(fecha)) {
      return json({ ok: false, error: "invalid_date" }, 400);
    }
    const summary = query.get("resumen");
    if (query.getAll("resumen").length > 1 || (summary !== null && summary !== "0" && summary !== "1")) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }
    try {
      const csvUrl = estudiosCsvUrl(readEnv);
      if (!csvUrl) return json({ ok: false, error: "unavailable" }, 503);
      const item = await fetchEstudio(fecha, { csvUrl, fetchImpl, now: now() });
      if (!item) return json({ ok: false, error: "not_found" }, 404);
      if (summary === "1") {
        const { fecha: day, cita, titulo } = item;
        return json({ ok: true, item: { fecha: day, cita, titulo } }, 200);
      }
      return json({ ok: true, item }, 200);
    } catch (_) {
      // Do not expose source URLs, unpublished text, or provider errors.
      return json({ ok: false, error: "unavailable" }, 503);
    }
  };
}

export default createEstudiosHandler();
