import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { json, madridParts, timeMatches } from "./_utils.mjs";
import { fetchPistasFromSheet, selectTodayPista } from "./_content.mjs";
import { SUBSCRIPTIONS, DELIVERIES, setupVapid, readEnv } from "./_push.mjs";

export function createSendDaily({ stores = getStore, push = webpush, readPistas = fetchPistasFromSheet,
  clock = () => new Date(), env = readEnv, logger = console } = {}) {
  let running;
  async function send() {
    const instant = clock();
    const now = madridParts(instant);
    const stats = { checked: 0, sent: 0, skipped: 0, removed: 0, errors: 0, stateErrors: 0 };
    // Sending requires the live published source; never send a local fallback.
    const pista = selectTodayPista(await readPistas(), instant);
    if (!pista) return { ...stats, reason: "no-pista-today", date: now.date };
    setupVapid(push, env);
    const store = stores({ name: SUBSCRIPTIONS, consistency: "strong" });
    const deliveries = stores({ name: DELIVERIES, consistency: "strong" });
    const due = new Map();
    const payload = JSON.stringify({
      title: pista.notificacionTitulo || "Pistas del Evangelio",
      body: pista.notificacionTexto || `Ya está disponible la Pista de hoy: ${pista.cita || "Evangelio del día"}`,
      url: `/?fecha=${pista.fecha}`,
      tag: `pistas-${pista.fecha}`
    });
    for await (const page of store.list({ paginate: true })) {
      for (const { key } of page.blobs) {
        stats.checked++;
        try {
          const item = await store.get(key, { type: "json" });
          if (!item?.active || !item.subscription) { stats.skipped++; continue; }
          if (!due.has(item.time)) due.set(item.time, timeMatches(item.time, now.time, instant));
          if (!due.get(item.time) || item.lastSentDate === now.date) { stats.skipped++; continue; }
          const receipt = await deliveries.get(key, { type: "json" });
          if (receipt?.lastSentDate === now.date) { stats.skipped++; continue; }
          try {
            await push.sendNotification(item.subscription, payload);
          } catch (error) {
            const status = Number(error?.statusCode || error?.status);
            if (status === 404 || status === 410) {
              await store.delete(key);
              await deliveries.delete(key);
              stats.removed++;
            } else {
              stats.errors++;
              logger.error("send-daily: proveedor rechazó el aviso", { status: status || null });
            }
            continue;
          }
          stats.sent++;
          const mark = { lastSentDate: now.date, lastSentAt: clock().toISOString() };
          // Blobs 8.1.2 has no atomic conditional writes. A receipt independent
          // of preferences prevents those updates from erasing delivery proof.
          try { await deliveries.setJSON(key, mark); }
          catch { stats.stateErrors++; }
          try {
            const latest = await store.get(key, { type: "json" });
            if (latest) await store.setJSON(key, { ...latest, ...mark });
          } catch { stats.stateErrors++; }
        } catch {
          stats.errors++;
          logger.error("send-daily: no se pudo procesar una suscripción");
        }
      }
    }
    logger.log("send-daily", { ...stats, date: now.date, time: now.time });
    return { ...stats, date: now.date };
  }
  return async function handler() {
    if (!running) running = send().finally(() => { running = null; });
    return json(await running);
  };
}

export default createSendDaily();
export const config = { schedule: "*/15 * * * *" };
