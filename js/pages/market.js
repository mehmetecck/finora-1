/* =====================================================================
   Finora - Market page logic
   Company list + detailed stock view, powered by FinoraAPI.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", function() {
  var css = getComputedStyle(document.documentElement);
  function C(n) { return css.getPropertyValue(n).trim(); }

  var listEl = document.getElementById("stockList");
  var detailEl = document.getElementById("stockDetail");
  var searchEl = document.getElementById("stockSearch");

  var params = new URLSearchParams(location.search);
  var activeSymbol = params.get("symbol") || null;
  var companies = [];
  var searchTimer = null;
  var searchRun = 0;
  var detailRun = 0;
  var chartType = "line";
  var chartRange = "1M";

  init();

  async function init() {
    listEl.innerHTML = `<div class="text-muted-2 small p-2">Loading market movers...</div>`;
    detailEl.innerHTML = Finora.emptyState("Loading market data...", "bi-hourglass-split");
    searchEl.addEventListener("input", handleSearchInput);

    var initialSymbol = activeSymbol;
    if (initialSymbol) loadDetail(initialSymbol);

    try {
      companies = await FinoraAPI.getTrending();
    } catch (err) {
      companies = [];
    }

    if (!companies.length) {
      if (searchEl.value.trim()) {
        handleSearchInput();
      } else {
        listEl.innerHTML = `<div class="text-muted-2 small p-2">${FinoraAPI.isConfigured() ? Finora.API_UNAVAILABLE_MSG : "Search for a company to load market data."}</div>`;
      }
      if (!activeSymbol) {
        detailEl.innerHTML = FinoraAPI.isConfigured()
          ? Finora.apiUnavailableState()
          : marketConfigState();
      }
    } else {
      if (!activeSymbol) activeSymbol = companies[0].symbol;
      if (searchEl.value.trim()) {
        handleSearchInput();
      } else {
        renderList(companies);
      }
      if (!initialSymbol && activeSymbol) loadDetail(activeSymbol);
    }
  }

  function handleSearchInput() {
    var q = searchEl.value.trim().toLowerCase();
    clearTimeout(searchTimer);

    if (!q) {
      renderList(companies);
      return;
    }

    var filtered = companies.filter(function(c) {
      return c.symbol.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q);
    });
    renderList(filtered);

    if (q.length < 2) return;
    var run = ++searchRun;
    searchTimer = setTimeout(async function() {
      renderSearchStatus(filtered);
      try {
        var results = await FinoraAPI.searchCompanies(q, 8);
        if (run !== searchRun) return;
        renderList(mergeCompanies(filtered, results));
      } catch (err) {
        if (run !== searchRun) return;
        renderList(filtered);
        if (!filtered.length) {
          listEl.innerHTML = `<div class="text-muted-2 small p-2">${Finora.API_UNAVAILABLE_MSG}</div>`;
        }
      }
    }, 350);
  }

  /* --------------------------- Sidebar ---------------------------- */
  function renderList(items) {
    if (!items.length) {
      listEl.innerHTML = `<div class="text-muted-2 small p-2">No matches.</div>`;
      return;
    }

    listEl.innerHTML = items
      .map(function(c) {
        var price = c.price != null ? Finora.fmtMoney(c.price) : "--";
        var hasChange = Number.isFinite(c.change);
        var up = (c.change || 0) >= 0;
        var active = c.symbol === activeSymbol ? "active" : "";
        return `<button class="stock-list-item ${active}" data-symbol="${c.symbol}">
            ${Finora.tickerAvatar(c.symbol, { size: "sm", color: c.color })}
            <span class="flex-grow-1 text-start min-w-0">
              <span class="d-block fw-semibold text-white text-truncate">${c.symbol}</span>
              <span class="d-block text-muted-2 small text-truncate">${c.name || ""}</span>
            </span>
            <span class="text-end">
              <span class="d-block small fw-semibold text-white">${price}</span>
              <span class="d-block small ${up ? "text-bull" : "text-bear"}">${hasChange ? `${up ? "+" : ""}${c.change.toFixed(2)}%` : "--"}</span>
            </span>
          </button>`;
      })
      .join("");

    listEl.querySelectorAll("[data-symbol]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        activeSymbol = btn.dataset.symbol;
        var selected = items.find(function(item) { return item.symbol === activeSymbol; });
        if (selected && !companies.some(function(item) { return item.symbol === selected.symbol; })) companies.unshift(selected);
        renderList(items);
        loadDetail(activeSymbol);
        history.replaceState(null, "", "market.html?symbol=" + activeSymbol);
      });
    });
  }

  function renderSearchStatus(items) {
    renderList(items);
    listEl.insertAdjacentHTML(
      "afterbegin",
      `<div class="text-muted-2 small p-2" data-search-status><span class="spinner-border spinner-border-sm me-2"></span>Searching companies...</div>`
    );
  }

  function mergeCompanies(primary, secondary) {
    var bySymbol = new Map();
    var combined = primary.concat(secondary);
    combined.forEach(function(item) {
      if (item && item.symbol && !bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
    });
    return Array.from(bySymbol.values());
  }

  /* --------------------------- Detail ----------------------------- */
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
            ${Finora.tickerAvatar(s.symbol, { size: "lg", color: s.color })}
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
          <button class="btn btn-ghost" data-action="watch"><i class="bi bi-star me-1"></i>Watchlist</button>
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

  function bindActions(s) {
    detailEl.querySelectorAll("[data-action]").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var user = await Finora.authReady;
        if (!user) { location.href = "login.html?next=market.html"; return; }
        Finora.toast("Trading is not connected to a broker API yet (" + btn.dataset.action + " " + s.symbol + ").", "info");
      });
    });
  }
});
