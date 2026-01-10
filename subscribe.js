const VAPID_PUBLIC_KEY = "BLcaMptBg8239UIkJ6CSoRWhNdAXpR_UA1ZF5DP2PZgKmOKlIYuFuVvIAbCs9inWK7KVaNZ-jKb-n7DKB6t3DyE";
const PUSH_API = "https://api.cnsniper.pl/api/push/subscribe";

async function handleEnablePush() {
  const status = document.getElementById("pushStatus");
  const btn = document.getElementById("pushBtn");

  status.textContent = "";

  // ❌ iOS: tylko PWA
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

    // 🔔 pytamy o zgodę – TYLKO po kliknięciu
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      status.textContent = "🔕 Powiadomienia zablokowane w systemie iOS";
      btn.textContent = "🔔 Włącz powiadomienia";
      btn.disabled = false;
      return;
    }

    const reg = await navigator.serviceWorker.ready;

    // ♻️ sprawdź czy już jest sub
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // 📡 wysyłamy do backendu
    const res = await fetch(PUSH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });

    if (!res.ok) {
      throw new Error("Backend error");
    }

    status.textContent = "✅ Powiadomienia włączone";
    btn.textContent = "✅ Powiadomienia aktywne";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Błąd podczas włączania powiadomień";
    btn.textContent = "🔔 Włącz powiadomienia";
    btn.disabled = false;
  }
}

/* helper */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}