import { getStore } from "@netlify/blobs";
import { json, options, sha256Base64Url } from "./_utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const body = await req.json().catch(() => null);
  if (!body?.subscription?.endpoint || !body?.time) return json({ error: "Faltan datos" }, 400);

  const key = await sha256Base64Url(body.subscription.endpoint);
  const store = getStore({ name: "push-subscriptions", consistency: "strong" });
  await store.setJSON(key, {
    subscription: body.subscription,
    time: body.time,
    timezone: "Europe/Madrid",
    active: true,
    lastSentDate: null,
    updatedAt: new Date().toISOString()
  });

  return json({ ok: true, key, time: body.time });
}
