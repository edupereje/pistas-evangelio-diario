import { json, options } from "./_utils.mjs";
import { fetchPistasFromSheet, publicSourceInfo, readLocalPistasFallback } from "./_content.mjs";

function responseBody(items, sourceInfo, extra = {}) {
  return {
    ok: true,
    ...sourceInfo,
    ...extra,
    count: items.length,
    firstFecha: items[0]?.fecha || null,
    lastFecha: items[items.length - 1]?.fecha || null,
    generatedAt: new Date().toISOString(),
    items
  };
}

function noStore(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();

  try {
    const items = await fetchPistasFromSheet();
    return noStore(responseBody(items, publicSourceInfo()));
  } catch (sheetError) {
    console.error("Error leyendo Google Sheet en /api/pistas", sheetError);
    try {
      const items = await readLocalPistasFallback();
      return noStore(responseBody(items, {
        source: "local-json-fallback",
        sheetId: publicSourceInfo().sheetId,
        usesExplicitCsvUrl: publicSourceInfo().usesExplicitCsvUrl
      }, {
        warning: "No se pudo leer Google Sheet como CSV público; se usa el respaldo local incluido en el deploy.",
        sheetError: sheetError.message || String(sheetError)
      }));
    } catch (fallbackError) {
      return json({
        ok: false,
        ...publicSourceInfo(),
        error: sheetError.message || String(sheetError),
        fallbackError: fallbackError.message || String(fallbackError),
        generatedAt: new Date().toISOString()
      }, 500);
    }
  }
}
