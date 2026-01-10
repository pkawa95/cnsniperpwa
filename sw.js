// sw.js

// =========================
// ⚙️ LIFECYCLE
// =========================
self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// =========================
// 🔔 PUSH
// =========================
self.addEventListener("push", event => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: data.icon || "/icons/icon-192.png",
    image: data.image,              // 🔥 MINIATURA
    badge: data.badge || "/icons/badge.png",
    vibrate: data.is_gigantos
      ? [300, 150, 300, 150, 300]
      : [200, 100, 200],
    data: {
      appUrl: data.app_url,
      offerId: data.offer_id,
      fromPush: true
    },
    tag: "cnsniper-offer",
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});
// =========================
// 👉 CLICK NA POWIADOMIENIE
// =========================
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const { app_url, match_key } = event.notification.data || {};
  const url = `${app_url}?fromPush=1`;

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
