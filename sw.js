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

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    image: data.image || undefined,
    badge: "/icons/badge.png",

    vibrate: data.is_gigantos
      ? [300, 150, 300, 150, 300]
      : [200, 100, 200],

    tag: "cnsniper-offer",
    renotify: true,

    data: {
      appUrl: data.app_url || "/",
      offerId: data.offer_id || null,
      fromPush: true
    }
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "CN Sniper",
      options
    )
  );
});

// =========================
// 👉 CLICK NA POWIADOMIENIE
// =========================
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const data = event.notification.data || {};
  const appUrl = data.appUrl || "/";
  const offerId = data.offerId || null;

  const targetUrl = offerId
    ? `${appUrl}?fromPush=1&offerId=${offerId}`
    : appUrl;

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clientList => {

      // 🔁 jeśli app już otwarta → focus + message
      for (const client of clientList) {
        if (client.url.startsWith(appUrl)) {
          client.focus();
          client.postMessage({
            fromPush: true,
            offerId
          });
          return;
        }
      }

      // 🆕 jeśli nie → otwieramy app
      return self.clients.openWindow(targetUrl);
    })
  );
});
