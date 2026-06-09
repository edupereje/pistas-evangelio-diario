const FIXED_SHEET_ID = "1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E";
const FIXED_SHEET_NAME = "Contenido";
const FIXED_GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${FIXED_SHEET_ID}/edit?usp=sharing`;
const DEFAULT_CONTENT_API_URL = "https://script.google.com/macros/s/AKfycbwp6Wadx4mDBeTtlQDVBnlUn1ty7eWcipS2pG-OQTAN3jqTNFVULLjUIDDJ4ZE1TOfpWQ/exec";

let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function env(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env?.get) return Netlify.env.get(name);
  } catch (_) {}
  return process.env[name];
}

export function contentApiUrl() {
  const value = String(env("CONTENT_API_URL") || "").trim();
  return value || DEFAULT_CONTENT_API_URL;
}

function looksLikeGoogleSheetUrl(url) {
  return /docs\.google\.com\/spreadsheets\/d\//i.test(String(url || ""));
}

function csvUrlFromGoogleSheet(url = FIXED_GOOGLE_SHEET_URL) {
  const match = String(url).match(/\/spreadsheets\/d\/([^/]+)/i);
  const sheetId = match?.[1] || FIXED_SHEET_ID;
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(FIXED_SHEET_NAME)}&t=${Date.now()}`;
}

async function fetchJsonFromAppsScript(url) {
  const response = await fetch(url, {
    headers: { "accept": "application/json" },
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.ok || !Array.isArray(data.items)) throw new Error(data?.error || "Respuesta de Apps Script no válida");
  return { ...data, source: "apps-script" };
}

async function fetchCsvFromFixedGoogleSheet() {
  const response = await fetch(csvUrlFromGoogleSheet(FIXED_GOOGLE_SHEET_URL), {
    headers: { "accept": "text/csv,text/plain,*/*" },
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`Google Sheet CSV HTTP ${response.status}`);
  const csv = await response.text();
  const rows = parseCsv(csv);
  const items = rowsToItems(rows);
  if (!items.length) throw new Error("El CSV del Google Sheet no devolvió filas de contenido.");
  return {
    ok: true,
    source: "google-sheet-csv",
    sheetId: FIXED_SHEET_ID,
    sheetName: FIXED_SHEET_NAME,
    sheetUrl: FIXED_GOOGLE_SHEET_URL,
    fetchedAt: new Date().toISOString(),
    items
  };
}

export async function fetchContent({ force = false } = {}) {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_TTL_MS) return cached;

  let data;
  const configuredUrl = contentApiUrl();
  const errors = [];

  // 1) Si CONTENT_API_URL apunta por error al Google Sheet, lo tratamos como Google Sheet.
  // 2) Si apunta al Apps Script, lo usamos primero.
  // 3) Como garantía permanente, siempre podemos leer del Google Sheet fijo por ID.
  try {
    if (looksLikeGoogleSheetUrl(configuredUrl)) {
      data = await fetchCsvFromFixedGoogleSheet();
    } else {
      data = await fetchJsonFromAppsScript(configuredUrl);
    }
  } catch (error) {
    errors.push(error.message);
    data = await fetchCsvFromFixedGoogleSheet();
  }

  const items = data.items
    .map(normalizePista)
    .filter((item) => item.fecha && item.publicar.toLowerCase() !== "no")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  cached = {
    ...data,
    ok: true,
    items,
    count: items.length,
    proxiedAt: new Date().toISOString(),
    configuredContentApiUrl: configuredUrl,
    fixedGoogleSheetUrl: FIXED_GOOGLE_SHEET_URL,
    fallbackErrors: errors
  };
  cachedAt = now;
  return cached;
}

export function normalizePista(item = {}) {
  const fieldNames = [
    "fecha", "publicar", "titulo", "celebracion", "cita", "evangelioTitulo", "evangelio", "pistas",
    "estoyEmpezando", "fraseDestacada", "imagenDiaUrl", "audioUrl", "notificacionTitulo", "notificacionTexto", "notasInternas"
  ];
  const normalized = {};
  fieldNames.forEach((field) => normalized[field] = String(item[field] || "").trim());
  normalized.fecha = normalizeDate(normalized.fecha);
  normalized.publicar = normalized.publicar || "sí";
  return normalized;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const es = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (es) return `${es[3]}-${String(es[2]).padStart(2,"0")}-${String(es[1]).padStart(2,"0")}`;
  return raw.split(" ")[0];
}

function rowsToItems(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = row[index] || "";
    });
    return item;
  }).filter((item) => item.fecha || item.titulo || item.evangelio || item.pistas);
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
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.length > 1 || row[0]) rows.push(row);
  return rows;
}

export function madridDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function getPublishedUntilToday(items, date = new Date()) {
  const today = madridDate(date);
  return items.filter((p) => p.fecha <= today);
}
