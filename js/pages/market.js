/* =====================================================================
   Finora - Market page logic
   Browse hub (search, indices, trending) + stock detail view.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  var css = getComputedStyle(document.documentElement);
  function C(n) { return css.getPropertyValue(n).trim(); }

  var browseEl = document.getElementById("marketBrowse");
  var detailViewEl = document.getElementById("marketDetail");
  var detailEl = document.getElementById("stockDetail");
  var browseSearchEl = document.getElementById("browseSearch");
  var browseResultsEl = document.getElementById("browseSearchResults");
  var browseCountryEl = document.getElementById("browseCountry");
  var browseCountryResultsEl = document.getElementById("browseCountryResults");

  var MARKET_COUNTRIES = Finora.countries;

  var EXCHANGE_COUNTRY = {
    NASDAQ: "US",
    NYSE: "US",
    AMEX: "US",
    LSE: "GB",
    XETRA: "DE",
    TSX: "CA",
    ASX: "AU",
    EURONEXT: "FR",
    TSE: "JP",
    HKEX: "HK",
    NSE: "IN",
    SSE: "CN",
    KRX: "KR",
    SGX: "SG",
  };

  var params = new URLSearchParams(location.search);
  var activeSymbol = params.get("symbol") || null;
  var preferredCountry = await Finora.countryReady.catch(function() { return Finora.getMarketCountry(); });
  var activeCountryCode = params.get("country") || (!activeSymbol && preferredCountry ? preferredCountry.code : "");
  var activeMarketOptions = {
    exchange: params.get("exchange") || "",
    country: params.get("country") || "",
    name: params.get("name") || "",
    logoSymbol: params.get("logo") || "",
  };
  var searchTimer = null;
  var searchRun = 0;
  var countrySearchTimer = null;
  var countrySearchRun = 0;
  var detailRun = 0;
  var chartType = "line";
  var chartRange = "1M";

  if (activeSymbol) {
    showDetailView();
    initDetail(activeSymbol);
  } else {
    showBrowseView();
    initBrowse();
  }

  loadTicker();

  function showBrowseView() {
    browseEl.classList.remove("d-none");
    detailViewEl.classList.add("d-none");
  }

  function showDetailView() {
    browseEl.classList.add("d-none");
    detailViewEl.classList.remove("d-none");
  }

  function openDetail(stock) {
    if (typeof stock === "string") stock = { symbol: stock, country: activeCountryCode };
    activeSymbol = stock.symbol;
    activeMarketOptions = {
      exchange: stock.exchange || "",
      country: stock.country || activeCountryCode || "",
      name: stock.name || "",
      currency: stock.currency || "",
      logoSymbol: stock.logoSymbol || stock.symbol,
    };
    var nextParams = new URLSearchParams({ symbol: activeSymbol });
    Object.keys(activeMarketOptions).forEach(function(key) {
      if (activeMarketOptions[key]) nextParams.set(key === "logoSymbol" ? "logo" : key, activeMarketOptions[key]);
    });
    history.pushState(null, "", "market.html?" + nextParams.toString());
    showDetailView();
    initDetail(activeSymbol, activeMarketOptions);
  }

  /* ============================ Browse hub ========================= */
  function initBrowse() {
    if (activeCountryCode) {
      var initialCountry = findCountryByCode(activeCountryCode);
      if (initialCountry) browseCountryEl.value = countryLabel(initialCountry);
    }
    browseSearchEl.addEventListener("input", handleBrowseSearch);
    browseSearchEl.addEventListener("focus", handleBrowseSearch);
    browseCountryEl.addEventListener("input", handleCountrySearch);
    browseCountryEl.addEventListener("focus", handleCountrySearch);
    document.addEventListener("click", function(e) {
      if (!e.target.closest(".market-search-wrap")) {
        browseResultsEl.classList.add("d-none");
        browseCountryResultsEl.classList.add("d-none");
      }
    });
    loadIndices();
    loadTrending();
    loadMovers();
  }

  function findCountryByCode(code) {
    for (var i = 0; i < MARKET_COUNTRIES.length; i++) {
      if (MARKET_COUNTRIES[i].code === code) return MARKET_COUNTRIES[i];
    }
    return null;
  }

  function countryLabel(country) {
    return country.flag + " " + country.name;
  }

  function stockCountry(stock) {
    var country = Finora.findCountry(stock.country);
    if (country) return country.code;
    var exchange = (stock.exchange || "").toUpperCase();
    return EXCHANGE_COUNTRY[exchange] || "US";
  }

  function reloadBrowseData() {
    loadTrending();
    loadMovers();
  }

  function handleCountrySearch() {
    var q = browseCountryEl.value.trim().toLowerCase();
    clearTimeout(countrySearchTimer);

    var activeCountry = findCountryByCode(activeCountryCode);
    if (activeCountry && q === countryLabel(activeCountry).toLowerCase()) q = "";

    if (q.length === 1) {
      browseCountryResultsEl.classList.remove("d-none");
      browseCountryResultsEl.innerHTML = `<div class="text-muted-2 small p-3">Type at least 2 characters…</div>`;
      return;
    }

    var run = ++countrySearchRun;
    countrySearchTimer = setTimeout(function() {
      if (run !== countrySearchRun) return;

      var matches = MARKET_COUNTRIES.filter(function(country) {
        return country.name.toLowerCase().indexOf(q) !== -1 || country.code.toLowerCase().indexOf(q) === 0;
      });

      if (!matches.length) {
        browseCountryResultsEl.classList.remove("d-none");
        browseCountryResultsEl.innerHTML = `<div class="text-muted-2 small p-3">No matches found.</div>`;
        return;
      }

      browseCountryResultsEl.classList.remove("d-none");
      browseCountryResultsEl.innerHTML = `<button type="button" class="market-search-result" data-country="">
          <span class="market-country-flag" aria-hidden="true">🌐</span>
          <span class="fw-semibold text-white">Worldwide</span>
        </button>` + matches
        .map(function(country) {
          return `<button type="button" class="market-search-result" data-country="${country.code}">
              <span class="market-country-flag" aria-hidden="true">${country.flag}</span>
              <span class="min-w-0">
                <span class="d-block fw-semibold text-white text-truncate">${country.name}</span>
              </span>
            </button>`;
        })
        .join("");

      browseCountryResultsEl.querySelectorAll("[data-country]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var code = btn.getAttribute("data-country");
          var country = findCountryByCode(code);
          activeCountryCode = country ? code : "";
          browseCountryEl.value = country ? countryLabel(country) : "";
          browseCountryResultsEl.classList.add("d-none");
          if (country) Finora.setMarketCountry(country, false);
          reloadBrowseData();
          if (browseSearchEl.value.trim().length >= 2) handleBrowseSearch();
        });
      });
    }, 200);
  }

  async function loadTicker() {
    var tape = document.querySelector(".ticker-tape");
    var track = document.getElementById("tickerTrack");
    if (!track || !tape) return;
    try {
      var stocks = await FinoraAPI.getTrending();
      if (!stocks.length) { tape.classList.add("d-none"); return; }
      if (stocks.every(function(s) { return s.price == null; })) { tape.classList.add("d-none"); return; }
      function item(s) {
        var up = s.change >= 0;
        return `<span class="ticker-item">
            <span class="sym">${s.symbol}</span>
            <span>${Finora.fmtMoney(s.price)}</span>
            <span class="${up ? "text-bull" : "text-bear"}">
              <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i>${Math.abs(s.change).toFixed(2)}%
            </span>
          </span>`;
      }
      track.innerHTML = stocks.map(item).join("").repeat(2);
    } catch (err) {
      tape.classList.add("d-none");
    }
  }

  function handleBrowseSearch() {
    var q = browseSearchEl.value.trim().toLowerCase();
    clearTimeout(searchTimer);

    if (!q) {
      browseResultsEl.classList.add("d-none");
      browseResultsEl.innerHTML = "";
      return;
    }

    if (q.length < 2) {
      browseResultsEl.classList.remove("d-none");
      browseResultsEl.innerHTML = `<div class="text-muted-2 small p-3">Type at least 2 characters…</div>`;
      return;
    }

    var run = ++searchRun;
    browseResultsEl.classList.remove("d-none");
    browseResultsEl.innerHTML = `<div class="text-muted-2 small p-3"><span class="spinner-border spinner-border-sm me-2"></span>Searching…</div>`;

    searchTimer = setTimeout(async function() {
      var local = [];
      try {
        var trending = await FinoraAPI.getTrending();
        local = trending.filter(function(c) {
          var textMatch = c.symbol.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q);
          return textMatch && (!activeCountryCode || stockCountry(c) === activeCountryCode);
        });
      } catch (err) {
        local = [];
      }

      var results = local;
      try {
        var remote = await FinoraAPI.searchCompanies(q, 12, activeCountryCode);
        if (run !== searchRun) return;
        results = mergeCompanies(local, remote);
      } catch (err) {
        if (run !== searchRun) return;
        results = local;
      }

      if (!results.length) {
        browseResultsEl.innerHTML = `<div class="text-muted-2 small p-3">No matches found.</div>`;
        return;
      }

      browseResultsEl.innerHTML = results
        .map(function(c, index) {
          return `<button type="button" class="market-search-result" data-pick="${index}">
              ${Finora.tickerAvatar(c.symbol, { size: "sm", color: c.color, logoSymbol: c.logoSymbol })}
              <span class="min-w-0">
                <span class="d-block fw-semibold text-white text-truncate">${c.symbol}</span>
                <span class="d-block text-muted-2 small text-truncate">${c.name || ""}${c.exchange ? " · " + c.exchange : ""}${c.country ? " · " + c.country : ""}</span>
              </span>
            </button>`;
        })
        .join("");

      browseResultsEl.querySelectorAll("[data-pick]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          browseSearchEl.value = "";
          browseResultsEl.classList.add("d-none");
          openDetail(results[Number(btn.getAttribute("data-pick"))]);
        });
      });
    }, 350);
  }

  async function loadIndices() {
    var row = document.getElementById("indicesRow");
    if (!row) return;
    try {
      var indices = await FinoraAPI.getIndices();
      if (!indices.length) { row.innerHTML = `<div class="col-12">${Finora.apiUnavailableState()}</div>`; return; }
      row.innerHTML = indices
        .map(function(idx, i) {
          var up = idx.change >= 0;
          return `<div class="col-6 col-lg-3">
              <div class="card-finora p-3 h-100">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted-2 small fw-semibold">${idx.name}</span>
                  <span class="badge ${up ? "badge-bull" : "badge-bear"}">
                    <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${Math.abs(idx.change).toFixed(2)}%
                  </span>
                </div>
                <div class="fs-4 fw-bold mb-2">${Finora.fmtNumber(idx.value)}</div>
                ${idx.history ? `<canvas id="idxChart${i}" height="48"></canvas>` : ""}
              </div>
            </div>`;
        })
        .join("");
      indices.forEach(function(idx, i) {
        if (idx.history) {
          FinoraChart.sparkline(document.getElementById("idxChart" + i), idx.history, idx.change >= 0 ? C("--bull") : C("--bear"));
        }
      });
    } catch (err) {
      row.innerHTML = `<div class="col-12">${Finora.apiUnavailableState()}</div>`;
    }
  }

  async function loadTrending() {
    var body = document.getElementById("trendingBody");
    var title = document.getElementById("trendingTitle");
    if (!body) return;
    var selectedCountry = findCountryByCode(activeCountryCode);
    if (title) title.textContent = selectedCountry ? "Stocks in " + selectedCountry.name : "Trending stocks";
    try {
      var stocks = await FinoraAPI.getTrending(activeCountryCode);
      if (!stocks.length) { body.innerHTML = Finora.emptyRow(6, activeCountryCode ? "No trending stocks for this market." : Finora.API_UNAVAILABLE_MSG); return; }
      body.innerHTML = stocks
        .map(function(s, i) {
          var hasQuote = Number.isFinite(s.price) && Number.isFinite(s.change);
          var up = hasQuote && s.change >= 0;
          return `<tr class="${hasQuote ? "trending-row" : ""}"${hasQuote ? ` data-symbol="${s.symbol}" data-stock-index="${i}"` : ""}>
              <td>
                <div class="d-flex align-items-center gap-3">
                  ${Finora.tickerAvatar(s.symbol, { color: s.color, logoSymbol: s.logoSymbol })}
                  <div>
                    <div class="fw-bold text-white">${s.symbol}</div>
                    <div class="text-muted-2 small">${s.name || ""}${s.exchange ? " · " + s.exchange : ""}</div>
                  </div>
                </div>
              </td>
              <td class="text-end fw-semibold text-white">${hasQuote ? Finora.fmtMoney(s.price, s.currency) : "—"}</td>
              <td class="text-end">
                ${hasQuote ? `<span class="badge ${up ? "badge-bull" : "badge-bear"}">
                  <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${Math.abs(s.change).toFixed(2)}%
                </span>` : `<span class="text-muted-2 small">Quote unavailable</span>`}
              </td>
              <td class="text-end d-none d-md-table-cell">${s.cap ? "$" + s.cap : "—"}</td>
              <td class="text-end d-none d-lg-table-cell" style="width:130px">
                ${s.history && s.history.length ? `<canvas id="rowChart${i}" height="36" width="120"></canvas>` : "—"}
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-brand" ${hasQuote ? `data-trade="${s.symbol}" data-stock-index="${i}"` : "disabled title=\"Live quote unavailable on the current market-data plan\""}>${hasQuote ? "Trade" : "Listed"}</button>
              </td>
            </tr>`;
        })
        .join("");

      stocks.forEach(function(s, i) {
        if (s.history && s.history.length) {
          FinoraChart.sparkline(document.getElementById("rowChart" + i), s.history, s.change >= 0 ? C("--bull") : C("--bear"), { responsive: false });
        }
      });

      body.querySelectorAll(".trending-row").forEach(function(row) {
        row.addEventListener("click", function(e) {
          if (e.target.closest("[data-trade]")) return;
          openDetail(stocks[Number(row.getAttribute("data-stock-index"))]);
        });
      });

      body.querySelectorAll("[data-trade]").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          openDetail(stocks[Number(btn.getAttribute("data-stock-index"))]);
        });
      });
    } catch (err) {
      body.innerHTML = Finora.emptyRow(6, Finora.API_UNAVAILABLE_MSG);
    }
  }

  async function loadMovers() {
    var country = activeCountryCode || "";
    loadMoverColumn("gainersList", true, function(limit) { return FinoraAPI.getGainers(limit, country); });
    loadMoverColumn("losersList", false, function(limit) { return FinoraAPI.getLosers(limit, country); });
  }

  function renderMoverItem(stock, isGainer) {
    var sign = isGainer ? "+" : "";
    return `<button type="button" class="market-mover-item" data-symbol="${stock.symbol}">
        ${Finora.tickerAvatar(stock.symbol, { size: "sm" })}
        <span class="flex-grow-1 min-w-0 text-start">
          <span class="d-block text-white text-truncate fw-medium">${stock.name}</span>
          <span class="market-mover-ticker">${stock.symbol}</span>
        </span>
        <span class="market-mover-price text-end">
          <span class="d-block fw-semibold text-white">${Finora.fmtMoney(stock.price)}</span>
          <span class="d-block text-muted-2 small">USD</span>
        </span>
        <span class="market-mover-change ${isGainer ? "bull" : "bear"}">${sign}${stock.change.toFixed(2)}%</span>
      </button>`;
  }

  async function loadMoverColumn(elementId, isGainer, fetchFn) {
    var wrap = document.getElementById(elementId);
    if (!wrap) return;
    wrap.innerHTML = `<div class="text-muted-2 small p-4">Loading…</div>`;
    try {
      var stocks = await fetchFn(6);
      if (!stocks.length) {
        wrap.innerHTML = `<div class="text-muted-2 small p-4">${Finora.API_UNAVAILABLE_MSG}</div>`;
        return;
      }
      wrap.innerHTML = stocks.map(function(s) { return renderMoverItem(s, isGainer); }).join("");
      wrap.querySelectorAll("[data-symbol]").forEach(function(btn, index) {
        btn.addEventListener("click", function() {
          openDetail(Object.assign({}, stocks[index], { country: stocks[index].country || activeCountryCode }));
        });
      });
    } catch (err) {
      wrap.innerHTML = `<div class="text-muted-2 small p-4">${Finora.API_UNAVAILABLE_MSG}</div>`;
    }
  }

  /* ============================ Detail view ======================== */
  function initDetail(symbol, options) {
    activeSymbol = symbol;
    activeMarketOptions = options || activeMarketOptions || {};
    loadDetail(symbol, activeMarketOptions);
  }

  function mergeCompanies(primary, secondary) {
    var seen = {};
    var result = [];
    var combined = primary.concat(secondary);
    combined.forEach(function(item) {
      var key = item && [item.symbol, item.exchange, item.country].join(":");
      if (item && item.symbol && !seen[key]) {
        seen[key] = true;
        result.push(item);
      }
    });
    return result;
  }

  async function loadDetail(symbol, options) {
    var run = ++detailRun;
    detailEl.innerHTML = Finora.emptyState("Loading " + symbol.toUpperCase() + "...", "bi-hourglass-split");
    var s;
    try {
      s = await FinoraAPI.getStock(symbol, options);
    } catch (err) {
      s = null;
    }
    if (run !== detailRun) return;
    if (!s) {
      detailEl.innerHTML = FinoraAPI.isConfigured()
        ? Finora.apiUnavailableState()
        : marketConfigState();
      return;
    }
    activeSymbol = s.symbol;
    renderDetail(s);
  }

  function marketConfigState() {
    return `<div class="text-center text-muted-2 py-5">
        <i class="bi bi-key d-block mb-2" style="font-size:1.9rem;opacity:.55"></i>
        <div class="fw-semibold text-white mb-1">Market data is not configured</div>
        <div>Add <code>FINNHUB_API_KEY</code> and <code>TWELVE_DATA_API_KEY</code> in the Vercel project's Environment Variables.</div>
      </div>`;
  }

  function renderDetail(s) {
    var up = s.change >= 0;
    detailEl.innerHTML = `
      <div class="card-finora p-4 mb-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div class="d-flex align-items-center gap-3">
            ${Finora.tickerAvatar(s.symbol, { size: "lg", color: s.color, logoSymbol: activeMarketOptions.logoSymbol })}
            <div>
              <h4 class="fw-bold mb-0">${s.name}</h4>
              <div class="text-muted-2 small">${s.exchange || ""} - ${s.symbol}${s.sector ? " - " + s.sector : ""}</div>
            </div>
          </div>
          <div class="text-end">
            <div class="fs-3 fw-bold">${Finora.fmtMoney(s.price)}</div>
            <span class="badge ${up ? "badge-bull" : "badge-bear"}">
              <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${up ? "+" : ""}${s.change.toFixed(2)}%
            </span>
          </div>
        </div>

        <div class="d-flex gap-2 mt-3 flex-wrap">
          <button class="btn btn-brand" data-action="buy">Buy</button>
          <button class="btn btn-outline-brand" data-action="sell">Sell</button>
          <button class="btn btn-ghost" data-action="toggle-watchlist"><i class="bi bi-star me-1"></i>Watchlist</button>
        </div>
      </div>

      <div class="card-finora p-4 mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <h6 class="fw-bold mb-0">Price chart</h6>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <div class="chart-type-toggle" id="chartTypeToggle" role="group" aria-label="Chart type">
              <button type="button" class="chart-type-btn ${chartType === "line" ? "active" : ""}" data-chart-type="line" title="Line chart" aria-pressed="${chartType === "line"}">
                <i class="bi bi-graph-up"></i>
              </button>
              <button type="button" class="chart-type-btn ${chartType === "candle" ? "active" : ""}" data-chart-type="candle" title="Candlestick chart" aria-pressed="${chartType === "candle"}">
                <i class="bi bi-bar-chart-line"></i>
              </button>
            </div>
            <div class="btn-group btn-group-sm" id="rangeBtns">
              ${["1D", "1W", "1M", "1Y"].map(function(r) { return `<button class="btn btn-ghost ${r === chartRange ? "active" : ""}" data-range="${r}">${r}</button>`; }).join("")}
            </div>
          </div>
        </div>
        <div id="chartWrap"><canvas id="stockChart"></canvas></div>
      </div>

      <div class="row g-4">
        <div class="col-lg-7">
          <div class="card-finora p-4 h-100">
            <h6 class="fw-bold mb-3">Key information</h6>
            <div class="row g-3" id="keyInfo"></div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card-finora p-4 h-100">
            <h6 class="fw-bold mb-3">About</h6>
            <p class="text-muted-2 mb-0">${s.about || "No company description available."}</p>
          </div>
        </div>
      </div>

      <div class="card-finora p-4 mt-4">
        <h6 class="fw-bold mb-3">Historical prices</h6>
        <div class="table-responsive">
          <table class="table table-finora align-middle mb-0">
            <thead><tr><th>Date</th><th class="text-end">Close</th><th class="text-end d-none d-md-table-cell">Change</th></tr></thead>
            <tbody id="historyBody"></tbody>
          </table>
        </div>
      </div>

      <div class="card-finora p-4 mt-4">
        <h6 class="fw-bold mb-3">Latest news</h6>
        <div id="newsList" class="d-grid gap-3"></div>
      </div>
    `;

    renderKeyInfo(s);
    bindActions(s);
    chartRange = "1M";
    drawChart(s.symbol, chartRange);
    loadHistory(s.symbol);
    loadNews(s.symbol);

    detailEl.querySelectorAll("#rangeBtns [data-range]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        detailEl.querySelectorAll("#rangeBtns .btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        chartRange = btn.dataset.range;
        drawChart(s.symbol, chartRange);
      });
    });

    detailEl.querySelectorAll("#chartTypeToggle [data-chart-type]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        chartType = btn.dataset.chartType;
        detailEl.querySelectorAll("#chartTypeToggle .chart-type-btn").forEach(function(b) {
          var active = b.dataset.chartType === chartType;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
        drawChart(s.symbol, chartRange);
      });
    });
  }

  function renderKeyInfo(s) {
    var rows = [
      ["Open", s.open], ["Prev close", s.prevClose],
      ["Day high", s.high], ["Day low", s.low],
      ["52w high", s.high52], ["52w low", s.low52],
      ["Volume", s.volume], ["Avg volume", s.avgVol],
      ["Market cap", s.cap ? "$" + s.cap : null], ["P/E", s.pe],
      ["EPS", s.eps], ["Div yield", s.divYield != null ? s.divYield + "%" : null],
      ["Beta", s.beta],
    ];
    document.getElementById("keyInfo").innerHTML = rows
      .map(function(row) {
        var k = row[0];
        var v = row[1];
        return `<div class="col-6">
          <div class="text-muted-2 small">${k}</div>
          <div class="fw-semibold">${v != null ? v : "--"}</div>
        </div>`;
      })
      .join("");
  }

  async function drawChart(symbol, range) {
    var wrap = document.getElementById("chartWrap");
    if (!wrap) return;

    chartRange = range;

    var ohlc = [];
    try {
      ohlc = await FinoraAPI.getOHLC(symbol, range, activeMarketOptions);
    } catch (err) {
      wrap.innerHTML = Finora.apiUnavailableState("bi-graph-up");
      return;
    }
    if (!ohlc.length) {
      wrap.innerHTML = Finora.apiUnavailableState("bi-graph-up");
      return;
    }

    wrap.innerHTML = `<canvas id="stockChart"></canvas>`;
    FinoraChart.stockChart(
      document.getElementById("stockChart"),
      {
        mode: chartType,
        ohlc: ohlc,
        closes: ohlc.map(function(b) { return b.close; }),
      },
      {
        bull: C("--bull"),
        bear: C("--bear"),
        formatY: function(v) { return "$" + Number(v).toFixed(2); },
        formatTooltip: function(v) { return Finora.fmtMoney(v); },
      }
    );
  }

  async function loadHistory(symbol) {
    var body = document.getElementById("historyBody");
    var data = [];
    try {
      data = await FinoraAPI.getHistory(symbol, "1M", activeMarketOptions);
    } catch (err) {
      body.innerHTML = Finora.emptyRow(3, Finora.API_UNAVAILABLE_MSG);
      return;
    }
    if (!data.length) { body.innerHTML = Finora.emptyRow(3, Finora.API_UNAVAILABLE_MSG); return; }
    var today = new Date();
    var rows = data.slice(-10).reverse();
    body.innerHTML = rows
      .map(function(close, i) {
        var d = new Date(today);
        d.setDate(today.getDate() - i);
        var prev = rows[i + 1];
        var chg = prev != null ? ((close - prev) / prev) * 100 : 0;
        var up = chg >= 0;
        return `<tr>
            <td class="text-muted-2">${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
            <td class="text-end fw-semibold">${Finora.fmtMoney(close)}</td>
            <td class="text-end d-none d-md-table-cell ${up ? "text-bull" : "text-bear"}">${up ? "+" : ""}${chg.toFixed(2)}%</td>
          </tr>`;
      })
      .join("");
  }

  async function loadNews(symbol) {
    var wrap = document.getElementById("newsList");
    var news = [];
    try {
      news = await FinoraAPI.getNews(symbol);
    } catch (err) {
      wrap.innerHTML = Finora.apiUnavailableState("bi-newspaper");
      return;
    }
    if (!news.length) { wrap.innerHTML = Finora.emptyState("No news available", "bi-newspaper"); return; }
    wrap.innerHTML = news
      .map(function(n) {
        return `<a href="${n.url || "#"}" class="news-item d-flex gap-3 text-decoration-none" target="_blank" rel="noopener">
          <div class="news-tag">${n.tag || "News"}</div>
          <div class="min-w-0">
            <div class="fw-semibold text-white text-truncate">${n.title}</div>
            <div class="text-muted-2 small text-truncate">${n.source || ""}${n.time ? " - " + n.time : ""}</div>
          </div>
        </a>`;
      })
      .join("");
  }

  function updateWatchButton(btn, inList) {
    if (inList) {
      btn.innerHTML = '<i class="bi bi-star-fill me-1"></i>In watchlist';
      btn.classList.add("active");
    } else {
      btn.innerHTML = '<i class="bi bi-star me-1"></i>Watchlist';
      btn.classList.remove("active");
    }
  }

  function syncWatchButton(symbol) {
    var profile = Finora.getProfile();
    if (!profile) return;
    var watchBtn = detailEl.querySelector('[data-action="toggle-watchlist"]');
    if (watchBtn) updateWatchButton(watchBtn, Finora.isInWatchlist(profile.uid, symbol));
  }

  function bindActions(s) {
    var profile = Finora.getProfile();
    detailEl.querySelectorAll("[data-action]").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        var action = e.currentTarget.getAttribute("data-action");

        if (action === "toggle-watchlist") {
          var added = Finora.toggleWatchlist(profile.uid, s.symbol, s.name);
          updateWatchButton(e.currentTarget, added);
          Finora.toast(
            added ? s.symbol + " added to your watchlist." : s.symbol + " removed from your watchlist.",
            added ? "success" : "info"
          );
          return;
        }
      });
    });
    syncWatchButton(s.symbol);
  }

  window.addEventListener("popstate", function() {
    var popped = new URLSearchParams(location.search);
    var sym = popped.get("symbol");
    if (sym) {
      activeSymbol = sym;
      activeMarketOptions = {
        exchange: popped.get("exchange") || "",
        country: popped.get("country") || "",
        name: popped.get("name") || "",
        logoSymbol: popped.get("logo") || "",
      };
      showDetailView();
      initDetail(sym, activeMarketOptions);
    } else {
      showBrowseView();
    }
  });
});
