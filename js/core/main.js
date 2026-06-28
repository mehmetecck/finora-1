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
     • Local auth (localStorage) — fallback when Firebase is not configured.
   Profile extras (plan, balance, phone, country, bio, currency) live in localStorage.
   ===================================================================== */

var Finora = (function() {
  var USE_FIREBASE = !!window.FIREBASE_CONFIGURED;
  var auth = USE_FIREBASE ? window.firebaseAuth : null;

  var LOGOKIT_API_KEY = "pk_fr8fb356698b780dc974a8";

  var EXTRAS_KEY = "finora_profile_extras";
  var LOCAL_USERS = "finora_local_users";
  var LOCAL_SESSION = "finora_local_session";
  var EMAIL_LINK_KEY = "finora_email_link_signin";

  /* --------------------- Profile extras (local) -------------------- */
  function allExtras() { return JSON.parse(localStorage.getItem(EXTRAS_KEY) || "{}"); }
  function getExtras(uid) { return allExtras()[uid] || {}; }
  function setExtras(uid, patch) {
    var all = allExtras();
    var existing = all[uid] || {};
    all[uid] = Object.assign({}, existing, patch);
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(all));
    return all[uid];
  }

  /* ------------------------- Watchlist (local) --------------------- */
  function getWatchlist(uid) {
    var extras = getExtras(uid);
    return extras.watchlist || [];
  }

  function setWatchlist(uid, list) {
    return setExtras(uid, { watchlist: list }).watchlist;
  }

  function watchlistSymbol(item) {
    return (typeof item === "string" ? item : item.symbol || "").toUpperCase();
  }

  function isInWatchlist(uid, symbol) {
    var sym = symbol.toUpperCase();
    return getWatchlist(uid).some(function(item) {
      return watchlistSymbol(item) === sym;
    });
  }

  function addToWatchlist(uid, symbol, name) {
    var sym = symbol.toUpperCase();
    if (isInWatchlist(uid, sym)) return getWatchlist(uid);
    var list = getWatchlist(uid).slice();
    list.push({ symbol: sym, name: name || sym, addedAt: new Date().toISOString() });
    return setWatchlist(uid, list);
  }

  function removeFromWatchlist(uid, symbol) {
    var sym = symbol.toUpperCase();
    var list = getWatchlist(uid).filter(function(item) {
      return watchlistSymbol(item) !== sym;
    });
    return setWatchlist(uid, list);
  }

  function toggleWatchlist(uid, symbol, name) {
    if (isInWatchlist(uid, symbol)) {
      removeFromWatchlist(uid, symbol);
      return false;
    }
    addToWatchlist(uid, symbol, name);
    return true;
  }

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
      case "auth/invalid-continue-uri": return "The confirmation email redirect URL is not valid.";
      case "auth/missing-continue-uri": return "The confirmation email redirect URL is missing.";
      case "auth/invalid-action-code": return "This email login link is invalid or has already been used.";
      case "auth/expired-action-code": return "This email login link has expired. Request a new one.";
      case "auth/invalid-api-key":
      case "auth/configuration-not-found": return "Firebase is not configured yet. Add your config in js/core/firebase-config.js.";
      default: return "Something went wrong. Please try again.";
    }
  }

  /* ===================================================================
     Local auth backend (localStorage)
     =================================================================== */
  var Local = (function() {
    function getUsers() { return JSON.parse(localStorage.getItem(LOCAL_USERS) || "[]"); }
    function saveUsers(u) { localStorage.setItem(LOCAL_USERS, JSON.stringify(u)); }
    function getSessionUid() {
      return JSON.parse(sessionStorage.getItem(LOCAL_SESSION) || localStorage.getItem(LOCAL_SESSION) || "null");
    }
    function setSessionUid(uid, remember) {
      if (remember === undefined) remember = true;
      var activeStore = remember ? localStorage : sessionStorage;
      var inactiveStore = remember ? sessionStorage : localStorage;
      inactiveStore.removeItem(LOCAL_SESSION);
      activeStore.setItem(LOCAL_SESSION, JSON.stringify(uid));
    }
    function clearSession() {
      localStorage.removeItem(LOCAL_SESSION);
      sessionStorage.removeItem(LOCAL_SESSION);
    }

    function current() {
      var uid = getSessionUid();
      if (!uid) return null;
      return getUsers().find(function(u) { return u.uid === uid; }) || null;
    }

    function register(opts) {
      var name = opts.name;
      var email = opts.email;
      var password = opts.password;
      var users = getUsers();
      if (users.some(function(u) { return u.email.toLowerCase() === email.toLowerCase(); })) {
        return { ok: false, code: "auth/email-already-in-use", error: mapAuthError("auth/email-already-in-use") };
      }
      if (!password || password.length < 6) {
        return { ok: false, code: "auth/weak-password", error: mapAuthError("auth/weak-password") };
      }
      var newUser = {
        uid: "local-" + Date.now(), name: name, email: email, password: password,
        joined: new Date().toISOString(),
      };
      users.push(newUser);
      saveUsers(users);
      setExtras(newUser.uid, { plan: "Free", balance: 0, currency: "USD" });
      // Match Firebase flow: do NOT auto sign-in; user logs in next.
      return { ok: true };
    }

    function login(opts) {
      var email = opts.email;
      var password = opts.password;
      var remember = opts.remember !== undefined ? opts.remember : true;
      var user = getUsers().find(function(u) { return u.email.toLowerCase() === email.toLowerCase(); });
      if (!user || user.password !== password) {
        return { ok: false, code: "auth/invalid-credential", error: mapAuthError("auth/invalid-credential") };
      }
      setSessionUid(user.uid, remember);
      return { ok: true, user: user };
    }

    function loginWithGoogle(opts) {
      if (!opts) opts = {};
      var remember = opts.remember !== undefined ? opts.remember : true;
      var users = getUsers();
      var user = users.find(function(u) { return u.email === "google.user@gmail.com"; });
      if (!user) {
        user = { uid: "local-google", name: "Google User", email: "google.user@gmail.com", password: null, plan: "Free", balance: 0, joined: new Date().toISOString() };
        users.push(user);
        saveUsers(users);
      }
      setSessionUid(user.uid, remember);
      return Promise.resolve({ ok: true, user: user });
    }

    function resetPassword(email) {
      if (!email) return { ok: false, code: "auth/missing-email", error: mapAuthError("auth/missing-email") };
      return { ok: true };
    }

    function updateUser(patch) { // Only for name/email on the core user object
      var users = getUsers();
      var i = users.findIndex(function(u) { return u.uid === getSessionUid(); });
      if (i === -1) return null;
      if (patch.name) users[i].name = patch.name;
      if (patch.email) users[i].email = patch.email;
      saveUsers(users);
      return users[i];
    }

    function changePassword(currentPassword, newPassword) {
      var user = current();
      if (!user || user.password !== currentPassword) {
        var e = new Error("wrong password"); e.code = "local/wrong-password"; throw e;
      }
      updateUser({ password: newPassword });
    }

    function deleteAccount(currentPassword) {
      var user = current();
      if (!user || (user.password !== null && user.password !== currentPassword)) {
        var e = new Error("wrong password"); e.code = "local/wrong-password"; throw e;
      }
      saveUsers(getUsers().filter(function(u) { return u.uid !== user.uid; }));
      clearSession();
    }

    return { current: current, register: register, login: login, loginWithGoogle: loginWithGoogle, resetPassword: resetPassword, updateUser: updateUser, changePassword: changePassword, deleteAccount: deleteAccount, clearSession: clearSession };
  })();

  /* ------------------------- Auth readiness ------------------------ */
  var currentUser = null;
  var resolveReady;
  var authReady = new Promise(function(resolve) { resolveReady = resolve; });

  /* ----------------- Session / authentication token ----------------
     `idToken` is the credential used to authenticate requests to the
     backend / market data API. With Firebase it's a JWT issued on login
     and refreshed automatically; in local auth mode it's a stand-in id.
     ----------------------------------------------------------------- */
  var idToken = null;

  async function captureToken(forceRefresh) {
    if (forceRefresh === undefined) forceRefresh = false;
    if (!currentUser) { idToken = null; return null; }
    if (USE_FIREBASE) {
      idToken = await currentUser.getIdToken(forceRefresh); // capture Firebase ID token
    } else {
      idToken = "local-session:" + currentUser.uid;
    }
    return idToken;
  }

  async function setAuthPersistence(remember) {
    if (remember === undefined) remember = true;
    if (!USE_FIREBASE) return;
    var persistence = remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
  }

  function authActionUrl(query) {
    var path = window.location.pathname.replace(/[^/]*$/, "");
    var url = window.location.origin + path + "login.html";
    return query ? url + query : url;
  }

  async function sendVerificationEmail(user) {
    if (!USE_FIREBASE || !user || user.emailVerified) return { ok: true, sent: false };
    try {
      await user.sendEmailVerification({
        url: authActionUrl("?verified=1"),
        handleCodeInApp: false,
      });
      return { ok: true, sent: true };
    } catch (e) {
      return { ok: false, sent: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  if (USE_FIREBASE) {
    var firstFired = false;
    auth.onAuthStateChanged(async function(user) {
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
  async function register(opts) {
    var name = opts.name;
    var email = opts.email;
    var password = opts.password;
    if (!USE_FIREBASE) return Local.register({ name: name, email: email, password: password });
    try {
      var cred = await auth.createUserWithEmailAndPassword(email, password);
      if (name) await cred.user.updateProfile({ displayName: name });
      var verification = await sendVerificationEmail(cred.user);
      setExtras(cred.user.uid, { plan: "Free", balance: 0, currency: "USD" });
      currentUser = cred.user;
      await captureToken();
      return {
        ok: true,
        user: cred.user,
        verificationEmailSent: verification.sent,
        verificationEmailError: verification.ok ? null : verification.error,
      };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  async function login(opts) {
    var email = opts.email;
    var password = opts.password;
    var remember = opts.remember !== undefined ? opts.remember : true;
    if (!USE_FIREBASE) {
      var res = Local.login({ email: email, password: password, remember: remember });
      if (res.ok) { currentUser = res.user; await captureToken(); }
      return res;
    }
    try {
      await setAuthPersistence(remember);
      var cred = await auth.signInWithEmailAndPassword(email, password);
      localStorage.setItem("finora_session_active", "true");
      currentUser = cred.user;
      await captureToken(); // capture the auth token & start the session
      return { ok: true, user: cred.user, token: idToken };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  async function loginWithGoogle(opts) {
    if (!opts) opts = {};
    var remember = opts.remember !== undefined ? opts.remember : true;
    if (!USE_FIREBASE) {
      var res = await Local.loginWithGoogle({ remember: remember });
      if (res.ok) { currentUser = res.user; await captureToken(); }
      return res;
    }
    try {
      await setAuthPersistence(remember);
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      var cred = await auth.signInWithPopup(provider);
      localStorage.setItem("finora_session_active", "true");
      var extras = getExtras(cred.user.uid);
      if (!extras.plan) setExtras(cred.user.uid, { plan: "Free", balance: 0, currency: "USD" });
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

  async function sendEmailLoginLink(opts) {
    opts = opts || {};
    var email = opts.email;
    var next = opts.next || "home.html";
    if (!email) return { ok: false, code: "auth/missing-email", error: mapAuthError("auth/missing-email") };
    if (!USE_FIREBASE) {
      return { ok: false, code: "auth/operation-not-allowed", error: "Passwordless email login requires Firebase Authentication." };
    }
    try {
      await auth.sendSignInLinkToEmail(email, {
        url: authActionUrl("?emailLink=1" + (next ? "&next=" + encodeURIComponent(next) : "")),
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_LINK_KEY, email);
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  function isEmailLoginLink(href) {
    return USE_FIREBASE && auth.isSignInWithEmailLink(href || window.location.href);
  }

  async function completeEmailLoginLink(email, href) {
    href = href || window.location.href;
    email = email || localStorage.getItem(EMAIL_LINK_KEY);
    if (!USE_FIREBASE) return { ok: false, code: "auth/operation-not-allowed", error: "Passwordless email login requires Firebase Authentication." };
    if (!auth.isSignInWithEmailLink(href)) return { ok: false, code: "auth/invalid-action-code", error: mapAuthError("auth/invalid-action-code") };
    if (!email) return { ok: false, code: "auth/missing-email", error: mapAuthError("auth/missing-email") };
    try {
      var cred = await auth.signInWithEmailLink(email, href);
      localStorage.removeItem(EMAIL_LINK_KEY);
      var extras = getExtras(cred.user.uid);
      if (!extras.plan) setExtras(cred.user.uid, { plan: "Free", balance: 0, currency: "USD" });
      currentUser = cred.user;
      await captureToken();
      return { ok: true, user: cred.user, token: idToken };
    } catch (e) { return { ok: false, code: e.code, error: mapAuthError(e.code) }; }
  }

  function logout() {
    function go() { window.location.href = "index.html"; }
    idToken = null; // end the session
    localStorage.removeItem("finora_session_active");
    if (!USE_FIREBASE) { Local.clearSession(); currentUser = null; go(); return; }
    auth.signOut().finally(go);
  }

  /* ------------------- Normalized profile object ------------------- */
  function normalizePlan(plan) {
    return plan === "Pro" ? "Premium" : (plan || "Free");
  }

  function normalizeCurrency(currency) {
    return currency === "EUR" ? "EUR" : "USD";
  }

  function getProfile() {
    if (!currentUser) return null;
    if (!USE_FIREBASE) {
      var u = currentUser;
      var extras = getExtras(u.uid);
      return {
        uid: u.uid, name: u.name, email: u.email, joined: u.joined,
        plan: normalizePlan(extras.plan),
        balance: extras.balance != null ? extras.balance : 0,
        currency: normalizeCurrency(extras.currency),
        phone: extras.phone || "",
        country: extras.country || "",
        bio: extras.bio || "",
      };
    }
    var extras = getExtras(currentUser.uid);
    var metadata = currentUser.metadata;
    var creationTime = metadata && metadata.creationTime ? metadata.creationTime : new Date().toISOString();
    return {
      uid: currentUser.uid,
      name: currentUser.displayName || (currentUser.email || "").split("@")[0],
      email: currentUser.email,
      joined: creationTime,
      plan: normalizePlan(extras.plan),
      balance: extras.balance != null ? extras.balance : 0,
      currency: normalizeCurrency(extras.currency),
      phone: extras.phone || "",
      country: extras.country || "",
      bio: extras.bio || "",
    };
  }

  async function updateProfile(patch) {
    if (!currentUser) return null;
    if (!USE_FIREBASE) {
      if (patch.name || patch.email) {
        currentUser = Local.updateUser({ name: patch.name, email: patch.email });
      }
      var extrasPatch = {};
      var key;
      for (key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key) && key !== "name" && key !== "email") {
          extrasPatch[key] = patch[key];
        }
      }
      if (Object.keys(extrasPatch).length) setExtras(currentUser.uid, extrasPatch);
      renderNavAuth();
      return getProfile();
    }
    if (patch.name && patch.name !== currentUser.displayName) {
      await currentUser.updateProfile({ displayName: patch.name });
    }
    if (patch.email && patch.email !== currentUser.email) {
      await currentUser.updateEmail(patch.email);
    }
    var extrasPatch = {};
    var key;
    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && key !== "name" && key !== "email") {
        extrasPatch[key] = patch[key];
      }
    }
    if (Object.keys(extrasPatch).length) setExtras(currentUser.uid, extrasPatch);
    renderNavAuth();
    return getProfile();
  }

  async function changePassword(currentPassword, newPassword) {
    if (!currentUser) throw new Error("Not signed in.");
    if (!USE_FIREBASE) return Local.changePassword(currentPassword, newPassword);
    var cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPassword);
  }

  async function deleteAccount(currentPassword) {
    if (!currentUser) throw new Error("Not signed in.");
    if (!USE_FIREBASE) return Local.deleteAccount(currentPassword);
    var cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(cred);
    var uid = currentUser.uid;
    await currentUser.delete();
    var all = allExtras();
    delete all[uid];
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(all));
  }

  /* --------------------------- Utilities --------------------------- */
  function getCurrency() {
    var profile = getProfile();
    return profile ? profile.currency : "USD";
  }

  function fmtMoney(n, currency) {
    if (currency === undefined) currency = getCurrency();
    else currency = normalizeCurrency(currency);
    var locale = currency === "EUR" ? "de-DE" : "en-US";
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency, maximumFractionDigits: 2 }).format(n || 0);
  }

  function fmtNumber(n) { return new Intl.NumberFormat("en-US").format(n || 0); }

  function initials(name) {
    return (name || "U").split(/[\s@.]+/).filter(function(p) { return p; }).map(function(p) { return p[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function toast(message, type) {
    if (type === undefined) type = "info";
    var el = document.createElement("div");
    el.className = "finora-toast " + type;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add("show"); });
    setTimeout(function() {
      el.classList.remove("show");
      setTimeout(function() { el.remove(); }, 250);
    }, 3000);
  }

  /* ----------------------- UI state helpers ------------------------ */
  var NO_DATA_MSG = "Connect a market data API to load this.";
  var API_UNAVAILABLE_MSG = "API is currently unavailable, please try again later or reload the page.";

  function emptyState(message, icon) {
    if (message === undefined) message = NO_DATA_MSG;
    if (icon === undefined) icon = "bi-database-x";
    return `<div class="text-center text-muted-2 py-5">
        <i class="bi ${icon} d-block mb-2" style="font-size:1.9rem;opacity:.55"></i>
        <div>${message}</div>
      </div>`;
  }

  function apiUnavailableState(icon) {
    if (icon === undefined) icon = "bi-wifi-off";
    return emptyState(API_UNAVAILABLE_MSG, icon);
  }

  function emptyRow(cols, message) {
    if (message === undefined) message = NO_DATA_MSG;
    return `<tr><td colspan="${cols}" class="text-center text-muted-2 py-5">
        <i class="bi bi-database-x me-2"></i>${message}</td></tr>`;
  }

  // Deterministic avatar gradient derived from a ticker symbol.
  var COLORS = ["#2563EB", "#7C3AED", "#14B8A6", "#38BDF8", "#22C55E", "#F59E0B", "#EC4899", "#EF4444", "#0D9488", "#A78BFA"];
  function symbolColor(symbol) {
    var h = 0;
    for (var i = 0; i < (symbol || "").length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
    return `linear-gradient(135deg, ${COLORS[h % COLORS.length]}, ${COLORS[(h >> 3) % COLORS.length]})`;
  }

  // Returns the markup for a ticker badge: the company logo when available,
  // otherwise a colored fallback showing the symbol text.
  function tickerAvatar(company, opts) {
    if (!company) return "";
    opts = opts || {};
    var symbol = company.symbol || "";
    var size = opts.size != null ? opts.size : "";
    var color = opts.color;
    var className = opts.className != null ? opts.className : "ticker-avatar";
    var sym = (symbol || "").trim().toUpperCase();
    var cls = [className, size].filter(function(part) { return part; }).join(" ");

    // Use Logokit API for company logos.
    var logo = null;
    if (company.website) {
      var logoUrl = new URL(`https://img.logokit.com/${company.website}`);
      if (LOGOKIT_API_KEY && !LOGOKIT_API_KEY.startsWith("YOUR_")) {
        logoUrl.searchParams.set("token", LOGOKIT_API_KEY);
      }
      logo = logoUrl.toString();
    }

    if (logo) {
      // The onerror handler reverts the element to its text-based fallback state.
      const onError = `this.parentElement.classList.remove('has-logo'); this.parentElement.textContent='${sym}'; this.parentElement.style.background='${color || symbolColor(sym)}'; this.remove();`;
      return `<span class="${cls} has-logo"><img src="${logo}" alt="${sym}" loading="lazy" onerror="${onError}"></span>`;
    }
    return `<span class="${cls}" style="background:${color || symbolColor(sym)}">${sym}</span>`;
  }

  /* ------------------------- Navbar binding ------------------------ */
  function bindDropdownLinks() {
    var slot = document.querySelector("[data-nav-auth]");
    if (!slot || slot.dataset.dropdownBound) return;
    slot.dataset.dropdownBound = "1";
    slot.addEventListener("click", function(e) {
      var link = e.target.closest(".dropdown-item[href]");
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = link.getAttribute("href");
    });
  }

  function navPremiumMarkup() {
    return `<a href="prosubscription.html" class="nav-premium-link" aria-label="Upgrade to Premium">
          <span class="nav-premium-link__title">Upgrade now</span>
          <span class="nav-premium-link__sub">30-day free trial</span>
        </a>`;
  }

  function signedInNavMarkup(pending, options) {
    if (!options) options = {};
    var hidePremium = !!options.hidePremium;
    var pendingCls = pending ? " nav-auth-pending" : "";
    var btnAttrs = pending
      ? ' class="nav-user-btn" type="button" tabindex="-1" aria-hidden="true"'
      : ' class="nav-user-btn dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account menu"';
    var menu = pending ? "" : `
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark border-finora">
              <li><a class="dropdown-item" href="profile.html"><i class="bi bi-person-circle me-2"></i>My Profile</a></li>
              <li><hr class="dropdown-divider border-finora"></li>
              <li><button class="dropdown-item" type="button" data-logout-btn><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li>
            </ul>`;
    return `<div class="d-flex align-items-center gap-3${pendingCls}">
          <div class="dropdown">
            <button${btnAttrs}>
              <i class="bi bi-person-fill" aria-hidden="true"></i>
            </button>${menu}
          </div>
          ${hidePremium ? "" : navPremiumMarkup()}
        </div>`;
  }

  function bindLogout(slot) {
    const btn = slot.querySelector("[data-logout-btn]");
    if (btn) {
      btn.addEventListener("click", logout);
      return true;
    }
    return false;
  }

  function isMinimalNavPage() {
    var slot = document.querySelector("[data-nav-auth]");
    return !!(slot && slot.hasAttribute("data-nav-minimal"));
  }

  function renderNavAuthPending() {
    var slot = document.querySelector("[data-nav-auth]");
    if (!slot || slot.dataset.navAuthState === "ready") return;
    slot.innerHTML = signedInNavMarkup(true, { hidePremium: isMinimalNavPage() });
    slot.dataset.navAuthState = "pending";
  }

  function renderNavAuth() {
    var slot = document.querySelector("[data-nav-auth]");
    if (!slot) return;
    var minimal = isMinimalNavPage();
    var profile = getProfile();

    if (profile) {
      slot.innerHTML = signedInNavMarkup(false, { hidePremium: minimal });
      bindLogout(slot);
    } else if (minimal) {
      slot.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <a href="login.html" class="nav-user-btn" aria-label="Log in">
            <i class="bi bi-person-fill" aria-hidden="true"></i>
          </a>
        </div>`;
    } else {
      slot.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <a href="login.html?mode=register" class="nav-user-btn" aria-label="Create account">
            <i class="bi bi-person-fill" aria-hidden="true"></i>
          </a>
          ${navPremiumMarkup()}
        </div>`;
    }
    slot.dataset.navAuthState = "ready";
    renderLandingCtas();
  }

  /* Protect pages that require auth (async — waits for Firebase). */
  async function requireAuth() {
    var user = await authReady;
    if (!user) {
      window.location.href = "index.html";
      return null;
    }
    return user;
  }

  function currentPath() {
    return window.location.pathname.split("/").pop() || "index.html";
  }

  function isPublicPage(path) {
    return path === "index.html" || path === "login.html" || path === "prosubscription.html" || path === "";
  }

  async function guardRoutes() {
    var path = currentPath();
    var user = await authReady;

    if (!user && !isPublicPage(path)) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  function renderLandingCtas() {
    var path = currentPath();
    if (path !== "index.html" && path !== "") return;
    var guestActions = document.querySelector("[data-landing-cta=\"guest-actions\"]");
    var signedActions = document.querySelector("[data-landing-cta=\"signed-actions\"]");
    if (!guestActions || !signedActions) return;
    var signedIn = !!getProfile();
    guestActions.classList.toggle("d-none", signedIn);
    signedActions.classList.toggle("d-none", !signedIn);
  }

  async function init() {
    renderNavAuthPending(); // Then show pending state
    var allowed = await guardRoutes();
    if (!allowed) return;
    renderNavAuth(); // Then render final auth state
    renderLandingCtas();
    bindDropdownLinks();
    var path = currentPath();
    document.querySelectorAll(".navbar .nav-link").forEach(function(link) {
      if (link.getAttribute("href") === path) {
        link.classList.add("active");
      }

      // Add a click listener to guard protected routes for logged-out users.
      link.addEventListener("click", function(e) {
        var href = link.getAttribute("href");
        if (!href) return;

        var linkPath = href.split("/").pop() || "index.html";
        var isProtected = !isPublicPage(linkPath);

        if (!getProfile() && isProtected) {
          e.preventDefault();
          // Redirect to login, passing the intended destination.
          window.location.href = "login.html?next=" + encodeURIComponent(href);
        }
      });
    });
  }

  return {
    authReady: authReady, register: register, login: login, loginWithGoogle: loginWithGoogle, resetPassword: resetPassword, logout: logout,
    sendEmailLoginLink: sendEmailLoginLink, isEmailLoginLink: isEmailLoginLink, completeEmailLoginLink: completeEmailLoginLink,
    sendVerificationEmail: function() { return sendVerificationEmail(currentUser); },
    getProfile: getProfile, updateProfile: updateProfile, changePassword: changePassword, deleteAccount: deleteAccount,
    init: init,
    requireAuth: requireAuth, mapAuthError: mapAuthError,
    getWatchlist: getWatchlist, removeFromWatchlist: removeFromWatchlist,
    isInWatchlist: isInWatchlist, toggleWatchlist: toggleWatchlist,
    fmtMoney: fmtMoney, fmtNumber: fmtNumber, getCurrency: getCurrency, initials: initials, toast: toast,
    emptyState: emptyState, apiUnavailableState: apiUnavailableState, emptyRow: emptyRow, tickerAvatar: tickerAvatar,
    API_UNAVAILABLE_MSG: API_UNAVAILABLE_MSG,
    isFirebase: USE_FIREBASE,
  };
})();
