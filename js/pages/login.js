/* =====================================================================
   Finora — Login / Registration page logic
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  var params = new URLSearchParams(window.location.search);
  var requestedNext = params.get("next") || "profile.html";
  var next = /^(https?:)?\/\//i.test(requestedNext) ? "profile.html" : requestedNext;

  // If already logged in, go straight to profile.
  var existing = await Finora.authReady;
  if (existing) {
    window.location.href = next;
    return;
  }

  var loginForm = document.getElementById("loginForm");
  var registerForm = document.getElementById("registerForm");
  var title = document.getElementById("authTitle");
  var subtitle = document.getElementById("authSubtitle");
  var switchHint = document.getElementById("switchHint");
  var tabs = document.querySelectorAll(".auth-tabs button");

  /* ---------------- Demo mode (no Firebase config) ----------------- */
  if (!Finora.isFirebase) {
    var note = document.createElement("div");
    note.className = "mb-3 p-2 px-3 border-finora";
    note.style.cssText = "background:var(--bg-elevated);color:var(--text-secondary);font-size:.82rem;border-radius:10px;";
    note.innerHTML = `<i class="bi bi-info-circle text-accent me-1"></i> Demo mode — test login is prefilled. Just click <strong>Log in</strong>.`;
    var tabsEl = document.querySelector(".auth-tabs");
    if (tabsEl) tabsEl.before(note);
    loginForm.email.value = "test@finora.com";
    loginForm.password.value = "test1234";
  }

  /* --------------------------- Tab switching ----------------------- */
  function setMode(mode) {
    var isLogin = mode === "login";
    tabs.forEach(function(t) { t.classList.toggle("active", t.dataset.tab === mode); });
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
    var link = switchHint.querySelector("[data-switch]");
    if (link) {
      link.addEventListener("click", function(e) {
        e.preventDefault();
        setMode(link.dataset.switch);
      });
    }
  }

  tabs.forEach(function(t) { t.addEventListener("click", function() { setMode(t.dataset.tab); }); });
  bindSwitch();

  // Honor ?mode=register deep link.
  if (params.get("mode") === "register") setMode("register");

  // Coming back from a successful sign-up: show login + a confirmation.
  if (params.get("registered") === "1") {
    setMode("login");
    Finora.toast("Account created! Please log in to continue.", "success");
  }

  /* ----------------------- Show / hide password ------------------- */
  document.querySelectorAll("[data-toggle-pw]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var input = btn.parentElement.querySelector("input");
      var icon = btn.querySelector("i");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      icon.className = show ? "bi bi-eye-slash" : "bi bi-eye";
    });
  });

  /* ---------------------- Password strength meter ------------------ */
  var pwInput = registerForm.querySelector('[name="password"]');
  var meter = document.getElementById("pwMeter");
  var hint = document.getElementById("pwHint");
  pwInput.addEventListener("input", function() {
    var v = pwInput.value;
    var score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    var pct = (score / 4) * 100;
    var colors = ["#EF4444", "#F59E0B", "#38BDF8", "#22C55E"];
    var labels = ["Weak", "Fair", "Good", "Strong"];
    meter.style.width = pct + "%";
    if (v.length === 0) {
      meter.style.width = "0%";
      hint.textContent = "Use 8+ characters with a mix of letters, numbers & symbols.";
      hint.style.color = "";
    } else {
      var i = Math.max(0, score - 1);
      meter.style.background = colors[i];
      hint.textContent = "Password strength: " + labels[i];
      hint.style.color = colors[i];
    }
    checkMatch();
  });

  /* --------------------- Confirm password match ------------------- */
  var confirmInput = registerForm.querySelector('[name="confirm"]');
  var matchHint = document.getElementById("matchHint");
  function checkMatch() {
    var a = pwInput.value;
    var b = confirmInput.value;
    if (!b) { matchHint.textContent = ""; return true; }
    var ok = a === b;
    matchHint.textContent = ok ? "Passwords match." : "Passwords do not match.";
    matchHint.style.color = ok ? "var(--bull)" : "var(--bear)";
    return ok;
  }
  confirmInput.addEventListener("input", checkMatch);

  /* ------------------------- Validation helpers ------------------- */
  // Basic email check: must contain "@" with text on both sides and a domain.
  function isEmail(v) { return v.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  var MIN_PASSWORD = 6; // Firebase requires at least 6 characters.

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
  }

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

  var resetLink = document.querySelector("[data-reset-password]");
  if (resetLink) {
    var resetInFlight = false;
    resetLink.addEventListener("click", async function(e) {
      e.preventDefault();
      if (resetInFlight) return;
      clearErrors(loginForm);
      var email = loginForm.email.value.trim();
      if (!isEmail(email)) {
        fieldError(loginForm.email, "Enter your email first so we can send a reset link.");
        return;
      }

      resetInFlight = true;
      resetLink.classList.add("disabled");
      resetLink.setAttribute("aria-disabled", "true");
      try {
        var res = await Finora.resetPassword(email);
        if (!res.ok) {
          fieldError(loginForm.email, res.error);
          Finora.toast(res.error, "error");
          return;
        }

        var message = Finora.isFirebase
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

  /* ----------------------------- Login ---------------------------- */
  loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    clearErrors(loginForm);
    var email = loginForm.email.value.trim();
    var password = loginForm.password.value;
    var rememberEl = document.getElementById("remember");
    var remember = rememberEl ? rememberEl.checked : true;
    var valid = true;
    if (!isEmail(email)) { fieldError(loginForm.email, "Enter a valid email address."); valid = false; }
    if (!password) { fieldError(loginForm.password, "Password is required."); valid = false; }
    if (!valid) return;

    var btn = loginForm.querySelector('[type="submit"]');
    setLoading(btn, true, "Logging in…");
    var res = await Finora.login({ email: email, password: password, remember: remember });
    setLoading(btn, false);
    if (!res.ok) {
      fieldError(loginForm.password, res.error);
      Finora.toast(res.error, "error");
      return;
    }
    Finora.toast("Welcome back!", "success");
    setTimeout(function() { window.location.href = next; }, 700);
  });

  /* --------------------------- Register --------------------------- */
  registerForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    clearErrors(registerForm);
    var name = registerForm.name.value.trim();
    var email = registerForm.email.value.trim();
    var password = registerForm.password.value;
    var confirm = registerForm.confirm.value;
    var terms = document.getElementById("terms").checked;
    var valid = true;

    if (name.length < 2) { fieldError(registerForm.name, "Please enter your full name."); valid = false; }
    if (!isEmail(email)) { fieldError(registerForm.email, "Enter a valid email address (must include @)."); valid = false; }
    if (!password) { fieldError(registerForm.password, "Please create a password."); valid = false; }
    else if (password.length < MIN_PASSWORD) { fieldError(registerForm.password, "Password must be at least " + MIN_PASSWORD + " characters."); valid = false; }
    // Passwords must match before submission.
    if (password !== confirm) { fieldError(registerForm.confirm, "Passwords do not match."); valid = false; }
    if (!terms) { Finora.toast("Please accept the Terms to continue.", "error"); valid = false; }
    if (!valid) return;

    var btn = registerForm.querySelector('[type="submit"]');
    setLoading(btn, true, "Creating account…");
    // Creates the user in the Firebase Authentication database.
    var res = await Finora.register({ name: name, email: email, password: password });
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
    // Redirect to the Login page upon successful account creation.
    Finora.toast("Account created! Redirecting to login…", "success");
    setTimeout(function() { window.location.href = "login.html?registered=1"; }, 900);
  });

  /* ------------------------- Google login ------------------------- */
  var googleBtn = document.querySelector("[data-google-login]");
  if (googleBtn) {
    googleBtn.addEventListener("click", async function() {
      setLoading(googleBtn, true, "Connecting…");
      var rememberEl = document.getElementById("remember");
      var remember = rememberEl ? rememberEl.checked : true;
      var res = await Finora.loginWithGoogle({ remember: remember });
      setLoading(googleBtn, false);
      if (!res.ok) { Finora.toast(res.error, "error"); return; }
      Finora.toast("Signed in with Google!", "success");
      setTimeout(function() { window.location.href = next; }, 700);
    });
  }
});
