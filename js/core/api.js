/* =====================================================================
   Finora — FinoraAPI (data service layer)
   ---------------------------------------------------------------------
   Single place where the app talks to a stock market API. All pages call
   these methods; none of them contain hard-coded demo data.

   TO GO LIVE:
   1. Set API_BASE and API_KEY below (e.g. Finnhub, Alpha Vantage, Polygon,
      Twelve Data, …).
   2. In each method, map the provider's JSON to the documented return
      shape (see the comments). The UI already expects these shapes.

   Until API_BASE/API_KEY are filled in, every method rejects and the pages
   render a friendly "connect a market data API" empty state.
   ===================================================================== */

const FinoraAPI = (() => {
  /* ============================= CONFIG ============================ */
  const API_BASE = "";   // e.g. "https://finnhub.io/api/v1"
  const API_KEY = "";    // your API key / token
  const KEY_PARAM = "token"; // query param name the provider expects for the key

  const isConfigured = () => Boolean(API_BASE && API_KEY);

  async function request(path, params = {}) {
    if (!isConfigured()) {
      throw new Error("Market data API is not configured. Add API_BASE and API_KEY in js/core/api.js.");
    }
    const url = new URL(API_BASE.replace(/\/$/, "") + path);
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    url.searchParams.set(KEY_PARAM, API_KEY);

    // Attach the logged-in user's auth token so the backend can authorize
    // the request (Finora.getToken() returns the Firebase ID token).
    const headers = {};
    try {
      const token = typeof Finora !== "undefined" ? await Finora.getToken() : null;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* not signed in — send the request unauthenticated */ }

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  /* ===================== Market data endpoints ====================
     Implement the mapping inside each method. Documented return shapes
     below are what the UI consumes.
     ================================================================ */

  // → [{ name, value, change, history?: number[] }]
  async function getIndices() {
    const data = await request("/indices");
    return data; // TODO: map to the shape above
  }

  // → [{ symbol, name, price, change, cap?, history?: number[] }]
  async function getTrending() {
    const data = await request("/stock/trending");
    return data; // TODO: map to the shape above
  }

  // → {
  //     symbol, name, price, change, exchange, sector, about,
  //     open, high, low, prevClose, volume, avgVol,
  //     pe, eps, high52, low52, divYield, beta, cap
  //   }
  async function getStock(symbol) {
    const data = await request("/stock/profile", { symbol });
    return data; // TODO: map to the shape above
  }

  // → number[] (closing prices) for the given range ("1D" | "1W" | "1M" | "1Y")
  async function getHistory(symbol, range = "1W") {
    const data = await request("/stock/candles", { symbol, range });
    return data; // TODO: map to an array of closing prices
  }

  // → [{ symbol, title, source, time, tag?, url? }]
  async function getNews(symbol) {
    const data = await request("/news", { symbol });
    return data; // TODO: map to the shape above
  }

  /* ====================== Portfolio endpoints =====================
     These could be served by your own backend or Firestore keyed by the
     Firebase user uid.
     ================================================================ */

  // → { holdings: [{ symbol, name, shares, avg, price, dayChange }], cash }
  async function getPortfolio(uid) {
    const data = await request("/portfolio", { uid });
    return data; // TODO: map to the shape above
  }

  // → number[] portfolio value series for the range
  async function getPortfolioHistory(uid, range = "1W") {
    const data = await request("/portfolio/history", { uid, range });
    return data; // TODO: map to an array of values
  }

  // → [{ type, title, meta, amount, time }]
  async function getTransactions(uid) {
    const data = await request("/portfolio/transactions", { uid });
    return data; // TODO: map to the shape above
  }

  return {
    isConfigured,
    getIndices, getTrending, getStock, getHistory, getNews,
    getPortfolio, getPortfolioHistory, getTransactions,
  };
})();
