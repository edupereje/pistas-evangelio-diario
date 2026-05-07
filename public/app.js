let pistas = [];
let currentTab = "hoy";
let selectedFecha = null;
let deferredPrompt = null;

const APP_URL = "https://pistas-evangelio-diario.netlify.app";
const DONATION_URL = "https://www.donoamiiglesia.es/san/Home?st=&uri=nm%3Aoid%3AZ6_KP98H380OG7J40QGP8F2L01003";
const CONTACT_PHONE = "34662519044";
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

function todayMadrid() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
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
  return pistas.find((p) => p.fecha === today) || availablePistas().slice(-1)[0] || pistas[0];
}

function getPista(fecha) {
  return pistas.find((p) => p.fecha === fecha && isPastOrToday(p.fecha)) || getTodayPista();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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

function formatFullText(p) {
  return `*${p.titulo}*\n*${p.celebracion}*\n\n(Recuerda:\n${rememberText()})\n\n*${p.evangelioTitulo}*\n${p.evangelio}\n\n*Pistas:* ${p.pistas}\n\nRelee el Evangelio, escucha lo que Dios te dice, respóndele con tu oración y llévalo a tu vida.`;
}

async function init() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js");
  }
  pistas = await fetch("/data/pistas.json").then((r) => r.json());
  selectedFecha = getTodayPista().fecha;
  render();
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
  const msg = isIOS()
    ? "En iPhone: abre este enlace en Safari, pulsa Compartir y elige ‘Añadir a pantalla de inicio’. Después abre la app desde el icono."
    : "En Android: abre la app en Chrome y pulsa ‘Instalar app’ si aparece. Si no aparece, usa el menú del navegador y elige ‘Instalar aplicación’ o ‘Añadir a pantalla de inicio’.";
  alert(msg);
}

function dismissInstall() {
  localStorage.setItem("pistasInstallDismissed", "true");
  render();
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
    const config = await fetch("/api/config").then((r) => r.json());
    if (!config.publicKey) throw new Error(config.error || "Falta clave pública VAPID");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey)
      });
    }

    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription, time })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo guardar la suscripción");
    }

    saveNotificationState({ active: true, time, permission: "granted", mode: "real" });
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
    const subscription = await getActiveSubscription();
    if (!subscription) {
      alert("No hay una suscripción activa. Pulsa primero ‘Activar notificaciones’. ");
      return;
    }

    const response = await fetch("/api/test-notification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo enviar la prueba");
    }

    alert("Notificación de prueba enviada.");
  } catch (error) {
    console.error(error);
    alert(`No se pudo enviar la notificación de prueba: ${error.message}`);
  }
}

async function shareText(title, text, url) {
  if (navigator.share) {
    await navigator.share({ title, text, url });
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    alert("Copiado al portapapeles.");
  }
}

async function sharePista(p) {
  await shareText(
    `Pistas del Evangelio — ${p.titulo}`,
    `${p.titulo}\n${p.celebracion}\n${p.cita}\n\nLee la Pista del día en la app.`,
    dayUrl(p.fecha)
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
  return `https://wa.me/?text=${encodeURIComponent(`${p.titulo}\n${p.celebracion}\n${p.cita}\n\nLee la Pista del Evangelio aquí:\n${dayUrl(p.fecha)}`)}`;
}

function contactWhatsapp(p) {
  return `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(`Hola, he leído la Pista del Evangelio de ${p.titulo} (${p.cita}) y quería comentar...`)}`;
}

function contactMail(p) {
  const subject = encodeURIComponent(`Pista del Evangelio — ${p.titulo}`);
  const body = encodeURIComponent(`Hola, he leído la Pista del Evangelio de ${p.titulo} (${p.cita}) y quería comentar...`);
  return `mailto:?subject=${subject}&body=${body}`;
}

function render() {
  const app = document.getElementById("app");
  const today = getTodayPista();
  const state = notificationState();
  app.innerHTML = `<div class="app">
    <header class="header">
      <div class="logo"><img src="/icons/icon-192.png" alt=""></div>
      <div><div class="title">Pistas del Evangelio</div><div class="subtitle">Para entender, rezar y llevar a la vida</div></div>
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

  return `<section>
    ${showInstall ? renderInstallCard() : ""}
    <div class="card hero">
      <div class="eyebrow">📅 Pista de hoy</div>
      <h1 class="h1">${p.titulo}</h1>
      <div class="muted">${p.celebracion}</div>
      <div class="pill">${p.cita}</div>
      <button class="button" style="margin-top:16px" onclick="openPista('${p.fecha}')">Leer la Pista de hoy</button>
    </div>
    ${showPrayer ? renderPrayerCard(false) : state.active ? renderPrayerSummary(state) : ""}
    <div class="button-row">
      <button class="button secondary" onclick="sharePistaByDate('${p.fecha}')">Compartir</button>
      <button class="button secondary" onclick="setTab('archivo')">Archivo</button>
    </div>
    ${renderRecommendCard()}
    ${renderDonateCard()}
  </section>`;
}

function renderInstallCard() {
  return `<div class="card notice">
    <h2 class="section-title">Instala la app</h2>
    <p class="muted">Añádela a la pantalla de inicio para acceder rápido y poder activar el aviso diario.</p>
    <div class="button-row">
      <button class="button soft" onclick="installApp()">Instalar en mi móvil</button>
      <button class="button secondary" onclick="showInstallHelp()">Ver instrucciones</button>
    </div>
    <button class="link-button" onclick="dismissInstall()">Ahora no</button>
  </div>`;
}

function renderPrayerSummary(state) {
  return `<div class="card">
    <div class="eyebrow">🔔 Tiempo de oración programado</div>
    <p class="muted">Recibirás el aviso diario a las <strong>${state.time || prayerTime()}</strong>. Puedes cambiarlo o desactivarlo en Ajustes.</p>
    <button class="button secondary" onclick="setTab('ajustes')">Cambiar en Ajustes</button>
  </div>`;
}

function renderPrayerCard(inSettings) {
  const t = prayerTime();
  const times = ["07:00", "08:00", "09:00", "21:00"];
  return `<div class="card">
    <div class="eyebrow">🔔 Programa tu tiempo de oración</div>
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
  return `<article>
    <button class="button secondary back" onclick="goHome()">← Volver</button>
    <div class="card hero" style="margin-top:14px">
      <h1 class="h1">${p.titulo}</h1>
      <div class="muted">${p.celebracion}</div>
      <div class="pill">${p.cita}</div>
    </div>
    ${renderRememberCard(true)}
    <section class="card"><h2 class="section-title">${p.evangelioTitulo}</h2><div class="text">${escapeHtml(p.evangelio)}</div></section>
    <section class="card pistas-card"><h2 class="section-title">Pistas</h2><div class="text">${escapeHtml(p.pistas)}</div></section>
    <div class="card closing">Relee el Evangelio, escucha lo que Dios te dice, respóndele con tu oración y llévalo a tu vida.</div>
    <div class="card"><h2 class="section-title">Compartir o guardar</h2><div class="button-row"><button class="button" onclick="sharePistaByDate('${p.fecha}')">Compartir</button><button class="button secondary" onclick="copyPistaByDate('${p.fecha}')">Copiar</button></div><a class="button secondary" style="margin-top:10px" href="${whatsappPista(p)}" target="_blank" rel="noreferrer">Compartir por WhatsApp</a></div>
    <div class="card"><h2 class="section-title">Comentar o preguntar</h2><p class="muted">Si esta Pista te ha suscitado alguna pregunta o quieres compartir algo, puedes escribir directamente.</p><div class="button-row"><a class="button" href="${contactWhatsapp(p)}" target="_blank" rel="noreferrer">WhatsApp</a><a class="button secondary" href="${contactMail(p)}">Correo</a></div></div>
    ${renderDonateCard()}
  </article>`;
}

function renderRememberCard(compact = false) {
  return `<section class="card remember-card">
    <div class="eyebrow">✨ Recuerda</div>
    <ol class="remember-list">${REMEMBER_STEPS.map((step) => `<li>${step}</li>`).join("")}</ol>
    ${compact ? "" : `<p class="muted">Estas Pistas están inspiradas en el camino de la lectio divina: leer la Palabra, comprenderla, escuchar lo que Dios quiere decirte, responder con la oración y llevarlo a la vida.</p>`}
  </section>`;
}

function renderArchivo() {
  return `<section>
    <h1 class="h1">Archivo</h1>
    <p class="muted">Pistas anteriores disponibles para volver a rezar con ellas.</p>
    <div class="list">${availablePistas().slice().reverse().map((p) => `<button class="archive-item" onclick="openPista('${p.fecha}')"><strong>${p.titulo}</strong><span class="muted">${p.celebracion}</span><br><span class="pill">${p.cita}</span></button>`).join("")}</div>
  </section>`;
}

function renderAjustes(state) {
  return `<section>
    <h1 class="h1">Ajustes</h1>
    <p class="muted">Instalación, notificaciones, ayuda y contacto.</p>
    ${!isStandalone() ? `<div class="card"><h2 class="section-title">Instalar en el móvil</h2><p class="muted">Instala la app para recibir la notificación diaria y acceder más rápido.</p><div class="button-row"><button class="button soft" onclick="installApp()">Instalar app</button><button class="button secondary" onclick="showInstallHelp()">Ver instrucciones</button></div></div>` : ""}
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
  return `<div class="card"><h2 class="section-title">Cómo usar estas Pistas</h2><p class="muted">Estas Pistas están inspiradas en el camino de la lectio divina. No se trata solo de leer un comentario, sino de entrar en diálogo con Dios a través del Evangelio.</p>${renderRememberCard(false)}</div>`;
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

function sharePistaByDate(fecha) {
  sharePista(getPista(fecha));
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
window.activateNotifications = activateNotifications;
window.deactivateNotifications = deactivateNotifications;
window.sendLocalTestNotification = sendLocalTestNotification;
window.chooseTime = chooseTime;
window.sharePistaByDate = sharePistaByDate;
window.copyPistaByDate = copyPistaByDate;
window.recommendApp = recommendApp;

init();
