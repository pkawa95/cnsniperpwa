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

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      image: data.image,
      badge: "/icons/badge.png",
      vibrate: [300, 100, 300],
      data: {
        match_key: data.match_key,
        app_url: data.app_url
      }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const { match_key, app_url } = event.notification.data;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(clientsArr => {
        for (const client of clientsArr) {
          if (client.url.startsWith(app_url)) {
            client.focus();
            client.postMessage({ fromPush: true, match_key });
            return;
          }
        }
        return clients.openWindow(app_url);
      })
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

