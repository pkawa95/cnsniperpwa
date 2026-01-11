/* =========================
   🌐 CONFIG
   ========================= */
const API = "https://api.cnsniper.pl";
const WS_URL = "wss://api.cnsniper.pl/ws/offers";
const WS_API = API.replace(/^http/, "ws");

// 🔄 SERVICE WORKER UPDATE HANDLER
navigator.serviceWorker?.addEventListener("message", event => {
  if (event.data?.type === "SW_UPDATED") {
    console.log("🔄 App updated – reloading");
    location.reload();
  }
});

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

/* =========================
   🔐 AUTH (PWA – ONE TIME LOGIN)
   ========================= */

const AUTH_TOKEN_KEY = "cn_auth_token";

/* 🔍 sprawdzenie czy już zalogowany */
function isLoggedIn() {
  return Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
}

/* 🔓 pokaż / ukryj login */
function showLogin() {
  document.getElementById("loginOverlay")?.classList.remove("hidden");
}

function hideLogin() {
  document.getElementById("loginOverlay")?.classList.add("hidden");
}

/* 🚪 login */
async function handleLogin() {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value;
  const err = document.getElementById("loginError");

  err.textContent = "";

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });

    if (!res.ok) throw new Error("Błędny login lub hasło");

    const data = await res.json();
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);

    hideLogin();
    bootAppAfterLogin();

  } catch (e) {
    err.textContent = "❌ Nieprawidłowy login lub hasło";
  }
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

/* 🚀 start aplikacji po zalogowaniu */
function bootAppAfterLogin() {
  // normalny start Twojej appki
  loadInterval();
  connectWS();
  connectHealthWS();
  loadStatsDashboard();
}

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
    .replace(/[^\w\s]/g, "")     // usuwa znaki specjalne
    .replace(/\s+/g, " ")        // scala spacje
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

      if (e.target.checked) selected.add(i);
      else selected.delete(i);

      saveSettings({
  ...settings,
  highlightNumbers: [...selected].sort((a, b) => a - b),
});

// 🔥 SYNC DO BACKENDU
syncHighlightNumbersDebounced();


      if (info) {
        info.textContent = settings.highlightNumbers.length
          ? `Zaznaczone: ${settings.highlightNumbers.join(", ")}`
          : "Brak zaznaczonych numerów.";
      }

      applyFilters();
    });

    box.appendChild(label);
  }

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
if (id === "rejectedView") {
  showRejectedView("junk"); // start domyślny
}

  // iOS PWA – blokada pinch zoom (NIE blokuje scrolla)
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend', e => e.preventDefault());



const PUSH_ENABLED_KEY = "cn_push_enabled";

async function handleEnablePush() {
  if (localStorage.getItem(PUSH_ENABLED_KEY)) {
    // 🔕 WYŁĄCZ
    await fetch(`${API}/push/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "all" })
    });

    localStorage.removeItem(PUSH_ENABLED_KEY);
    updatePushButton(false);
    return;
  }

  // 🔔 WŁĄCZ (Twoja istniejąca logika subscribe)
  const ok = await subscribeForPush(); // ← masz to już
  if (ok) {
    localStorage.setItem(PUSH_ENABLED_KEY, "1");
    updatePushButton(true);
  }
}

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

async function syncHighlightNumbersToBackend() {
  try {
    await apiFetch(`${API}/settings/highlight-numbers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numbers: settings.highlightNumbers
      })
    });
  } catch (e) {
    console.error("❌ Sync highlight numbers failed", e);
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
  await loadHighlightNumbersFromBackend(); // GET (z tokenem)
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
