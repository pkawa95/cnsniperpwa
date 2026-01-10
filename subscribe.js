const VAPID_PUBLIC_KEY = "TWOJ_PUBLIC_KEY";

async function enablePush() {
  // ❌ NIE PWA → NIE MA PUSH
  if (!window.navigator.standalone) {
    alert("📲 Dodaj aplikację do ekranu głównego, aby włączyć powiadomienia");
    return;
  }

  // 🔔 pytamy DOPIERO PO KLIKNIĘCIU
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    alert("🔕 Powiadomienia zablokowane. Włącz je w ustawieniach iOS.");
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub)
  });

  alert("🔔 Powiadomienia włączone!");
}

/* helper */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
