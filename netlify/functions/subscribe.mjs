import { getStore } from "@netlify/blobs";
import { json, options, sha256Base64Url, validNotificationTime } from "./_utils.mjs";
import { SUBSCRIPTIONS, validSubscription } from "./_push.mjs";

export function createSubscribe({ stores = getStore, clock = () => new Date() } = {}) {
  return async function handler(req) {
    if (req.method === "OPTIONS") return options();
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    const body = await req.json().catch(() => null);
    if (!validSubscription(body?.subscription) || !validNotificationTime(body?.time)) {
      return json({ error: "Revisa la suscripción y elige una hora entre las 00:00 y las 23:45 (HH:MM). El aviso puede llegar en los 15 minutos siguientes." }, 400);
    }
    const key = await sha256Base64Url(body.subscription.endpoint);
    const store = stores({ name: SUBSCRIPTIONS, consistency: "strong" });
    const existing = await store.get(key, { type: "json" });
    await store.setJSON(key, {
      ...existing, subscription: body.subscription, time: body.time,
      timezone: "Europe/Madrid", active: true,
      lastSentDate: existing?.lastSentDate || null,
      lastSentAt: existing?.lastSentAt || null,
      updatedAt: clock().toISOString()
    });
    return json({ ok: true, time: body.time });
  };
}
export default createSubscribe();
