// sw.js

const VERSION = "1.6"; // 🔥 ZMIEŃ PRZY KAŻDYM DEPLOYU
const CACHE_NAME = `cnsniper-${VERSION}`;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/stats.js",
  "/subscribe.js",
  "/manifest.json",
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
    Promise.all([
      // 🧹 usuń stare cache
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_NAME)
            .map(k => caches.delete(k))
        )
      ),

      // 🟢 przejmij kontrolę OD RAZU
      self.clients.claim()
    ])
  );
});

/* =========================
   🌐 FETCH STRATEGY
   ========================= */
self.addEventListener("fetch", event => {
  const req = event.request;

  // 🔥 HTML ZAWSZE Z SIECI (najważniejsze)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 🧠 ASSETS: cache-first + update w tle
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

/* =========================
   🔄 AUTO-REFRESH CLIENTS
   ========================= */
self.addEventListener("activate", () => {
  self.clients.matchAll({ type: "window" }).then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: "SW_UPDATED" });
    });
  });
});

/* =========================
   🔔 PUSH
   ========================= */
self.addEventListener("push", event => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || "Nowa oferta", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge.png",
      data
    })
  );
});

/* =========================
   👉 CLICK
   ========================= */
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const { match_key, app_url } = event.notification.data || {};
  const url = `${app_url || "/"}?match_key=${encodeURIComponent(match_key || "")}`;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if (c.url.startsWith(app_url)) {
            c.focus();
            c.postMessage({ fromPush: true, match_key });
            return;
          }
        }
        return clients.openWindow(url);
      })
  );
});
