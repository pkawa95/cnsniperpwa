// subscribe.js

const VAPID_PUBLIC_KEY = "TU_WKLEJ_PUBLIC_KEY";
const PUSH_API = "https://api.cnsniper.pl/push/subscribe";

// Base64URL → Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  if (!("serviceWorker" in navigator)) return;
  if (!("PushManager" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    alert("🔕 Powiadomienia zablokowane");
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await fetch(PUSH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });

  console.log("🔔 PUSH SUBSCRIBED");
}

// 🚀 auto subscribe po starcie PWA
document.addEventListener("DOMContentLoaded", () => {
  subscribePush();
});
