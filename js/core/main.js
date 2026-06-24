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
      case "auth/missing-email": return "Please enter your email address.";
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
      case "auth/unauthorized-domain": return "This domain is not authorized in Firebase Authentication settings.";
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
    const getSessionUid = () =>
      JSON.parse(sessionStorage.getItem(LOCAL_SESSION) || localStorage.getItem(LOCAL_SESSION) || "null");
    const setSessionUid = (uid, remember = true) => {
      const activeStore = remember ? localStorage : sessionStorage;
      const inactiveStore = remember ? sessionStorage : localStorage;
      inactiveStore.removeItem(LOCAL_SESSION);
      activeStore.setItem(LOCAL_SESSION, JSON.stringify(uid));
    };
    const clearSession = () => {
      localStorage.removeItem(LOCAL_SESSION);
      sessionStorage.removeItem(LOCAL_SESSION);
    };

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

    function login({ email, password, remember = true }) {
      const user = getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user || user.password !== password) {
        return { ok: false, code: "auth/invalid-credential", error: mapAuthError("auth/invalid-credential") };
      }
      setSessionUid(user.uid, remember);
      return { ok: true, user };
    }

    function loginWithGoogle({ remember = true } = {}) {
      const users = getUsers();
      let user = users.find((u) => u.email === "google.user@gmail.com");
      if (!user) {
        user = { uid: "local-google", name: "Google User", email: "google.user@gmail.com", password: null, plan: "Free", balance: 0, joined: new Date().toISOString() };
        users.push(user);
        saveUsers(users);
      }
      setSessionUid(user.uid, remember);
      return Promise.resolve({ ok: true, user });
    }

    function resetPassword(email) {
      if (!email) return { ok: false, code: "auth/missing-email", error: mapAuthError("auth/missing-email") };
      return { ok: true };
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

    return { current, register, login, loginWithGoogle, resetPassword, updateUser, changePassword, deleteAccount, clearSession };
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

  async function setAuthPersistence(remember = true) {
    if (!USE_FIREBASE) return;
    const persistence = remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
  }

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

  async function login({ email, password, remember = true }) {
    if (!USE_FIREBASE) {
      const res = Local.login({ email, password, remember });
      if (res.ok) { currentUser = res.user; await captureToken(); }
      return res;
    }
    try {
      await setAuthPersistence(remember);
      const cred = await auth.signInWithEmailAndPassword(email, password);
      currentUser = cred.user;
      await captureToken(); // capture the auth token & start the session
      return { ok: true, user: cred.user, token: idToken };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  async function loginWithGoogle({ remember = true } = {}) {
    if (!USE_FIREBASE) {
      const res = await Local.loginWithGoogle({ remember });
      if (res.ok) { currentUser = res.user; await captureToken(); }
      return res;
    }
    try {
      await setAuthPersistence(remember);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
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

  async function resetPassword(email) {
    if (!email) return { ok: false, code: "auth/missing-email", error: mapAuthError("auth/missing-email") };
    if (!USE_FIREBASE) return Local.resetPassword(email);
    try {
      await auth.sendPasswordResetEmail(email);
      return { ok: true };
    } catch (e) {
      if (e.code === "auth/user-not-found") return { ok: true };
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
  function normalizePlan(plan) {
    return plan === "Pro" ? "Premium" : (plan || "Free");
  }

  function getProfile() {
    if (!currentUser) return null;
    if (!USE_FIREBASE) {
      const u = currentUser;
      return {
        uid: u.uid, name: u.name, email: u.email, joined: u.joined,
        plan: normalizePlan(u.plan), balance: u.balance != null ? u.balance : 0,
        phone: u.phone || "", country: u.country || "", bio: u.bio || "",
      };
    }
    const extras = getExtras(currentUser.uid);
    return {
      uid: currentUser.uid,
      name: currentUser.displayName || (currentUser.email || "").split("@")[0],
      email: currentUser.email,
      joined: currentUser.metadata?.creationTime || new Date().toISOString(),
      plan: normalizePlan(extras.plan),
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
  const API_UNAVAILABLE_MSG = "API is currently unavailable, please try again later or reload the page.";

  function emptyState(message = NO_DATA_MSG, icon = "bi-database-x") {
    return `<div class="text-center text-muted-2 py-5">
        <i class="bi ${icon} d-block mb-2" style="font-size:1.9rem;opacity:.55"></i>
        <div>${message}</div>
      </div>`;
  }

  function apiUnavailableState(icon = "bi-wifi-off") {
    return emptyState(API_UNAVAILABLE_MSG, icon);
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

  // Company logos stored in assets/logos. Maps ticker symbol -> image path.
  const LOGOS = {
    AAPL: "assets/logos/Apple.png",
    MSFT: "assets/logos/Microsoft.png",
    NVDA: "assets/logos/Nvidia_logo.png",
    GOOGL: "assets/logos/Google.png",
    AMZN: "assets/logos/Amazon_logo.png",
    META: "assets/logos/Meta.png",
    TSLA: "assets/logos/Tesla.png",
    AMD: "assets/logos/AMD.png",
    JPM: "assets/logos/jpm.png",
    V: "assets/logos/Visa.png",
    MA: "assets/logos/Mastercard.png",
    NFLX: "assets/logos/netflix.png",
    DIS: "assets/logos/Disney.png",
    KO: "assets/logos/cokewirsindinlidi.png",
    PEP: "assets/logos/Pepsi.png",
    WMT: "assets/logos/Walmart.png",
    COST: "assets/logos/Costco.png",
    NKE: "assets/logos/nike.png",
    MCD: "assets/logos/McDonald.png",
    SBUX: "assets/logos/Starbucks.png",
    BA: "assets/logos/Boeing.png",
    CAT: "assets/logos/Caterpillar.png",
    GE: "assets/logos/ge.png",
    XOM: "assets/logos/Exxon.png",
    CVX: "assets/logos/Chevron.png",
    JNJ: "assets/logos/JNJ.png",
    PFE: "assets/logos/pfizer.png",
    UNH: "assets/logos/United.png",
    HD: "assets/logos/THD.png",
    ORCL: "assets/logos/Oracle.png",
    IBM: "assets/logos/IBM.png",
    INTC: "assets/logos/intel.png",
    CRM: "assets/logos/Salesforce.png",
    UBER: "assets/logos/uber.png",
    ABNB: "assets/logos/airbnb.png",
    SHOP: "assets/logos/shopify.png",
  };

  function logoFor(symbol) {
    return LOGOS[(symbol || "").trim().toUpperCase()] || null;
  }

  // Returns the markup for a ticker badge: the company logo when available,
  // otherwise a colored fallback showing the symbol text.
  function tickerAvatar(symbol, opts = {}) {
    const { size = "", color, className = "ticker-avatar" } = opts;
    const sym = (symbol || "").trim().toUpperCase();
    const cls = [className, size].filter(Boolean).join(" ");
    const logo = logoFor(sym);
    if (logo) {
      return `<span class="${cls} has-logo"><img src="${logo}" alt="${sym}" loading="lazy" onerror="this.parentElement.classList.remove('has-logo');this.parentElement.textContent='${sym}';this.parentElement.style.background='${color || symbolColor(sym)}'"></span>`;
    }
    return `<span class="${cls}" style="background:${color || symbolColor(sym)}">${sym}</span>`;
  }

  /* ------------------------- Navbar binding ------------------------ */
  const USER_ICON = "assets/Icons/user.png";

  function renderNavAuth() {
    const slot = document.querySelector("[data-nav-auth]");
    if (!slot) return;
    const profile = getProfile();
    const premiumLink = `<a href="prosubscription.html" class="nav-premium-link" aria-label="Upgrade to Premium">
          <span class="nav-premium-link__title">Upgrade now</span>
          <span class="nav-premium-link__sub">30-day free trial</span>
        </a>`;

    if (profile) {
      slot.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <div class="dropdown">
            <button class="nav-user-btn dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account menu">
              <img src="${USER_ICON}" alt="">
            </button>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark border-finora">
              <li><a class="dropdown-item" href="profile.html"><i class="bi bi-person me-2"></i>My Profile</a></li>
            </ul>
          </div>
          ${premiumLink}
        </div>`;
    } else {
      slot.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <a href="login.html?mode=register" class="nav-user-btn" aria-label="Create account">
            <img src="${USER_ICON}" alt="">
          </a>
          ${premiumLink}
        </div>`;
    }
  }

  /* Protect pages that require auth (async — waits for Firebase). */
  async function requireAuth(nextPath = window.location.pathname.split("/").pop() || "profile.html") {
    const user = await authReady;
    if (!user) {
      window.location.href = "login.html?next=" + encodeURIComponent(nextPath);
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
    authReady, register, login, loginWithGoogle, resetPassword, logout,
    getProfile, updateProfile, changePassword, deleteAccount,
    requireAuth, mapAuthError, getToken,
    fmtMoney, fmtNumber, initials, toast,
    emptyState, apiUnavailableState, emptyRow, symbolColor, logoFor, tickerAvatar,
    API_UNAVAILABLE_MSG,
    isFirebase: USE_FIREBASE,
  };
})();
