/* =========================
   🌐 CONFIG
   ========================= */
const API = "https://api.cnsniper.pl";
const WS_URL = "wss://api.cnsniper.pl/ws/offers";

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
  const res = await fetch(`${API}/interval`);
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
  if (st) st.textContent = "Zapisano ✅";
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

  loadInterval();
  connectWS();

  // listeners filtrów
  document.querySelectorAll(
    "#sortSelect, #gigantosCheck, #numberSearch, .sources input"
  ).forEach(el => el.addEventListener("input", applyFilters));

  // settings UI
  renderSettingsNumbers();

  // push URL param
  readPushFromURL();
});
