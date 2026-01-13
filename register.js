// ===============================
// 🆕 REGISTER V2
// ===============================
async function handleRegisterV2() {
  const username = document.getElementById("regV2_username").value.trim();
  const email = document.getElementById("regV2_email").value.trim();
  const first_name = document.getElementById("regV2_firstname").value.trim();
  const last_name = document.getElementById("regV2_lastname").value.trim();
  const password = document.getElementById("regV2_password").value;

  const errorBox = document.getElementById("regV2_error");
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
    showLoginV2();

    document.getElementById("loginV2_login").value = username;
    document.getElementById("loginV2_password").value = "";

    document.getElementById("loginV2_error").textContent =
      "✅ Konto utworzone! Zaloguj się.";

    console.log("🆕 Zarejestrowano:", data.username);

  } catch (err) {
    errorBox.textContent = "Brak połączenia z serwerem";
  }
}
