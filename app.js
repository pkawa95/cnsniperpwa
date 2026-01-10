/* =========================
   🌐 CONFIG
   ========================= */
const API = "https://api.cnsniper.pl";
const WS_URL = "wss://api.cnsniper.pl/ws/offers";


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

  return {
    ...o,
    offer_id: o.offer_id ?? o.id ?? null, // 🔥 KLUCZOWE
    source: detectSource(o),
    link: cleanLink(o.link),
    image_url: o.image ?? o.image_url ?? null,
    found_at: foundAt ? Number(foundAt) : 0,
    found_at_iso: foundAt ? formatDate(foundAt) : "",
    is_gigantos: Boolean(o.is_gigantos),
  };
}


function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

// 🔢 szukanie numeru komiksu w tytule: "1", "nr 1", "(1)", "1/2000" itd.
// - NIE łapie "11" gdy szukasz "1" (granice liczbowe)
function titleHasNumber(title, n) {
  const t = String(title ?? "");
  // granice: początek/koniec lub znak nie-cyfrowy
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
    const id = `hn_${i}`;
    const checked = settings.highlightNumbers.includes(i);

    const label = document.createElement("label");
    label.className = "num-pill";
    label.innerHTML = `
      <input type="checkbox" id="${id}" value="${i}" ${checked ? "checked" : ""}>
      <span>${i}</span>
    `;

    label.querySelector("input").addEventListener("change", () => {
      const selected = new Set(settings.highlightNumbers);
      if (label.querySelector("input").checked) selected.add(i);
      else selected.delete(i);

      saveSettings({ ...settings, highlightNumbers: [...selected].sort((a, b) => a - b) });

      if (info) {
        info.textContent = settings.highlightNumbers.length
          ? `Zaznaczone: ${settings.highlightNumbers.join(", ")}`
          : "Brak zaznaczonych numerów.";
      }

      // odśwież widok kafelków
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
  document.querySelectorAll(".view").forEach(v =>
    v.classList.remove("active")
  );
  document.getElementById(id)?.classList.add("active");

  currentView = id;

  if (id === "foundView") connectWS();
  else disconnectWS();

  if (id === "settingsView") {
    // wyrenderuj multiwybór 1..40 po wejściu w ustawienia
    renderSettingsNumbers();
  }
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
      setTimeout(connectWS, 1000); // 🔥 szybki reconnect
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

    // INIT – pełna lista
    if (data.type === "init" && Array.isArray(data.offers)) {
      allOffers = data.offers.map(normalizeOffer);
      applyFilters();
      return;
    }

    // 🔥 NOWA OFERTA LIVE
    if (data.type === "new" && data.offer) {
      allOffers.unshift(normalizeOffer(data.offer));
      applyFilters();
      return;
    }

    // fallback na stary format (gdyby przyszedł "offer" bez type)
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
   📊 STATS + SETTINGS
   ========================= */
async function loadStats() {
  const res = await fetch(`${API}/statystyki`);
  const data = await res.json();
  const el = document.getElementById("stats");
  if (el) el.textContent = JSON.stringify(data, null, 2);
}

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

  // manualne wyszukiwanie po numerze (pole w Found)
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

  filtered.sort((a, b) =>
    sort === "oldest"
      ? (a.found_at || 0) - (b.found_at || 0)
      : (b.found_at || 0) - (a.found_at || 0)
  );

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
    const isFromPush = highlightedOfferId && o.offer_id === highlightedOfferId;

    el.className = "offer";
    if (isGiga) el.classList.add("offer-gigantos");
    if (isHL) el.classList.add("offer-highlight");
    if (isFromPush) el.classList.add("offer-from-push"); // 🔥

    el.onclick = () => window.open(o.link, "_blank");

    el.innerHTML = `
      <img src="${o.image_url ?? ""}" loading="lazy" onerror="this.style.display='none'">
      <div class="offer-body">
        <span class="badge ${o.source}">
          ${String(o.source).toUpperCase()}
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
   🔄 INIT
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  settings = loadSettings();

  loadStats();
  loadInterval();
  connectWS();

  // events dla filtrów w Found
  document.querySelectorAll(
    "#sortSelect, #gigantosCheck, #numberSearch, .sources input"
  ).forEach(el =>
    el.addEventListener("input", applyFilters)
  );

  // render multiwyboru od razu (jakby start był na settings)
  renderSettingsNumbers();
});

let highlightedOfferId = null;

navigator.serviceWorker?.addEventListener("message", event => {
  if (event.data?.fromPush && event.data.offerId) {
    highlightedOfferId = event.data.offerId;

    // 🔥 przenieś ofertę na TOP
    const idx = allOffers.findIndex(o => o.offer_id === highlightedOfferId);
    if (idx > -1) {
      const [hit] = allOffers.splice(idx, 1);
      allOffers.unshift(hit);
    }

    // pokaż widok ofert
    showView("foundView");

    applyFilters();
  }
});

