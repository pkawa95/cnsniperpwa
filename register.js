async function handleRegisterV2() {
  const username = document.getElementById("regV2_username").value;
  const email = document.getElementById("regV2_email").value;
  const first_name = document.getElementById("regV2_firstname").value;
  const last_name = document.getElementById("regV2_lastname").value;
  const password = document.getElementById("regV2_password").value;
  const errorBox = document.getElementById("regV2_error");

  errorBox.textContent = "";

  try {
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        first_name,
        last_name,
        password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.detail || "Błąd rejestracji";
      return;
    }

    // po rejestracji → wracamy do logowania
    showLoginV2();
    document.getElementById("loginV2_error").textContent =
      "Konto utworzone! Możesz się zalogować.";

  } catch (e) {
    errorBox.textContent = "Brak połączenia z serwerem";
  }
}
