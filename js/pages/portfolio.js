/* =====================================================================
   Finora — Portfolio page logic
   Requires auth. Pulls holdings/transactions from FinoraAPI and renders
   empty states until the API/backend is connected.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const user = await Finora.requireAuth();
  if (!user) return;

  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();

  let portfolio = { holdings: [], cash: 0 };

  try {
    portfolio = (await FinoraAPI.getPortfolio(user.uid)) || portfolio;
  } catch {
    portfolio = { holdings: [], cash: 0 };
  }

  const holdings = portfolio.holdings || [];

  renderSummary(holdings, portfolio.cash || 0);
  renderHoldings(holdings);
  renderAllocation(holdings);
  loadPerformance(user.uid, "1W");
  loadTransactions(user.uid);

  document.querySelectorAll("#rangeBtns [data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#rangeBtns .btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadPerformance(user.uid, btn.dataset.range);
    });
  });

  /* --------------------------- Summary ---------------------------- */
  function renderSummary(holdings, cash) {
    const value = holdings.reduce((sum, h) => sum + h.shares * h.price, 0);
    const invested = holdings.reduce((sum, h) => sum + h.shares * h.avg, 0);
    const totalReturn = invested ? ((value - invested) / invested) * 100 : 0;
    const todayPL = holdings.reduce((sum, h) => sum + h.shares * h.price * ((h.dayChange || 0) / 100), 0);

    document.getElementById("totalValue").textContent = Finora.fmtMoney(value + cash);
    document.getElementById("buyingPower").textContent = Finora.fmtMoney(cash);
    document.getElementById("investedValue").textContent = Finora.fmtMoney(invested);
    document.getElementById("holdingsCount").textContent = holdings.length;

    const trBadge = document.getElementById("totalReturnBadge");
    const up = totalReturn >= 0;
    trBadge.className = `badge ${up ? "badge-bull" : "badge-bear"} mt-1`;
    trBadge.innerHTML = holdings.length
      ? `<i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${up ? "+" : ""}${totalReturn.toFixed(2)}%`
      : "—";

    document.getElementById("todayPL").textContent = Finora.fmtMoney(todayPL);
    const plBadge = document.getElementById("todayPLBadge");
    const plUp = todayPL >= 0;
    plBadge.className = `badge ${plUp ? "badge-bull" : "badge-bear"} mt-1`;
    plBadge.innerHTML = holdings.length ? `${plUp ? "+" : ""}${Finora.fmtMoney(todayPL)}` : "—";
  }

  /* -------------------------- Holdings ---------------------------- */
  function renderHoldings(holdings) {
    const body = document.getElementById("holdingsBody");
    if (!holdings.length) { body.innerHTML = Finora.emptyRow(7, "No holdings yet. Buy stocks to get started."); return; }
    body.innerHTML = holdings
      .map((h) => {
        const value = h.shares * h.price;
        const ret = h.avg ? ((h.price - h.avg) / h.avg) * 100 : 0;
        const up = ret >= 0;
        return `<tr>
            <td>
              <div class="d-flex align-items-center gap-3">
                ${Finora.tickerAvatar(h.symbol, { size: "sm", color: h.color })}
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
    const legend = document.getElementById("allocLegend");
    const wrap = document.getElementById("allocWrap");
    if (!holdings.length) {
      wrap.innerHTML = Finora.emptyState("No allocation yet", "bi-pie-chart");
      legend.innerHTML = "";
      return;
    }
    const segments = holdings.map((h) => ({
      label: h.symbol,
      value: h.shares * h.price,
      color: (h.color && h.color.match(/#[0-9a-f]{6}/i)?.[0]) || "#14B8A6",
    }));
    FinoraChart.donut(document.getElementById("allocChart"), segments);
    const total = segments.reduce((s, x) => s + x.value, 0);
    legend.innerHTML = segments
      .map(
        (s) => `<div class="d-flex justify-content-between align-items-center">
          <span class="d-flex align-items-center gap-2">
            <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block"></span>
            <span class="small fw-semibold">${s.label}</span>
          </span>
          <span class="small text-muted-2">${((s.value / total) * 100).toFixed(1)}%</span>
        </div>`
      )
      .join("");
  }

  /* ------------------------ Performance --------------------------- */
  async function loadPerformance(uid, range) {
    const wrap = document.getElementById("perfWrap");
    let data = [];
    try {
      data = await FinoraAPI.getPortfolioHistory(uid, range);
    } catch {
      data = [];
    }
    if (!data.length) {
      wrap.innerHTML = Finora.emptyState("Performance data unavailable", "bi-graph-up");
      return;
    }
    wrap.innerHTML = `<canvas id="perfChart" height="240"></canvas>`;
    const up = data[data.length - 1] >= data[0];
    FinoraChart.line(document.getElementById("perfChart"), data, {
      color: up ? C("--bull") : C("--bear"),
      lineWidth: 2.5,
      fillAlpha: 0.25,
      axis: true,
      formatY: (v) => "$" + (v / 1000).toFixed(0) + "k",
      tooltip: (v) => Finora.fmtMoney(v),
    });
  }

  /* ------------------------ Transactions -------------------------- */
  async function loadTransactions(uid) {
    const list = document.getElementById("txList");
    let txs = [];
    try {
      txs = await FinoraAPI.getTransactions(uid);
    } catch {
      txs = [];
    }
    if (!txs.length) { list.innerHTML = Finora.emptyState("No transactions yet", "bi-receipt"); return; }
    list.innerHTML = txs
      .map((t) => {
        const buy = t.type === "buy";
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
