/* =========================
   🔔 PUSH SUBSCRIBE – FINAL
   ========================= */

const VAPID_PUBLIC_KEY =
  "BLcaMptBg8239UIkJ6CSoRWhNdAXpR_UA1ZF5DP2PZgKmOKlIYuFuVvIAbCs9inWK7KVaNZ-jKb-n7DKB6t3DyE";

// ❌ BEZ /api
// ❌ BEZ relative path
// ✅ DOKŁADNIE JAK W FASTAPI
const PUSH_SUBSCRIBE_URL = "https://api.cnsniper.pl/push/subscribe";

async function handleEnablePush() {
  const status = document.getElementById("pushStatus");
  const btn = document.getElementById("pushBtn");

  status.textContent = "";

  /* =========================
     📲 iOS – TYLKO PWA
     ========================= */
  if (!window.navigator.standalone) {
    alert("📲 Dodaj aplikację do ekranu głównego (PWA), aby włączyć powiadomienia.");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    status.textContent = "❌ Brak Service Workera";
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "⏳ Włączanie...";

    /* =========================
       🔐 Permission (TYLKO po kliknięciu)
       ========================= */
    let permission = Notification.permission;
    if (permission !== "granted") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      status.textContent = "🔕 Powiadomienia zablokowane w systemie";
      btn.textContent = "🔔 Włącz powiadomienia";
      btn.disabled = false;
      return;
    }

    /* =========================
       🧱 Service Worker READY
       ========================= */
    const reg = await navigator.serviceWorker.ready;

    /* =========================
       ♻️ Subscription
       ========================= */
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    console.log("📦 PUSH SUB:", sub);

    /* =========================
       📡 BACKEND – TYLKO apiFetch ❗
       ========================= */
    const res = await apiFetch(PUSH_SUBSCRIBE_URL, {
      method: "POST",
      body: JSON.stringify(sub),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Backend error ${res.status}: ${t}`);
    }

    status.textContent = "✅ Powiadomienia włączone";
    btn.textContent = "🔕 Wyłącz powiadomienia";
    btn.disabled = false;

  } catch (err) {
    console.error("❌ PUSH ERROR:", err);
    status.textContent = "❌ Błąd podczas włączania powiadomień";
    btn.textContent = "🔔 Włącz powiadomienia";
    btn.disabled = false;
  }
}

/* =========================
   🔧 HELPERS
   ========================= */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const base64Safe = (base64 + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
