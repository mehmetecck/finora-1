/* =====================================================================
   Finora - real market data service
   ---------------------------------------------------------------------
   The browser calls Finora's PHP proxy. API keys stay in Vercel environment
   variables and are never included in this client-side file.

   This file intentionally does not fake prices. If the key is missing or the
   provider rejects a request, pages render a clear unavailable state.
   ===================================================================== */

const FinoraAPI = (() => {
  const MARKET_PROXY = "/api/market-data.php";
  const REQUEST_TIMEOUT = 12000;
  const QUOTE_CACHE_TTL = 60 * 1000;
  const HISTORY_CACHE_TTL = 5 * 60 * 1000;
  const NEWS_CACHE_TTL = 15 * 60 * 1000;
  const CATALOG_CACHE_TTL = 24 * 60 * 60 * 1000;
  const MOVERS_CACHE_TTL = 60 * 60 * 1000;
  const MOVERS_STORAGE_KEY = "finora_market_movers";
  const API_UNAVAILABLE_MSG = "API is currently unavailable, please try again later or reload the page.";

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

  function company(symbol, name, exchange, sector, country = "US", currency = "USD") {
    return { symbol, name, exchange, sector, country, currency };
  }

  function hasFinnhubKey() {
    return true;
  }

  function hasTwelveKey() {
    return true;
  }

  function isConfigured() {
    return hasFinnhubKey() || hasTwelveKey();
  }

  function requireFinnhubKey() {
    if (!hasFinnhubKey()) {
      throw new Error("The PHP market-data proxy is unavailable.");
    }
  }

  function requireTwelveKey() {
    if (!hasTwelveKey()) {
      throw new Error("The PHP market-data proxy is unavailable.");
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
      const res = await fetch(url, { signal: controller ? controller.signal : undefined });
      if (!res.ok) throw new Error(API_UNAVAILABLE_MSG);
      const data = await res.json();
      if (data.status === "error" || data.code) throw new Error(API_UNAVAILABLE_MSG);
      return data;
    } catch (err) {
      if (err && err.message === API_UNAVAILABLE_MSG) throw err;
      throw new Error(API_UNAVAILABLE_MSG);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function proxyUrl(action) {
    const url = new URL(MARKET_PROXY, window.location.href);
    url.searchParams.set("action", action);
    return url;
  }

  async function timeSeries(symbol, outputsize = 60, options = {}) {
    requireTwelveKey();
    const url = proxyUrl("time_series");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1day");
    url.searchParams.set("outputsize", outputsize);
    if (options.exchange) url.searchParams.set("exchange", options.exchange);
    if (options.country) url.searchParams.set("country", options.country);
    const marketKey = `${options.exchange || ""}:${options.country || ""}`;
    return withCache(`time:${symbol}:${outputsize}:${marketKey}`, HISTORY_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function quote(symbol) {
    requireFinnhubKey();
    const url = proxyUrl("quote");
    url.searchParams.set("symbol", symbol);
    return withCache(`quote:${symbol}`, QUOTE_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function companySearch(query) {
    requireFinnhubKey();
    const url = proxyUrl("company_search");
    url.searchParams.set("q", query);
    return withCache(`search:${query.toLowerCase()}`, HISTORY_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function twelveSymbolSearch(query, outputsize = 30) {
    requireTwelveKey();
    const url = proxyUrl("symbol_search");
    url.searchParams.set("symbol", query);
    url.searchParams.set("outputsize", String(outputsize));
    return withCache(`symbol-search:${query.toLowerCase()}:${outputsize}`, HISTORY_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function stockCatalog(country, outputsize = 120) {
    requireTwelveKey();
    const url = proxyUrl("stocks");
    url.searchParams.set("country", country);
    url.searchParams.set("outputsize", String(outputsize));
    return withCache(`stocks:${country.toUpperCase()}:${outputsize}`, CATALOG_CACHE_TTL, () => fetchJson(url.toString()));
  }

  async function companyNews(symbol) {
    requireFinnhubKey();
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 14);
    const url = proxyUrl("company_news");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", from.toISOString().slice(0, 10));
    url.searchParams.set("to", to.toISOString().slice(0, 10));
    return withCache(`news:${symbol}`, NEWS_CACHE_TTL, () => fetchJson(url.toString()));
  }

  function metaFor(symbol, options = {}) {
    const normalized = (symbol || "").trim().toUpperCase();
    return Object.assign(
      {},
      bySymbol.get(normalized) || company(normalized, normalized, "", "", "", ""),
      Object.fromEntries(Object.entries(options).filter(([, value]) => value != null && value !== ""))
    );
  }

  async function getStock(symbol, options = {}) {
    const normalized = symbol.trim().toUpperCase();
    const meta = metaFor(normalized, options);
    const isInternational = meta.country && meta.country !== "US" && meta.country !== "United States";

    if (!isInternational && hasFinnhubKey()) {
      try {
        const q = await quote(normalized);
        return mapQuote(normalized, meta, q);
      } catch {
        /* Twelve Data provides a reliable exchange-aware fallback. */
      }
    }

    const series = await timeSeries(normalized, 60, meta);
    return mapSeries(normalized, meta, series);
  }

  function mapQuote(symbol, meta, data) {
    const price = round(Number(data.c));
    const prevClose = round(Number(data.pc));
    if (!price) throw new Error(API_UNAVAILABLE_MSG);
    const percentChange = Number.isFinite(Number(data.dp)) ? round(Number(data.dp)) : changePct(price, prevClose);

    return {
      symbol,
      name: meta.name || symbol,
      price,
      change: percentChange,
      exchange: meta.exchange,
      country: meta.country || "",
      currency: meta.currency || "USD",
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
    if (!values.length) throw new Error(API_UNAVAILABLE_MSG);
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
      country: meta.country || "",
      currency: data.meta?.currency || meta.currency || "USD",
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

  async function getHistory(symbol, range = "1M", options = {}) {
    const normalized = symbol.trim().toUpperCase();
    const points = rangePoints(range);
    const meta = metaFor(normalized, options);
    const data = await timeSeries(normalized, Math.max(points, 60), meta);
    return mapSeries(normalized, meta, data).history.slice(-points);
  }

  async function getOHLC(symbol, range = "1M", options = {}) {
    const normalized = symbol.trim().toUpperCase();
    const points = rangePoints(range);
    const data = await timeSeries(normalized, Math.max(points, 60), metaFor(normalized, options));
    const values = [...(data.values || [])].reverse();
    if (!values.length) throw new Error(API_UNAVAILABLE_MSG);
    return values.slice(-points).map((row) => ({
      date: (row.datetime || "").slice(0, 10),
      open: round(Number(row.open)),
      high: round(Number(row.high)),
      low: round(Number(row.low)),
      close: round(Number(row.close)),
    })).filter((bar) => bar.close != null);
  }

  async function mapWithLimit(items, limit, mapper) {
    const out = [];
    for (let i = 0; i < items.length; i += limit) {
      const batch = await Promise.allSettled(items.slice(i, i + limit).map(mapper));
      out.push(...batch.filter((r) => r.status === "fulfilled").map((r) => r.value));
    }
    return out;
  }

  async function getCountryStocks(country, limit = 10) {
    const data = await stockCatalog(country, 120);
    const seenCompanies = new Set();
    const primaryListings = (data.data || [])
      .filter((item) => item.symbol && /common stock|reit/i.test(item.type || ""))
      .filter((item) => !/cboe|otc/i.test(item.exchange || "") && !/^B?CXE$/i.test(item.mic_code || ""))
      .filter((item) => {
        const key = String(item.name || item.symbol).trim().toLowerCase();
        if (seenCompanies.has(key)) return false;
        seenCompanies.add(key);
        return true;
      })
      .slice(0, limit)
      .map((item) => ({
        symbol: item.symbol.toUpperCase(),
        name: item.name || item.symbol,
        exchange: item.exchange || "",
        micCode: item.mic_code || "",
        country: item.country || country,
        currency: item.currency || "",
        logoSymbol: logoTicker(item.symbol.toUpperCase(), item.exchange, item.country, item.mic_code),
        sector: "",
        price: null,
        change: null,
        history: [],
      }));

    if (!primaryListings.length) throw new Error(API_UNAVAILABLE_MSG);
    return primaryListings;
  }

  async function getTrending(country = "") {
    if (country && country.toUpperCase() !== "US") {
      return getCountryStocks(country, 10);
    }
    if (!hasFinnhubKey()) {
      return DEFAULT_SYMBOLS.map(function (symbol) {
        return { ...metaFor(symbol), price: null, change: null, history: [] };
      });
    }
    var items = await mapWithLimit(DEFAULT_SYMBOLS, 4, async function (symbol) {
      try {
        return await getStock(symbol);
      } catch (err) {
        return { ...metaFor(symbol), price: null, change: null, history: [] };
      }
    });
    if (items.length && items.every(function (item) { return item.price == null; })) {
      throw new Error(API_UNAVAILABLE_MSG);
    }
    if (items.length) return items;
    return DEFAULT_SYMBOLS.map(function (symbol) {
      return { ...metaFor(symbol), price: null, change: null, history: [] };
    });
  }

  function mapMover(row) {
    const symbol = (row.symbol || "").trim().toUpperCase();
    const meta = metaFor(symbol);
    return {
      symbol,
      name: row.name || meta.name || symbol,
      price: round(Number(row.last)),
      change: round(Number(row.percent_change)),
      exchange: row.exchange || meta.exchange,
      sector: meta.sector || "",
    };
  }

  function readStoredMovers(direction, limit, country) {
    try {
      const raw = localStorage.getItem(MOVERS_STORAGE_KEY);
      if (!raw) return null;
      const all = JSON.parse(raw);
      const entry = all[direction + ":" + limit + ":" + (country || "WW")];
      if (!entry || !Array.isArray(entry.data) || Date.now() - entry.time > MOVERS_CACHE_TTL) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  function writeStoredMovers(direction, limit, country, data) {
    try {
      const raw = localStorage.getItem(MOVERS_STORAGE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[direction + ":" + limit + ":" + (country || "WW")] = { time: Date.now(), data: data };
      localStorage.setItem(MOVERS_STORAGE_KEY, JSON.stringify(all));
    } catch {
      /* ignore storage errors */
    }
  }

  async function fetchMarketMovers(direction, limit, country) {
    requireTwelveKey();
    const url = proxyUrl("market_movers");
    url.searchParams.set("direction", direction);
    url.searchParams.set("outputsize", String(limit));
    url.searchParams.set("country", country || "US");
    const data = await fetchJson(url.toString());
    return (data.values || [])
      .slice(0, limit)
      .map(mapMover)
      .filter((item) => item.symbol && item.price != null && Number.isFinite(item.change));
  }

  async function moversFromCatalog(direction, limit) {
    if (!hasFinnhubKey()) return [];
    const symbols = COMPANY_CATALOG.map((c) => c.symbol);
    const quoted = await mapWithLimit(symbols, 4, async (symbol) => {
      try {
        return await getStock(symbol);
      } catch {
        return null;
      }
    });
    const valid = quoted.filter((item) => item && item.price != null && Number.isFinite(item.change));
    const sorted = valid.sort((a, b) => (direction === "gainers" ? b.change - a.change : a.change - b.change));
    if (direction === "gainers") return sorted.filter((item) => item.change > 0).slice(0, limit);
    return sorted.filter((item) => item.change < 0).slice(0, limit);
  }

  async function getMarketMovers(direction, limit = 6, country = "") {
    const cached = readStoredMovers(direction, limit, country);
    if (cached && cached.length) return cached;

    let movers = [];
    if (hasTwelveKey()) {
      try {
        movers = await fetchMarketMovers(direction, limit, country);
      } catch {
        /* fall back to catalog quotes */
      }
    }
    if (!movers.length) movers = await moversFromCatalog(direction, limit);
    if (!movers.length) throw new Error(API_UNAVAILABLE_MSG);

    writeStoredMovers(direction, limit, country, movers);
    return movers;
  }

  async function getGainers(limit = 6, country = "") {
    return getMarketMovers("gainers", limit, country);
  }

  async function getLosers(limit = 6, country = "") {
    return getMarketMovers("losers", limit, country);
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
    }).then((results) => {
      if (results.length && results.every((item) => item.value == null)) {
        throw new Error(API_UNAVAILABLE_MSG);
      }
      return results;
    });
  }

  function countryMatches(value, selectedCountry) {
    if (!selectedCountry) return true;
    const selected = typeof Finora !== "undefined" && Finora.findCountry
      ? Finora.findCountry(selectedCountry)
      : null;
    const wantedCode = selected ? selected.code : selectedCountry.toUpperCase();
    const wantedName = selected ? selected.name.toLowerCase() : "";
    const actual = String(value || "").trim();
    return actual.toUpperCase() === wantedCode || actual.toLowerCase() === wantedName;
  }

  function logoTicker(symbol, exchange, country, micCode = "") {
    const suffixByExchange = {
      LSE: "LN", XETR: "GR", FSX: "GR", XSTU: "GR", SWX: "SW",
      TSX: "CN", ASX: "AU", TSE: "JP", HKEX: "HK", NSE: "IN",
      BSE: "IN", MTA: "IM", SGX: "SP", KRX: "KP",
    };
    const suffixByMic = {
      XBRU: "BB", XLON: "LN", XETR: "GR", XSWX: "SW", XTSE: "CN",
      XASX: "AU", XTKS: "JP", XHKG: "HK", XNSE: "IN", XBOM: "IN",
      XMIL: "IM", XSES: "SP", XKRX: "KP",
    };
    const suffix = suffixByMic[String(micCode || "").toUpperCase()]
      || suffixByExchange[String(exchange || "").toUpperCase()];
    if (!suffix || country === "US" || country === "United States") return symbol;
    return `${symbol}:${suffix}`;
  }

  async function searchCompanies(query, limit = 8, country = "") {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const matches = COMPANY_CATALOG
      .filter((c) => countryMatches(c.country, country))
      .filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, limit);

    let remote = [];
    if (hasTwelveKey()) {
      try {
        const data = await twelveSymbolSearch(q, country ? 120 : Math.max(limit * 3, 30));
        remote = (data.data || [])
          .filter((item) => item.symbol && /stock|depositary receipt|reit/i.test(item.instrument_type || ""))
          .filter((item) => countryMatches(item.country, country))
          .map((item) => ({
            symbol: item.symbol.toUpperCase(),
            name: item.instrument_name || item.symbol,
            exchange: item.exchange || "",
            micCode: item.mic_code || "",
            country: item.country || "",
            currency: item.currency || "",
            logoSymbol: logoTicker(item.symbol.toUpperCase(), item.exchange, item.country, item.mic_code),
            sector: "",
            price: null,
            change: null,
            history: [],
          }));
      } catch {
        remote = [];
      }
    }

    if (!remote.length && !country && hasFinnhubKey()) {
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
              country: meta.country || "",
              currency: meta.currency || "",
              logoSymbol: symbol,
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
      const key = `${item?.symbol || ""}:${item?.exchange || ""}:${item?.country || ""}`;
      if (item?.symbol && !bySymbol.has(key)) bySymbol.set(key, { ...item, price: null, change: null, history: [] });
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
    API_UNAVAILABLE_MSG,
    isConfigured,
    hasFinnhubKey,
    hasTwelveKey,
    searchCompanies,
    getIndices,
    getTrending,
    getGainers,
    getLosers,
    getStock,
    getHistory,
    getOHLC,
    getNews,
    getPortfolio,
    getPortfolioHistory,
    getTransactions,
  };
})();
