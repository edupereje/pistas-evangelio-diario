import { readFileSync } from "node:fs";
import { join } from "node:path";

const raw = readFileSync(join(process.cwd(), "public", "data", "pistas.json"), "utf8");
export const pistas = JSON.parse(raw).map(({ fecha, titulo, celebracion, cita }) => ({ fecha, titulo, celebracion, cita }));

function madridDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function getTodayPista(date = new Date()) {
  const today = madridDate(date);
  return pistas.find((p) => p.fecha === today) || pistas.filter((p) => p.fecha <= today).slice(-1)[0] || pistas[0];
}
