// ===============================
// AUTH.JS V2 – CN SNIPER
// ===============================

const API_BASE = "https://api.cnsniper.pl";

// ===============================
// TOKEN HELPERS
// ===============================

function getAccessToken() {
  return localStorage.getItem("access_token");
}

function getRefreshToken() {
  return localStorage.getItem("refresh_token");
}

function setTokens(access, refresh) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

// ===============================
// JWT
// ===============================

function isJwtExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp && payload.exp < now;
  } catch {
    return true;
  }
}

// ===============================
// OVERLAY
// ===============================

function showAuthOverlay() {
  document.getElementById("loginOverlayV2")?.classList.remove("hidden");
  showLoginV2();
}

function hideAuthOverlay() {
  document.getElementById("loginOverlayV2")?.classList.add("hidden");
}

// ===============================
// TAB SWITCH
// ===============================

function showLoginV2() {
  document.getElementById("loginFormV2")?.classList.remove("hidden");
  document.getElementById("registerFormV2")?.classList.add("hidden");
  document.getElementById("btnLoginTab")?.classList.add("active");
  document.getElementById("btnRegisterTab")?.classList.remove("active");
}

function showRegisterV2() {
  document.getElementById("loginFormV2")?.classList.add("hidden");
  document.getElementById("registerFormV2")?.classList.remove("hidden");
  document.getElementById("btnLoginTab")?.classList.remove("active");
  document.getElementById("btnRegisterTab")?.classList.add("active");
}

// ===============================
// SESSION CHECK
// ===============================

function checkAuthSession() {
  const access = getAccessToken();
  const refresh = getRefreshToken();

  if (!access || !refresh) {
    showAuthOverlay();
    return;
  }

  if (isJwtExpired(access)) {
    console.warn("🔒 Access token expired");
    showAuthOverlay();
    return;
  }

  hideAuthOverlay();
}

// ===============================
// LOGIN
// ===============================

async function handleLoginV2() {
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
      body: JSON.stringify({ login, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.detail || "Błąd logowania";
      return;
    }

    setTokens(data.access_token, data.refresh_token);
    hideAuthOverlay();

    console.log("✅ Zalogowano");

  } catch (e) {
    errorBox.textContent = "Brak połączenia z serwerem";
  }
}

// ===============================
// LOGOUT (BONUS)
// ===============================

function handleLogoutV2() {
  clearTokens();
  showAuthOverlay();
  console.log("🚪 Wylogowano");
}

// ===============================
// AUTO INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  checkAuthSession();
});
