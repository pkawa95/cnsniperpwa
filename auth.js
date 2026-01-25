// ===============================
// AUTH.JS V2 – CN SNIPER (FINAL)
// ===============================

console.log("✅ auth.js loaded");
const API_BASE = window.API_BASE;

// ===============================
// TOKEN HELPERS
// ===============================

window.getAccessToken = function () {
  return localStorage.getItem("access_token");
};

window.getRefreshToken = function () {
  return localStorage.getItem("refresh_token");
};

window.setTokens = function (access, refresh) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
};

window.clearTokens = function () {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

// ===============================
// JWT
// ===============================

window.isJwtExpired = function (token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp && payload.exp < now;
  } catch {
    return true;
  }
};

// ===============================
// OVERLAY
// ===============================

window.showAuthOverlay = function () {
  const o = document.getElementById("loginOverlayV2");
  if (!o) {
    console.error("❌ loginOverlayV2 NOT FOUND");
    return;
  }

  o.classList.remove("hidden");
  o.style.display = "flex";
  o.style.position = "fixed";
  o.style.inset = "0";
  o.style.zIndex = "99999";

  window.showLoginV2();
};

window.hideAuthOverlay = function () {
  const o = document.getElementById("loginOverlayV2");
  if (!o) return;
  o.classList.add("hidden");
};

// ===============================
// TAB SWITCH (GLOBAL)
// ===============================

window.showLoginV2 = function () {
  document.getElementById("loginFormV2")?.classList.remove("hidden");
  document.getElementById("registerFormV2")?.classList.add("hidden");
  document.getElementById("btnLoginTab")?.classList.add("active");
  document.getElementById("btnRegisterTab")?.classList.remove("active");
};

window.showRegisterV2 = function () {
  document.getElementById("loginFormV2")?.classList.add("hidden");
  document.getElementById("registerFormV2")?.classList.remove("hidden");
  document.getElementById("btnLoginTab")?.classList.remove("active");
  document.getElementById("btnRegisterTab")?.classList.add("active");
};

// ===============================
// LOGIN
// ===============================

window.handleLoginV2 = async function () {
  const login = document.getElementById("loginV2_login")?.value.trim();
  const password = document.getElementById("loginV2_password")?.value;
  const errorBox = document.getElementById("loginV2_error");

  if (!login || !password) {
    errorBox.textContent = "Uzupełnij login i hasło";
    return;
  }

  errorBox.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.detail || "Błąd logowania";
      return;
    }

    window.setTokens(data.access_token, data.refresh_token);
    window.hideAuthOverlay();

    console.log("✅ ZALOGOWANO");

    // opcjonalnie:
    location.reload();

  } catch (e) {
    console.error(e);
    errorBox.textContent = "Brak połączenia z serwerem";
  }
};

// ===============================
// LOGOUT
// ===============================

window.handleLogoutV2 = function () {
  window.clearTokens();
  window.showAuthOverlay();
  console.log("🚪 Wylogowano");
};

// ===============================
// SESSION CHECK (BOOT)
// ===============================

window.checkAuthSession = function () {
  const access = window.getAccessToken();
  const refresh = window.getRefreshToken();

  console.log("🔍 access:", access);
  console.log("🔍 refresh:", refresh);

  if (!access || !refresh) {
    console.log("🚨 NO SESSION");
    window.showAuthOverlay();
    return;
  }

  if (window.isJwtExpired(access)) {
    console.warn("⏰ Access token expired");
    window.showAuthOverlay();
    return;
  }

  console.log("✅ SESSION OK");
  window.hideAuthOverlay();
};

// ===============================
// FINAL BOOTSTRAP (NIEZAWODNY)
// ===============================

(function authBootstrapFinal() {
  console.log("🔥 AUTH BOOTSTRAP FINAL");

  function boot() {
    const overlay = document.getElementById("loginOverlayV2");

    if (!overlay) {
      console.error("❌ loginOverlayV2 NOT FOUND");
      return;
    }

    window.checkAuthSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    setTimeout(boot, 0);
  }
})();
