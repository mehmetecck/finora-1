/* =====================================================================
   Finora - real market data service
   ---------------------------------------------------------------------
   Providers:
   - Finnhub: live quotes and company news
   - Twelve Data: daily price history for charts

   Add your key below to enable real daily quotes/charts:
   const TWELVE_DATA_API_KEY = "YOUR_KEY";

   This file intentionally does not fake prices. If the key is missing or the
   provider rejects a request, pages render a clear unavailable state.
   ===================================================================== */

const FinoraAPI = (() => {
  const FINNHUB_API_KEY = "d8qk0r9r01qrf6e1n31gd8qk0r9r01qrf6e1n320";
  const FINNHUB_BASE = "https://finnhub.io/api/v1";
  const TWELVE_DATA_API_KEY = "76d6376ad8b54c4681c49311a31590a6";
  const TWELVE_BASE = "https://api.twelvedata.com";
  const REQUEST_TIMEOUT = 6500;
  const QUOTE_CACHE_TTL = 60 * 1000;
  const HISTORY_CACHE_TTL = 5 * 60 * 1000;
  const NEWS_CACHE_TTL = 15 * 60 * 1000;

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
  ];

  const cache = new Map();
  const bySymbol = new Map(COMPANY_CATALOG.map((item) => [item.symbol, item]));

  function company(symbol, name, exchange, sector) {
    return { symbol, name, exchange, sector };
  }

  function hasFinnhubKey() {
    return Boolean(FINNHUB_API_KEY && !FINNHUB_API_KEY.startsWith("YOUR_"));
  }

  function hasTwelveKey() {
    return Boolean(TWELVE_DATA_API_KEY && !TWELVE_DATA_API_KEY.startsWith("YOUR_"));
  }

  function isConfigured() {
    return hasFinnhubKey() || hasTwelveKey();
  }

  function requireFinnhubKey() {
    if (!hasFinnhubKey()) {
      throw new Error("Live quotes and news require a Finnhub API key in js/core/api.js.");
    }
  }

  function requireTwelveKey() {
    if (!hasTwelveKey()) {
      throw new Error("Charts and price history require a Twelve Data API key in js/core/api.js.");
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

  async function withCache(key, ttl, loader) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < ttl) return hit.promise;
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
    requireTwelveKey();
    const url = new URL(TWELVE_BASE + "/time_series");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1day");
    url.searchParams.set("outputsize", outputsize);
    url.searchParams.set("apikey", TWELVE_DATA_API_KEY);
    return withCache(`time:${symbol}:${outputsize}`, HISTORY_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function quote(symbol) {
    requireFinnhubKey();
    const url = new URL(FINNHUB_BASE + "/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", FINNHUB_API_KEY);
    return withCache(`quote:${symbol}`, QUOTE_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function companySearch(query) {
    requireFinnhubKey();
    const url = new URL(FINNHUB_BASE + "/search");
    url.searchParams.set("q", query);
    url.searchParams.set("token", FINNHUB_API_KEY);
    return withCache(`search:${query.toLowerCase()}`, HISTORY_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function companyNews(symbol) {
    requireFinnhubKey();
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 14);
    const url = new URL(FINNHUB_BASE + "/company-news");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", from.toISOString().slice(0, 10));
    url.searchParams.set("to", to.toISOString().slice(0, 10));
    url.searchParams.set("token", FINNHUB_API_KEY);
    return withCache(`news:${symbol}`, NEWS_CACHE_TTL, () => fetchJson(url.toString()));
  }

  function metaFor(symbol) {
    const normalized = (symbol || "").trim().toUpperCase();
    return bySymbol.get(normalized) || company(normalized, normalized, "", "");
  }

  async function getStock(symbol) {
    const normalized = symbol.trim().toUpperCase();
    const meta = metaFor(normalized);
    const q = await quote(normalized);
    return mapQuote(normalized, meta, q);
  }

  function mapQuote(symbol, meta, data) {
    const price = round(Number(data.c));
    const prevClose = round(Number(data.pc));
    if (!price) throw new Error(`No quote data for ${symbol}`);
    const percentChange = Number.isFinite(Number(data.dp)) ? round(Number(data.dp)) : changePct(price, prevClose);

    return {
      symbol,
      name: meta.name || symbol,
      price,
      change: percentChange,
      exchange: meta.exchange,
      sector: meta.sector || "",
      about: `${meta.name || symbol} is listed${meta.exchange ? ` on ${meta.exchange}` : ""}${meta.sector ? ` in the ${meta.sector} sector` : ""}.`,
      open: round(Number(data.o)),
      high: round(Number(data.h)),
      low: round(Number(data.l)),
      prevClose,
      volume: null,
      avgVol: null,
      pe: null,
      eps: null,
      high52: null,
      low52: null,
      divYield: null,
      beta: null,
      cap: null,
      history: [],
    };
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
    if (!hasFinnhubKey()) return DEFAULT_SYMBOLS.map((symbol) => ({ ...metaFor(symbol), price: null, change: null, history: [] }));
    const items = await mapWithLimit(DEFAULT_SYMBOLS, 4, async (symbol) => {
      try {
        return await getStock(symbol);
      } catch {
        return { ...metaFor(symbol), price: null, change: null, history: [] };
      }
    });
    return items.length ? items : DEFAULT_SYMBOLS.map((symbol) => ({ ...metaFor(symbol), price: null, change: null, history: [] }));
  }

  async function getIndices() {
    if (!hasFinnhubKey()) return INDEX_SYMBOLS.map((idx) => ({ name: idx.name, value: null, change: null, history: [] }));
    return mapWithLimit(INDEX_SYMBOLS, 2, async (idx) => {
      try {
        const q = await quote(idx.symbol);
        return {
          name: idx.name,
          value: round(Number(q.c)),
          change: Number.isFinite(Number(q.dp)) ? round(Number(q.dp)) : changePct(Number(q.c), Number(q.pc)),
          history: [],
        };
      } catch {
        return { name: idx.name, value: null, change: null, history: [] };
      }
    });
  }

  async function searchCompanies(query, limit = 8) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches = COMPANY_CATALOG
      .filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, limit);

    let remote = [];
    if (hasFinnhubKey()) {
      try {
        const data = await companySearch(q);
        remote = (data.result || [])
          .filter((item) => item.symbol && item.type === "Common Stock")
          .map((item) => {
            const symbol = item.symbol.toUpperCase();
            const meta = metaFor(symbol);
            return {
              symbol,
              name: item.description || meta.name || symbol,
              exchange: meta.exchange,
              sector: meta.sector,
              price: null,
              change: null,
              history: [],
            };
          });
      } catch {
        remote = [];
      }
    }

    const bySymbol = new Map();
    [...matches, ...remote].forEach((item) => {
      if (item?.symbol && !bySymbol.has(item.symbol)) bySymbol.set(item.symbol, { ...item, price: null, change: null, history: [] });
    });
    return [...bySymbol.values()].slice(0, limit);
  }

  async function getNews(symbol) {
    const normalized = symbol.trim().toUpperCase();
    const items = await companyNews(normalized);
    return (Array.isArray(items) ? items : [])
      .filter((item) => item.headline && item.url)
      .slice(0, 6)
      .map((item) => ({
        title: item.headline,
        source: item.source || "Finnhub",
        time: item.datetime ? new Date(item.datetime * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
        url: item.url,
        tag: item.category || "News",
      }));
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
    hasFinnhubKey,
    hasTwelveKey,
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
