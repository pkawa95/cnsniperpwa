/* =========================
   🌐 CONFIG
   ========================= */
const API = "https://api.cnsniper.pl";
const WS_URL = "wss://api.cnsniper.pl/ws/offers";
const WS_API = API.replace(/^http/, "ws");

/* =========================
   🌐 API FETCH (AUTH-AWARE)
   ========================= */
let refreshPromise = null;

async function apiFetch(url, options = {}) {
  const access = localStorage.getItem("access_token");
  const refresh = localStorage.getItem("refresh_token");

  const headers = { ...(options.headers || {}) };

  if (access) {
    headers.Authorization = `Bearer ${access}`;
  }

  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  let res = await fetch(url, { ...options, headers });

  // 🚫 konto zdezaktywowane
  if (res.status === 403) {
    forceLogout(
      "account_disabled",
      "Administrator musi aktywować twoje konto"
    );
    throw new Error("Account disabled");
  }

  // 🔁 access expired
  if (res.status === 401 && refresh) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const r = await fetch(`${API}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });

        if (r.status === 403) {
          forceLogout(
            "account_disabled",
            "Administrator musi aktywować twoje konto"
          );
          throw new Error("Account disabled");
        }

        if (!r.ok) {
          forceLogout("refresh_failed", "Sesja wygasła");
          throw new Error("Refresh failed");
        }

        const tokens = await r.json();
        localStorage.setItem("access_token", tokens.access_token);
        localStorage.setItem("refresh_token", tokens.refresh_token);
        return tokens.access_token;
      })().finally(() => {
        refreshPromise = null;
      });
    }

    const newAccess = await refreshPromise;
    headers.Authorization = `Bearer ${newAccess}`;
    res = await fetch(url, { ...options, headers });
  }

  return res;
}

// ===============================
// 🔐 AUTH HARD GUARD (BLOCK APP)
// ===============================
// ===============================
// 🔐 AUTH HARD STOP (REAL)
// ===============================
const __ACCESS = localStorage.getItem("access_token");
const __REFRESH = localStorage.getItem("refresh_token");

if (!__ACCESS || !__REFRESH) {
  console.warn("⛔ APP.JS BLOCKED – NO AUTH");

  // NIE URUCHAMIAJ RESZTY PLIKU
  // ale NIE RZUCAJ throw (żeby auth.js się wykonał)
  window.__APP_BLOCKED__ = true;
}

// ===============================
// 🔐 AUTH HARD GUARD (SAFE VERSION)
// ===============================
(function authHardGuard() {
  const access = localStorage.getItem("access_token");
  const refresh = localStorage.getItem("refresh_token");

  console.log("🛡️ AUTH HARD GUARD", { access, refresh });

  if (!access || !refresh) {
    console.warn("⛔ NO SESSION → SHOW AUTH OVERLAY");

    const overlay = document.getElementById("loginOverlayV2");
    if (overlay) {
      overlay.classList.remove("hidden");
      overlay.style.display = "flex";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "99999";
    }

    // ❗ NIE BLOKUJEMY JS — tylko UI
    return;
  }

  console.log("✅ SESSION OK – APP MAY CONTINUE");
})();


// 🔄 SERVICE WORKER UPDATE HANDLER
navigator.serviceWorker?.addEventListener("message", event => {
  if (event.data?.type === "SW_UPDATED") {
    console.log("🔄 App updated – reloading");
    location.reload();
  }
});

let highlightCheckWS = null;
/* =========================
   🔢 HIGHLIGHT NUMBERS – SYNC TIMER
   ========================= */
let highlightSyncTimer = null;

function syncHighlightNumbersDebounced() {
  clearTimeout(highlightSyncTimer);
  highlightSyncTimer = setTimeout(() => {
    syncHighlightNumbersToBackend();
  }, 300);
}



/* 🚀 start aplikacji po zalogowaniu */
/* =========================
   🔔 PUSH MATCHING (SINGLE SOURCE OF TRUTH)
   ========================= */
let highlightedMatchKey = null;

/**
 * Identyczna logika co w backendzie:
 * match_key = f"{source}|{normalize_title(title)}"
 */
function normalizeTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function makeMatchKey(o) {
  const source = String(o?.source || "unknown");
  const title = normalizeTitle(o?.title || "");
  return `${source}|${title}`;
}

/* =========================
   🧠 STATE
   ========================= */
let socket = null;
let currentView = "foundView";
let allOffers = [];

/* =========================
   ⚙️ SETTINGS (localStorage)
   ========================= */
const SETTINGS_KEY = "cn_settings_v1";

const defaultSettings = {
  highlightNumbers: [], // [1..40]
};

let settings = loadSettings();

/* =========================
   🔧 HELPERS
   ========================= */

// 🔗 Vinted: https://www.vinted.plhttps://www.vinted.pl/...
function cleanLink(link) {
  if (!link) return link;

  const idx = link.lastIndexOf("https://");
  if (idx > 0) return link.slice(idx);

  // czasem backend da "www.vinted.pl/..." bez schematu
  if (link.startsWith("www.")) return "https://" + link;

  return link;
}

// 🏷️ source
function detectSource(offer) {
  const url = (offer.link || "").toLowerCase();

  if (url.includes("vinted")) return "vinted";
  if (url.includes("allegro")) return "allegro";
  if (url.includes("olx")) return "olx";

  return offer.source || "unknown";
}

// 🕒 UNIX → czytelna data
function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pl-PL");
}

// 🧠 normalizacja oferty z backendu
function normalizeOffer(o) {
  const foundAt = o.found_at ?? o.foundAt ?? null;

  const normalized = {
    ...o,
    source: detectSource(o),
    link: cleanLink(o.link),
    image_url: o.image ?? o.image_url ?? null,
    found_at: foundAt ? Number(foundAt) : 0,
    found_at_iso: foundAt ? formatDate(foundAt) : "",
    is_gigantos: Boolean(o.is_gigantos),
  };

  // 🔥 match_key liczymy zawsze identycznie
  normalized.match_key = makeMatchKey(normalized);

  return normalized;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   ⚙️ SETTINGS STORAGE
   ========================= */
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };

    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      highlightNumbers: Array.isArray(parsed.highlightNumbers)
        ? parsed.highlightNumbers
            .map(n => Number(n))
            .filter(n => Number.isInteger(n) && n >= 1 && n <= 40)
        : [],
    };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(next) {
  settings = {
    ...defaultSettings,
    ...next,
    highlightNumbers: Array.isArray(next.highlightNumbers)
      ? next.highlightNumbers
          .map(n => Number(n))
          .filter(n => Number.isInteger(n) && n >= 1 && n <= 40)
      : [],
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* =========================
   🔢 HIGHLIGHT NUMBERS
   ========================= */

// szukanie numeru komiksu w tytule: "1", "nr 1", "(1)", "1/2000" itd.
// - NIE łapie "11" gdy szukasz "1" (granice liczbowe)
function titleHasNumber(title, n) {
  const t = String(title ?? "");
  const re = new RegExp(`(^|\\D)${n}(\\D|$)`);
  return re.test(t);
}

function isHighlightedBySelectedNumbers(offer) {
  if (!settings.highlightNumbers.length) return false;
  const title = offer?.title ?? "";
  return settings.highlightNumbers.some(n => titleHasNumber(title, n));
}

function renderSettingsNumbers() {
  const box = document.getElementById("highlightNumbers");
  const info = document.getElementById("highlightInfo");
  if (!box) return;

  box.innerHTML = "";

  for (let i = 1; i <= 40; i++) {
    const checked = settings.highlightNumbers.includes(i);

    const label = document.createElement("label");
    label.className = "num-pill";
    label.innerHTML = `
      <input type="checkbox" value="${i}" ${checked ? "checked" : ""}>
      <span>${i}</span>
    `;

    label.querySelector("input").addEventListener("change", (e) => {
      const selected = new Set(settings.highlightNumbers);

      if (e.target.checked) {
        selected.add(i);
      } else {
        selected.delete(i);
      }

      // ✅ 1. zapisz lokalnie
      saveSettings({
        ...settings,
        highlightNumbers: [...selected].sort((a, b) => a - b),
      });

      // ✅ 2. wyślij stan do WS (CHECKCHECK)
      sendHighlightState();

      // ✅ 3. sync do backendu (REST, debounce)
      syncHighlightNumbersDebounced();

      // ✅ 4. info pod gridem
      if (info) {
        info.textContent = settings.highlightNumbers.length
          ? `Zaznaczone: ${settings.highlightNumbers.join(", ")}`
          : "Brak zaznaczonych numerów.";
      }

      // ✅ 5. natychmiastowe lifesearch
      applyFilters();
    });

    box.appendChild(label);
  }

  // initial info
  if (info) {
    info.textContent = settings.highlightNumbers.length
      ? `Zaznaczone: ${settings.highlightNumbers.join(", ")}`
      : "Brak zaznaczonych numerów.";
  }
}


/* =========================
   🔀 VIEW SWITCH
   ========================= */
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");

  currentView = id;

  if (id === "foundView") connectWS();
  else disconnectWS();

  if (id === "settingsView") renderSettingsNumbers();
}

/* =========================
   🔌 WEBSOCKET (REALTIME)
   ========================= */
function connectWS() {
  if (socket) return;

  socket = new WebSocket(WS_URL);
  const status = document.getElementById("wsStatus");

  socket.onopen = () => {
    if (status) status.textContent = "🟢 LIVE – realtime";
  };

  socket.onclose = () => {
    if (status) status.textContent = "🔴 rozłączono";
    socket = null;

    if (currentView === "foundView") {
      setTimeout(connectWS, 1000);
    }
  };

  socket.onerror = () => {
    if (status) status.textContent = "⚠️ błąd WebSocket";
  };

  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn("Nie JSON:", event.data);
      return;
    }

    if (data.type === "init" && Array.isArray(data.offers)) {
      allOffers = data.offers.map(normalizeOffer);
      applyFilters();
      return;
    }

    if (data.type === "new" && data.offer) {
      allOffers.unshift(normalizeOffer(data.offer));
      applyFilters();
      return;
    }

    // fallback
    if (data.offer) {
      allOffers.unshift(normalizeOffer(data.offer));
      applyFilters();
    }
  };
}

function disconnectWS() {
  if (socket) {
    socket.close();
    socket = null;
  }
}

/* =========================
   ⏱️ INTERVAL
   ========================= */
async function loadInterval() {
  const res = await apiFetch(`${API}/interval`)
  const data = await res.json();
  const input = document.getElementById("intervalInput");
  if (input) input.value = data.scan_interval;
}

async function updateInterval() {
  const value = Number(document.getElementById("intervalInput").value);

  const res = await fetch(`${API}/interval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval: value }),
  });

  if (!res.ok) {
    alert("Minimalny interwał to 30 sekund");
    return;
  }

  const st = document.getElementById("intervalStatus");
if (st) {
  st.textContent = "✅ Zapisano";
  setTimeout(() => st.textContent = "", 2000);
}
}
/* =========================
   🧠 FILTER + SORT
   ========================= */
function applyFilters() {
  let filtered = [...allOffers];

  const gigantosOnly = document.getElementById("gigantosCheck")?.checked;
  const number = document.getElementById("numberSearch")?.value.trim();
  const sort = document.getElementById("sortSelect")?.value;

  const sources = [...document.querySelectorAll(".sources input:checked")]
    .map(i => i.value);

  if (gigantosOnly) {
    filtered = filtered.filter(o => Boolean(o.is_gigantos));
  }

  if (number) {
    const n = Number(number);
    if (Number.isFinite(n)) {
      filtered = filtered.filter(o => titleHasNumber(o.title, n));
    } else {
      filtered = filtered.filter(o => String(o.title ?? "").includes(number));
    }
  }

  if (sources.length > 0) {
    filtered = filtered.filter(o => sources.includes(o.source));
  }

  // 🔥 SORT: push-highlight zawsze na top
  filtered.sort((a, b) => {
    if (highlightedMatchKey) {
      if (a.match_key === highlightedMatchKey) return -1;
      if (b.match_key === highlightedMatchKey) return 1;
    }

    if (sort === "oldest") return (a.found_at || 0) - (b.found_at || 0);
    return (b.found_at || 0) - (a.found_at || 0);
  });

  renderOffers(filtered);
}

/* =========================
   🧾 RENDER OFFERS
   ========================= */
function renderOffers(list) {
  const container = document.getElementById("offers");
  if (!container) return;

  container.innerHTML = "";

  list.forEach(o => {
    const el = document.createElement("div");

    const isGiga = Boolean(o.is_gigantos);
    const isHL = isHighlightedBySelectedNumbers(o);
    const isFromPush = highlightedMatchKey && o.match_key === highlightedMatchKey;

    el.className = "offer";
    if (isGiga) el.classList.add("offer-gigantos");
    if (isHL) el.classList.add("offer-highlight");
    if (isFromPush) el.classList.add("offer-from-push");

    el.onclick = () => window.open(o.link, "_blank");

    el.innerHTML = `
      <img src="${o.image_url ?? ""}" loading="lazy" onerror="this.style.display='none'">

      <div class="offer-body">
        <span class="badge ${escapeHtml(o.source)}">
          ${escapeHtml(String(o.source).toUpperCase())}
        </span>

        ${isGiga ? `<span class="giga-tag">🚨 GIGANTOS</span>` : ``}
        ${isHL ? `<span class="hl-tag">NUMER</span>` : ``}
        ${isFromPush ? `<span class="push-tag">🔔 z powiadomienia</span>` : ``}

        <div class="offer-title">${escapeHtml(o.title)}</div>
        <div class="offer-price">${escapeHtml(o.price ?? "brak ceny")}</div>
        <div class="offer-date">${escapeHtml(o.found_at_iso ?? "")}</div>
      </div>
    `;

    container.appendChild(el);
  });
}

/* =========================
   🔔 PUSH EVENTS (SERVICE WORKER MESSAGE)
   ========================= */
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.fromPush && event.data.match_key) {
    highlightedMatchKey = event.data.match_key;

    // przełącz na FOUND
    showView("foundView");

    // przerysuj i daj na top
    applyFilters();
  }
});

/* =========================
   🔔 PUSH EVENTS (URL PARAM)
   iOS często odpala appkę przez openWindow(url?match_key=...)
   ========================= */
function readPushFromURL() {
  const params = new URLSearchParams(window.location.search);
  const mk = params.get("match_key");
  if (mk) {
    highlightedMatchKey = mk;
    showView("foundView");
    applyFilters();
  }
}

/* =========================
   🔄 INIT
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  settings = loadSettings();

  if (isLoggedIn()) {
    hideLogin();
    bootAppAfterLogin();
    bindFilterEvents(); // 🔥🔥🔥 TO JEST KLUCZ
    readPushFromURL();
  } else {
    showLogin();
  }
});


/* =========================
   ❤️ HEALTH WS
   ========================= */
let healthSocket = null;

function formatUptime(sec) {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function connectHealthWS() {
  if (healthSocket) return;

  healthSocket = new WebSocket("wss://api.cnsniper.pl/ws/health");

  const bar = document.getElementById("healthBar");
  const text = document.getElementById("healthText");
  const dot = bar?.querySelector(".dot");

  healthSocket.onopen = () => {
    dot.className = "dot online";
  };

  healthSocket.onclose = () => {
    dot.className = "dot offline";
    text.textContent = "Offline";
    healthSocket = null;
    setTimeout(connectHealthWS, 2000);
  };

  healthSocket.onmessage = e => {
  const d = JSON.parse(e.data);

  text.textContent =
    `Status: ${d.status} | ` +
    `Uptime: ${formatUptime(d.uptime_seconds)} | ` +
    `Scan: ${d.is_scanning ? "🟢" : "⏸"} | ` +
    `Next: ${d.next_scan_in_seconds}s | ` +
    `Last: ${formatDate(d.last_scan_at)}`;
};
}
document.addEventListener("DOMContentLoaded", connectHealthWS);

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("pl-PL");
}

/* =========================
   ❌ REJECTED STATE
   ========================= */
let rejectedType = "junk";        // "junk" | "changes"
let rejectedOffers = [];
let rejectedWS = null;
let rejectedWSKind = null;        // 🔥 KLUCZ – jaki WS jest aktualnie podłączony

/* =========================
   ❌ REJECTED VIEW SWITCH
   ========================= */
function showRejectedView(type) {
  if (type !== "junk" && type !== "changes") {
    console.warn("Invalid rejected type:", type);
    return;
  }

  // ❌ nic nie rób, jeśli kliknięto ten sam tab
  if (rejectedType === type) return;

  rejectedType = type;

  // UI tabs
  document
    .querySelectorAll("#rejectedView .stats-tab")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.rejected === type
      );
    });

  loadRejected(type);
  connectRejectedWS(type);
}

/* =========================
   ❌ LOAD REJECTED (REST)
   ========================= */
async function loadRejected(type) {
  const box = document.getElementById("rejectedOffers");
  const status = document.getElementById("rejectedStatus");
  if (!box) return;

  box.innerHTML = "";
  if (status) status.textContent = "Ładowanie…";

  try {
    const res = await apiFetch(`${API}/rejected/${type}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    rejectedOffers = Array.isArray(data)
      ? data.map(normalizeOffer)
      : [];

    renderRejectedOffers(rejectedOffers);

    if (status) {
      status.textContent = rejectedOffers.length
        ? `Załadowano: ${rejectedOffers.length}`
        : "Brak pozycji";
    }
  } catch (err) {
    console.error("Rejected load error:", err);
    if (status) status.textContent = "❌ Błąd ładowania";
  }
}

/* =========================
   ❌ RENDER REJECTED
   ========================= */
function renderRejectedOffers(list) {
  const container = document.getElementById("rejectedOffers");
  if (!container) return;

  container.innerHTML = "";

  list.forEach(o => {
    const el = document.createElement("div");

    const isGiga = Boolean(o.is_gigantos);
    const isHL = isHighlightedBySelectedNumbers(o);

    el.className = "offer";
    if (isGiga) el.classList.add("offer-gigantos");
    if (isHL) el.classList.add("offer-highlight");

    el.onclick = () => window.open(o.link, "_blank");

    el.innerHTML = `
      <img src="${o.image ?? ""}" loading="lazy"
           onerror="this.style.display='none'">

      <div class="offer-body">
        <span class="badge ${escapeHtml(o.source)}">
          ${escapeHtml(String(o.source).toUpperCase())}
        </span>

        <div class="offer-title">${escapeHtml(o.title)}</div>
        <div class="offer-price">${escapeHtml(o.price ?? "brak ceny")}</div>
        <div class="offer-date">${escapeHtml(o.found_at_iso ?? "")}</div>
      </div>
    `;

    container.appendChild(el);
  });
}

/* =========================
   ❌ REJECTED WEBSOCKET (REALTIME)
   ========================= */
function connectRejectedWS(kind) {
  // ✅ jeśli WS już działa dla tego samego typu → NIC NIE RÓB
  if (rejectedWS && rejectedWSKind === kind) return;

  // 🔴 zamykamy WS tylko przy zmianie typu
  if (rejectedWS) {
    rejectedWS.close();
    rejectedWS = null;
  }

  rejectedWSKind = kind;

  // 🔥 bazujemy na WS_URL z appki
  const baseWS = WS_URL.replace("/ws/offers", "");
  const url = `${baseWS}/ws/rejected?kind=${kind}`;

  rejectedWS = new WebSocket(url);

  rejectedWS.onopen = () => {
    console.log("🟢 Rejected WS connected:", kind);
  };

  rejectedWS.onmessage = ev => {
    try {
      const msg = JSON.parse(ev.data);

      // INIT
      if (msg.type === "init" && Array.isArray(msg.offers)) {
        rejectedOffers = msg.offers.map(normalizeOffer);
        renderRejectedOffers(rejectedOffers);
        return;
      }

      // NEW
      if (msg.type === "new" && msg.offer) {
        const offer = normalizeOffer(msg.offer);

        const key = `${offer.source}:${offer.oid}`;
        const exists = rejectedOffers.some(
          o => `${o.source}:${o.oid}` === key
        );
        if (exists) return;

        rejectedOffers.unshift(offer);
        renderRejectedOffers(rejectedOffers);
      }
    } catch (e) {
      console.error("Rejected WS parse error:", e);
    }
  };

  rejectedWS.onclose = () => {
    console.log("🔴 Rejected WS disconnected");
    rejectedWS = null;
    rejectedWSKind = null;
  };

  rejectedWS.onerror = err => {
    console.error("Rejected WS error:", err);
  };
}

/* =========================
   INIT
   ========================= */
   document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("rejectedView")?.classList.contains("active")) {
    showRejectedView("junk");
  }
});

  // iOS PWA – blokada pinch zoom (NIE blokuje scrolla)
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend', e => e.preventDefault());



/* =========================
   🔔 PUSH ENABLE / DISABLE
   ========================= */

const PUSH_ENABLED_KEY = "cn_push_enabled";

/**
 * GŁÓWNY HANDLER POD PRZYCISK
 */
async function handleEnablePush() {
  const enabled = Boolean(localStorage.getItem(PUSH_ENABLED_KEY));

  if (enabled) {
    // =====================
    // 🔕 WYŁĄCZ PUSH
    // =====================
    try {
      await apiFetch(`${API}/push/unsubscribe`, {
        method: "POST"
      });

      localStorage.removeItem(PUSH_ENABLED_KEY);
      updatePushButton(false);

    } catch (e) {
      console.error("❌ Push unsubscribe error:", e);
      alert("Nie udało się wyłączyć powiadomień");
    }

    return;
  }

  // =====================
  // 🔔 WŁĄCZ PUSH
  // =====================

  // 1️⃣ Permission
  let perm = Notification.permission;
  if (perm !== "granted") {
    perm = await Notification.requestPermission();
  }

  if (perm !== "granted") {
    alert("Musisz zezwolić na powiadomienia, aby je włączyć");
    return;
  }

  // 2️⃣ Subscribe (Twoja istniejąca funkcja)
  let ok = false;
  try {
    ok = await subscribeForPush(); // ⬅️ MUSI wołać /push/subscribe przez apiFetch
  } catch (e) {
    console.error("❌ Push subscribe error:", e);
  }

  if (!ok) {
    alert("Nie udało się włączyć powiadomień");
    return;
  }

  // 3️⃣ Zapis lokalny + UI
  localStorage.setItem(PUSH_ENABLED_KEY, "1");
  updatePushButton(true);
}


/**
 * AKTUALIZACJA UI PRZYCISKU
 */
function updatePushButton(enabled) {
  const btn = document.getElementById("pushBtn");
  const status = document.getElementById("pushStatus");

  if (!btn) return;

  if (enabled) {
    btn.textContent = "🔕 Wyłącz powiadomienia";
    btn.style.background =
      "linear-gradient(135deg, #ff4d6d, #ffb347)";
    if (status) status.textContent = "Powiadomienia włączone ✅";
  } else {
    btn.textContent = "🔔 Włącz powiadomienia";
    btn.style.background =
      "linear-gradient(135deg, #4fdfff, #ff4fd8)";
    if (status) status.textContent = "Powiadomienia wyłączone";
  }
}


/**
 * 🔄 SYNC HIGHLIGHT NUMBERS → BACKEND
 * (bez zmian, ale zostawiam w komplecie)
 */
async function syncHighlightNumbersToBackend() {
  try {
    await apiFetch(`${API}/settings/highlight-numbers`, {
      method: "POST",
      body: JSON.stringify({
        numbers: settings.highlightNumbers
      })
    });

    updateHighlightServerStatus("ok", "Zapisano ✓");

  } catch (e) {
    updateHighlightServerStatus("error", "Błąd zapisu");
  }
}


async function loadHighlightNumbersFromBackend() {
  try {
    const res = await apiFetch(`${API}/settings/highlight-numbers`);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();

    if (Array.isArray(data.numbers)) {
      saveSettings({
        ...settings,
        highlightNumbers: data.numbers,
      });
    }
  } catch (e) {
    console.warn("⚠️ Nie udało się pobrać highlight numbers:", e);
  }
}

async function bootAppAfterLogin() {
  await loadHighlightNumbersFromBackend(); // ⬅️ token już istnieje
  connectHighlightWS();
  sendHighlightState();

  loadInterval();
  connectWS();
  connectHealthWS();
  loadStatsDashboard();
}



function bindFilterEvents() {
  // GIGANTOS
  document
    .getElementById("gigantosCheck")
    ?.addEventListener("change", applyFilters);

  // SORT
  document
    .getElementById("sortSelect")
    ?.addEventListener("change", applyFilters);

  // NUMER SEARCH (live)
  document
    .getElementById("numberSearch")
    ?.addEventListener("input", applyFilters);

  // ŹRÓDŁA
  document
    .querySelectorAll(".sources input")
    .forEach(el =>
      el.addEventListener("change", applyFilters)
    );
}

function sendHighlightState() {
  if (!highlightWS || highlightWS.readyState !== WebSocket.OPEN) return;

  console.log("📤 highlight_state →", settings.highlightNumbers);

  highlightWS.send(JSON.stringify({
    type: "highlight_state",
    numbers: settings.highlightNumbers,
  }));
}


let highlightWS = null;

function connectHighlightWS() {
  if (highlightWS) return;

  highlightWS = new WebSocket("wss://api.cnsniper.pl/ws/highlight");

  highlightWS.onopen = () => {
    console.log("🟢 Highlight WS connected");
    sendHighlightState();
  };

  highlightWS.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      console.log("📥 highlight WS:", msg);

      if (msg.type === "highlight_check") {
        updateHighlightServerStatus(
          msg.equal ? "ok" : "error",
          msg.equal
            ? "Stan zgodny z serwerem ✓"
            : "Stan RÓŻNI SIĘ od serwera ⚠️"
        );
      }
    } catch {}
  };

  highlightWS.onclose = () => {
    console.log("🔴 Highlight WS closed");
    highlightWS = null;
    setTimeout(connectHighlightWS, 2000);
  };
}

function updateHighlightServerStatus(state, message) {
  const box = document.getElementById("highlightServerStatus");
  if (!box) return;

  box.classList.remove("ok", "error", "pending");
  box.classList.add(state);

  const text = box.querySelector(".text");
  if (text) {
    text.textContent = message;
  }
}

let authWS = null;

function connectAuthWS() {
  const token = localStorage.getItem("access_token");
  if (!token) return;

  if (authWS) return; // 🔒 tylko jedno połączenie

  authWS = new WebSocket(
    `wss://api.cnsniper.pl/ws/auth-status?token=${token}`
  );

  authWS.onopen = () => {
    console.log("🟢 AUTH WS connected");
  };

  authWS.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      console.log("🔐 AUTH WS:", msg);

      if (msg.type === "auth" && msg.action === "logout") {
        forceLogout(
          msg.reason || "account_disabled",
          msg.message || "Konto dezaktywowane"
        );
      }
    } catch {}
  };

  authWS.onclose = () => {
    console.warn("🟠 AUTH WS closed");
    authWS = null;

    // 🔁 reconnect TYLKO jeśli nadal zalogowany
    if (localStorage.getItem("access_token")) {
      setTimeout(connectAuthWS, 2000);
    }
  };

  authWS.onerror = () => {
    authWS?.close();
  };
}


function forceLogout(reason = "session_invalid", message = "") {
  console.warn("🚨 FORCE LOGOUT:", reason, message);

  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");

  // pozamykaj WS z appki jeśli istnieją
  try { window.__authWS?.close(); } catch {}
  window.__authWS = null;

  try { window.__offersWS?.close(); } catch {}
  window.__offersWS = null;

  // pokaż overlay logowania
  showAuthOverlay();

  // info dla UI
  const box = document.getElementById("loginV2_error");
  if (box && message) box.textContent = message;

  // powiadom app.js
  window.dispatchEvent(new CustomEvent("auth:logout", {
    detail: { reason, message }
  }));
}

// =========================
// ✅ APP INIT (EVENT-DRIVEN)
// =========================
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 app.js DOMContentLoaded");

  // bindy filtrów mogą być zawsze
  bindFilterEvents();
  readPushFromURL();

  // jeśli już jest token (np. refresh strony)
  if (localStorage.getItem("access_token") && localStorage.getItem("refresh_token")) {
    console.log("✅ session present → boot app");
    bootAppAfterLogin();
    connectAuthWS();   // <-- start auth realtime
    return;
  }

  // jeśli nie ma tokenów, auth.js pokaże overlay
  console.log("⛔ no session → waiting for login");
});

// po udanym loginie z auth.js
window.addEventListener("auth:login", () => {
  console.log("✅ auth:login event → boot app");
  bootAppAfterLogin();
  connectAuthWS();
});

// po logout
window.addEventListener("auth:logout", (e) => {
  console.warn("🧼 auth:logout event", e.detail);

  // zatrzymaj wszystko co realtime
  try { socket?.close(); } catch {}
  socket = null;
});

let STATS = null;
let CURRENT_VIEW = "global";

async function loadStats() {
  try {
    const res = await apiFetch(`${API}/stats`);

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status}: ${t}`);
    }

    STATS = await res.json();
    console.log("📊 STATS OK:", STATS);
    renderStats();

  } catch (err) {
    console.error("❌ STATS LOAD ERROR:", err);
    const box = document.getElementById("statsDashboard");
    if (box) {
      box.innerHTML =
        "<b style='color:red'>❌ Nie udało się załadować statystyk</b>";
    }
  }
}


document.addEventListener("DOMContentLoaded", loadStats);



function showStatsView(view) {
  CURRENT_VIEW = view;

  document.querySelectorAll(".stats-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  renderStats();
}

function renderStats() {
  if (!STATS) return;

  let html = "";

  if (CURRENT_VIEW === "global") {
    html = renderGlobal(STATS.global);
  }

  if (CURRENT_VIEW === "today") {
    html = renderToday(STATS.today);
  }

  if (CURRENT_VIEW === "weekly") {
    html = renderWeekly(STATS.weekly);
  }

  document.getElementById("statsDashboard").innerHTML = html;
}

/* =========================
   🔧 RENDERERS (CSS READY)
========================= */

function renderGlobal(g) {
  return `
    <div class="stats-grid">
      ${statCard("⏱ Uptime", formatTime(g.uptime_sec), "blue")}
      ${statCard("🔁 Scany", g.scans, "cyan")}
      ${statCard("🆕 Nowe", g.totals.new, "green")}
      ${statCard("🗑 Junk", g.totals.junk, "red")}
      ${statCard("🔄 Zmiany", g.totals.change, "orange")}
      ${statCard("🚨 Gigantosy", g.totals.gigantos, "pink")}
    </div>

    <h3>📦 Źródła</h3>
    ${renderSources(g.per_source)}
  `;
}

function renderToday(t) {
  return `
    <div class="stats-grid">
      ${statCard("🔁 Scany", t.scans, "cyan")}
      ${statCard("🆕 Nowe", t.new, "green")}
      ${statCard("🗑 Junk", t.junk, "red")}
      ${statCard("🔄 Zmiany", t.change, "orange")}
      ${statCard("🚨 Gigantosy", t.gigantos, "pink")}
    </div>

    <h3>📦 Źródła</h3>
    ${renderSources(t.per_source)}
  `;
}

function renderWeekly(w) {
  return `
    <h3>➡️ Aktualny tydzień</h3>

    <div class="stats-grid">
      ${statCard("🔁 Scany", w.current.scans, "cyan", w.compare.scans)}
      ${statCard("🆕 Nowe", w.current.new, "green", w.compare.new)}
      ${statCard("🗑 Junk", w.current.junk, "red", w.compare.junk)}
      ${statCard("🔄 Zmiany", w.current.change, "orange", w.compare.change)}
      ${statCard("🚨 Gigantosy", w.current.gigantos, "pink", w.compare.gigantos)}
    </div>
  `;
}

/* =========================
   🧩 COMPONENTS
========================= */

function statCard(title, value, color, delta = null) {
  let deltaHtml = "";

  if (delta && typeof delta.abs === "number") {
    const cls = delta.abs >= 0 ? "up" : "down";
    const sign = delta.abs > 0 ? "+" : "";
    deltaHtml = `
      <div class="delta ${cls}">
        ${sign}${delta.abs}${delta.pct !== null ? ` (${delta.pct}%)` : ""}
      </div>
    `;
  }

  return `
    <div class="stat-card ${color}">
      <div class="stat-title">${title}</div>
      <div class="stat-value">${value}</div>
      ${deltaHtml}
    </div>
  `;
}

/* =========================
   📦 SOURCES (BARS)
========================= */

function renderSources(s) {
  const total = Object.values(s).reduce((a, b) => a + b, 0) || 1;

  return `
    <div class="bars">
      ${Object.entries(s).map(([name, val]) => {
        const pct = Math.round((val / total) * 100);
        return `
          <div class="bar">
            <strong>${name.toUpperCase()}</strong>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct}%"></div>
            </div>
            <span>${val}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* =========================
   ⏱ HELPERS
========================= */

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

async function subscribeForPush() {
  try {
    console.log("🔔 subscribeForPush() start");

    if (!("serviceWorker" in navigator)) {
      console.error("❌ No Service Worker support");
      return false;
    }

    if (!("PushManager" in window)) {
      console.error("❌ No PushManager support");
      return false;
    }

    // 1️⃣ czekamy aż SW będzie READY
    const reg = await navigator.serviceWorker.ready;
    console.log("✅ SW ready", reg);

    // 2️⃣ sprawdzamy czy już istnieje sub
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      console.log("📥 creating new push subscription");

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } else {
      console.log("♻️ using existing subscription");
    }

    console.log("📦 PUSH SUB:", sub);

    // 3️⃣ WYSYŁKA DO BACKENDU — UWAGA: apiFetch ❗
    const res = await apiFetch(`${API}/push/subscribe`, {
      method: "POST",
      body: JSON.stringify(sub),
    });

    console.log("📡 push subscribe response:", res.status);

    if (!res.ok) {
      const txt = await res.text();
      console.error("❌ Backend error:", txt);
      return false;
    }

    console.log("✅ push subscribed OK");
    return true;

  } catch (err) {
    console.error("❌ subscribeForPush exception:", err);
    return false;
  }
}

