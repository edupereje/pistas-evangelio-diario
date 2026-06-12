import webpush from "web-push";
import { json, options, vapidEnv } from "./_utils.mjs";

function setupVapid() {
  const { publicKey, privateKey, subject } = vapidEnv();
  if (!publicKey || !privateKey) throw new Error("Faltan claves VAPID en Netlify");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function errorMessage(error) {
  const status = error?.statusCode || error?.status || "";
  const body = error?.body ? ` ${String(error.body).slice(0, 300)}` : "";
  return `${status ? `HTTP ${status}: ` : ""}${error?.message || "Error desconocido"}${body}`;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    setupVapid();
    const body = await req.json().catch(() => null);
    if (!body?.subscription?.endpoint) return json({ error: "Falta subscription" }, 400);

    const payload = JSON.stringify({
      title: "Pistas del Evangelio",
      body: "Notificación de prueba activada correctamente.",
      url: "/"
    });

    await webpush.sendNotification(body.subscription, payload);
    return json({ ok: true });
  } catch (error) {
    console.error("test-notification error", error);
    return json({ ok: false, error: errorMessage(error) }, 500);
  }
}
