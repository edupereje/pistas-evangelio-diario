const CACHE_NAME = "pistas-v8-11-google-sheet-live-20260701";
const APP_SHELL = ["/", "/index.html", "/styles.css?v=8.11", "/app.js?v=8.11", "/manifest.webmanifest?v=8.11"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match("/index.html"))));
});

self.addEventListener("push", (event) => {
  let data = { title: "Pistas del Evangelio", body: "Ya está disponible la Pista de hoy.", url: "/" };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icons/icon-192.png?v=8.11",
    badge: "/icons/icon-192.png?v=8.11",
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
