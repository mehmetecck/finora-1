/* =====================================================================
   Finora - Market page logic
   Browse hub (search, indices, trending) + stock detail view.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  await Finora.authReady; // Wait for auth state to be resolved
  var css = getComputedStyle(document.documentElement);
  function C(n) { return css.getPropertyValue(n).trim(); }

  var browseEl = document.getElementById("marketBrowse");
  var detailViewEl = document.getElementById("marketDetail");
  var detailEl = document.getElementById("stockDetail");
  var browseSearchEl = document.getElementById("browseSearch");
  var browseResultsEl = document.getElementById("browseSearchResults");
  var browseCountryEl = document.getElementById("browseCountry");
  var browseCountryResultsEl = document.getElementById("browseCountryResults");

  var MARKET_COUNTRIES = [];

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
  var activeCountryCode = "";
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


  function showBrowseView() {
    browseEl.classList.remove("d-none");
    detailViewEl.classList.add("d-none");
  }

  function showDetailView() {
    browseEl.classList.add("d-none");
    detailViewEl.classList.remove("d-none");
  }

  function openDetail(symbol) {
    activeSymbol = symbol;
    history.pushState(null, "", "market.html?symbol=" + symbol);
    showDetailView();
    initDetail(symbol);
  }

  /* ============================ Browse hub ========================= */
  async function initBrowse() {
    // Fetch countries from an API instead of hardcoding them.

    // Inject a placeholder for warnings about API fallbacks.
    const searchContainer = document.querySelector(".market-search-container");
    if (searchContainer) {
      const warningPlaceholder = document.createElement("div");
      warningPlaceholder.id = "marketWarning";
      searchContainer.before(warningPlaceholder);
    }

    await loadMarketCountries();

    // Set the default country from the user's profile, if available.
    const profile = Finora.getProfile();
    console.log("Country from profile:", profile ? profile.country : "No profile or country");
    if (profile && profile.country) {
      const userCountry = findCountry(profile.country);
      if (userCountry) {
        activeCountryCode = userCountry.code;
        browseCountryEl.value = countryLabel(userCountry);
      } else {
        // If the profile country is invalid or not in our list, default to Worldwide.
        console.warn(`Profile country "${profile.country}" not found in market list. Defaulting to Worldwide.`);
        activeCountryCode = "";
        browseCountryEl.value = profile.country;
      }
    } else {
      // Default to Worldwide if no country is set in profile.
      activeCountryCode = "";
      browseCountryEl.value = "🌐 Worldwide";
    }
    console.log("Active country code:", activeCountryCode);

    browseSearchEl.addEventListener("input", handleBrowseSearch);
    browseSearchEl.addEventListener("focus", handleBrowseSearch);
    browseCountryEl.addEventListener("input", handleCountrySearch);
    browseCountryEl.addEventListener("focus", function() { // On focus, select the text and show the search results.
      this.select();
      // Also trigger the search immediately to show the dropdown.
      handleCountrySearch();
    });
    document.addEventListener("click", function(e) {
      if (!e.target.closest(".market-search-wrap")) {
        browseResultsEl.classList.add("d-none");
        browseCountryResultsEl.classList.add("d-none");
      }
    });
    loadIndices();
    console.log("Fetching market data for country:", activeCountryCode || "Worldwide");
    loadTrending();
    loadMovers();
    loadTicker();
  }

  /**
   * Fetches a list of countries from a public API to populate the country filter.
   */
  async function loadMarketCountries() {
    // Start with our special "Worldwide" option.
    MARKET_COUNTRIES = [{ code: "WW", name: "Worldwide", flag: "🌐" }];
    try {
      const response = await fetch("https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/index.json");
      const data = await response.json();
      const countries = data
        .map(c => ({
          code: c.code,
          name: c.name,
          flag: c.emoji
        }))
      .sort((a, b) => a.name.localeCompare(b.name));
      MARKET_COUNTRIES.push(...countries);
    } catch (error) {
      console.error("Failed to load country list:", error);
      // The app will still work with just the "Worldwide" option.
    }
  }

  function findCountry(value) {
    if (!value) return null;
    const trimmedValue = value.trim();
    // First, try to match by code (the ideal case, e.g., "DE").
    for (var i = 0; i < MARKET_COUNTRIES.length; i++) {
      if (MARKET_COUNTRIES[i].code.toLowerCase() === trimmedValue.toLowerCase()) return MARKET_COUNTRIES[i];
    }
    // Fallback: try to match by name (for legacy/bad data, e.g., "Germany").
    const valueAsName = trimmedValue.toLowerCase();
    for (var i = 0; i < MARKET_COUNTRIES.length; i++) {
      if (MARKET_COUNTRIES[i].name.toLowerCase() === valueAsName) return MARKET_COUNTRIES[i];
    }
    return null;
  }

  function countryLabel(country) {
    return country.flag + " " + country.name;
  }

  function stockCountry(stock) {
    var exchange = (stock.exchange || "").toUpperCase();
    if (EXCHANGE_COUNTRY[exchange]) {
      return EXCHANGE_COUNTRY[exchange];
    }

    // Fallback for symbols from search results that include a country suffix.
    const symbol = (stock.symbol || "").toUpperCase();
    const parts = symbol.split('.');
    if (parts.length > 1) {
      const suffix = parts[parts.length - 1];
      // This is a simplified mapping. A real-world app might need a more
      // comprehensive map of exchange suffixes to country codes.
      const suffixToCountry = {
        DE: "DE", // Germany (.DE)
        L: "GB",  // London (.L)
        PA: "FR", // Paris (.PA)
        AS: "NL", // Amsterdam (.AS)
        TO: "CA", // Toronto (.TO)
        AX: "AU", // Australia (.AX)
      };
      if (suffixToCountry[suffix]) return suffixToCountry[suffix];
    }

    return null;
  }

  function reloadBrowseData() {
    // Clear any previous fallback warnings.
    const warningEl = document.getElementById("marketWarning");
    if (warningEl) warningEl.innerHTML = "";

    console.log("Reloading market data for country:", activeCountryCode || "Worldwide");
    loadTrending();
    loadMovers();
    loadTicker();
  }

  function handleCountrySearch() {
    const rawValue = browseCountryEl.value.trim();
    const lowerRawValue = rawValue.toLowerCase();
    clearTimeout(countrySearchTimer);

    // When the input is cleared, reset to Worldwide view.
    if (!rawValue) {
      browseCountryResultsEl.classList.add("d-none");
      browseCountryResultsEl.innerHTML = "";
      if (activeCountryCode !== "") {
        activeCountryCode = "";
        browseCountryEl.value = "🌐 Worldwide";
        reloadBrowseData();
      }
      return;
    }

    // For searching, remove the flag from the query string.
    // This allows users to type in the input even when a country is already selected.
    const q = rawValue.replace(/^\p{Emoji_Presentation}\s*/u, "").toLowerCase();

    // Don't search if the input already says "Worldwide".
    // We check the original value here before it was cleaned.
    if (lowerRawValue === "🌐 worldwide") {
      browseCountryResultsEl.classList.add("d-none");
      return;
    }

    if (q.length < 2) {
      browseCountryResultsEl.classList.remove("d-none");
      browseCountryResultsEl.innerHTML = `<div class="text-muted-2 small p-3">Type at least 2 characters…</div>`;
      return;
    }

    var run = ++countrySearchRun;
    countrySearchTimer = setTimeout(function() {
      if (run !== countrySearchRun) return;

      var matches = MARKET_COUNTRIES.filter(function(country) {
        return country.name.toLowerCase().includes(q) || country.code.toLowerCase().startsWith(q);
      });

      if (!matches.length) {
        browseCountryResultsEl.classList.remove("d-none");
        browseCountryResultsEl.innerHTML = `<div class="text-muted-2 small p-3">No matches found.</div>`;
        return;
      }

      browseCountryResultsEl.classList.remove("d-none");
      browseCountryResultsEl.innerHTML = matches
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
          var country = findCountry(code);
          if (!country) return;

          // "WW" is the special code for our Worldwide option.
          if (code === "WW") {
            activeCountryCode = "";
          } else {
            activeCountryCode = code;
          }

          browseCountryEl.value = countryLabel(country);
          browseCountryResultsEl.classList.add("d-none");
          reloadBrowseData();
        });
      });
    }, 200);
  }

  async function loadTicker() {
    var tape = document.querySelector(".ticker-tape");
    var track = document.getElementById("tickerTrack");
    if (!track || !tape) return;
    try {
      // getTrending now returns an object { data, fallback }
      var result = await FinoraAPI.getTrending(activeCountryCode || "");
      var stocks = result.data;

      if (!stocks || !stocks.length) { tape.classList.add("d-none"); return; }
      tape.classList.remove("d-none");
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
        // getTrending returns an object { data, fallback }, so we need the data property.
        var trendingResult = await FinoraAPI.getTrending();
        local = (trendingResult.data || []).filter(function(c) {
          return c.symbol.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q);
        });
      } catch (err) {
        local = [];
      }

      var results = local;
      try {
        var remote = await FinoraAPI.searchCompanies(q, 8);
        if (run !== searchRun) return;
        results = mergeCompanies(local, remote);
      } catch (err) {
        if (run !== searchRun) return;
        results = local;
      }

      if (activeCountryCode) {
        results = results.filter(function(c) { return stockCountry(c) === activeCountryCode; });
      }

      if (!results.length) {
        browseResultsEl.innerHTML = `<div class="text-muted-2 small p-3">No matches found.</div>`;
        return;
      }

      browseResultsEl.innerHTML = results
        .map(function(c) {
          return `<button type="button" class="market-search-result" data-pick="${c.symbol}">
              ${Finora.tickerAvatar(c, { size: "sm" })}
              <span class="min-w-0">
                <span class="d-block fw-semibold text-white text-truncate">${c.symbol}</span>
                <span class="d-block text-muted-2 small text-truncate">${c.name || ""}</span>
              </span>
            </button>`;
        })
        .join("");

      browseResultsEl.querySelectorAll("[data-pick]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          browseSearchEl.value = "";
          browseResultsEl.classList.add("d-none");
          openDetail(btn.getAttribute("data-pick"));
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
    if (!body) return;
    try {
      // Use top gainers as the source for the "trending" table, as this API call
      // is already country-aware. This fixes the country filter functionality.
      var result = await FinoraAPI.getGainers(10, activeCountryCode || "");
      var stocks = result.data;

      // If the API call for a specific country failed and we fell back to the
      // worldwide list, show an informative message to the user.
      const warningEl = document.getElementById("marketWarning");
      if (warningEl && result.fallback && activeCountryCode) {
        const countryName = (findCountry(activeCountryCode) || { name: activeCountryCode }).name;
        if (stocks && stocks.length > 0) {
          // If we fell back AND we have stocks, it means we're showing the US default list.
          warningEl.innerHTML = `<div class="alert alert-warning small mb-3">
            <i class="bi bi-exclamation-triangle me-2"></i>Could not load market data for <strong>${countryName}</strong>. Showing worldwide stocks instead. This may be due to API plan limitations.
          </div>`;
        } else {
          // If we fell back and have NO stocks, it means the API failed for a non-US country.
          warningEl.innerHTML = `<div class="alert alert-warning small mb-3">
            <i class="bi bi-exclamation-triangle me-2"></i>Could not load market data for <strong>${countryName}</strong>. This may be due to API plan limitations.
          </div>`;
        }
      }

      if (!stocks || !stocks.length) {
        const countryName = activeCountryCode ? (findCountry(activeCountryCode) || { name: activeCountryCode }).name : "";
        let message = Finora.API_UNAVAILABLE_MSG;
        if (activeCountryCode) {
          if (result.fallback) {
            message = `Stock info from ${countryName} is unavailable.`;
          } else {
            message = `No trending stocks found for this market.`;
          }
        }
        body.innerHTML = Finora.emptyRow(6, message);
        return;
      }
      body.innerHTML = stocks
        .map(function(s, i) {
          var up = s.change >= 0;
          return `<tr class="trending-row" data-symbol="${s.symbol}">
              <td>
                <div class="d-flex align-items-center gap-3">
                  ${Finora.tickerAvatar(s)}
                  <div>
                    <div class="fw-bold text-white">${s.symbol}</div>
                    <div class="text-muted-2 small">${s.name || ""}</div>
                  </div>
                </div>
              </td>
              <td class="text-end fw-semibold text-white">${Finora.fmtMoney(s.price)}</td>
              <td class="text-end">
                <span class="badge ${up ? "badge-bull" : "badge-bear"}">
                  <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${Math.abs(s.change).toFixed(2)}%
                </span>
              </td>
              <td class="text-end d-none d-md-table-cell">${s.cap ? "$" + s.cap : "—"}</td>
              <td class="text-end d-none d-lg-table-cell" style="width:130px">
                ${s.history ? `<canvas id="rowChart${i}" height="36" width="120"></canvas>` : "—"}
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-brand" data-trade="${s.symbol}">Trade</button>
              </td>
            </tr>`;
        })
        .join("");

      stocks.forEach(function(s, i) {
        if (s.history) {
          FinoraChart.sparkline(document.getElementById("rowChart" + i), s.history, s.change >= 0 ? C("--bull") : C("--bear"), { responsive: false });
        }
      });

      body.querySelectorAll(".trending-row").forEach(function(row) {
        row.addEventListener("click", function(e) {
          if (e.target.closest("[data-trade]")) return;
          openDetail(row.getAttribute("data-symbol"));
        });
      });

      body.querySelectorAll("[data-trade]").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          openDetail(btn.getAttribute("data-trade"));
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
        ${Finora.tickerAvatar(stock, { size: "sm" })}
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
      var result = await fetchFn(6);
      var stocks = result.data;

      if (!stocks || !stocks.length) {
        const countryName = activeCountryCode ? (findCountry(activeCountryCode) || { name: activeCountryCode }).name : "";
        let message = `No ${isGainer ? "gainers" : "losers"} found.`;
        if (activeCountryCode) {
          if (result.fallback) {
            message = `Data for ${countryName} is unavailable.`;
          } else {
            message = `No ${isGainer ? "gainers" : "losers"} found for this market.`;
          }
        }
        wrap.innerHTML = `<div class="text-muted-2 small p-4">${message}</div>`;
        return;
      }
      wrap.innerHTML = stocks.map(function(s) { return renderMoverItem(s, isGainer); }).join("");
      wrap.querySelectorAll("[data-symbol]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          openDetail(btn.getAttribute("data-symbol"));
        });
      });
    } catch (err) {
      wrap.innerHTML = `<div class="text-muted-2 small p-4">${Finora.API_UNAVAILABLE_MSG}</div>`;
    }
  }

  /* ============================ Detail view ======================== */
  function initDetail(symbol) {
    activeSymbol = symbol;
    loadDetail(symbol);
  }

  function mergeCompanies(primary, secondary) {
    var seen = {};
    var result = [];
    var combined = primary.concat(secondary);
    combined.forEach(function(item) {
      if (item && item.symbol && !seen[item.symbol]) {
        seen[item.symbol] = true;
        result.push(item);
      }
    });
    return result;
  }

  async function loadDetail(symbol) {
    var run = ++detailRun;
    detailEl.innerHTML = Finora.emptyState("Loading " + symbol.toUpperCase() + "...", "bi-hourglass-split");
    var s;
    try {
      s = await FinoraAPI.getStock(symbol);
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
        <div class="fw-semibold text-white mb-1">Real market data needs an API key</div>
        <div>Add Finnhub and Twelve Data keys in <code>js/core/api.js</code> to enable quotes, news, charts, and history.</div>
      </div>`;
  }

  function renderDetail(s) {
    var up = s.change >= 0;
    detailEl.innerHTML = `
      <div class="card-finora p-4 mb-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div class="d-flex align-items-center gap-3">
            ${Finora.tickerAvatar(s, { size: "lg" })}
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
    loadNews(s);

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
      ohlc = await FinoraAPI.getOHLC(symbol, range);
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
      data = await FinoraAPI.getHistory(symbol, "1M");
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

  async function loadNews(stock) {
    var wrap = document.getElementById("newsList");
    var news = [];
    try {
      news = await FinoraAPI.getNews(stock.symbol);
    } catch (err) {
      wrap.innerHTML = Finora.apiUnavailableState("bi-newspaper");
      return;
    }
    if (!news.length) { wrap.innerHTML = Finora.emptyState("No news available", "bi-newspaper"); return; }
    wrap.innerHTML = news
      .map(function(n) {
        const newsSource = {
          website: n.url ? new URL(n.url).hostname : null,
          // Use the source name for the avatar fallback text.
          symbol: Finora.initials(n.source),
        };
        return `<a href="${n.url || "#"}" class="news-item d-flex gap-3 text-decoration-none" target="_blank" rel="noopener">
          ${Finora.tickerAvatar(newsSource, { size: "sm" })}
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

  window.addEventListener("popstate", async function() {
    var sym = new URLSearchParams(location.search).get("symbol");
    if (sym) {
      activeSymbol = sym;
      showDetailView();
      await initDetail(sym);
    } else {
      showBrowseView();
      // When returning to the browse view, we should ensure the data is fresh.
      reloadBrowseData();
    }
  });
});
