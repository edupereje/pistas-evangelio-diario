import { getStore } from "@netlify/blobs";
import { json, options, sha256Base64Url } from "./_utils.mjs";
import { SUBSCRIPTIONS, DELIVERIES } from "./_push.mjs";

export function createUnsubscribe({ stores = getStore } = {}) {
  return async function handler(req) {
    if (req.method === "OPTIONS") return options();
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    const body = await req.json().catch(() => null);
    if (typeof body?.endpoint !== "string" || !body.endpoint) return json({ error: "Falta endpoint" }, 400);
    const key = await sha256Base64Url(body.endpoint);
    await stores({ name: SUBSCRIPTIONS, consistency: "strong" }).delete(key);
    await stores({ name: DELIVERIES, consistency: "strong" }).delete(key);
    return json({ ok: true });
  };
}
export default createUnsubscribe();
