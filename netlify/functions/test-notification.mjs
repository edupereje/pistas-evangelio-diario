import webpush from "web-push";
import { json, options } from "./_utils.mjs";
import { setupVapid, readEnv, validSubscription } from "./_push.mjs";

export function createTestNotification({ push = webpush, env = readEnv } = {}) {
  return async function handler(req) {
    if (req.method === "OPTIONS") return options();
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    const body = await req.json().catch(() => null);
    if (!validSubscription(body?.subscription)) return json({ error: "Suscripción no válida" }, 400);
    try {
      setupVapid(push, env);
      await push.sendNotification(body.subscription, JSON.stringify({
        title: "Pistas del Evangelio", body: "Notificación de prueba activada correctamente.", url: "/"
      }));
      return json({ ok: true });
    } catch (error) {
      const gone = [404, 410].includes(Number(error?.statusCode || error?.status));
      return json({ error: gone ? "La suscripción ha caducado. Desactiva y vuelve a activar los avisos." : "No se pudo enviar la prueba. Revisa la configuración de avisos." }, gone ? 410 : 502);
    }
  };
}
export default createTestNotification();
