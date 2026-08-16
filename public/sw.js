const CACHE = "olafs-reha-kompass-v1.0.0-journey-2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/js/app.js",
  "/js/api.js",
  "/js/content.js",
  "/js/crypto-vault.js",
  "/js/data-model.js",
  "/js/idb.js",
  "/js/local-guide.js",
  "/js/timeline.js",
  "/js/webauthn-client.js"
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
