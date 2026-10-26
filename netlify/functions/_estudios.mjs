import { madridDate, parseCsv } from "./_content.mjs";

export const ESTUDIOS_HEADERS = ["fecha", "cita", "titulo", "contenidoMarkdown", "publicar"];

function unavailableSource() {
  return new Error("Public studies source unavailable.");
}

function readRuntimeEnv(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env?.get) {
      const value = Netlify.env.get(name);
      if (value !== undefined && value !== null) return value;
    }
  } catch (_) {}
  return process.env[name];
}

// No fallback to Contenido, the private workbook, or a local copy.
export function estudiosCsvUrl(readEnv = readRuntimeEnv) {
  const raw = readEnv("PISTAS_ESTUDIOS_CSV_URL");
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const url = new URL(String(raw).trim());
  if (url.protocol !== "https:" || url.username || url.password) throw unavailableSource();
  return url.href;
}

export function isIsoCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

export function hasWorkshopMarker(text) {
  return text.split(/\r?\n/).some((line) => {
    const label = line.trim()
      .replace(/^(?:(?:#{1,6}|>|[-+])[\t ]*)+/, "")
      .replace(/[*_\u0060]/g, "")
      .trim();
    return /^(?:PARTE[\t ]+B\b|(?:B[.)—–:-][\t ]*)?TALLER(?:[\t ]+EXCLUSIVO)?[\t ]+PARA(?:[\t ]+ELABORAR)?(?:[\t ]+LAS)?[\t ]+PISTAS\b)/i.test(label);
  });
}

export function hasInternalReference(text) {
  return /\b(?:originalDriveId|originalUrl|notasInternas)\b/i.test(text) ||
    /https?:\/\/(?:drive\.google\.com(?:[/:?#]|$)|docs\.google\.com\/(?:document|spreadsheets|presentation)(?:[/?#]|$))/i.test(text) ||
    /\b(?:project-file|library-file):/i.test(text) ||
    /\bfile:\/\//i.test(text);
}

function isPublished(value) {
  const normalized = value.trim().normalize("NFC").toLowerCase();
  return normalized === "sí" || normalized === "si";
}

// Preserve every character of A, including whitespace and Markdown.
// These structural guards supplement the approved-only publishing step;
// they cannot classify unlabeled private prose.
export function parseEstudiosCsv(csvText, { today = madridDate() } = {}) {
  if (typeof csvText !== "string" || !isIsoCalendarDate(today)) throw unavailableSource();
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""), { strict: true });
  const first = rows.findIndex((row) => row.some((cell) => cell.trim() !== ""));
  const header = rows[first];
  if (!header || header.length !== ESTUDIOS_HEADERS.length ||
      header.some((value, index) => value !== ESTUDIOS_HEADERS[index])) throw unavailableSource();
  const dates = new Set();
  const items = [];
  for (const row of rows.slice(first + 1)) {
    if (row.every((cell) => cell.trim() === "")) continue;
    if (row.length !== ESTUDIOS_HEADERS.length) throw unavailableSource();
    const [fecha, cita, titulo, contenidoMarkdown, publicar] = row;
    if (!isPublished(publicar)) continue;
    if (!isIsoCalendarDate(fecha)) throw unavailableSource();
    if (fecha > today) continue;
    if (dates.has(fecha)) throw unavailableSource();
    dates.add(fecha);
    if (![cita, titulo, contenidoMarkdown].every((value) => value.trim() !== "")) throw unavailableSource();
    if (contenidoMarkdown.length > 50000 || [cita, titulo, contenidoMarkdown].some((value) =>
      hasWorkshopMarker(value) || hasInternalReference(value))) throw unavailableSource();
    items.push({ fecha, cita, titulo, contenidoMarkdown });
  }
  return items;
}

export async function fetchEstudio(fecha, {
  csvUrl, fetchImpl = globalThis.fetch, now = new Date()
} = {}) {
  const today = madridDate(now);
  if (!isIsoCalendarDate(fecha)) throw unavailableSource();
  if (fecha > today) return null;
  const response = await fetchImpl(csvUrl, {
    headers: { accept: "text/csv,text/plain" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok || /text\/html|application\/json/i.test(response.headers.get("content-type") || "")) {
    throw unavailableSource();
  }
  const items = parseEstudiosCsv(await response.text(), { today });
  return items.find((item) => item.fecha === fecha) || null;
}
