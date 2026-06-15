import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { madridParts, timeMatches, vapidEnv } from "./_utils.mjs";
import { getTodayPista } from "./_pistas.mjs";

function setupVapid() {
  const { publicKey, privateKey, subject } = vapidEnv();
  if (!publicKey || !privateKey) throw new Error("Faltan claves VAPID");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export default async () => {
  setupVapid();
  const now = madridParts(new Date());
  const pista = await getTodayPista(new Date());
  const store = getStore({ name: "push-subscriptions", consistency: "strong" });

  let checked = 0;
  let sent = 0;
  let skipped = 0;
  let removed = 0;

  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      checked++;
      const item = await store.get(blob.key, { type: "json" });
      if (!item?.active || !item?.subscription) { skipped++; continue; }
      if (!timeMatches(item.time, now.time)) { skipped++; continue; }
      if (item.lastSentDate === now.date) { skipped++; continue; }

      const payload = JSON.stringify({
        title: pista.notificacionTitulo || "Pistas del Evangelio",
        body: pista.notificacionTexto || `Ya está disponible la Pista de hoy: ${pista.cita}`,
        url: `/?fecha=${pista.fecha}`
      });

      try {
        await webpush.sendNotification(item.subscription, payload);
        item.lastSentDate = now.date;
        item.lastSentAt = new Date().toISOString();
        await store.setJSON(blob.key, item);
        sent++;
      } catch (error) {
        const status = error?.statusCode || error?.status;
        if (status === 403 || status === 404 || status === 410) {
          await store.delete(blob.key);
          removed++;
        } else {
          console.error("Error enviando push", blob.key, error?.statusCode || error?.status || "", error?.message || error, error?.body || "");
        }
      }
    }
  }

  console.log(`send-daily checked=${checked} sent=${sent} skipped=${skipped} removed=${removed} now=${now.date} ${now.time}`);
};

export const config = { schedule: "*/15 * * * *" };
