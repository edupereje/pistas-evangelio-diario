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
  return env("CONTENT_API_URL") || DEFAULT_CONTENT_API_URL;
}

export async function fetchContent({ force = false } = {}) {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_TTL_MS) return cached;

  const response = await fetch(contentApiUrl(), {
    headers: { "accept": "application/json" },
    redirect: "follow"
  });

  if (!response.ok) throw new Error(`No se pudo cargar el contenido: HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.ok || !Array.isArray(data.items)) throw new Error(data?.error || "Respuesta de contenido no válida");

  const items = data.items
    .map(normalizePista)
    .filter((item) => item.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  cached = { ...data, items, count: items.length, proxiedAt: new Date().toISOString() };
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
  return normalized;
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
