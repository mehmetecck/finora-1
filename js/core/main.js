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

  var EXTRAS_KEY = "finora_profile_extras";
  var LOCAL_USERS = "finora_local_users";
  var LOCAL_SESSION = "finora_local_session";
  var EMAIL_LINK_KEY = "finora_email_link_signin";
  var MARKET_COUNTRY_KEY = "finora_market_country";
  var MARKET_COUNTRY_CODES = [
    ["AR", "Argentina"], ["AT", "Austria"], ["AU", "Australia"], ["BE", "Belgium"],
    ["BR", "Brazil"], ["CA", "Canada"], ["CH", "Switzerland"], ["CL", "Chile"],
    ["CN", "China"], ["CO", "Colombia"], ["CZ", "Czech Republic"], ["DE", "Germany"],
    ["DK", "Denmark"], ["EG", "Egypt"], ["ES", "Spain"], ["FI", "Finland"],
    ["FR", "France"], ["GB", "United Kingdom"], ["GR", "Greece"], ["HK", "Hong Kong"],
    ["HU", "Hungary"], ["ID", "Indonesia"], ["IE", "Ireland"], ["IL", "Israel"],
    ["IN", "India"], ["IT", "Italy"], ["JP", "Japan"], ["KR", "South Korea"],
    ["LU", "Luxembourg"], ["MY", "Malaysia"], ["MX", "Mexico"], ["NL", "Netherlands"],
    ["NO", "Norway"], ["NZ", "New Zealand"], ["PH", "Philippines"], ["PK", "Pakistan"],
    ["PL", "Poland"], ["PT", "Portugal"], ["QA", "Qatar"], ["RO", "Romania"],
    ["SA", "Saudi Arabia"], ["SE", "Sweden"], ["SG", "Singapore"], ["TH", "Thailand"],
    ["TR", "Turkey"], ["TW", "Taiwan"], ["AE", "United Arab Emirates"],
    ["US", "United States"], ["VN", "Vietnam"], ["ZA", "South Africa"],
  ];

  function countryFlag(code) {
    return code.length === 2
      ? String.fromCodePoint(code.charCodeAt(0) + 127397, code.charCodeAt(1) + 127397)
      : "";
  }

  var MARKET_COUNTRIES = MARKET_COUNTRY_CODES.map(function(item) {
    return { code: item[0], name: item[1], flag: countryFlag(item[0]) };
  });

  function findMarketCountry(value) {
    var needle = String(value || "").trim().toLowerCase();
    if (!needle) return null;
    var found = MARKET_COUNTRIES.find(function(country) {
      return country.code.toLowerCase() === needle || country.name.toLowerCase() === needle;
    });
    if (found) return Object.assign({}, found);
    if (/^[a-z]{2}$/i.test(needle)) {
      var code = needle.toUpperCase();
      var name = code;
      try {
        name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
      } catch (err) {
        /* Intl.DisplayNames is not available in some older browsers. */
      }
      return { code: code, name: name, flag: countryFlag(code) };
    }
    return null;
  }

  function readMarketCountry() {
    try {
      var stored = JSON.parse(localStorage.getItem(MARKET_COUNTRY_KEY) || "null");
      if (!stored || !stored.code) return null;
      var known = findMarketCountry(stored.code);
      return known || stored;
    } catch (err) {
      return null;
    }
  }

  function saveCountryToCurrentUser(country) {
    if (!currentUser || !country) return;
    var patch = { country: country.name, countryCode: country.code };
    if (!USE_FIREBASE) {
      currentUser = Local.updateUser(patch) || currentUser;
    } else {
      setExtras(currentUser.uid, patch);
    }
  }

  function setMarketCountry(value, syncProfile) {
    if (syncProfile === undefined) syncProfile = true;
    var country = typeof value === "object" && value
      ? findMarketCountry(value.code || value.name)
      : findMarketCountry(value);
    if (!country) return null;
    localStorage.setItem(MARKET_COUNTRY_KEY, JSON.stringify(country));
    if (syncProfile) saveCountryToCurrentUser(country);
    window.dispatchEvent(new CustomEvent("finora:countrychange", { detail: country }));
    return country;
  }

  function fetchWithTimeout(url, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeout = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;
    return fetch(url, { signal: controller ? controller.signal : undefined })
      .then(function(response) {
        if (!response.ok) throw new Error("Location lookup failed.");
        return response.json();
      })
      .finally(function() { if (timeout) clearTimeout(timeout); });
  }

  function browserPosition() {
    return new Promise(function(resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is unavailable."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 24 * 60 * 60 * 1000,
      });
    });
  }

  async function detectMarketCountry() {
    try {
      var position = await browserPosition();
      var coords = position.coords;
      var reverseUrl = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
      reverseUrl.searchParams.set("latitude", String(coords.latitude));
      reverseUrl.searchParams.set("longitude", String(coords.longitude));
      reverseUrl.searchParams.set("localityLanguage", "en");
      var reverse = await fetchWithTimeout(reverseUrl.toString(), 6000);
      var precise = findMarketCountry(reverse.countryCode);
      if (precise) return precise;
    } catch (err) {
      /* Permission denial and unavailable GPS both fall back to country-level IP lookup. */
    }

    try {
      var ipResult = await fetchWithTimeout("https://api.country.is/", 5000);
      var fromIp = findMarketCountry(ipResult.country);
      if (fromIp) return fromIp;
    } catch (err) {
      /* Offline visitors still get a locale-derived default below. */
    }

    var locale = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    var localeRegion = locale.match(/[-_]([A-Za-z]{2})\b/);
    return findMarketCountry(localeRegion ? localeRegion[1] : "US");
  }

  async function resolveMarketCountry() {
    var profile = getProfile();
    var fromProfile = profile && findMarketCountry(profile.countryCode || profile.country);
    if (fromProfile) return setMarketCountry(fromProfile, false);

    var stored = readMarketCountry();
    if (stored) {
      saveCountryToCurrentUser(stored);
      return stored;
    }

    var detected = await detectMarketCountry();
    return setMarketCountry(detected || "US", true);
  }

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
      users.push({
        uid: "local-" + Date.now(), name: name, email: email, password: password,
        plan: "Free", balance: 0, currency: "USD", joined: new Date().toISOString(),
        country: (readMarketCountry() || {}).name || "",
        countryCode: (readMarketCountry() || {}).code || "",
      });
      saveUsers(users);
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
        var marketCountry = readMarketCountry() || {};
        user = { uid: "local-google", name: "Google User", email: "google.user@gmail.com", password: null, plan: "Free", balance: 0, joined: new Date().toISOString(), country: marketCountry.name || "", countryCode: marketCountry.code || "" };
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

    function updateUser(patch) {
      var users = getUsers();
      var i = users.findIndex(function(u) { return u.uid === getSessionUid(); });
      if (i === -1) return null;
      users[i] = Object.assign({}, users[i], patch);
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

  function emailLinkActionSettings(next) {
    var query = "?emailLink=1";
    if (next) query += "&next=" + encodeURIComponent(next);
    return {
      url: authActionUrl(query),
      handleCodeInApp: true,
    };
  }

  if (USE_FIREBASE) {
    var firstFired = false;
    auth.onAuthStateChanged(async function(user) {
      currentUser = user;
      await captureToken(); // start the session: grab the token for this user
      if (!firstFired) { firstFired = true; resolveReady(user); }
      renderNavAuth();
      renderLandingCtas();
    });
  } else {
    currentUser = Local.current();
    captureToken();
    resolveReady(currentUser);
  }
  var marketCountryReady = authReady.then(resolveMarketCountry);

  /* ------------------------------ Auth ----------------------------- */
  async function register(opts) {
    var name = opts.name;
    var email = opts.email;
    var password = opts.password;
    if (!USE_FIREBASE) {
      var res = Local.register({ name: name, email: email, password: password });
      if (!res.ok) return res;
      var loginRes = Local.login({ email: email, password: password, remember: true });
      if (loginRes.ok) {
        currentUser = loginRes.user;
        await captureToken();
      }
      return { ok: true };
    }
    try {
      var cred = await auth.createUserWithEmailAndPassword(email, password);
      if (name) await cred.user.updateProfile({ displayName: name });
      var verification = await sendVerificationEmail(cred.user);
      var registrationCountry = readMarketCountry() || {};
      setExtras(cred.user.uid, { plan: "Free", balance: 0, currency: "USD", country: registrationCountry.name || "", countryCode: registrationCountry.code || "" });
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
      var extras = getExtras(cred.user.uid);
      if (!extras.plan) {
        var googleCountry = readMarketCountry() || {};
        setExtras(cred.user.uid, { plan: "Free", balance: 0, currency: "USD", country: googleCountry.name || "", countryCode: googleCountry.code || "" });
      }
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
      await auth.sendSignInLinkToEmail(email, emailLinkActionSettings(next));
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
    if (!USE_FIREBASE) {
      return { ok: false, code: "auth/operation-not-allowed", error: "Passwordless email login requires Firebase Authentication." };
    }
    if (!auth.isSignInWithEmailLink(href)) {
      return { ok: false, code: "auth/invalid-action-code", error: mapAuthError("auth/invalid-action-code") };
    }
    if (!email) return { ok: false, code: "auth/missing-email", error: mapAuthError("auth/missing-email") };
    try {
      var cred = await auth.signInWithEmailLink(email, href);
      localStorage.removeItem(EMAIL_LINK_KEY);
      var extras = getExtras(cred.user.uid);
      if (!extras.plan) setExtras(cred.user.uid, { plan: "Free", balance: 0, currency: "USD" });
      currentUser = cred.user;
      await captureToken();
      return { ok: true, user: cred.user, token: idToken };
    } catch (e) {
      return { ok: false, code: e.code, error: mapAuthError(e.code) };
    }
  }

  function logout() {
    function go() { window.location.href = "index.html"; }
    idToken = null; // end the session
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
      return {
        uid: u.uid, name: u.name, email: u.email, joined: u.joined,
        plan: normalizePlan(u.plan), balance: u.balance != null ? u.balance : 0,
        currency: normalizeCurrency(u.currency),
        phone: u.phone || "", country: u.country || (readMarketCountry() || {}).name || "",
        countryCode: u.countryCode || (readMarketCountry() || {}).code || "", bio: u.bio || "",
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
      country: extras.country || (readMarketCountry() || {}).name || "",
      countryCode: extras.countryCode || (readMarketCountry() || {}).code || "",
      bio: extras.bio || "",
    };
  }

  async function updateProfile(patch) {
    if (!currentUser) return null;
    if (patch.country || patch.countryCode) {
      var selectedCountry = findMarketCountry(patch.countryCode || patch.country);
      if (selectedCountry) {
        patch.country = selectedCountry.name;
        patch.countryCode = selectedCountry.code;
        setMarketCountry(selectedCountry, false);
      }
    }
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
    var i;
    for (i = 0; i < (symbol || "").length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
    return `linear-gradient(135deg, ${COLORS[h % COLORS.length]}, ${COLORS[(h >> 3) % COLORS.length]})`;
  }

  function logoKitToken() {
    var token = window.FINORA_CONFIG && window.FINORA_CONFIG.logoKitToken;
    return token && token.indexOf("YOUR_") !== 0 ? token : "";
  }

  function logoFor(symbol) {
    var token = logoKitToken();
    var ticker = (symbol || "").trim().toUpperCase();
    if (!token || !ticker) return null;
    return "https://img.logokit.com/ticker/" + encodeURIComponent(ticker)
      + "?token=" + encodeURIComponent(token) + "&size=64&fallback=404";
  }

  // Returns the markup for a ticker badge: the company logo when available,
  // otherwise a colored fallback showing the symbol text.
  function tickerAvatar(symbol, opts) {
    if (!opts) opts = {};
    var size = opts.size != null ? opts.size : "";
    var color = opts.color;
    var className = opts.className != null ? opts.className : "ticker-avatar";
    var sym = (symbol || "").trim().toUpperCase();
    var cls = [className, size].filter(function(part) { return part; }).join(" ");
    var logo = logoFor(opts.logoSymbol || sym);
    if (logo) {
      return `<span class="${cls} has-logo"><img src="${logo}" alt="${sym}" loading="lazy" onerror="this.parentElement.classList.remove('has-logo');this.parentElement.textContent='${sym}';this.parentElement.style.background='${color || symbolColor(sym)}'"></span>`;
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
              <li><a class="dropdown-item" href="profile.html"><i class="bi bi-person me-2"></i>My Profile</a></li>
              <li><a class="dropdown-item" href="portfolio.html"><i class="bi bi-briefcase me-2"></i>My Portfolio</a></li>
              <li><a class="dropdown-item" href="watchlist.html"><i class="bi bi-star me-2"></i>My Watchlist</a></li>
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

  function isMinimalNavPage() {
    var slot = document.querySelector("[data-nav-auth]");
    return !!(slot && slot.hasAttribute("data-nav-minimal"));
  }

  function setGuestNavbarHidden(hidden) {
    var nav = document.querySelector(".navbar-nav");
    var toggler = document.querySelector(".navbar .navbar-toggler");
    var actions = document.querySelector(".navbar-actions");
    if (nav) nav.classList.toggle("d-none", hidden);
    if (toggler) toggler.classList.toggle("d-none", hidden);
    if (actions) actions.classList.toggle("d-none", hidden);
  }

  function renderNavAuthPending() {
    var slot = document.querySelector("[data-nav-auth]");
    if (!slot || slot.dataset.navAuthState === "ready") return;
    slot.innerHTML = "";
    setGuestNavbarHidden(true);
    slot.dataset.navAuthState = "pending";
  }

  function renderNavAuth() {
    var slot = document.querySelector("[data-nav-auth]");
    if (!slot) return;
    var minimal = isMinimalNavPage();
    var profile = getProfile();

    if (profile) {
      setGuestNavbarHidden(false);
      slot.innerHTML = signedInNavMarkup(false, { hidePremium: minimal });
    } else {
      setGuestNavbarHidden(true);
      slot.innerHTML = "";
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
    var shell = document.querySelector("[data-landing-cta-shell]");
    var guestActions = document.querySelector("[data-landing-cta=\"guest-actions\"]");
    var signedActions = document.querySelector("[data-landing-cta=\"signed-actions\"]");
    if (!guestActions || !signedActions) return;
    var signedIn = !!getProfile();
    guestActions.classList.toggle("d-none", signedIn);
    signedActions.classList.toggle("d-none", !signedIn);
    if (shell) shell.removeAttribute("data-landing-cta-pending");
  }

  async function init() {
    renderNavAuthPending();
    var allowed = await guardRoutes();
    if (!allowed) return;
    renderNavAuth();
    renderLandingCtas();
    if (logoKitToken()) {
      var footer = document.querySelector(".footer");
      if (footer && !footer.querySelector("[data-logokit-attribution]")) {
        footer.insertAdjacentHTML("beforeend", '<div class="text-center mt-1"><a data-logokit-attribution href="https://logokit.com" class="text-muted-2 small" target="_blank" rel="noopener">Logos provided by LogoKit.com</a></div>');
      }
    }
    bindDropdownLinks();
    var path = currentPath();
    document.querySelectorAll(".navbar .nav-link").forEach(function(link) {
      if (link.getAttribute("href") === path) link.classList.add("active");
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    authReady: authReady, register: register, login: login, loginWithGoogle: loginWithGoogle, resetPassword: resetPassword, logout: logout,
    sendEmailLoginLink: sendEmailLoginLink, isEmailLoginLink: isEmailLoginLink, completeEmailLoginLink: completeEmailLoginLink,
    sendVerificationEmail: function() { return sendVerificationEmail(currentUser); },
    getProfile: getProfile, updateProfile: updateProfile, changePassword: changePassword, deleteAccount: deleteAccount,
    countryReady: marketCountryReady, countries: MARKET_COUNTRIES, findCountry: findMarketCountry,
    getMarketCountry: readMarketCountry, setMarketCountry: setMarketCountry,
    requireAuth: requireAuth, mapAuthError: mapAuthError,
    getWatchlist: getWatchlist, removeFromWatchlist: removeFromWatchlist,
    isInWatchlist: isInWatchlist, toggleWatchlist: toggleWatchlist,
    fmtMoney: fmtMoney, fmtNumber: fmtNumber, getCurrency: getCurrency, initials: initials, toast: toast,
    emptyState: emptyState, apiUnavailableState: apiUnavailableState, emptyRow: emptyRow, tickerAvatar: tickerAvatar,
    API_UNAVAILABLE_MSG: API_UNAVAILABLE_MSG,
    isFirebase: USE_FIREBASE,
  };
})();
