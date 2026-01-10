/* =========================
   📊 STATS DASHBOARD
   ========================= */

const API_BASE = "http://83.168.90.77:8010";

let statsCache = {
  global: null,
  today: null,
  weekly: null,
};

let currentStatsView = "global";

/* =========================
   🔌 LOAD STATS (PEWNE ENDPOINTY)
   ========================= */
async function loadStatsDashboard() {
  try {
    const [g, t, w] = await Promise.all([
      fetch(`${API_BASE}/stats/global`).then(r => r.json()),
      fetch(`${API_BASE}/stats/today`).then(r => r.json()),
      fetch(`${API_BASE}/stats/weekly`).then(r => r.json()),
    ]);

    statsCache.global = g;
    statsCache.today = t;
    statsCache.weekly = w;

    console.log("📊 STATS LOADED", statsCache);
    renderStats();
  } catch (e) {
    console.error("❌ STATS LOAD ERROR", e);
    renderEmpty("Błąd ładowania statystyk");
  }
}

/* =========================
   🔀 VIEW SWITCH
   ========================= */
function showStatsView(view) {
  currentStatsView = view;

  document.querySelectorAll(".stats-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view)
  );

  renderStats();
}

/* =========================
   🎨 RENDER
   ========================= */
function renderStats() {
  const box = document.getElementById("statsDashboard");
  if (!box) return;

  box.innerHTML = "";

  if (currentStatsView === "global" && statsCache.global) {
    renderGlobal(statsCache.global);
  }

  if (currentStatsView === "today" && statsCache.today) {
    renderToday(statsCache.today);
  }

  if (currentStatsView === "weekly" && statsCache.weekly) {
    renderWeekly(statsCache.weekly);
  }
}

/* =========================
   🌍 GLOBAL
   ========================= */
function renderGlobal(g) {
  renderCards([
    card("⏱ Uptime", secToTime(g.uptime_sec), "blue"),
    card("🔁 Skanów", g.scans, "pink"),
    card("🆕 Nowe", g.totals.new, "green"),
    card("🗑 Junk", g.totals.junk, "red"),
    card("🔁 Zmiany", g.totals.change, "orange"),
    card("🚨 Gigantosy", g.totals.gigantos, "cyan"),
  ]);

  renderSourceBars(g.per_source);
}

/* =========================
   📅 TODAY
   ========================= */
function renderToday(t) {
  if (!t || !t.new) {
    renderEmpty("Brak danych na dziś");
    return;
  }

  renderCards([
    card("🆕 Nowe", t.new, "green"),
    card("🗑 Junk", t.junk, "red"),
    card("🔁 Zmiany", t.change, "orange"),
    card("🚨 Gigantosy", t.gigantos, "cyan"),
  ]);

  renderSourceBars(t.per_source);
}

/* =========================
   📆 WEEKLY
   ========================= */
function renderWeekly(w) {
  if (!w || !w.current) {
    renderEmpty("Brak danych tygodniowych");
    return;
  }

  const cur = w.current;
  const cmp = w.compare || {};

  renderCards([
    card("🆕 Nowe", cur.new, "green", cmp.new),
    card("🗑 Junk", cur.junk, "red", cmp.junk),
    card("🔁 Zmiany", cur.change, "orange", cmp.change),
    card("🚨 Gigantosy", cur.gigantos, "cyan", cmp.gigantos),
  ]);

  renderSourceBars(cur.per_source);
}

/* =========================
   🧩 UI HELPERS
   ========================= */
function card(title, value, color, delta = null) {
  let diff = "";

  if (delta && delta.abs !== 0 && delta.pct !== null) {
    const up = delta.abs > 0;
    diff = `
      <div class="delta ${up ? "up" : "down"}">
        ${up ? "⬆️" : "⬇️"} ${delta.abs} (${delta.pct}%)
      </div>
    `;
  }

  return `
    <div class="stat-card ${color}">
      <div class="stat-title">${title}</div>
      <div class="stat-value">${value}</div>
      ${diff}
    </div>
  `;
}

function renderCards(cards) {
  document.getElementById("statsDashboard").innerHTML +=
    `<div class="stats-grid">${cards.join("")}</div>`;
}

function renderSourceBars(src) {
  if (!src) return;

  const max = Math.max(...Object.values(src), 1);

  const bars = Object.entries(src).map(([k, v]) => `
    <div class="bar">
      <span>${k.toUpperCase()}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(v / max) * 100}%"></div>
      </div>
      <b>${v}</b>
    </div>
  `).join("");

  document.getElementById("statsDashboard").innerHTML +=
    `<div class="bars">${bars}</div>`;
}

function renderEmpty(msg) {
  document.getElementById("statsDashboard").innerHTML =
    `<p class="muted">${msg}</p>`;
}

function secToTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/* =========================
   🚀 INIT
   ========================= */
document.addEventListener("DOMContentLoaded", loadStatsDashboard);
