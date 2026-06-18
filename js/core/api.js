/* =====================================================================
   Finora - data service layer
   ---------------------------------------------------------------------
   Market data is powered by Yahoo Finance's public chart/search endpoints.
   These endpoints are unofficial and can rate-limit, so all request code is
   centralized here and can be swapped for a real backend later.
   ===================================================================== */

const FinoraAPI = (() => {
  const YAHOO_BASE = "https://query1.finance.yahoo.com";
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const CACHE_TTL = 60 * 1000;
  const REQUEST_TIMEOUT = 8000;

  const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "JPM", "V"];
  const COMPANY_CATALOG = [
    { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", sector: "Communication Services" },
    { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical" },
    { symbol: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", sector: "Communication Services" },
    { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical" },
    { symbol: "AMD", name: "Advanced Micro Devices, Inc.", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", sector: "Financial Services" },
    { symbol: "V", name: "Visa Inc.", exchange: "NYSE", sector: "Financial Services" },
    { symbol: "MA", name: "Mastercard Incorporated", exchange: "NYSE", sector: "Financial Services" },
    { symbol: "NFLX", name: "Netflix, Inc.", exchange: "NASDAQ", sector: "Communication Services" },
    { symbol: "DIS", name: "The Walt Disney Company", exchange: "NYSE", sector: "Communication Services" },
    { symbol: "KO", name: "The Coca-Cola Company", exchange: "NYSE", sector: "Consumer Defensive" },
    { symbol: "PEP", name: "PepsiCo, Inc.", exchange: "NASDAQ", sector: "Consumer Defensive" },
    { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE", sector: "Consumer Defensive" },
    { symbol: "COST", name: "Costco Wholesale Corporation", exchange: "NASDAQ", sector: "Consumer Defensive" },
    { symbol: "NKE", name: "NIKE, Inc.", exchange: "NYSE", sector: "Consumer Cyclical" },
    { symbol: "MCD", name: "McDonald's Corporation", exchange: "NYSE", sector: "Consumer Cyclical" },
    { symbol: "SBUX", name: "Starbucks Corporation", exchange: "NASDAQ", sector: "Consumer Cyclical" },
    { symbol: "BA", name: "The Boeing Company", exchange: "NYSE", sector: "Industrials" },
    { symbol: "CAT", name: "Caterpillar Inc.", exchange: "NYSE", sector: "Industrials" },
    { symbol: "GE", name: "GE Aerospace", exchange: "NYSE", sector: "Industrials" },
    { symbol: "XOM", name: "Exxon Mobil Corporation", exchange: "NYSE", sector: "Energy" },
    { symbol: "CVX", name: "Chevron Corporation", exchange: "NYSE", sector: "Energy" },
    { symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", sector: "Healthcare" },
    { symbol: "PFE", name: "Pfizer Inc.", exchange: "NYSE", sector: "Healthcare" },
    { symbol: "UNH", name: "UnitedHealth Group Incorporated", exchange: "NYSE", sector: "Healthcare" },
    { symbol: "HD", name: "The Home Depot, Inc.", exchange: "NYSE", sector: "Consumer Cyclical" },
    { symbol: "ORCL", name: "Oracle Corporation", exchange: "NYSE", sector: "Technology" },
    { symbol: "IBM", name: "International Business Machines Corporation", exchange: "NYSE", sector: "Technology" },
    { symbol: "INTC", name: "Intel Corporation", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "CRM", name: "Salesforce, Inc.", exchange: "NYSE", sector: "Technology" },
    { symbol: "UBER", name: "Uber Technologies, Inc.", exchange: "NYSE", sector: "Technology" },
    { symbol: "ABNB", name: "Airbnb, Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical" },
    { symbol: "SHOP", name: "Shopify Inc.", exchange: "NYSE", sector: "Technology" },
    { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSE Arca", sector: "ETF" },
    { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", sector: "ETF" },
  ];
  const INDEX_SYMBOLS = [
    { symbol: "^GSPC", name: "S&P 500" },
    { symbol: "^DJI", name: "Dow Jones" },
    { symbol: "^IXIC", name: "Nasdaq" },
    { symbol: "^RUT", name: "Russell 2000" },
  ];
  const RANGE_MAP = {
    "1D": { range: "1d", interval: "5m" },
    "1W": { range: "5d", interval: "30m" },
    "1M": { range: "1mo", interval: "1d" },
    "1Y": { range: "1y", interval: "1wk" },
  };

  const cache = new Map();

  const isConfigured = () => true;
  const compact = (arr) => arr.filter((item) => item != null);
  const round = (n, digits = 2) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;

  function withCache(key, loader) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < CACHE_TTL) return hit.promise;
    const promise = loader().catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, { time: Date.now(), promise });
    return promise;
  }

  async function yahoo(path, params = {}) {
    const url = new URL(YAHOO_BASE + path);
    Object.entries(params).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, value);
    });

    try {
      return await fetchJson(url.toString());
    } catch (err) {
      return fetchJson(CORS_PROXY + encodeURIComponent(url.toString()));
    }
  }

  async function fetchJson(url) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
    let res;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller?.signal,
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`Yahoo request failed (${res.status})`);
    const data = await res.json();
    if (data?.chart?.error) throw new Error(data.chart.error.description || "Yahoo chart error");
    if (data?.finance?.error) throw new Error(data.finance.error.description || "Yahoo finance error");
    return data;
  }

  async function chart(symbol, rangeKey = "1M") {
    const cfg = RANGE_MAP[rangeKey] || RANGE_MAP["1M"];
    const encoded = encodeURIComponent(symbol);
    return withCache(`chart:${symbol}:${rangeKey}`, async () => {
      const data = await yahoo(`/v8/finance/chart/${encoded}`, {
        range: cfg.range,
        interval: cfg.interval,
        includePrePost: "false",
      });
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error(`No chart data for ${symbol}`);
      return result;
    });
  }

  async function searchSymbols(query, limit = 8) {
    const q = query.trim();
    if (q.length < 2) return [];
    return withCache(`search:${q.toLowerCase()}:${limit}`, async () => {
      try {
        const data = await yahoo("/v1/finance/search", {
          q,
          quotesCount: limit,
          newsCount: 0,
        });
        const quotes = data?.quotes || [];
        const yahooMatches = quotes
          .filter((q) => ["EQUITY", "ETF"].includes(q.quoteType))
          .slice(0, limit)
          .map((q) => ({
            symbol: q.symbol,
            name: q.longname || q.shortname || q.symbol,
            exchange: q.exchDisp || q.exchange || "",
            sector: q.sector || q.sectorDisp || "",
          }));
        return yahooMatches.length ? yahooMatches : searchCatalog(q, limit);
      } catch {
        return searchCatalog(q, limit);
      }
    });
  }

  function searchCatalog(query, limit) {
    const q = query.toLowerCase();
    return COMPANY_CATALOG
      .filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  async function searchCompanies(query, limit = 8) {
    const matches = await searchSymbols(query, limit);
    return mapWithLimit(matches, 3, async (match) => {
      try {
        return await getSnapshot(match.symbol, match);
      } catch {
        return { ...match, price: null, change: 0, history: [] };
      }
    });
  }

  async function getSnapshot(symbol, searchMeta = {}) {
    const result = await chart(symbol, "1M");
    return mapChartResult(result, searchMeta);
  }

  function mapChartResult(result, searchMeta = {}) {
    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const closes = compact(quote.close || []);
    const price = round(meta.regularMarketPrice ?? closes[closes.length - 1]);
    const prevClose = round(meta.previousClose ?? meta.chartPreviousClose);
    const firstClose = closes[0];
    const change = prevClose ? round(((price - prevClose) / prevClose) * 100) : 0;
    const history = closes.map((n) => round(n)).filter((n) => n != null);

    return {
      symbol: meta.symbol || searchMeta.symbol,
      name: meta.longName || meta.shortName || searchMeta.name || searchMeta.symbol,
      price,
      change,
      exchange: meta.fullExchangeName || meta.exchangeName || searchMeta.exchange || "",
      sector: searchMeta.sector || "",
      about: searchMeta.sector ? `${searchMeta.name || meta.shortName || meta.symbol} is listed in the ${searchMeta.sector} sector.` : "",
      open: round(lastValue(quote.open)),
      high: round(meta.regularMarketDayHigh ?? lastValue(quote.high)),
      low: round(meta.regularMarketDayLow ?? lastValue(quote.low)),
      prevClose,
      volume: formatLarge(meta.regularMarketVolume ?? lastValue(quote.volume)),
      avgVol: null,
      pe: null,
      eps: null,
      high52: round(meta.fiftyTwoWeekHigh),
      low52: round(meta.fiftyTwoWeekLow),
      divYield: null,
      beta: null,
      cap: null,
      history,
      firstClose,
    };
  }

  function lastValue(values = []) {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] != null) return values[i];
    }
    return null;
  }

  function formatLarge(n) {
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) >= 1_000_000_000) return `${round(n / 1_000_000_000, 2)}B`;
    if (Math.abs(n) >= 1_000_000) return `${round(n / 1_000_000, 2)}M`;
    if (Math.abs(n) >= 1_000) return `${round(n / 1_000, 2)}K`;
    return String(Math.round(n));
  }

  async function mapWithLimit(items, limit, mapper) {
    const results = [];
    for (let i = 0; i < items.length; i += limit) {
      const batch = items.slice(i, i + limit);
      const mapped = await Promise.allSettled(batch.map(mapper));
      results.push(...mapped.filter((r) => r.status === "fulfilled").map((r) => r.value));
    }
    return results;
  }

  async function getIndices() {
    return mapWithLimit(INDEX_SYMBOLS, 2, async (idx) => {
      const s = await getSnapshot(idx.symbol, idx);
      return {
        name: idx.name,
        value: s.price,
        change: s.change,
        history: s.history,
      };
    });
  }

  async function getTrending() {
    return mapWithLimit(DEFAULT_SYMBOLS, 3, async (symbol) => getSnapshot(symbol, { symbol }));
  }

  async function getStock(symbol) {
    if (!symbol || !symbol.trim()) throw new Error("Missing symbol");
    const matches = await searchSymbols(symbol, 1).catch(() => []);
    const exact = matches.find((m) => m.symbol.toUpperCase() === symbol.toUpperCase()) || matches[0] || { symbol };
    return getSnapshot(exact.symbol, exact);
  }

  async function getHistory(symbol, range = "1W") {
    const result = await chart(symbol, range);
    const closes = result.indicators?.quote?.[0]?.close || [];
    return closes.map((n) => round(n)).filter((n) => n != null);
  }

  async function getNews(symbol) {
    const data = await yahoo("/v1/finance/search", {
      q: symbol,
      quotesCount: 0,
      newsCount: 6,
    });
    return (data?.news || []).slice(0, 6).map((n) => ({
      symbol,
      title: n.title,
      source: n.publisher,
      time: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toLocaleDateString() : "",
      tag: "Yahoo",
      url: n.link,
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
