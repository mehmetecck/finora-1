/* =====================================================================
   Finora - real market data service
   ---------------------------------------------------------------------
   Provider: Twelve Data
   Free API key: https://twelvedata.com/pricing

   Add your key below to enable real daily quotes/charts:
   const TWELVE_DATA_API_KEY = "YOUR_KEY";

   This file intentionally does not fake prices. If the key is missing or the
   provider rejects a request, pages render a clear unavailable state.
   ===================================================================== */

const FinoraAPI = (() => {
  const TWELVE_DATA_API_KEY = "76d6376ad8b54c4681c49311a31590a6";
  const TWELVE_BASE = "https://api.twelvedata.com";
  const REQUEST_TIMEOUT = 6500;
  const CACHE_TTL = 5 * 60 * 1000;

  const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "JPM", "V"];
  const INDEX_SYMBOLS = [
    { symbol: "SPY", name: "S&P 500 ETF" },
    { symbol: "DIA", name: "Dow Jones ETF" },
    { symbol: "QQQ", name: "Nasdaq 100 ETF" },
    { symbol: "IWM", name: "Russell 2000 ETF" },
  ];

  const COMPANY_CATALOG = [
    company("AAPL", "Apple Inc.", "NASDAQ", "Technology"),
    company("MSFT", "Microsoft Corporation", "NASDAQ", "Technology"),
    company("NVDA", "NVIDIA Corporation", "NASDAQ", "Technology"),
    company("GOOGL", "Alphabet Inc.", "NASDAQ", "Communication Services"),
    company("AMZN", "Amazon.com, Inc.", "NASDAQ", "Consumer Cyclical"),
    company("META", "Meta Platforms, Inc.", "NASDAQ", "Communication Services"),
    company("TSLA", "Tesla, Inc.", "NASDAQ", "Consumer Cyclical"),
    company("AMD", "Advanced Micro Devices, Inc.", "NASDAQ", "Technology"),
    company("JPM", "JPMorgan Chase & Co.", "NYSE", "Financial Services"),
    company("V", "Visa Inc.", "NYSE", "Financial Services"),
    company("MA", "Mastercard Incorporated", "NYSE", "Financial Services"),
    company("NFLX", "Netflix, Inc.", "NASDAQ", "Communication Services"),
    company("DIS", "The Walt Disney Company", "NYSE", "Communication Services"),
    company("KO", "The Coca-Cola Company", "NYSE", "Consumer Defensive"),
    company("PEP", "PepsiCo, Inc.", "NASDAQ", "Consumer Defensive"),
    company("WMT", "Walmart Inc.", "NYSE", "Consumer Defensive"),
    company("COST", "Costco Wholesale Corporation", "NASDAQ", "Consumer Defensive"),
    company("NKE", "NIKE, Inc.", "NYSE", "Consumer Cyclical"),
    company("MCD", "McDonald's Corporation", "NYSE", "Consumer Cyclical"),
    company("SBUX", "Starbucks Corporation", "NASDAQ", "Consumer Cyclical"),
    company("BA", "The Boeing Company", "NYSE", "Industrials"),
    company("CAT", "Caterpillar Inc.", "NYSE", "Industrials"),
    company("GE", "GE Aerospace", "NYSE", "Industrials"),
    company("XOM", "Exxon Mobil Corporation", "NYSE", "Energy"),
    company("CVX", "Chevron Corporation", "NYSE", "Energy"),
    company("JNJ", "Johnson & Johnson", "NYSE", "Healthcare"),
    company("PFE", "Pfizer Inc.", "NYSE", "Healthcare"),
    company("UNH", "UnitedHealth Group Incorporated", "NYSE", "Healthcare"),
    company("HD", "The Home Depot, Inc.", "NYSE", "Consumer Cyclical"),
    company("ORCL", "Oracle Corporation", "NYSE", "Technology"),
    company("IBM", "International Business Machines Corporation", "NYSE", "Technology"),
    company("INTC", "Intel Corporation", "NASDAQ", "Technology"),
    company("CRM", "Salesforce, Inc.", "NYSE", "Technology"),
    company("UBER", "Uber Technologies, Inc.", "NYSE", "Technology"),
    company("ABNB", "Airbnb, Inc.", "NASDAQ", "Consumer Cyclical"),
    company("SHOP", "Shopify Inc.", "NYSE", "Technology"),
    company("SPY", "SPDR S&P 500 ETF Trust", "NYSE Arca", "ETF"),
    company("QQQ", "Invesco QQQ Trust", "NASDAQ", "ETF"),
    company("DIA", "SPDR Dow Jones Industrial Average ETF", "NYSE Arca", "ETF"),
    company("IWM", "iShares Russell 2000 ETF", "NYSE Arca", "ETF"),
  ];

  const cache = new Map();
  const bySymbol = new Map(COMPANY_CATALOG.map((item) => [item.symbol, item]));

  function company(symbol, name, exchange, sector) {
    return { symbol, name, exchange, sector };
  }

  function isConfigured() {
    return Boolean(TWELVE_DATA_API_KEY && !TWELVE_DATA_API_KEY.startsWith("YOUR_"));
  }

  function requireKey() {
    if (!isConfigured()) {
      throw new Error("Real market data requires a free Twelve Data API key in js/core/api.js.");
    }
  }

  function round(n, digits = 2) {
    return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
  }

  function formatLarge(n) {
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) >= 1_000_000_000) return `${round(n / 1_000_000_000, 2)}B`;
    if (Math.abs(n) >= 1_000_000) return `${round(n / 1_000_000, 2)}M`;
    if (Math.abs(n) >= 1_000) return `${round(n / 1_000, 2)}K`;
    return String(Math.round(n));
  }

  function changePct(price, prevClose) {
    return prevClose ? round(((price - prevClose) / prevClose) * 100) : 0;
  }

  async function withCache(key, loader) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < CACHE_TTL) return hit.promise;
    const promise = loader().catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, { time: Date.now(), promise });
    return promise;
  }

  async function fetchJson(url) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
    try {
      const res = await fetch(url, { signal: controller?.signal });
      if (!res.ok) throw new Error(`Market API error ${res.status}`);
      const data = await res.json();
      if (data.status === "error" || data.code) throw new Error(data.message || "Market API error");
      return data;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function timeSeries(symbol, outputsize = 60) {
    requireKey();
    const url = new URL(TWELVE_BASE + "/time_series");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1day");
    url.searchParams.set("outputsize", outputsize);
    url.searchParams.set("apikey", TWELVE_DATA_API_KEY);
    return withCache(`time:${symbol}:${outputsize}`, () => fetchJson(url.toString()));
  }

  function metaFor(symbol) {
    const normalized = (symbol || "").trim().toUpperCase();
    return bySymbol.get(normalized) || company(normalized, normalized, "", "");
  }

  async function getStock(symbol) {
    const normalized = symbol.trim().toUpperCase();
    const meta = metaFor(normalized);
    const series = await timeSeries(normalized, 60);
    return mapSeries(normalized, meta, series);
  }

  function mapSeries(symbol, meta, data) {
    const values = [...(data.values || [])].reverse();
    if (!values.length) throw new Error(`No market data for ${symbol}`);
    const latest = values[values.length - 1];
    const prev = values[values.length - 2] || latest;
    const price = round(Number(latest.close));
    const prevClose = round(Number(prev.close));
    const volume = Number(latest.volume);
    const exchange = data.meta?.exchange || meta.exchange;
    const sector = meta.sector || "";

    return {
      symbol,
      name: meta.name || symbol,
      price,
      change: changePct(price, prevClose),
      exchange,
      sector,
      about: `${meta.name || symbol} is listed${exchange ? ` on ${exchange}` : ""}${sector ? ` in the ${sector} sector` : ""}.`,
      open: round(Number(latest.open)),
      high: round(Number(latest.high)),
      low: round(Number(latest.low)),
      prevClose,
      volume: Number.isFinite(volume) ? formatLarge(volume) : null,
      avgVol: null,
      pe: null,
      eps: null,
      high52: null,
      low52: null,
      divYield: null,
      beta: null,
      cap: null,
      history: values.map((row) => round(Number(row.close))).filter((n) => n != null),
    };
  }

  function rangePoints(range) {
    switch (range) {
      case "1D": return 2;
      case "1W": return 7;
      case "1M": return 30;
      case "1Y": return 60;
      default: return 30;
    }
  }

  async function getHistory(symbol, range = "1M") {
    const normalized = symbol.trim().toUpperCase();
    const points = rangePoints(range);
    const data = await timeSeries(normalized, Math.max(points, 60));
    return mapSeries(normalized, metaFor(normalized), data).history.slice(-points);
  }

  async function mapWithLimit(items, limit, mapper) {
    const out = [];
    for (let i = 0; i < items.length; i += limit) {
      const batch = await Promise.allSettled(items.slice(i, i + limit).map(mapper));
      out.push(...batch.filter((r) => r.status === "fulfilled").map((r) => r.value));
    }
    return out;
  }

  async function getTrending() {
    return DEFAULT_SYMBOLS.map((symbol) => ({ ...metaFor(symbol), price: null, change: null, history: [] }));
  }

  async function getIndices() {
    return INDEX_SYMBOLS.map((idx) => ({ name: idx.name, value: null, change: null, history: [] }));
  }

  async function searchCompanies(query, limit = 8) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches = COMPANY_CATALOG
      .filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, limit);

    return matches.map((m) => ({ ...m, price: null, change: null, history: [] }));
  }

  async function getNews() {
    return [];
  }

  async function getPortfolio() {
    return { holdings: [], cash: 0 };
  }

  async function getPortfolioHistory() {
    return [];
  }

  async function getTransactions() {
    return [];
  }

  return {
    isConfigured,
    searchCompanies,
    getIndices,
    getTrending,
    getStock,
    getHistory,
    getNews,
    getPortfolio,
    getPortfolioHistory,
    getTransactions,
  };
})();
