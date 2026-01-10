// sw.js

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  self.clients.claim();
});

// =========================
// 🔔 PUSH
// =========================
self.addEventListener("push", event => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Nowa oferta", body: "Sprawdź aplikację" };
    }
  }

  const title = data.title || "🆕 Nowa oferta";
  const options = {
    body: data.body || "Kliknij, aby zobaczyć",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// =========================
// 👉 CLICK
// =========================
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
