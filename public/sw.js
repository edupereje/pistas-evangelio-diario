const APP_VERSION = "8.19.0";
const CACHE_NAME = `pistas-v${APP_VERSION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  `/styles.css?v=${APP_VERSION}`,
  `/app.js?v=${APP_VERSION}`,
  `/manifest.webmanifest?v=${APP_VERSION}`,
  "/icons/icon-192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("pistas-") && key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Las API nunca deben recibir HTML de respaldo: si fallan, la app decide qué hacer.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navegación: red primero; solo sin conexión usamos la portada guardada.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await caches.match(event.request)) || (await caches.match("/index.html")) || (await caches.match("/"))
      )
    );
    return;
  }

  // Recursos estáticos: red primero y, si no hay conexión, la copia exacta en caché.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("push", (event) => {
  let data = { title: "Pistas del Evangelio", body: "Ya está disponible la Pista de hoy.", url: "/" };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url === urlToOpen && "focus" in client) return client.focus();
    }
    return clients.openWindow(urlToOpen);
  }));
});
