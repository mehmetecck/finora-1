/* =====================================================================
   Finora — main (core) module
   ---------------------------------------------------------------------
   Shared across every page. Exposes the global `Finora` namespace with:
     • Auth: register, login, loginWithGoogle, logout
     • Profile: getProfile, updateProfile, changePassword, deleteAccount
     • UI helpers: toast, navbar rendering, formatters
   Page-specific logic lives in  js/pages/*.js .

   Two auth backends are supported and selected automatically:
     • Firebase Authentication  — when js/core/firebase-config.js has real keys.
     • Local demo auth (localStorage) — fallback for testing before config.
   Profile extras (plan, balance, phone, country, bio) live in localStorage.
   ===================================================================== */

const Finora = (() => {
  const USE_FIREBASE = !!window.FIREBASE_CONFIGURED;
  const auth = USE_FIREBASE ? window.firebaseAuth : null;

  const EXTRAS_KEY = "finora_profile_extras";
  const LOCAL_USERS = "finora_local_users";
  const LOCAL_SESSION = "finora_local_session";

  /* --------------------- Profile extras (local) -------------------- */
  const allExtras = () => JSON.parse(localStorage.getItem(EXTRAS_KEY) || "{}");
  const getExtras = (uid) => allExtras()[uid] || {};
  const setExtras = (uid, patch) => {
    const all = allExtras();
    all[uid] = { ...(all[uid] || {}), ...patch };
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(all));
    return all[uid];
  };

  /* ---------------------- Friendly error text ---------------------- */
  function mapAuthError(code) {
    switch (code) {
      case "auth/email-already-in-use": return "This email is already in use.";
      case "auth/invalid-email": return "Please enter a valid email address.";
      case "auth/weak-password": return "Password is too weak. Use at least 6 characters.";
      case "auth/missing-password": return "Please enter a password.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Invalid email or password.";
      case "local/wrong-password": return "Current password is incorrect.";
      case "auth/user-disabled": return "This account has been disabled.";
      case "auth/too-many-requests": return "Too many attempts. Please try again later.";
      case "auth/network-request-failed": return "Network error. Check your connection and try again.";
      case "auth/requires-recent-login": return "Please log in again to complete this action.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request": return "Google sign-in was cancelled.";
      case "auth/popup-blocked": return "Your browser blocked the sign-in popup. Allow popups and try again.";
      case "auth/account-exists-with-different-credential": return "An account already exists with this email. Try logging in with your password.";
      case "auth/operation-not-allowed": return "This sign-in method isn't enabled for this Firebase project.";
      case "auth/invalid-api-key":
      case "auth/configuration-not-found": return "Firebase is not configured yet. Add your config in js/core/firebase-config.js.";
      default: return "Something went wrong. Please try again.";
    }
  }

  /* ===================================================================
     Local demo auth backend (localStorage)
     =================================================================== */
  const Local = (() => {
    const getUsers = () => JSON.parse(localStorage.getItem(LOCAL_USERS) || "[]");
    const saveUsers = (u) => localStorage.setItem(LOCAL_USERS, JSON.stringify(u));
    const getSessionUid = () => JSON.parse(localStorage.getItem(LOCAL_SESSION) || "null");
    const setSessionUid = (uid) => localStorage.setItem(LOCAL_SESSION, JSON.stringify(uid));
    const clearSession = () => localStorage.removeItem(LOCAL_SESSION);

    // Seed a ready-to-use test account once.
    (function seed() {
      const users = getUsers();
      if (!users.some((u) => u.email === "test@finora.com")) {
        users.push({
          uid: "local-test", name: "Test User", email: "test@finora.com",
          password: "test1234", plan: "Free", balance: 0,
          joined: new Date().toISOString(),
        });
        saveUsers(users);
      }
    })();

    const current = () => {
      const uid = getSessionUid();
      if (!uid) return null;
      return getUsers().find((u) => u.uid === uid) || null;
    };

    function register({ name, email, password }) {
      const users = getUsers();
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return { ok: false, code: "auth/email-already-in-use", error: mapAuthError("auth/email-already-in-use") };
      }
      if (!password || password.length < 6) {
        return { ok: false, code: "auth/weak-password", error: mapAuthError("auth/weak-password") };
      }
      users.push({
        uid: "local-" + Date.now(), name, email, password,
        plan: "Free", balance: 0, joined: new Date().toISOString(),
      });
      saveUsers(users);
      // Match Firebase flow: do NOT auto sign-in; user logs in next.
      return { ok: true };
    }

    function login({ email, password }) {
      const user = getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user || user.password !== password) {
        return { ok: false, code: "auth/invalid-credential", error: mapAuthError("auth/invalid-credential") };
      }
      setSessionUid(user.uid);
      return { ok: true, user };
    }

    function loginWithGoogle() {
      const users = getUsers();
      let user = users.find((u) => u.email === "google.user@gmail.com");
      if (!user) {
        user = { uid: "local-google", name: "Google User", email: "google.user@gmail.com", password: null, plan: "Free", balance: 0, joined: new Date().toISOString() };
        users.push(user);
        saveUsers(users);
      }
      setSessionUid(user.uid);
      return Promise.resolve({ ok: true, user });
    }

    function updateUser(patch) {
      const users = getUsers();
      const i = users.findIndex((u) => u.uid === getSessionUid());
      if (i === -1) return null;
      users[i] = { ...users[i], ...patch };
      saveUsers(users);
      return users[i];
    }

    function changePassword(currentPassword, newPassword) {
      const user = current();
      if (!user || user.password !== currentPassword) {
        const e = new Error("wrong password"); e.code = "local/wrong-password"; throw e;
      }
      updateUser({ password: newPassword });
    }

    function deleteAccount(currentPassword) {
      const user = current();
      if (!user || (user.password !== null && user.password !== currentPassword)) {
        const e = new Error("wrong password"); e.code = "local/wrong-password"; throw e;
      }
      saveUsers(getUsers().filter((u) => u.uid !== user.uid));
      clearSession();
    }

    return { current, register, login, loginWithGoogle, updateUser, changePassword, deleteAccount, clearSession };
  })();

  /* ------------------------- Auth readiness ------------------------ */
  let currentUser = null;
  let resolveReady;
  const authReady = new Promise((resolve) => (resolveReady = resolve));

  /* ----------------- Session / authentication token ----------------
     `idToken` is the credential used to authenticate requests to the
     backend / market data API. With Firebase it's a JWT issued on login
     and refreshed automatically; in local demo mode it's a stand-in id.
     ----------------------------------------------------------------- */
  let idToken = null;

  async function captureToken(forceRefresh = false) {
    if (!currentUser) { idToken = null; return null; }
    if (USE_FIREBASE) {
      idToken = await currentUser.getIdToken(forceRefresh); // capture Firebase ID token
    } else {
      idToken = "local-session:" + currentUser.uid; // demo session token
    }
    return idToken;
  }

  // Returns a valid token, refreshing it if needed (use this in API calls).
  function getToken() { return captureToken(); }

  if (USE_FIREBASE) {
    let firstFired = false;
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      await captureToken(); // start the session: grab the token for this user
      if (!firstFired) { firstFired = true; resolveReady(user); }
      renderNavAuth();
    });
  } else {
    currentUser = Local.current();
    captureToken();
    resolveReady(currentUser);
  }

  /* ------------------------------ Auth ----------------------------- */
  async function register({ name, email, password }) {
    if (!USE_FIREBASE) return Local.register({ name, email, password });
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (name) await cred.user.updateProfile({ displayName: name });
      setExtras(cred.user.uid, { plan: "Free", balance: 0 });
      await auth.signOut();
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  async function login({ email, password }) {
    if (!USE_FIREBASE) {
      const res = Local.login({ email, password });
      if (res.ok) { currentUser = res.user; await captureToken(); }
      return res;
    }
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      currentUser = cred.user;
      await captureToken(); // capture the auth token & start the session
      return { ok: true, user: cred.user, token: idToken };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  async function loginWithGoogle() {
    if (!USE_FIREBASE) {
      const res = await Local.loginWithGoogle();
      if (res.ok) { currentUser = res.user; await captureToken(); }
      return res;
    }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await auth.signInWithPopup(provider);
      const extras = getExtras(cred.user.uid);
      if (!extras.plan) setExtras(cred.user.uid, { plan: "Free", balance: 0 });
      currentUser = cred.user;
      await captureToken(); // capture the auth token & start the session
      return { ok: true, user: cred.user, token: idToken };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  function logout() {
    const go = () => (window.location.href = "index.html");
    idToken = null; // end the session
    if (!USE_FIREBASE) { Local.clearSession(); currentUser = null; go(); return; }
    auth.signOut().finally(go);
  }

  /* ------------------- Normalized profile object ------------------- */
  function getProfile() {
    if (!currentUser) return null;
    if (!USE_FIREBASE) {
      const u = currentUser;
      return {
        uid: u.uid, name: u.name, email: u.email, joined: u.joined,
        plan: u.plan || "Free", balance: u.balance != null ? u.balance : 0,
        phone: u.phone || "", country: u.country || "", bio: u.bio || "",
      };
    }
    const extras = getExtras(currentUser.uid);
    return {
      uid: currentUser.uid,
      name: currentUser.displayName || (currentUser.email || "").split("@")[0],
      email: currentUser.email,
      joined: currentUser.metadata?.creationTime || new Date().toISOString(),
      plan: extras.plan || "Free",
      balance: extras.balance != null ? extras.balance : 0,
      phone: extras.phone || "",
      country: extras.country || "",
      bio: extras.bio || "",
    };
  }

  async function updateProfile(patch) {
    if (!currentUser) return null;
    if (!USE_FIREBASE) {
      currentUser = Local.updateUser(patch);
      renderNavAuth();
      return getProfile();
    }
    if (patch.name && patch.name !== currentUser.displayName) {
      await currentUser.updateProfile({ displayName: patch.name });
    }
    if (patch.email && patch.email !== currentUser.email) {
      await currentUser.updateEmail(patch.email);
    }
    const { name, email, ...rest } = patch;
    if (Object.keys(rest).length) setExtras(currentUser.uid, rest);
    renderNavAuth();
    return getProfile();
  }

  async function changePassword(currentPassword, newPassword) {
    if (!currentUser) throw new Error("Not signed in.");
    if (!USE_FIREBASE) return Local.changePassword(currentPassword, newPassword);
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPassword);
  }

  async function deleteAccount(currentPassword) {
    if (!currentUser) throw new Error("Not signed in.");
    if (!USE_FIREBASE) return Local.deleteAccount(currentPassword);
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(cred);
    const uid = currentUser.uid;
    await currentUser.delete();
    const all = allExtras();
    delete all[uid];
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(all));
  }

  /* --------------------------- Utilities --------------------------- */
  const fmtMoney = (n, currency = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n || 0);

  const fmtNumber = (n) => new Intl.NumberFormat("en-US").format(n || 0);

  const initials = (name) =>
    (name || "U").split(/[\s@.]+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `finora-toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, 3000);
  }

  /* ----------------------- UI state helpers ------------------------ */
  const NO_DATA_MSG = "Connect a market data API to load this.";

  function emptyState(message = NO_DATA_MSG, icon = "bi-database-x") {
    return `<div class="text-center text-muted-2 py-5">
        <i class="bi ${icon} d-block mb-2" style="font-size:1.9rem;opacity:.55"></i>
        <div>${message}</div>
      </div>`;
  }

  function emptyRow(cols, message = NO_DATA_MSG) {
    return `<tr><td colspan="${cols}" class="text-center text-muted-2 py-5">
        <i class="bi bi-database-x me-2"></i>${message}</td></tr>`;
  }

  // Deterministic avatar gradient derived from a ticker symbol.
  const COLORS = ["#2563EB", "#7C3AED", "#14B8A6", "#38BDF8", "#22C55E", "#F59E0B", "#EC4899", "#EF4444", "#0D9488", "#A78BFA"];
  function symbolColor(symbol) {
    let h = 0;
    for (let i = 0; i < (symbol || "").length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
    return `linear-gradient(135deg, ${COLORS[h % COLORS.length]}, ${COLORS[(h >> 3) % COLORS.length]})`;
  }

  /* ------------------------- Navbar binding ------------------------ */
  function renderNavAuth() {
    const slot = document.querySelector("[data-nav-auth]");
    if (!slot) return;
    const profile = getProfile();

    if (profile) {
      slot.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-ghost d-flex align-items-center gap-2 dropdown-toggle" data-bs-toggle="dropdown">
            <span class="ticker-avatar" style="width:30px;height:30px;font-size:.72rem;background:var(--brand-gradient);color:#021014;">${initials(profile.name)}</span>
            <span class="d-none d-sm-inline">${profile.name.split(" ")[0]}</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark border-finora">
            <li><a class="dropdown-item" href="profile.html"><i class="bi bi-person me-2"></i>My Profile</a></li>
            <li><a class="dropdown-item" href="portfolio.html"><i class="bi bi-briefcase me-2"></i>Portfolio</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-bear" data-logout><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li>
          </ul>
        </div>`;
      slot.querySelector("[data-logout]").addEventListener("click", logout);
    } else {
      slot.innerHTML = `
        <a href="login.html" class="btn btn-ghost">Log in</a>
        <a href="login.html?mode=register" class="btn btn-brand">Get started</a>`;
    }
  }

  /* Protect pages that require auth (async — waits for Firebase). */
  async function requireAuth() {
    const user = await authReady;
    if (!user) {
      window.location.href = "login.html?next=profile.html";
      return null;
    }
    return user;
  }

  function init() {
    renderNavAuth();
    const path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".navbar .nav-link").forEach((link) => {
      if (link.getAttribute("href") === path) link.classList.add("active");
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    authReady, register, login, loginWithGoogle, logout,
    getProfile, updateProfile, changePassword, deleteAccount,
    requireAuth, mapAuthError, getToken,
    fmtMoney, fmtNumber, initials, toast,
    emptyState, emptyRow, symbolColor,
    isFirebase: USE_FIREBASE,
  };
})();
