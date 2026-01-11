/* =========================
   📊 STATS DASHBOARD
   ========================= */

const API_BASE = "https://api.cnsniper.pl";

let statsCache = {
  global: null,
  today: null,
  weekly: null,
};

let currentStatsView = "global";

/* =========================
   🔌 LOAD STATS
   ========================= */
async function loadStatsDashboard() {
  try {
    const [g, t, w] = await Promise.all([
      fetch(`${API_BASE}/stats/global`).then(r => r.json()),
      fetch(`${API_BASE}/stats/today`).then(r => r.json()),
      fetch(`${API_BASE}/stats/weekly`).then(r => r.json()),
    ]);

    statsCache.global = g || {};
    statsCache.today = t || {};
    statsCache.weekly = w || {};

    renderStats();
  } catch (e) {
    console.error("❌ STATS LOAD ERROR", e);
    renderEmpty("❌ Błąd ładowania statystyk");
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
   🎨 RENDER ROOT
   ========================= */
function renderStats() {
  const box = document.getElementById("statsDashboard");
  if (!box) return;

  box.innerHTML = "";

  if (currentStatsView === "global") {
    renderGlobal(statsCache.global);
  }

  if (currentStatsView === "today") {
    renderToday(statsCache.today);
  }

  if (currentStatsView === "weekly") {
    renderWeekly(statsCache.weekly);
  }
}

/* =========================
   🌍 GLOBAL
   ========================= */
function renderGlobal(g = {}) {
  const totals = g.totals || {};
  const perSource = g.per_source || {};

  renderCards([
    card("⏱ Uptime", secToTime(g.uptime_sec || 0), "blue"),
    card("🔁 Skanów", g.scans || 0, "pink"),
    card("🆕 Nowe", totals.new || 0, "green"),
    card("🗑 Junk", totals.junk || 0, "red"),
    card("🔁 Zmiany", totals.change || 0, "orange"),
    card("🚨 Gigantosy", totals.gigantos || 0, "cyan"),
  ]);

  renderSourceBars(perSource);
}

/* =========================
   📅 TODAY
   ========================= */
function renderToday(t = {}) {
  if (!Object.keys(t).length) {
    renderEmpty("Brak danych na dziś");
    return;
  }

  renderCards([
    card("🔁 Skanów", t.scans || 0, "pink"),
    card("🆕 Nowe", t.new || 0, "green"),
    card("🗑 Junk", t.junk || 0, "red"),
    card("🔁 Zmiany", t.change || 0, "orange"),
    card("🚨 Gigantosy", t.gigantos || 0, "cyan"),
  ]);

  renderSourceBars(t.per_source || {});
}

/* =========================
   📆 WEEKLY
   ========================= */
function renderWeekly(w = {}) {
  const cur = w.current || {};
  const cmp = w.compare || {};

  if (!Object.keys(cur).length) {
    renderEmpty("Brak danych tygodniowych");
    return;
  }

  renderCards([
    card("🔁 Skanów", cur.scans || 0, "pink", cmp.scans),
    card("🆕 Nowe", cur.new || 0, "green", cmp.new),
    card("🗑 Junk", cur.junk || 0, "red", cmp.junk),
    card("🔁 Zmiany", cur.change || 0, "orange", cmp.change),
    card("🚨 Gigantosy", cur.gigantos || 0, "cyan", cmp.gigantos),
  ]);

  renderSourceBars(cur.per_source || {});
}

/* =========================
   🧩 UI HELPERS
   ========================= */
function card(title, value, color, delta = null) {
  let diff = "";

  if (delta && typeof delta.abs === "number" && delta.abs !== 0) {
    const up = delta.abs > 0;
    diff = `
      <div class="delta ${up ? "up" : "down"}">
        ${up ? "⬆️" : "⬇️"} ${delta.abs}
        ${delta.pct !== null ? `(${delta.pct}%)` : ""}
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
  const box = document.getElementById("statsDashboard");
  box.innerHTML += `<div class="stats-grid">${cards.join("")}</div>`;
}

function renderSourceBars(src = {}) {
  const box = document.getElementById("statsDashboard");
  const values = Object.values(src);
  const max = Math.max(...values, 1);

  const bars = Object.entries(src).map(([k, v]) => `
    <div class="bar">
      <span>${k.toUpperCase()}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(v / max) * 100}%"></div>
      </div>
      <b>${v}</b>
    </div>
  `).join("");

  box.innerHTML += `<div class="bars">${bars}</div>`;
}

function renderEmpty(msg) {
  const box = document.getElementById("statsDashboard");
  box.innerHTML = `<p class="muted">${msg}</p>`;
}

function secToTime(sec) {
  const s = Number(sec) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/* =========================
   🚀 INIT
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  loadStatsDashboard();
  setInterval(loadStatsDashboard, 30_000); // auto-refresh
});
