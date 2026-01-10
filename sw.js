// sw.js

/* =========================
   ⚙️ SERVICE WORKER LIFECYCLE
   ========================= */

self.addEventListener("install", event => {
  // aktywuj od razu (bez czekania)
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

/* =========================
   🔔 PUSH EVENT
   ========================= */

self.addEventListener("push", event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error("❌ PUSH DATA NOT JSON");
    return;
  }

  const title = data.title || "Nowa oferta";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    image: data.image || undefined,      // miniatura (jeśli jest)
    badge: "/icons/badge.png",
    vibrate: data.is_gigantos
      ? [300, 150, 300, 150, 300]
      : [200, 100, 200],
    tag: "cnsniper-offer",
    renotify: true,

    // 🔥 DANE PRZEKAZYWANE DO KLIKNIĘCIA
    data: {
      match_key: data.match_key,
      app_url: data.app_url || "https://cnsniper.pl",
      fromPush: true
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* =========================
   👉 CLICK NA POWIADOMIENIE
   ========================= */

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const { app_url, match_key } = event.notification.data || {};
  const targetUrl =
    app_url
      ? `${app_url}?fromPush=1&match_key=${encodeURIComponent(match_key || "")}`
      : "/";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clientList => {

      // 👉 jeśli aplikacja już otwarta – focus + postMessage
      for (const client of clientList) {
        if (client.url.startsWith(app_url)) {
          client.focus();
          client.postMessage({
            fromPush: true,
            match_key
          });
          return;
        }
      }

      // 👉 jeśli nie ma – otwórz nową instancję
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
