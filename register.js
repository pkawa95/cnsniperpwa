// ===============================
// REGISTER.JS V2 – CN SNIPER
// ===============================

console.log("✅ register.js loaded");

// ===============================
// 🆕 REGISTER V2 (GLOBAL)
// ===============================

window.handleRegisterV2 = async function () {
  const username = document.getElementById("regV2_username")?.value.trim();
  const email = document.getElementById("regV2_email")?.value.trim();
  const first_name = document.getElementById("regV2_firstname")?.value.trim();
  const last_name = document.getElementById("regV2_lastname")?.value.trim();
  const password = document.getElementById("regV2_password")?.value;

  const errorBox = document.getElementById("regV2_error");
  if (!errorBox) {
    console.error("❌ regV2_error NOT FOUND");
    return;
  }

  errorBox.textContent = "";

  // ===============================
  // 🧪 FRONT VALIDATION
  // ===============================

  if (!username || !email || !first_name || !last_name || !password) {
    errorBox.textContent = "Uzupełnij wszystkie pola";
    return;
  }

  if (username.length < 3) {
    errorBox.textContent = "Username musi mieć min. 3 znaki";
    return;
  }

  if (password.length < 8) {
    errorBox.textContent = "Hasło musi mieć min. 8 znaków";
    return;
  }

  // ===============================
  // 🚀 REQUEST
  // ===============================

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        first_name,
        last_name,
        password,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.detail || "Błąd rejestracji";
      return;
    }

    // ===============================
    // ✅ SUCCESS
    // ===============================

    console.log("🆕 ZAREJESTROWANO:", data);

    // wróć do logowania
    if (typeof window.showLoginV2 === "function") {
      window.showLoginV2();
    }

    // prefill login
    const loginInput = document.getElementById("loginV2_login");
    if (loginInput) loginInput.value = username;

    const loginError = document.getElementById("loginV2_error");
    if (loginError) {
      loginError.textContent = "✅ Konto utworzone! Zaloguj się.";
    }

  } catch (err) {
    console.error(err);
    errorBox.textContent = "Brak połączenia z serwerem";
  }
};
