const VAPID_PUBLIC_KEY = "BLcaMptBg8239UIkJ6CSoRWhNdAXpR_UA1ZF5DP2PZgKmOKlIYuFuVvIAbCs9inWK7KVaNZ-jKb-n7DKB6t3DyE";

/* =========================
   🔍 PWA DETECT
   ========================= */
function isPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/* =========================
   🔔 ENABLE PUSH (ON CLICK!)
   ========================= */
async function enablePush() {
  // ⛔ MUSI BYĆ PWA
  if (!isPWA()) {
    alert("📲 Dodaj aplikację do ekranu głównego (PWA), aby włączyć powiadomienia");
    return;
  }

  // ⛔ JUŻ ZABLOKOWANE
  if (Notification.permission === "denied") {
    alert(
      "🔕 Powiadomienia są zablokowane.\n\n" +
      "iOS: Ustawienia → Powiadomienia → CNSniper → Włącz"
    );
    return;
  }

  // 🔔 REQUEST – TYLKO TU, BEZ AWAIT PRZED
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    alert("🔕 Powiadomienia nie zostały włączone");
    return;
  }

  // ✅ SERVICE WORKER
  const reg = await navigator.serviceWorker.ready;

  // ✅ SUBSCRIBE
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  // 📡 BACKEND
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub)
  });

  alert("🔔 Powiadomienia WŁĄCZONE!");
}

/* =========================
   🔧 BASE64 → UINT8
   ========================= */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const base64Safe = (base64 + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
