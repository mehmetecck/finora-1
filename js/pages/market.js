/* =====================================================================
   Finora - Market page logic
   Company list + detailed stock view, powered by FinoraAPI.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();

  const listEl = document.getElementById("stockList");
  const detailEl = document.getElementById("stockDetail");
  const searchEl = document.getElementById("stockSearch");

  const params = new URLSearchParams(location.search);
  let activeSymbol = params.get("symbol") || null;
  let companies = [];
  let searchTimer = null;
  let searchRun = 0;

  init();

  async function init() {
    listEl.innerHTML = `<div class="text-muted-2 small p-2">Loading market movers...</div>`;
    detailEl.innerHTML = Finora.emptyState("Loading market data...", "bi-hourglass-split");
    searchEl.addEventListener("input", handleSearchInput);

    if (activeSymbol) loadDetail(activeSymbol);

    try {
      companies = await FinoraAPI.getTrending();
    } catch {
      companies = [];
    }

    if (!companies.length) {
      if (searchEl.value.trim()) {
        handleSearchInput();
      } else {
        listEl.innerHTML = `<div class="text-muted-2 small p-2">Search for a company to load market data.</div>`;
      }
      if (!activeSymbol) {
        detailEl.innerHTML = FinoraAPI.isConfigured()
          ? Finora.emptyState("Search for a company to see market data.", "bi-search")
          : marketConfigState();
      }
    } else {
      if (!activeSymbol) activeSymbol = companies[0].symbol;
      if (searchEl.value.trim()) {
        handleSearchInput();
      } else {
        renderList(companies);
      }
      if (activeSymbol) loadDetail(activeSymbol);
    }

    if (activeSymbol && !companies.some((c) => c.symbol === activeSymbol)) loadDetail(activeSymbol);
  }

  function handleSearchInput() {
    const q = searchEl.value.trim().toLowerCase();
    clearTimeout(searchTimer);

    if (!q) {
      renderList(companies);
      return;
    }

    const filtered = companies.filter(
      (c) => c.symbol.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q)
    );
    renderList(filtered);

    if (q.length < 2) return;
    const run = ++searchRun;
    searchTimer = setTimeout(async () => {
      renderSearchStatus(filtered);
      try {
        const results = await FinoraAPI.searchCompanies(q, 8);
        if (run !== searchRun) return;
        renderList(mergeCompanies(filtered, results));
      } catch {
        if (run !== searchRun) return;
        renderList(filtered);
        if (!filtered.length) listEl.innerHTML = `<div class="text-muted-2 small p-2">Search unavailable right now.</div>`;
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
      .map((c) => {
        const price = c.price != null ? Finora.fmtMoney(c.price) : "--";
        const hasChange = Number.isFinite(c.change);
        const up = (c.change || 0) >= 0;
        const active = c.symbol === activeSymbol ? "active" : "";
        return `<button class="stock-list-item ${active}" data-symbol="${c.symbol}">
            <span class="ticker-avatar sm" style="background:${c.color || Finora.symbolColor(c.symbol)}">${c.symbol}</span>
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

    listEl.querySelectorAll("[data-symbol]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSymbol = btn.dataset.symbol;
        const selected = items.find((item) => item.symbol === activeSymbol);
        if (selected && !companies.some((item) => item.symbol === selected.symbol)) companies.unshift(selected);
        renderList(items);
        loadDetail(activeSymbol);
        history.replaceState(null, "", `market.html?symbol=${activeSymbol}`);
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
    const bySymbol = new Map();
    [...primary, ...secondary].forEach((item) => {
      if (item?.symbol && !bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
    });
    return [...bySymbol.values()];
  }

  /* --------------------------- Detail ----------------------------- */
  async function loadDetail(symbol) {
    detailEl.innerHTML = Finora.emptyState(`Loading ${symbol.toUpperCase()}...`, "bi-hourglass-split");
    let s;
    try {
      s = await FinoraAPI.getStock(symbol);
    } catch {
      s = null;
    }
    if (!s) {
      detailEl.innerHTML = FinoraAPI.isConfigured()
        ? Finora.emptyState(`Real market data for ${symbol.toUpperCase()} is unavailable right now.`, "bi-wifi-off")
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
        <div>Add a free Twelve Data key in <code>js/core/api.js</code> to enable quotes, charts, and history.</div>
      </div>`;
  }

  function renderDetail(s) {
    const up = s.change >= 0;
    detailEl.innerHTML = `
      <div class="card-finora p-4 mb-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div class="d-flex align-items-center gap-3">
            <span class="ticker-avatar lg" style="background:${s.color || Finora.symbolColor(s.symbol)}">${s.symbol}</span>
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
          <div class="btn-group btn-group-sm" id="rangeBtns">
            ${["1D", "1W", "1M", "1Y"].map((r) => `<button class="btn btn-ghost ${r === "1M" ? "active" : ""}" data-range="${r}">${r}</button>`).join("")}
          </div>
        </div>
        <div id="chartWrap"><canvas id="stockChart" height="260"></canvas></div>
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
    drawChart(s.symbol, "1M");
    loadHistory(s.symbol);
    loadNews(s.symbol);

    detailEl.querySelectorAll("#rangeBtns [data-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        detailEl.querySelectorAll("#rangeBtns .btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        drawChart(s.symbol, btn.dataset.range);
      });
    });
  }

  function renderKeyInfo(s) {
    const rows = [
      ["Open", s.open], ["Prev close", s.prevClose],
      ["Day high", s.high], ["Day low", s.low],
      ["52w high", s.high52], ["52w low", s.low52],
      ["Volume", s.volume], ["Avg volume", s.avgVol],
      ["Market cap", s.cap ? "$" + s.cap : null], ["P/E", s.pe],
      ["EPS", s.eps], ["Div yield", s.divYield != null ? s.divYield + "%" : null],
      ["Beta", s.beta],
    ];
    document.getElementById("keyInfo").innerHTML = rows
      .map(([k, v]) => `<div class="col-6">
          <div class="text-muted-2 small">${k}</div>
          <div class="fw-semibold">${v ?? "--"}</div>
        </div>`)
      .join("");
  }

  async function drawChart(symbol, range) {
    const wrap = document.getElementById("chartWrap");
    let data = [];
    try {
      data = await FinoraAPI.getHistory(symbol, range);
    } catch {
      data = [];
    }
    if (!data.length) {
      wrap.innerHTML = Finora.emptyState("Chart data unavailable", "bi-graph-up");
      return;
    }
    wrap.innerHTML = `<canvas id="stockChart" height="260"></canvas>`;
    const up = data[data.length - 1] >= data[0];
    FinoraChart.line(document.getElementById("stockChart"), data, {
      color: up ? C("--bull") : C("--bear"),
      lineWidth: 2.5,
      fillAlpha: 0.25,
      axis: true,
      formatY: (v) => "$" + v.toFixed(0),
      tooltip: (v) => Finora.fmtMoney(v),
    });
  }

  async function loadHistory(symbol) {
    const body = document.getElementById("historyBody");
    let data = [];
    try {
      data = await FinoraAPI.getHistory(symbol, "1M");
    } catch {
      data = [];
    }
    if (!data.length) { body.innerHTML = Finora.emptyRow(3); return; }
    const today = new Date();
    const rows = data.slice(-10).reverse();
    body.innerHTML = rows
      .map((close, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const prev = rows[i + 1];
        const chg = prev != null ? ((close - prev) / prev) * 100 : 0;
        const up = chg >= 0;
        return `<tr>
            <td class="text-muted-2">${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
            <td class="text-end fw-semibold">${Finora.fmtMoney(close)}</td>
            <td class="text-end d-none d-md-table-cell ${up ? "text-bull" : "text-bear"}">${up ? "+" : ""}${chg.toFixed(2)}%</td>
          </tr>`;
      })
      .join("");
  }

  async function loadNews(symbol) {
    const wrap = document.getElementById("newsList");
    let news = [];
    try {
      news = await FinoraAPI.getNews(symbol);
    } catch {
      news = [];
    }
    if (!news.length) { wrap.innerHTML = Finora.emptyState("No news available", "bi-newspaper"); return; }
    wrap.innerHTML = news
      .map(
        (n) => `<a href="${n.url || "#"}" class="news-item d-flex gap-3 text-decoration-none" target="_blank" rel="noopener">
          <div class="news-tag">${n.tag || "News"}</div>
          <div class="min-w-0">
            <div class="fw-semibold text-white text-truncate">${n.title}</div>
            <div class="text-muted-2 small">${n.source || ""}${n.time ? " - " + n.time : ""}</div>
          </div>
        </a>`
      )
      .join("");
  }

  function bindActions(s) {
    detailEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const user = await Finora.authReady;
        if (!user) { location.href = "login.html?next=market.html"; return; }
        Finora.toast(`Trading is not connected to a broker API yet (${btn.dataset.action} ${s.symbol}).`, "info");
      });
    });
  }
});
