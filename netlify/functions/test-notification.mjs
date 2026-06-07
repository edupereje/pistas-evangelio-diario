import webpush from "web-push";
import { json, options, env } from "./_utils.mjs";

function setupVapid() {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  const subject = env("VAPID_SUBJECT") || "mailto:info@example.com";
  if (!publicKey || !privateKey) throw new Error("Faltan claves VAPID");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  setupVapid();
  const body = await req.json().catch(() => null);
  if (!body?.subscription) return json({ error: "Falta subscription" }, 400);

  const payload = JSON.stringify({
    title: "Pistas del Evangelio",
    body: "Notificación de prueba activada correctamente.",
    url: "/"
  });

  await webpush.sendNotification(body.subscription, payload);
  return json({ ok: true });
}
