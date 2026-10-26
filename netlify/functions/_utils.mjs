export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export async function sha256Base64Url(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash).toString("base64url");
}

export function madridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function validNotificationTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && value <= "23:45";
}

// Resolve the chosen wall time using Madrid's real offsets. In autumn use the
// first occurrence; a missing spring time moves to the first valid minute.
export function madridScheduledTime(chosen, date) {
  if (!validNotificationTime(chosen)) return null;
  const day = madridParts(date).date;
  const target = `${day}T${chosen}`;
  const nominal = Date.parse(`${target}:00Z`);
  const offsets = new Set([-12, 0, 12].map((hours) => {
    const probe = nominal + hours * 3600000;
    const local = madridParts(new Date(probe));
    return Date.parse(`${local.date}T${local.time}:00Z`) - probe;
  }));
  const candidates = [...offsets].map((offset) => nominal - offset).sort((a, b) => a - b);
  const localStamp = (instant) => {
    const local = madridParts(new Date(instant));
    return `${local.date}T${local.time}`;
  };
  const exact = candidates.find((instant) => localStamp(instant) === target);
  if (exact !== undefined) return new Date(exact);
  if (candidates.length < 2) return null;
  for (let instant = candidates[0]; instant <= candidates.at(-1); instant += 60000) {
    if (localStamp(instant) >= target) return new Date(instant);
  }
  return null;
}

export function timeMatches(chosen, current, date) {
  if (!validNotificationTime(chosen) || typeof current !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(current)) return false;
  if (date) {
    const scheduled = madridScheduledTime(chosen, date);
    const diff = scheduled ? date.getTime() - scheduled.getTime() : -1;
    return diff >= 0 && diff < 15 * 60000;
  }
  const toMinutes = (value) => {
    const [h, m] = String(value || "").split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const c = toMinutes(chosen);
  const n = toMinutes(current);
  if (c === null || n === null) return false;
  const diff = n - c;
  return diff >= 0 && diff < 15;
}

// Compatibilidad con notification-diagnostics.mjs que podía quedar en el repositorio anterior.
// Netlify empaqueta todas las funciones presentes en GitHub; si ese archivo antiguo
// sigue allí, necesita este export para que el build no falle.
export function vapidEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "";
  return {
    ok: Boolean(publicKey && privateKey && subject),
    publicKeyPresent: Boolean(publicKey),
    privateKeyPresent: Boolean(privateKey),
    subjectPresent: Boolean(subject),
    subject,
    publicKeyLength: publicKey.length,
    privateKeyLength: privateKey.length
  };
}
