let pistas = [];
let currentTab = "hoy";
let selectedFecha = null;
let deferredPrompt = null;

const APP_URL = "https://pistas-evangelio-diario.netlify.app";
const DONATION_URL = "https://www.donoamiiglesia.es/san/Home?st=&uri=nm%3Aoid%3AZ6_KP98H380OG7J40QGP8F2L01003#!/donar/21acd17c-ed3e-e611-80e8-005056b101e1";
const CONTACT_PHONE = "34662519044";
const CONTENT_API_URL = "/api/pistas";
const STATIC_FALLBACK_URL = "/data/pistas.json?v=8.14";
const REMEMBER_STEPS = [
  "Pide el Espíritu Santo",
  "Lee despacio y entiende",
  "Escucha lo que Dios te dice",
  "Respóndele con tu oración",
  "Llévalo a tu vida"
];

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  render();
});

window.addEventListener("appinstalled", () => {
  localStorage.setItem("pistasInstalled", "true");
  localStorage.removeItem("pistasInstallDismissed");
  render();
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isSafariIOS() {
  const ua = navigator.userAgent;
  return isIOS() && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

function isLikelyInAppBrowser() {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|Line|WhatsApp|MicroMessenger|Messenger/i.test(ua);
}

function todayMadrid() {
  // Evita problemas entre navegadores: algunos no devuelven en-CA como YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isPastOrToday(fecha) {
  return fecha <= todayMadrid();
}

function availablePistas() {
  return pistas.filter((p) => isPastOrToday(p.fecha));
}

function dayIsAvailable(fecha) {
  return pistas.some((p) => p.fecha === fecha && isPastOrToday(p.fecha));
}

function getTodayPista() {
  const requested = new URLSearchParams(location.search).get("fecha");
  const today = todayMadrid();
  if (requested && dayIsAvailable(requested)) return pistas.find((p) => p.fecha === requested);
  return pistas.find((p) => p.fecha === today) || availablePistas().slice(-1)[0] || pistas[0] || null;
}

function getPista(fecha) {
  return pistas.find((p) => p.fecha === fecha && isPastOrToday(p.fecha)) || getTodayPista();
}

function cleanVapidPublicKey(value) {
  return String(value || "")
    .trim()
    .replace(/^VAPID_PUBLIC_KEY\s*=\s*/i, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
}

function urlBase64ToUint8Array(base64String) {
  const key = cleanVapidPublicKey(base64String);
  if (!key) throw new Error("Falta la clave pública VAPID.");

  const padding = "=".repeat((4 - key.length % 4) % 4);
  const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");

  try {
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  } catch (error) {
    throw new Error("La clave pública VAPID no tiene formato válido. Revisa VAPID_PUBLIC_KEY en Netlify: debe pegarse solo el valor, sin 'VAPID_PUBLIC_KEY=' ni comillas.");
  }
}

async function getActiveSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return await registration.pushManager.getSubscription();
}

function notificationState() {
  return JSON.parse(localStorage.getItem("pistasNotificationState") || "{}");
}

function saveNotificationState(state) {
  localStorage.setItem("pistasNotificationState", JSON.stringify(state));
}

function prayerTime() {
  return localStorage.getItem("pistasPrayerTime") || "08:00";
}

function setPrayerTime(value) {
  localStorage.setItem("pistasPrayerTime", value);
}

function dayUrl(fecha) {
  return `${location.origin}/?fecha=${fecha}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[s]));
}

function rememberText() {
  return REMEMBER_STEPS.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

const CLOSING_TEXT = "Relee el Evangelio, escucha lo que Dios te dice, respóndele con tu oración y llévalo a tu vida.";

function cleanPistasTextForShare(pistas) {
  let text = String(pistas || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Evita duplicar el cierre cuando ya viene incluido en la hoja de contenidos.
  const closingPattern = /\n*\s*\*?_?Relee el Evangelio, escucha lo que Dios te dice, respóndele con tu oración y llévalo a tu vida\.?_?\*?\s*$/i;
  while (closingPattern.test(text)) {
    text = text.replace(closingPattern, "").trim();
  }
  return text;
}

function formatFullText(p) {
  const pistasText = cleanPistasTextForShare(p.pistas);
  return `*${p.titulo}*\n*${p.celebracion}*\n\n(Recuerda:  \n${rememberText()})\n\n*${p.evangelioTitulo}*\n${p.evangelio}\n\n*Pistas:* ${pistasText}\n\n*${CLOSING_TEXT}*`;
}

function formatShareText(p, includeLink = false) {
  const base = formatFullText(p);
  return includeLink ? `${base}\n\nAbrir en la app:\n${dayUrl(p.fecha)}` : base;
}

async function init() {
  renderLoading();
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js?v=8.14");
  }

  // Cargamos primero una copia local de respaldo para que la app nunca quede vacía
  // si la función/API tarda, falla o devuelve una respuesta incompleta.
  try {
    pistas = await loadStaticFallback();
  } catch (fallbackError) {
    console.warn("No se pudo cargar contenido local de respaldo", fallbackError);
    pistas = [];
  }

  // Después intentamos actualizar desde Google Sheets a través de Netlify Functions.
  try {
    const remotePistas = await loadPistasFromApi();
    if (Array.isArray(remotePistas) && remotePistas.length > 0) {
      pistas = remotePistas;
    } else {
      console.warn("La API no devolvió Pistas; se mantiene el respaldo local.");
    }
  } catch (error) {
    console.warn("No se pudo cargar el contenido desde Google Sheets; se mantiene respaldo local", error);
  }

  if (!Array.isArray(pistas) || pistas.length === 0) {
    renderError("No se pudo cargar el contenido. Comprueba la conexión y vuelve a intentarlo.");
    return;
  }

  const params = new URLSearchParams(location.search);
  const requestedFecha = params.get("fecha");
  const requestedRead = params.get("leer") === "1" || params.get("view") === "lectura";
  if (requestedFecha && dayIsAvailable(requestedFecha)) {
    selectedFecha = requestedFecha;
    if (requestedRead || params.has("fecha")) currentTab = "lectura";
  } else {
    selectedFecha = getTodayPista()?.fecha;
  }
  render();
}

async function loadStaticFallback() {
  const response = await fetch(STATIC_FALLBACK_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Error fallback HTTP ${response.status}`);
  const data = await response.json();
  const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
  if (!items.length) throw new Error("El respaldo local no contiene Pistas.");
  return items.map(normalizePista).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function loadPistasFromApi() {
  const response = await fetch(`${CONTENT_API_URL}?force=1&t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok || !Array.isArray(data.items)) throw new Error(data.error || "Respuesta de contenido no válida");
  const items = data.items.map(normalizePista).filter((item) => item.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!items.length) throw new Error("La API respondió correctamente, pero no devolvió ninguna Pista.");
  return items;
}


function hasStartingContent(p) {
  return Boolean(p && p.estoyEmpezando && p.estoyEmpezando.trim().length > 0);
}

function hasImage(p) {
  return Boolean(p && p.imagenDiaUrl && /^https?:\/\//i.test(p.imagenDiaUrl.trim()));
}

function normalizePista(item) {
  const fields = ["fecha", "publicar", "titulo", "celebracion", "cita", "evangelioTitulo", "evangelio", "pistas", "estoyEmpezando", "fraseDestacada", "imagenDiaUrl", "audioUrl", "notificacionTitulo", "notificacionTexto", "notasInternas"];
  const normalized = {};
  fields.forEach((field) => normalized[field] = String(item?.[field] || "").trim());
  return normalized;
}

function renderLoading() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="app"><header class="header"><div class="logo"><img src="/icons/icon-192.png" alt=""></div><div><div class="title">Pistas del Evangelio</div><div class="subtitle">Cargando contenido...</div></div></header><main class="main"><div class="card hero"><div class="eyebrow">Un momento</div><h1 class="h1">Preparando la Pista de hoy</h1><p class="muted">Estamos cargando el Evangelio y las Pistas desde la hoja de contenidos.</p></div></main></div>`;
}

function renderError(message) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="app"><header class="header"><div class="logo"><img src="/icons/icon-192.png" alt=""></div><div><div class="title">Pistas del Evangelio</div><div class="subtitle">No se pudo cargar</div></div></header><main class="main"><div class="card"><h1 class="h1">Contenido no disponible</h1><p class="muted">${escapeHtml(message)}</p><button class="button" onclick="location.reload()">Reintentar</button></div></main></div>`;
}

async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    render();
    return;
  }
  showInstallHelp();
}

function showInstallHelp() {
  const ios = isIOS();
  const android = isAndroid();
  const standalone = isStandalone();
  const safari = isSafariIOS();
  const inApp = isLikelyInAppBrowser();
  const title = standalone ? "La app ya está instalada" : ios ? "Instalar en iPhone" : android ? "Instalar en Android" : "Instalar la app";

  let body = "";
  if (standalone) {
    body = `<p>Ya estás usando la app desde el icono de la pantalla de inicio.</p>`;
  } else if (ios) {
    body = `
      ${!safari || inApp ? `<div class="install-warning"><strong>Primer paso:</strong> abre este enlace en <strong>Safari</strong>. Si lo has abierto desde WhatsApp, toca el menú del navegador y elige “Abrir en Safari”, o copia el enlace y pégalo en Safari.</div>` : ""}
      <ol class="install-steps">
        <li><span>1</span><div><strong>Abre esta página en Safari.</strong><small>Las notificaciones en iPhone funcionan cuando la web-app está añadida a la pantalla de inicio.</small></div></li>
        <li><span>2</span><div><strong>Pulsa el botón Compartir.</strong><small>Es el cuadrado con una flecha hacia arriba.</small></div></li>
        <li><span>3</span><div><strong>Elige “Añadir a pantalla de inicio”.</strong><small>Puede estar más abajo en la lista de opciones.</small></div></li>
        <li><span>4</span><div><strong>Pulsa “Añadir”.</strong><small>Después abre Pistas del Evangelio desde el icono nuevo.</small></div></li>
      </ol>
      <div class="button-row"><button class="button secondary" onclick="copyAppLink()">Copiar enlace</button><button class="button secondary" onclick="shareAppLink()">Compartir enlace</button></div>
    `;
  } else if (android) {
    body = `
      <ol class="install-steps">
        <li><span>1</span><div><strong>Pulsa “Instalar app”.</strong><small>Si Chrome muestra el aviso nativo, acepta la instalación.</small></div></li>
        <li><span>2</span><div><strong>Si no aparece, abre el menú de Chrome.</strong><small>Toca los tres puntos y elige “Instalar aplicación” o “Añadir a pantalla de inicio”.</small></div></li>
        <li><span>3</span><div><strong>Abre desde el icono.</strong><small>Entonces podrás activar el aviso diario.</small></div></li>
      </ol>
      <button class="button" onclick="installApp()">Instalar app</button>
    `;
  } else {
    body = `<p>Abre esta página desde el navegador del móvil y usa la opción “Añadir a pantalla de inicio” o “Instalar aplicación”.</p><button class="button secondary" onclick="copyAppLink()">Copiar enlace</button>`;
  }

  showModal(title, body);
}

function showModal(title, body) {
  closeModal();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" id="installModal" onclick="closeModal(event)">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onclick="event.stopPropagation()">
        <button class="modal-close" onclick="closeModal()" aria-label="Cerrar">×</button>
        <h2 id="modalTitle">${title}</h2>
        <div class="modal-content">${body}</div>
      </div>
    </div>
  `);
}

function closeModal(event) {
  if (event && event.target && event.target.id !== "installModal") return;
  const existing = document.getElementById("installModal");
  if (existing) existing.remove();
}

async function copyAppLink() {
  await navigator.clipboard.writeText(APP_URL);
  alert("Enlace copiado. Ábrelo en Safari para instalar la app en iPhone.");
}

async function shareAppLink() {
  if (navigator.share) {
    await navigator.share({ title: "Pistas del Evangelio", text: "Instala esta app para rezar cada día con el Evangelio.", url: APP_URL });
  } else {
    await copyAppLink();
  }
}

function dismissInstall() {
  localStorage.setItem("pistasInstallDismissed", "true");
  render();
}

async function getNotificationConfig() {
  const config = await fetch(`/api/config?v=${Date.now()}`).then((r) => r.json());
  if (!config.publicKey) throw new Error(config.error || "Falta clave pública VAPID");
  return { publicKey: cleanVapidPublicKey(config.publicKey) };
}

async function createFreshSubscription(publicKey) {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: existing.endpoint })
      });
    } catch (_) {}
    try { await existing.unsubscribe(); } catch (_) {}
  }
  return await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
}

async function registerSubscriptionOnServer(subscription, time) {
  const response = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription, time })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "No se pudo guardar la suscripción");
  }
}

async function activateNotifications() {
  const time = document.querySelector("#timeInput")?.value || prayerTime();
  setPrayerTime(time);

  if (!isStandalone()) {
    alert("Primero instala la app y ábrela desde el icono de la pantalla de inicio. Así podremos activar correctamente el aviso diario.");
    currentTab = "ajustes";
    render();
    return;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Este dispositivo o navegador no admite notificaciones push web.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    saveNotificationState({ active: false, permission });
    alert("No se han autorizado las notificaciones. Puedes activarlas después desde los ajustes del navegador o del móvil.");
    render();
    return;
  }

  try {
    const config = await getNotificationConfig();
    // Siempre renovamos la suscripción. Así evitamos el error 403 cuando han cambiado las claves VAPID.
    const subscription = await createFreshSubscription(config.publicKey);
    await registerSubscriptionOnServer(subscription, time);

    saveNotificationState({ active: true, time, permission: "granted", mode: "real", refreshedAt: new Date().toISOString() });
    alert(`Aviso diario activado a las ${time}.`);
    render();
  } catch (error) {
    console.error(error);
    alert(`No se pudieron activar las notificaciones: ${error.message}`);
  }
}

async function deactivateNotifications() {
  try {
    const subscription = await getActiveSubscription();
    if (subscription) {
      await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      await subscription.unsubscribe();
    }
  } catch (error) {
    console.warn("No se pudo eliminar la suscripción remota", error);
  }
  saveNotificationState({ active: false, time: prayerTime(), permission: Notification?.permission || "default" });
  alert("Notificaciones desactivadas en la app.");
  render();
}

async function sendTestNotificationRequest(subscription) {
  const response = await fetch("/api/test-notification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "No se pudo enviar la prueba");
  }
}

function isOldVapidSubscriptionError(error) {
  const text = String(error?.message || error || "");
  return /VAPID credentials|authorization header|credentials used to create the subscriptions|403/i.test(text);
}

async function sendLocalTestNotification() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Este dispositivo no admite notificaciones push web.");
    return;
  }

  if (Notification.permission !== "granted") {
    alert("Primero activa las notificaciones.");
    return;
  }

  try {
    let subscription = await getActiveSubscription();
    if (!subscription) {
      alert("No hay una suscripción activa. Pulsa primero ‘Activar notificaciones’. ");
      return;
    }

    try {
      await sendTestNotificationRequest(subscription);
    } catch (error) {
      if (!isOldVapidSubscriptionError(error)) throw error;
      const config = await getNotificationConfig();
      subscription = await createFreshSubscription(config.publicKey);
      await registerSubscriptionOnServer(subscription, prayerTime());
      saveNotificationState({ active: true, time: prayerTime(), permission: "granted", mode: "real", refreshedAt: new Date().toISOString() });
      await sendTestNotificationRequest(subscription);
    }

    alert("Notificación de prueba enviada.");
  } catch (error) {
    console.error(error);
    alert(`No se pudo enviar la notificación de prueba: ${error.message}`);
  }
}

async function shareText(title, text, url = "") {
  const payload = url ? { title, text, url } : { title, text };
  if (navigator.share) {
    await navigator.share(payload);
  } else {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    alert("Texto copiado al portapapeles.");
  }
}

async function sharePista(p) {
  await shareText(
    `Pistas del Evangelio — ${p.titulo}`,
    formatShareText(p, true),
    ""
  );
}

async function recommendApp() {
  await shareText(
    "Pistas del Evangelio",
    "Te comparto esta app sencilla para rezar cada día con el Evangelio. Puedes instalarla en el móvil y recibir una llamada diaria a la oración.",
    APP_URL
  );
}

async function copyPista(p) {
  await navigator.clipboard.writeText(formatFullText(p));
  alert("Texto copiado.");
}

function whatsappPista(p) {
  return `https://wa.me/?text=${encodeURIComponent(formatShareText(p, true))}`;
}

async function shareWhatsappPista(p) {
  const text = formatShareText(p, true);
  // Usamos enlace directo de WhatsApp para que el cuadro de chat se abra con
  // el texto completo ya preparado en formato WhatsApp-ready.
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function contactWhatsapp(p) {
  return `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(`Hola, he leído la Pista del Evangelio de ${p.titulo} (${p.cita}) y quería comentar...`)}`;
}

function contactMail(p) {
  const subject = encodeURIComponent(`Pista del Evangelio — ${p.titulo}`);
  const body = encodeURIComponent(`Hola, he leído la Pista del Evangelio de ${p.titulo} (${p.cita}) y quería comentar...`);
  return `mailto:pistas.evangelio@gmail.com?subject=${subject}&body=${body}`;
}

function extractHighlight(p) {
  const source = `${p.evangelio}\n${p.pistas}`;
  const quoted = source.match(/[«“\"]([^»”\"]{8,70})[»”\"]/);
  if (quoted && quoted[1]) return `“${quoted[1].trim()}”`;
  return p.cita;
}

function render() {
  const app = document.getElementById("app");
  const today = getTodayPista();
  if (!today) {
    renderError("Todavía no hay ninguna Pista publicada en la hoja de contenidos.");
    return;
  }
  const state = notificationState();
  app.innerHTML = `<div class="app">
    <header class="header">
      <div class="logo"><img src="/icons/icon-192.png" alt=""></div>
      <div><button class="title title-button" onclick="goHome()">Pistas del Evangelio</button><div class="subtitle">Para entender, rezar y llevar a la vida</div></div>
    </header>
    <main class="main">${renderMain(today, state)}</main>
    ${renderNav()}
  </div>`;
}

function renderMain(today, state) {
  if (currentTab === "lectura") return renderLectura(getPista(selectedFecha));
  if (currentTab === "archivo") return renderArchivo();
  if (currentTab === "ajustes") return renderAjustes(state);
  return renderHoy(today, state);
}

function renderHoy(p, state) {
  const installed = isStandalone();
  const installDismissed = localStorage.getItem("pistasInstallDismissed") === "true";
  const showInstall = !installed && !installDismissed;
  const showPrayer = installed && !state.active;
  const highlight = extractHighlight(p);
  const today = todayMadrid();
  const exactToday = p.fecha === today;

  return `<section>
    ${showInstall ? renderInstallCard() : ""}
    <div class="card hero">
      <div class="eyebrow">${exactToday ? "Pista de hoy" : "Última Pista publicada"}</div>
      ${!exactToday ? `<div class="source-note">Hoy es ${today}. Todavía no hay una Pista publicada para esa fecha; mostramos la última disponible.</div>` : ""}
      <h1 class="h1">${p.titulo}</h1>
      <div class="quote">${escapeHtml(highlight)}</div>
      <div class="muted">${p.celebracion}</div>
      <div class="pill">${p.cita}</div>
      <a class="button" style="margin-top:16px" href="?fecha=${p.fecha}&leer=1" onclick="event.preventDefault(); openPista('${p.fecha}')">Leer la Pista de hoy</a>
    </div>
    ${showPrayer ? renderPrayerCard(false) : state.active ? renderPrayerSummary(state) : ""}
    <div class="button-row">
      <button class="button secondary" onclick="sharePistaByDate('${p.fecha}')">Compartir</button>
      <button class="button secondary" onclick="setTab('archivo')">Archivo</button>
    </div>
    ${renderRecommendCard()}
    ${renderHowToUseButtonCard()}
    ${renderDonateCard()}
  </section>`;
}

function renderInstallCard() {
  const ios = isIOS();
  const android = isAndroid();
  const headline = ios ? "Instala la app en iPhone" : android ? "Instala la app en Android" : "Instala la app";
  const text = ios
    ? "Para recibir el aviso diario en iPhone, añádela a la pantalla de inicio desde Safari. Te guiamos paso a paso."
    : android
      ? "Añádela a la pantalla de inicio para acceder rápido y activar el aviso diario."
      : "Añádela a la pantalla de inicio para acceder rápido y activar el aviso diario.";
  const primary = ios ? "Ver cómo instalar" : "Instalar en mi móvil";
  return `<div class="card notice">
    <h2 class="section-title">${headline}</h2>
    <p class="muted">${text}</p>
    <div class="button-row">
      <button class="button soft" onclick="${ios ? "showInstallHelp()" : "installApp()"}">${primary}</button>
      <button class="button secondary" onclick="showInstallHelp()">Instrucciones</button>
    </div>
    <button class="link-button" onclick="dismissInstall()">Ahora no</button>
  </div>`;
}

function renderPrayerSummary(state) {
  return `<div class="card">
    <div class="eyebrow">Tiempo de oración programado</div>
    <p class="muted">Recibirás el aviso diario a las <strong>${state.time || prayerTime()}</strong>. Puedes cambiarlo o desactivarlo en Ajustes.</p>
    <button class="button secondary" onclick="setTab('ajustes')">Cambiar en Ajustes</button>
  </div>`;
}

function renderPrayerCard(inSettings) {
  const t = prayerTime();
  const times = ["07:00", "08:00", "09:00", "21:00"];
  return `<div class="card">
    <div class="eyebrow">Programa tu tiempo de oración</div>
    <p class="muted">Es importante reservar un momento concreto para escuchar la Palabra de Dios. Elige a qué hora quieres recibir cada día una llamada sencilla para rezar con el Evangelio.</p>
    <div class="time-grid">${times.map((x) => `<button class="${t === x ? "active" : ""}" onclick="chooseTime('${x}')">${x}</button>`).join("")}</div>
    <label class="label" for="timeInput">Elegir otra hora</label>
    <input id="timeInput" class="time-input" type="time" step="900" value="${t}" onchange="chooseTime(this.value)">
    <button class="button" style="margin-top:12px" onclick="activateNotifications()">Activar notificaciones</button>
    ${inSettings ? `<button class="button secondary" style="margin-top:10px" onclick="sendLocalTestNotification()">Probar notificación</button>` : ""}
    <div class="status">Al activar las notificaciones se guardará una suscripción técnica del dispositivo y la hora elegida. El aviso diario se enviará automáticamente cuando el servidor esté configurado.</div>
  </div>`;
}

function renderLectura(p) {
  const starting = hasStartingContent(p);
  const image = hasImage(p);
  return `<article>
    <button class="button secondary back" onclick="goHome()">← Volver</button>
    <div class="card hero" style="margin-top:14px">
      <h1 class="h1">${p.titulo}</h1>
      <div class="quote">${escapeHtml(extractHighlight(p))}</div>
      <div class="muted">${p.celebracion}</div>
      <div class="pill">${p.cita}</div>
    </div>
    ${renderRememberCard(true)}
    <section class="card"><h2 class="section-title">${p.evangelioTitulo}</h2><div class="text">${escapeHtml(p.evangelio)}</div></section>
    ${starting ? renderContentSwitcher(p) : `<section class="card pistas-card"><h2 class="section-title">Pistas</h2><div class="text">${escapeHtml(cleanPistasTextForShare(p.pistas))}</div></section>`}
    ${image ? `<div class="card image-card"><h2 class="section-title">Imagen del día</h2><p class="muted">Una síntesis visual para recordar y compartir la Palabra de hoy.</p><button class="button soft" onclick="showDailyImage('${p.fecha}')">Ver imagen del día</button></div>` : ""}
    <div class="card closing">${CLOSING_TEXT}</div>
    <div class="card"><h2 class="section-title">Compartir o guardar</h2><div class="button-row"><button class="button" onclick="sharePistaByDate('${p.fecha}')">Compartir</button><button class="button secondary" onclick="copyPistaByDate('${p.fecha}')">Copiar</button></div><button class="button secondary" style="margin-top:10px" onclick="shareWhatsappPistaByDate('${p.fecha}')">Compartir por WhatsApp</button></div>
    <div class="card"><h2 class="section-title">Comentar o preguntar</h2><p class="muted">Si esta Pista te ha suscitado alguna pregunta o quieres compartir algo, puedes escribir directamente.</p><div class="button-row"><a class="button" href="${contactWhatsapp(p)}" target="_blank" rel="noreferrer">WhatsApp</a><a class="button secondary" href="${contactMail(p)}">Correo</a></div></div>
    ${renderHowToUseButtonCard()}
    ${renderDonateCard()}
  </article>`;
}

function renderContentSwitcher(p) {
  const mode = localStorage.getItem("pistasReadMode") || "pistas";
  const showStarting = mode === "empezando" && hasStartingContent(p);
  return `<section class="card pistas-card">
    <div class="segmented" role="tablist" aria-label="Modo de lectura">
      <button class="${!showStarting ? "active" : ""}" onclick="setReadMode('pistas')">Pistas</button>
      <button class="${showStarting ? "active" : ""}" onclick="setReadMode('empezando')">Estoy empezando</button>
    </div>
    <h2 class="section-title">${showStarting ? "Estoy empezando" : "Pistas"}</h2>
    <div class="text">${escapeHtml(showStarting ? p.estoyEmpezando : cleanPistasTextForShare(p.pistas))}</div>
  </section>`;
}

function renderRememberCard(compact = false) {
  return `<section class="card remember-card">
    <div class="eyebrow">Recuerda</div>
    <ol class="remember-list">${REMEMBER_STEPS.map((step) => `<li>${step}</li>`).join("")}</ol>
    ${compact ? "" : `<p class="muted">Estas Pistas están inspiradas en el camino de la lectio divina: leer la Palabra, comprenderla, escuchar lo que Dios quiere decirte, responder con la oración y llevarlo a la vida.</p>`}
  </section>`;
}

function renderArchivo() {
  return `<section>
    <button class="button secondary back" onclick="goHome()">← Volver</button>
    <h1 class="h1" style="margin-top:14px">Archivo</h1>
    <p class="muted">Pistas anteriores disponibles para volver a rezar con ellas.</p>
    <div class="list">${availablePistas().slice().reverse().map((p) => `<a class="archive-item" href="?fecha=${p.fecha}&leer=1" onclick="event.preventDefault(); openPista('${p.fecha}')"><strong>${p.titulo}</strong><span class="muted">${p.celebracion}</span><br><span class="pill">${p.cita}</span></a>`).join("")}</div>
  </section>`;
}

function renderAjustes(state) {
  return `<section>
    <button class="button secondary back" onclick="goHome()">← Volver</button>
    <h1 class="h1" style="margin-top:14px">Ajustes</h1>
    <p class="muted">Instalación, notificaciones, ayuda y contacto.</p>
    ${!isStandalone() ? `<div class="card"><h2 class="section-title">Instalar en el móvil</h2><p class="muted">Instala la app para recibir la notificación diaria y acceder más rápido.</p><div class="button-row"><button class="button soft" onclick="${isIOS() ? "showInstallHelp()" : "installApp()"}">${isIOS() ? "Ver guía iPhone" : "Instalar app"}</button><button class="button secondary" onclick="showInstallHelp()">Instrucciones</button></div></div>` : ""}
    ${renderPrayerCard(true)}
    ${state.active ? `<div class="card"><h2 class="section-title">Notificaciones activadas</h2><p class="muted">Hora actual: <strong>${state.time || prayerTime()}</strong></p><button class="button secondary" onclick="deactivateNotifications()">Desactivar notificaciones</button></div>` : ""}
    ${renderHowToUseCard()}
    ${renderAboutCard()}
    ${renderPrivacyCard()}
    ${renderHelpCard()}
    ${renderRecommendCard()}
    ${renderDonateCard()}
  </section>`;
}

function renderHowToUseCard() {
  return `<div class="card"><h2 class="section-title">Cómo rezar con la Palabra</h2>${renderHowToUseContent()}</div>`;
}

function renderAboutCard() {
  return `<div class="card"><h2 class="section-title">Quiénes somos</h2><p class="muted">Pistas del Evangelio es una iniciativa de la Parroquia de San José Obrero de Cuatrovientos, Ponferrada. Nace para ayudar a rezar cada día con la Palabra de Dios: leer el Evangelio, entenderlo mejor, escucharlo en la vida y responder al Señor con la oración.</p><p class="muted"><strong>Parroquia de San José Obrero</strong><br>Cuatrovientos — Ponferrada</p></div>`;
}

function renderPrivacyCard() {
  return `<div class="card"><h2 class="section-title">Privacidad</h2><p class="muted">La app no pide nombre, teléfono ni correo para leer las Pistas. Si activas notificaciones, se guardará una suscripción técnica del dispositivo y la hora elegida para poder enviarte el aviso diario. Puedes desactivarlas en cualquier momento desde Ajustes.</p><p class="muted">Si escribes por WhatsApp o correo, esa comunicación se realiza fuera de la app.</p></div>`;
}

function renderHelpCard() {
  return `<div class="card"><h2 class="section-title">Ayuda rápida</h2><ul class="help-list"><li>Para instalarla, usa el botón de instalación o “Añadir a pantalla de inicio”.</li><li>Para recibir avisos, instala la app y activa notificaciones desde Ajustes.</li><li>Para cambiar la hora, vuelve a Ajustes y elige otro momento.</li><li>Para compartir una Pista, usa el botón “Compartir” al final de cada lectura.</li></ul></div>`;
}

function renderRecommendCard() {
  return `<div class="card"><h2 class="section-title">Recomendar la app</h2><p class="muted">¿A alguien le puede ayudar rezar cada día con el Evangelio? Recomiéndale esta app.</p><button class="button soft" onclick="recommendApp()">Recomendar a un amigo</button></div>`;
}

function renderDonateCard() {
  return `<div class="card donate-card"><h2 class="section-title">Donar</h2><p class="muted">Si crees que merece la pena dar a conocer esta herramienta, tu donación lo hará posible.</p><a class="button" href="${DONATION_URL}" target="_blank" rel="noreferrer">Donar a través de Dono a mi Iglesia</a></div>`;
}

function renderHowToUseButtonCard() {
  return `<div class="card"><h2 class="section-title">Cómo rezar con la Palabra</h2><p class="muted">Una ayuda breve para entrar en el Evangelio como oración: pedir el Espíritu Santo, leer, escuchar, responder y llevarlo a la vida.</p><button class="button soft" onclick="showHowToUseModal()">Ver guía breve</button></div>`;
}

function showHowToUseModal() {
  showModal("Cómo rezar con la Palabra", renderHowToUseContent());
}

function renderHowToUseContent() {
  return `<p>La lectio divina no es un simple estudio de la Biblia. Es un encuentro personal con Dios a través de su Palabra.</p>
    <div class="lectio-steps">
      <div><strong>0. Prepárate</strong><span>Busca silencio, ponte en presencia de Dios e invoca al Espíritu Santo.</span></div>
      <div><strong>1. Lee y entiende</strong><span>Lee despacio. Mira qué dice el texto: quién aparece, qué sucede, qué palabras se repiten.</span></div>
      <div><strong>2. Escucha</strong><span>Pregunta qué te dice Dios hoy en tu vida real: heridas, decisiones, relaciones y búsquedas.</span></div>
      <div><strong>3. Responde</strong><span>Habla con el Señor desde lo que has escuchado: agradece, pide, ofrece, pide perdón o alaba.</span></div>
      <div><strong>4. Descansa</strong><span>Si puedes, permanece un momento en silencio amoroso. No hace falta pensar mucho.</span></div>
      <div><strong>5. Llévalo a la vida</strong><span>Elige un paso pequeño, concreto y posible para hoy o para esta semana.</span></div>
    </div>`;
}

function renderNav() {
  return `<nav class="nav">
    <button class="${currentTab === "hoy" || currentTab === "lectura" ? "active" : ""}" onclick="setTab('hoy')">Hoy</button>
    <button class="${currentTab === "archivo" ? "active" : ""}" onclick="setTab('archivo')">Archivo</button>
    <button onclick="recommendApp()">Recomendar</button>
    <button class="${currentTab === "ajustes" ? "active" : ""}" onclick="setTab('ajustes')">Ajustes</button>
  </nav>`;
}

function setTab(tab) {
  currentTab = tab;
  if (tab !== "lectura") history.replaceState(null, "", "/");
  render();
}

function goHome() {
  currentTab = "hoy";
  history.replaceState(null, "", "/");
  render();
}

function openPista(fecha) {
  selectedFecha = fecha;
  currentTab = "lectura";
  history.replaceState(null, "", `?fecha=${fecha}`);
  render();
}

function chooseTime(value) {
  setPrayerTime(value);
  const state = notificationState();
  if (state.active) saveNotificationState({ ...state, time: value });
  render();
}

function setReadMode(mode) {
  localStorage.setItem("pistasReadMode", mode);
  render();
}

function showDailyImage(fecha) {
  const p = getPista(fecha);
  if (!hasImage(p)) return;
  const url = escapeHtml(p.imagenDiaUrl);
  showModal("Imagen del día", `
    <p>Una síntesis visual para recordar y compartir la Palabra de hoy.</p>
    <img class="daily-image" src="${url}" alt="Imagen del día: ${escapeHtml(p.titulo)}" loading="lazy">
    <div class="button-row">
      <a class="button" href="${url}" target="_blank" rel="noreferrer">Abrir imagen</a>
      <button class="button secondary" onclick="shareImageByDate('${p.fecha}')">Compartir</button>
    </div>
  `);
}

async function shareImageByDate(fecha) {
  const p = getPista(fecha);
  if (!hasImage(p)) return;
  await shareText(
    `Imagen del día — ${p.titulo}`,
    `${p.titulo}
${p.celebracion}
${p.cita}`,
    p.imagenDiaUrl
  );
}

function sharePistaByDate(fecha) {
  sharePista(getPista(fecha));
}

function shareWhatsappPistaByDate(fecha) {
  shareWhatsappPista(getPista(fecha));
}

function copyPistaByDate(fecha) {
  copyPista(getPista(fecha));
}

window.setTab = setTab;
window.goHome = goHome;
window.openPista = openPista;
window.installApp = installApp;
window.showInstallHelp = showInstallHelp;
window.dismissInstall = dismissInstall;
window.closeModal = closeModal;
window.copyAppLink = copyAppLink;
window.shareAppLink = shareAppLink;
window.activateNotifications = activateNotifications;
window.deactivateNotifications = deactivateNotifications;
window.sendLocalTestNotification = sendLocalTestNotification;
window.chooseTime = chooseTime;
window.sharePistaByDate = sharePistaByDate;
window.shareWhatsappPistaByDate = shareWhatsappPistaByDate;
window.copyPistaByDate = copyPistaByDate;
window.recommendApp = recommendApp;
window.setReadMode = setReadMode;
window.showDailyImage = showDailyImage;
window.shareImageByDate = shareImageByDate;
window.showHowToUseModal = showHowToUseModal;

init();
