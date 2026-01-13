const API_BASE = ""; // jeśli masz np. https://api.xxx.pl → wpisz tutaj

function showLoginV2() {
  document.getElementById("loginFormV2").classList.remove("hidden");
  document.getElementById("registerFormV2").classList.add("hidden");
  document.getElementById("btnLoginTab").classList.add("active");
  document.getElementById("btnRegisterTab").classList.remove("active");
}

function showRegisterV2() {
  document.getElementById("loginFormV2").classList.add("hidden");
  document.getElementById("registerFormV2").classList.remove("hidden");
  document.getElementById("btnLoginTab").classList.remove("active");
  document.getElementById("btnRegisterTab").classList.add("active");
}

async function handleLoginV2() {
  const login = document.getElementById("loginV2_login").value;
  const password = document.getElementById("loginV2_password").value;
  const errorBox = document.getElementById("loginV2_error");

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

    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);

    document.getElementById("loginOverlayV2").classList.add("hidden");

    location.reload();

  } catch (e) {
    errorBox.textContent = "Brak połączenia z serwerem";
  }
}
