import { getStore } from "@netlify/blobs";
import { json, options, sha256Base64Url } from "./_utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const body = await req.json().catch(() => null);
  if (!body?.endpoint) return json({ error: "Falta endpoint" }, 400);

  const key = await sha256Base64Url(body.endpoint);
  const store = getStore({ name: "push-subscriptions", consistency: "strong" });
  await store.delete(key);
  return json({ ok: true });
}
