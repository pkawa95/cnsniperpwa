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

  const { appUrl, offerId, fromPush } = event.notification.data || {};
  const targetUrl = `${appUrl}?fromPush=1&offerId=${encodeURIComponent(offerId)}`;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.startsWith(appUrl)) {
            client.focus();
            client.postMessage({ fromPush, offerId });
            return;
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});