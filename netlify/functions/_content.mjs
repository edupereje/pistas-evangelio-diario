const DEFAULT_SHEET_ID = "1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E";
const DEFAULT_SHEET_NAME = "Contenido";

function envValue(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env?.get) return Netlify.env.get(name);
  } catch (_) {}
  return process.env[name];
}

export function sheetCsvUrl() {
  const explicit = envValue("PISTAS_SHEET_CSV_URL") || envValue("SHEET_CSV_URL") || envValue("GOOGLE_SHEET_CSV_URL");
  if (explicit && String(explicit).trim()) return String(explicit).trim();

  const sheetId = envValue("PISTAS_SHEET_ID") || envValue("GOOGLE_SHEET_ID") || DEFAULT_SHEET_ID;
  const sheetName = envValue("PISTAS_SHEET_NAME") || DEFAULT_SHEET_NAME;
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

export function publicSourceInfo() {
  const url = sheetCsvUrl();
  return {
    source: "google-sheet-csv",
    sheetId: (url.match(/\/spreadsheets\/d\/([^/]+)/) || [])[1] || null,
    usesExplicitCsvUrl: Boolean(envValue("PISTAS_SHEET_CSV_URL") || envValue("SHEET_CSV_URL") || envValue("GOOGLE_SHEET_CSV_URL"))
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = "";
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => String(value).trim() !== "")) rows.push(row);
  return rows;
}

function slugHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function excelSerialToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 30000 || serial > 60000) return "";
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

export function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  const serial = excelSerialToIso(raw);
  if (serial) return serial;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return raw;
}

function normalizePublicar(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "sí" || text === "si" || text === "s" || text === "yes" || text === "true" || text === "1";
}

function titleFromDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function rowToObject(headers, row) {
  const object = {};
  headers.forEach((header, index) => {
    if (!header) return;
    object[header] = cleanText(row[index]);
  });
  return object;
}

export function parsePistasCsv(csvText) {
  const rows = parseCsv(csvText);
  const headerIndex = rows.findIndex((row) => row.some((cell) => slugHeader(cell) === "fecha") && row.some((cell) => slugHeader(cell) === "publicar"));
  if (headerIndex < 0) throw new Error("No se encontró la cabecera de la hoja Contenido: fecha, publicar, titulo...");

  const headers = rows[headerIndex].map(slugHeader);
  const items = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const object = rowToObject(headers, row);
    const fecha = normalizeDate(object.fecha);
    if (!fecha) continue;
    if (!normalizePublicar(object.publicar)) continue;

    items.push({
      fecha,
      publicar: object.publicar || "sí",
      titulo: object.titulo && !/^\d{5}$/.test(object.titulo) ? object.titulo : titleFromDate(fecha),
      celebracion: object.celebracion || "",
      cita: object.cita || "",
      evangelioTitulo: object.evangelioTitulo || "",
      evangelio: object.evangelio || "",
      pistas: object.pistas || "",
      estoyEmpezando: object.estoyEmpezando || "",
      fraseDestacada: object.fraseDestacada || "",
      imagenDiaUrl: object.imagenDiaUrl || "",
      audioUrl: object.audioUrl || "",
      notificacionTitulo: object.notificacionTitulo || "",
      notificacionTexto: object.notificacionTexto || "",
      notasInternas: object.notasInternas || ""
    });
  }

  items.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return items;
}

export async function fetchPistasFromSheet() {
  const url = sheetCsvUrl();
  const response = await fetch(url, {
    headers: {
      "user-agent": "Pistas-del-Evangelio/1.0",
      "accept": "text/csv,text/plain,*/*"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`No se pudo leer Google Sheet como CSV. HTTP ${response.status}. Revisa que la hoja esté compartida/publicada y que la URL CSV sea correcta.`);
  }

  const csv = await response.text();
  const items = parsePistasCsv(csv);
  if (!items.length) throw new Error("La hoja se leyó, pero no devolvió ninguna Pista publicada.");
  return items;
}

export async function readLocalPistasFallback() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const candidates = [
    path.resolve(process.cwd(), "public/data/pistas.json"),
    path.resolve(process.cwd(), "data/pistas.json")
  ];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
      if (items.length) return items.sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No se pudo leer el respaldo local public/data/pistas.json: ${lastError?.message || "sin detalle"}`);
}

export function madridDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function selectTodayPista(items, date = new Date()) {
  const today = madridDate(date);
  return items.find((p) => p.fecha === today) || items.filter((p) => p.fecha <= today).slice(-1)[0] || items[0] || null;
}
