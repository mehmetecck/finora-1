/* =====================================================================
   Finora — Home page logic
   Pulls live data from FinoraAPI. Renders empty states until the market
   data API is configured (js/core/api.js).
   ===================================================================== */

document.addEventListener("DOMContentLoaded", function() {
  var css = getComputedStyle(document.documentElement);
  function C(n) { return css.getPropertyValue(n).trim(); }

  loadTicker();
  loadIndices();
  loadTrending();
  loadHero();

  /* ------------------------- Ticker tape -------------------------- */
  async function loadTicker() {
    var tape = document.querySelector(".ticker-tape");
    var track = document.getElementById("tickerTrack");
    if (!track) return;
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

  /* -------------------------- Indices ----------------------------- */
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

  /* ----------------------- Trending table ------------------------- */
  async function loadTrending() {
    var body = document.getElementById("trendingBody");
    if (!body) return;
    try {
      var stocks = await FinoraAPI.getTrending();
      if (!stocks.length) { body.innerHTML = Finora.emptyRow(6, Finora.API_UNAVAILABLE_MSG); return; }
      body.innerHTML = stocks
        .map(function(s, i) {
          var up = s.change >= 0;
          return `<tr>
              <td>
                <div class="d-flex align-items-center gap-3">
                  ${Finora.tickerAvatar(s.symbol, { color: s.color })}
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
                <a href="market.html?symbol=${s.symbol}" class="btn btn-sm btn-outline-brand">Trade</a>
              </td>
            </tr>`;
        })
        .join("");
      stocks.forEach(function(s, i) {
        if (s.history) {
          FinoraChart.sparkline(document.getElementById("rowChart" + i), s.history, s.change >= 0 ? C("--bull") : C("--bear"), { responsive: false });
        }
      });
    } catch (err) {
      body.innerHTML = Finora.emptyRow(6, Finora.API_UNAVAILABLE_MSG);
    }
  }

  /* ------------------------- Hero card ---------------------------- */
  async function loadHero() {
    var card = document.getElementById("heroCard");
    if (!card) return;
    try {
      var trending = await FinoraAPI.getTrending();
      var symbol = trending[0] && trending[0].symbol;
      if (!symbol) throw new Error("no symbol");
      var s = await FinoraAPI.getStock(symbol);
      if (!s) throw new Error("no stock");

      var up = s.change >= 0;
      var heroAvatar = document.getElementById("heroAvatar");
      var heroLogo = Finora.logoFor(s.symbol);
      if (heroLogo) {
        heroAvatar.classList.add("has-logo");
        heroAvatar.style.background = "";
        heroAvatar.innerHTML = `<img src="${heroLogo}" alt="${s.symbol}" loading="lazy">`;
      } else {
        heroAvatar.classList.remove("has-logo");
        heroAvatar.textContent = s.symbol;
        heroAvatar.style.background = s.color || Finora.symbolColor(s.symbol);
      }
      document.getElementById("heroName").textContent = s.name;
      document.getElementById("heroMeta").textContent = `${s.exchange || ""} · ${s.symbol}`;
      document.getElementById("heroPrice").textContent = Finora.fmtMoney(s.price);
      var badge = document.getElementById("heroChange");
      badge.className = `badge ${up ? "badge-bull" : "badge-bear"}`;
      badge.innerHTML = `<i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${up ? "+" : ""}${s.change.toFixed(2)}%`;
      document.getElementById("heroStats").innerHTML =
        `<span>Open ${s.open != null ? s.open : "—"}</span><span>High ${s.high != null ? s.high : "—"}</span><span>Low ${s.low != null ? s.low : "—"}</span><span>Vol ${s.volume != null ? s.volume : "—"}</span>`;

      var history = await FinoraAPI.getHistory(symbol, "1M");
      if (history.length) {
        FinoraChart.line(document.getElementById("heroChart"), history, { color: C("--accent"), lineWidth: 2.5, fillAlpha: 0.35 });
      } else {
        document.getElementById("heroChartWrap").innerHTML = Finora.apiUnavailableState("bi-graph-up");
      }
    } catch (err) {
      document.getElementById("heroChartWrap").innerHTML = Finora.apiUnavailableState("bi-graph-up");
    }
  }
});
