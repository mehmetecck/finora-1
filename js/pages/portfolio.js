/* =====================================================================
   Finora — Portfolio page logic
   Requires auth. Pulls holdings/transactions from FinoraAPI and renders
   empty states until the API/backend is connected.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  var user = await Finora.requireAuth();
  if (!user) return;

  var css = getComputedStyle(document.documentElement);
  function C(n) { return css.getPropertyValue(n).trim(); }

  var portfolio = { holdings: [], cash: 0 };

  try {
    portfolio = (await FinoraAPI.getPortfolio(user.uid)) || portfolio;
  } catch (err) {
    portfolio = { holdings: [], cash: 0 };
  }

  var holdings = portfolio.holdings || [];

  renderSummary(holdings, portfolio.cash || 0);
  renderHoldings(holdings);
  renderAllocation(holdings);
  loadPerformance(user.uid, "1W");
  loadTransactions(user.uid);

  document.querySelectorAll("#rangeBtns [data-range]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll("#rangeBtns .btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      loadPerformance(user.uid, btn.dataset.range);
    });
  });

  /* --------------------------- Summary ---------------------------- */
  function renderSummary(holdings, cash) {
    var value = holdings.reduce(function(sum, h) { return sum + h.shares * h.price; }, 0);
    var invested = holdings.reduce(function(sum, h) { return sum + h.shares * h.avg; }, 0);
    var totalReturn = invested ? ((value - invested) / invested) * 100 : 0;
    var todayPL = holdings.reduce(function(sum, h) { return sum + h.shares * h.price * ((h.dayChange || 0) / 100); }, 0);

    document.getElementById("totalValue").textContent = Finora.fmtMoney(value + cash);
    document.getElementById("buyingPower").textContent = Finora.fmtMoney(cash);
    document.getElementById("investedValue").textContent = Finora.fmtMoney(invested);
    document.getElementById("holdingsCount").textContent = holdings.length;

    var trBadge = document.getElementById("totalReturnBadge");
    var up = totalReturn >= 0;
    trBadge.className = `badge ${up ? "badge-bull" : "badge-bear"} mt-1`;
    trBadge.innerHTML = holdings.length
      ? `<i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${up ? "+" : ""}${totalReturn.toFixed(2)}%`
      : "—";

    document.getElementById("todayPL").textContent = Finora.fmtMoney(todayPL);
    var plBadge = document.getElementById("todayPLBadge");
    var plUp = todayPL >= 0;
    plBadge.className = `badge ${plUp ? "badge-bull" : "badge-bear"} mt-1`;
    plBadge.innerHTML = holdings.length ? `${plUp ? "+" : ""}${Finora.fmtMoney(todayPL)}` : "—";
  }

  /* -------------------------- Holdings ---------------------------- */
  function renderHoldings(holdings) {
    var body = document.getElementById("holdingsBody");
    if (!holdings.length) { body.innerHTML = Finora.emptyRow(7, "No holdings yet. Buy stocks to get started."); return; }
    body.innerHTML = holdings
      .map(function(h) {
        var value = h.shares * h.price;
        var ret = h.avg ? ((h.price - h.avg) / h.avg) * 100 : 0;
        var up = ret >= 0;
        return `<tr>
            <td>
              <div class="d-flex align-items-center gap-3">
                ${Finora.tickerAvatar(h, { size: "sm" })}
                <div><div class="fw-bold text-white">${h.symbol}</div><div class="text-muted-2 small">${h.name || ""}</div></div>
              </div>
            </td>
            <td class="text-end">${h.shares}</td>
            <td class="text-end d-none d-md-table-cell">${Finora.fmtMoney(h.avg)}</td>
            <td class="text-end">${Finora.fmtMoney(h.price)}</td>
            <td class="text-end fw-semibold">${Finora.fmtMoney(value)}</td>
            <td class="text-end ${up ? "text-bull" : "text-bear"}">${up ? "+" : ""}${ret.toFixed(2)}%</td>
            <td class="text-end"><a href="market.html?symbol=${h.symbol}" class="btn btn-sm btn-outline-brand">Trade</a></td>
          </tr>`;
      })
      .join("");
  }

  /* ------------------------- Allocation --------------------------- */
  function renderAllocation(holdings) {
    var legend = document.getElementById("allocLegend");
    var wrap = document.getElementById("allocWrap");
    if (!holdings.length) {
      wrap.innerHTML = Finora.emptyState("No allocation yet", "bi-pie-chart");
      legend.innerHTML = "";
      return;
    }
    var segments = holdings.map(function(h) {
      var colorMatch = h.color && h.color.match(/#[0-9a-f]{6}/i);
      return {
        label: h.symbol,
        value: h.shares * h.price,
        color: (colorMatch && colorMatch[0]) || "#14B8A6",
      };
    });
    FinoraChart.donut(document.getElementById("allocChart"), segments);
    var total = segments.reduce(function(s, x) { return s + x.value; }, 0);
    legend.innerHTML = segments
      .map(function(s) {
        return `<div class="d-flex justify-content-between align-items-center">
          <span class="d-flex align-items-center gap-2">
            <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block"></span>
            <span class="small fw-semibold">${s.label}</span>
          </span>
          <span class="small text-muted-2">${((s.value / total) * 100).toFixed(1)}%</span>
        </div>`;
      })
      .join("");
  }

  /* ------------------------ Performance --------------------------- */
  async function loadPerformance(uid, range) {
    var wrap = document.getElementById("perfWrap");
    var data = [];
    try {
      data = await FinoraAPI.getPortfolioHistory(uid, range);
    } catch (err) {
      wrap.innerHTML = Finora.apiUnavailableState("bi-graph-up");
      return;
    }
    if (!data.length) {
      wrap.innerHTML = Finora.emptyState("No performance data yet", "bi-graph-up");
      return;
    }
    wrap.innerHTML = `<canvas id="perfChart" height="240"></canvas>`;
    var up = data[data.length - 1] >= data[0];
    FinoraChart.line(document.getElementById("perfChart"), data, {
      color: up ? C("--bull") : C("--bear"),
      lineWidth: 2.5,
      fillAlpha: 0.25,
      axis: true,
      formatY: function(v) { return "$" + (v / 1000).toFixed(0) + "k"; },
      tooltip: function(v) { return Finora.fmtMoney(v); },
    });
  }

  /* ------------------------ Transactions -------------------------- */
  async function loadTransactions(uid) {
    var list = document.getElementById("txList");
    var txs = [];
    try {
      txs = await FinoraAPI.getTransactions(uid);
    } catch (err) {
      txs = [];
    }
    if (!txs.length) { list.innerHTML = Finora.emptyState("No transactions yet", "bi-receipt"); return; }
    list.innerHTML = txs
      .map(function(t) {
        var buy = t.type === "buy";
        return `<div class="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary-subtle">
            <div class="d-flex align-items-center gap-3">
              <span class="tx-icon ${buy ? "bull" : "bear"}"><i class="bi bi-arrow-${buy ? "down-left" : "up-right"}"></i></span>
              <div><div class="fw-semibold text-white">${t.title}</div><div class="text-muted-2 small">${t.meta || ""}</div></div>
            </div>
            <div class="text-end">
              <div class="fw-semibold ${buy ? "text-bear" : "text-bull"}">${buy ? "-" : "+"}${Finora.fmtMoney(Math.abs(t.amount))}</div>
              <div class="text-muted-2 small">${t.time || ""}</div>
            </div>
          </div>`;
      })
      .join("");
  }
});
