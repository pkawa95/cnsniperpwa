// sw.js

/* =========================
   🧱 VERSIONING
   ========================= */
const VERSION = "1.1.4"; // 🔥 ZMIEŃ PRZY KAŻDYM DEPLOYU
const CACHE_NAME = `cnsniper-${VERSION}`;

/* =========================
   📦 CORE ASSETS
   ========================= */
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/stats.js",
  "/subscribe.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/badge.png",
];

/* =========================
   ⚙️ INSTALL
   ========================= */
self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

/* =========================
   ⚙️ ACTIVATE
   ========================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      // 🧹 usuń stare cache
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      );

      // 🟢 przejmij kontrolę natychmiast
      await self.clients.claim();

      // 🔄 powiadom clienty o update
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach(c =>
        c.postMessage({ type: "SW_UPDATED" })
      );
    })()
  );
});

/* =========================
   🌐 FETCH STRATEGY
   ========================= */
self.addEventListener("fetch", event => {
  const req = event.request;

  // ❌ nie cache’ujemy requestów innych niż GET
  if (req.method !== "GET") {
    return;
  }

  // 🌍 HTML – NETWORK FIRST
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);

          // 🔥 KLON TYLKO DO CACHE
          const clone = res.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, clone);

          return res;
        } catch (err) {
          const cached = await caches.match(req);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 📦 ASSETS – CACHE FIRST + UPDATE W TLE
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);

      const fetchPromise = fetch(req)
        .then(async res => {
          if (res && res.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })()
  );
});

/* =========================
   🔔 PUSH
   ========================= */
self.addEventListener("push", event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const title = data.title || "Nowa oferta";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/badge.png",
      image: data.image || undefined,
      data, // 🔥 PRZENOSIMY CAŁE PAYLOAD
    })
  );
});

/* =========================
   👉 NOTIFICATION CLICK
   ========================= */
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const { match_key, app_url } = event.notification.data || {};
  const base = app_url || "/";
  const url =
    match_key
      ? `${base}?match_key=${encodeURIComponent(match_key)}`
      : base;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if (client.url.startsWith(base)) {
          await client.focus();
          client.postMessage({
            fromPush: true,
            match_key,
          });
          return;
        }
      }

      await self.clients.openWindow(url);
    })()
  );
});
