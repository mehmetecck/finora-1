/* =====================================================================
   Finora — Login / Registration page logic
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  var params = new URLSearchParams(window.location.search);
  var requestedNext = params.get("next") || "home.html";
  var next = /^(https?:)?\/\//i.test(requestedNext) ? "home.html" : requestedNext;

  if (Finora.isEmailLoginLink(window.location.href)) {
    var emailLinkResult = await Finora.completeEmailLoginLink(null, window.location.href);
    if (!emailLinkResult.ok && emailLinkResult.code === "auth/missing-email") {
      var emailForLink = window.prompt("Please confirm the email address you used for this login link:");
      if (emailForLink) {
        emailLinkResult = await Finora.completeEmailLoginLink(emailForLink.trim(), window.location.href);
      }
    }

    if (emailLinkResult.ok) {
      Finora.toast("Signed in with email link.", "success");
      setTimeout(function() { window.location.href = next; }, 700);
      return;
    }

    Finora.toast(emailLinkResult.error, "error");
    window.history.replaceState({}, document.title, "login.html");
  }

  // If already logged in, go straight to profile.
  const existing = await Finora.authReady;
  if (existing) {
    window.location.href = next;
    return;
  } 

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const title = document.getElementById("authTitle");
  const subtitle = document.getElementById("authSubtitle");
  const switchHint = document.getElementById("switchHint");
  const tabs = document.querySelectorAll(".auth-tabs button");

  /* ---------------- Demo mode (no Firebase config) ----------------- */
  if (!Finora.isFirebase) {
    const note = document.createElement("div");
    note.className = "mb-3 p-2 px-3 border-finora";
    note.style.cssText = "background:var(--bg-elevated);color:var(--text-secondary);font-size:.82rem;border-radius:10px;";
    note.innerHTML = `<i class="bi bi-info-circle text-accent me-1"></i> Demo mode — test login is prefilled. Just click <strong>Log in</strong>.`;
    const tabsEl = document.querySelector(".auth-tabs");
    if (tabsEl) tabsEl.before(note);
    loginForm.email.value = "test@finora.com";
    loginForm.password.value = "test1234";
  }

  /* --------------------------- Tab switching ----------------------- */
  function setMode(mode) {
    const isLogin = mode === "login";
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === mode));
    loginForm.classList.toggle("d-none", !isLogin);
    registerForm.classList.toggle("d-none", isLogin);

    title.textContent = isLogin ? "Welcome back" : "Create your account";
    subtitle.textContent = isLogin ? "Log in to access your dashboard" : "Start investing in under two minutes";
    switchHint.innerHTML = isLogin
      ? `Don't have an account? <a href="#" data-switch="register">Sign up free</a>`
      : `Already have an account? <a href="#" data-switch="login">Log in</a>`;
    bindSwitch();
  }

  function bindSwitch() {
    const link = switchHint.querySelector("[data-switch]");
    if (link) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        setMode(link.dataset.switch);
      });
    }
  }

  tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.tab)));
  bindSwitch();

  // Honor ?mode=register deep link.
  if (params.get("mode") === "register") setMode("register");

  // Coming back from a successful sign-up: show login + a confirmation.
  if (params.get("registered") === "1") {
    setMode("login");
    Finora.toast("Account created! Please log in to continue.", "success");
  }

  if (params.get("verified") === "1") {
    setMode("login");
    Finora.toast("Email confirmed. You can log in now.", "success");
  }

  /* ----------------------- Show / hide password ------------------- */
  document.querySelectorAll("[data-toggle-pw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      const icon = btn.querySelector("i");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      icon.className = show ? "bi bi-eye-slash" : "bi bi-eye";
    });
  });

  /* ------------------------- Validation helpers ------------------- */
  var MIN_PASSWORD = 6; // Firebase requires at least 6 characters.
  function isEmail(v) { return v.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function clearFieldError(input) {
    input.classList.remove("is-invalid");
    var container = input.closest(".mb-3, .mb-2");
    if (!container) return;
    container.querySelectorAll(".invalid-feedback").forEach(function(f) { f.remove(); });
  }

  function fieldError(input, msg) {
    input.classList.add("is-invalid");
    var container = input.closest(".mb-3, .mb-2");
    var fb = container ? container.querySelector(".invalid-feedback") : null;
    if (!fb) {
      fb = document.createElement("div");
      fb.className = "invalid-feedback d-block";
      (input.closest(".input-group") || input).insertAdjacentElement("afterend", fb);
    }
    fb.textContent = msg;
  }
  function clearErrors(form) {
    form.querySelectorAll(".is-invalid").forEach(function(i) { i.classList.remove("is-invalid"); });
    form.querySelectorAll(".invalid-feedback").forEach(function(f) { f.remove(); });
    if (form === registerForm && matchHint) matchHint.textContent = "";
  }

  /* ---------------------- Password strength meter ------------------ */
  var pwInput = registerForm.querySelector('[name="password"]');
  var meter = document.getElementById("pwMeter");
  var hint = document.getElementById("pwHint");
  pwInput.addEventListener("input", function() {
    var v = pwInput.value;
    if (v.length >= MIN_PASSWORD) clearFieldError(pwInput);
    var score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const pct = (score / 4) * 100;
    const colors = ["#EF4444", "#F59E0B", "#38BDF8", "#22C55E"];
    const labels = ["Weak", "Fair", "Good", "Strong"];
    meter.style.width = pct + "%";
    if (v.length === 0) {
      meter.style.width = "0%";
      hint.textContent = "Use 8+ characters with a mix of letters, numbers & symbols.";
      hint.style.color = "";
    } else {
      const i = Math.max(0, score - 1);
      meter.style.background = colors[i];
      hint.textContent = `Password strength: ${labels[i]}`;
      hint.style.color = colors[i];
    }
    checkMatch();
  });

  /* --------------------- Confirm password match ------------------- */
  const confirmInput = registerForm.querySelector('[name="confirm"]');
  const matchHint = document.getElementById("matchHint");
  function checkMatch() {
    const a = pwInput.value;
    const b = confirmInput.value;
    if (!b) { matchHint.textContent = ""; return true; }
    const ok = a === b;
    matchHint.textContent = ok ? "Passwords match." : "Passwords do not match.";
    matchHint.style.color = ok ? "var(--bull)" : "var(--bear)";
    return ok;
  }
  confirmInput.addEventListener("input", function() {
    if (confirmInput.value) clearFieldError(confirmInput);
    checkMatch();
  });

  function bindLiveValidation(input, isValid) {
    input.addEventListener("input", function() {
      if (isValid(input.value.trim())) clearFieldError(input);
    });
  }

  bindLiveValidation(loginForm.email, isEmail);
  bindLiveValidation(registerForm.email, isEmail);
  registerForm.name.addEventListener("input", function() {
    if (registerForm.name.value.trim().length >= 2) clearFieldError(registerForm.name);
  });

  /* ------------------------- Submit helpers ----------------------- */
  function setLoading(btn, isLoading, loadingText) {
    if (isLoading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  const resetLink = document.querySelector("[data-reset-password]");
  if (resetLink) {
    let resetInFlight = false;
    resetLink.addEventListener("click", async (e) => {
      e.preventDefault();
      if (resetInFlight) return;
      clearErrors(loginForm);
      const email = loginForm.email.value.trim();
      if (!isEmail(email)) {
        fieldError(loginForm.email, "Enter your email first so we can send a reset link.");
        return;
      }

      resetInFlight = true;
      resetLink.classList.add("disabled");
      resetLink.setAttribute("aria-disabled", "true");
      try {
        const res = await Finora.resetPassword(email);
        if (!res.ok) {
          fieldError(loginForm.email, res.error);
          Finora.toast(res.error, "error");
          return;
        }

        const message = Finora.isFirebase
          ? "Password reset email sent. Check your inbox."
          : "Demo mode: password reset emails require Firebase config.";
        Finora.toast(message, Finora.isFirebase ? "success" : "info");
      } finally {
        resetInFlight = false;
        resetLink.classList.remove("disabled");
        resetLink.removeAttribute("aria-disabled");
      }
    });
  }

  var emailLinkBtn = document.querySelector("[data-email-link-login]");
  if (emailLinkBtn) {
    emailLinkBtn.addEventListener("click", async function() {
      clearErrors(loginForm);
      var email = loginForm.email.value.trim();
      if (!isEmail(email)) {
        fieldError(loginForm.email, "Enter a valid email address so we can send your login link.");
        return;
      }

      setLoading(emailLinkBtn, true, "Sending link...");
      var res = await Finora.sendEmailLoginLink({ email: email, next: next });
      setLoading(emailLinkBtn, false);
      if (!res.ok) {
        fieldError(loginForm.email, res.error);
        Finora.toast(res.error, "error");
        return;
      }
      Finora.toast("Login link sent. Check your inbox.", "success");
    });
  }

  /* ----------------------------- Login ---------------------------- */
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(loginForm);
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    const remember = document.getElementById("remember")?.checked ?? true;
    let valid = true;
    if (!isEmail(email)) { fieldError(loginForm.email, "Enter a valid email address."); valid = false; }
    if (!password) { fieldError(loginForm.password, "Password is required."); valid = false; }
    if (!valid) return;

    const btn = loginForm.querySelector('[type="submit"]');
    setLoading(btn, true, "Logging in…");
    const res = await Finora.login({ email, password, remember });
    setLoading(btn, false);
    if (!res.ok) {
      fieldError(loginForm.password, res.error);
      Finora.toast(res.error, "error");
      return;
    }
    Finora.toast("Welcome back!", "success");
    setTimeout(() => (window.location.href = next), 700);
  });

  /* --------------------------- Register --------------------------- */
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(registerForm);
    const name = registerForm.name.value.trim();
    const email = registerForm.email.value.trim();
    const password = registerForm.password.value;
    const confirm = registerForm.confirm.value;
    const terms = document.getElementById("terms").checked;
    let valid = true;

    if (name.length < 2) { fieldError(registerForm.name, "Please enter your full name."); valid = false; }
    if (!isEmail(email)) { fieldError(registerForm.email, "Enter a valid email address (must include @)."); valid = false; }
    if (!password) { fieldError(registerForm.password, "Please create a password."); valid = false; }
    else if (password.length < MIN_PASSWORD) { fieldError(registerForm.password, `Password must be at least ${MIN_PASSWORD} characters.`); valid = false; }
    // Passwords must match before submission.
    if (password !== confirm) { fieldError(registerForm.confirm, "Passwords do not match."); valid = false; }
    if (!terms) { Finora.toast("Please accept the Terms to continue.", "error"); valid = false; }
    if (!valid) return;

    const btn = registerForm.querySelector('[type="submit"]');
    setLoading(btn, true, "Creating account…");
    // Creates the user in the Firebase Authentication database.
    const res = await Finora.register({ name, email, password });
    setLoading(btn, false);
    if (!res.ok) {
      // Surface clear, field-specific errors from Firebase.
      if (res.code === "auth/email-already-in-use" || res.code === "auth/invalid-email") {
        fieldError(registerForm.email, res.error);
      } else if (res.code === "auth/weak-password" || res.code === "auth/missing-password") {
        fieldError(registerForm.password, res.error);
      }
      Finora.toast(res.error, "error");
      return;
    }
    // Registration was successful and the user is now logged in.
    // The main.js `register` function handles sending a verification email if needed.
    Finora.toast("Welcome to Finora!", "success");
    // Redirect to the destination specified in the URL, or home.html by default.
    setTimeout(function() {
      window.location.href = next;
    }, 700);
  });

  /* ------------------------- Google login ------------------------- */
  const googleBtn = document.querySelector("[data-google-login]");
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      setLoading(googleBtn, true, "Connecting…");
      const remember = document.getElementById("remember")?.checked ?? true;
      const res = await Finora.loginWithGoogle({ remember });
      setLoading(googleBtn, false);
      if (!res.ok) { Finora.toast(res.error, "error"); return; }
      Finora.toast("Signed in with Google!", "success");
      setTimeout(() => (window.location.href = next), 700);
    });
  }

  /* ------------------------- Demo socials ------------------------- */
  document.querySelectorAll("[data-demo-social]").forEach((btn) => {
    btn.addEventListener("click", () => Finora.toast("This login option is not available in this demo.", "info"));
  });
});
