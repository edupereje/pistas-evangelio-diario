import { json, options } from "./_utils.mjs";
import { fetchPistasFromSheet, publicSourceInfo } from "./_content.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();

  try {
    const items = await fetchPistasFromSheet();
    const body = {
      ok: true,
      ...publicSourceInfo(),
      count: items.length,
      firstFecha: items[0]?.fecha || null,
      lastFecha: items[items.length - 1]?.fecha || null,
      generatedAt: new Date().toISOString(),
      items
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type"
      }
    });
  } catch (error) {
    console.error("Error en /api/pistas", error);
    return json({
      ok: false,
      ...publicSourceInfo(),
      error: error.message || String(error),
      generatedAt: new Date().toISOString()
    }, 500);
  }
}
