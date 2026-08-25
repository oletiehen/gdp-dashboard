const CACHE = "olafs-reha-kompass-v1.0.0-workbench-10";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260825-rc4",
  "/manifest.webmanifest?v=20260825-rc4",
  "/icon.svg?v=20260825-rc4",
  "/icon-180.png?v=20260825-rc4",
  "/icon-192.png?v=20260825-rc4",
  "/icon-512.png?v=20260825-rc4",
  "/js/app.js?v=20260825-rc4",
  "/js/api.js?v=20260825-rc4",
  "/js/content.js?v=20260825-rc4",
  "/js/crypto-vault.js?v=20260825-rc4",
  "/js/data-model.js?v=20260825-rc4",
  "/js/idb.js?v=20260825-rc4",
  "/js/local-guide.js?v=20260825-rc4",
  "/js/metime.js?v=20260825-rc4",
  "/js/timeline.js?v=20260825-rc4",
  "/js/webauthn-client.js?v=20260825-rc4"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put("/index.html", copy));
      return response;
    }).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});

self.addEventListener("push", event => {
  let url = "/#/kalender";
  try {
    const data = event.data?.json();
    if (typeof data?.url === "string" && data.url.startsWith("/")) url = data.url;
  } catch {
    // Der sichtbare Text bleibt absichtlich neutral.
  }
  event.waitUntil(self.registration.showNotification("Olafs Kompass", {
    body: "In Kürze steht ein persönlicher Termin an. Öffne deinen Kompass.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "rehakompass-neutral-reminder",
    renotify: false,
    data: { url }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/#/kalender";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const existing = list.find(client => "focus" in client);
    if (existing) {
      existing.navigate(url);
      return existing.focus();
    }
    return self.clients.openWindow(url);
  }));
});
