/* =====================================================================
   Finora — Home page logic
   Pulls live data from FinoraAPI. Renders empty states until the market
   data API is configured (js/core/api.js).
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();

  loadTicker();
  loadIndices();
  loadTrending();
  loadHero();

  /* ------------------------- Ticker tape -------------------------- */
  async function loadTicker() {
    const tape = document.querySelector(".ticker-tape");
    const track = document.getElementById("tickerTrack");
    if (!track) return;
    try {
      const stocks = await FinoraAPI.getTrending();
      if (!stocks.length) { tape.classList.add("d-none"); return; }
      if (stocks.every((s) => s.price == null)) { tape.classList.add("d-none"); return; }
      const item = (s) => {
        const up = s.change >= 0;
        return `<span class="ticker-item">
            <span class="sym">${s.symbol}</span>
            <span>${Finora.fmtMoney(s.price)}</span>
            <span class="${up ? "text-bull" : "text-bear"}">
              <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i>${Math.abs(s.change).toFixed(2)}%
            </span>
          </span>`;
      };
      track.innerHTML = stocks.map(item).join("").repeat(2);
    } catch {
      tape.classList.add("d-none");
    }
  }

  /* -------------------------- Indices ----------------------------- */
  async function loadIndices() {
    const row = document.getElementById("indicesRow");
    if (!row) return;
    try {
      const indices = await FinoraAPI.getIndices();
      if (!indices.length) { row.innerHTML = `<div class="col-12">${Finora.apiUnavailableState()}</div>`; return; }
      row.innerHTML = indices
        .map((idx, i) => {
          const up = idx.change >= 0;
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
      indices.forEach((idx, i) => {
        if (idx.history) {
          FinoraChart.sparkline(document.getElementById(`idxChart${i}`), idx.history, idx.change >= 0 ? C("--bull") : C("--bear"));
        }
      });
    } catch {
      row.innerHTML = `<div class="col-12">${Finora.apiUnavailableState()}</div>`;
    }
  }

  /* ----------------------- Trending table ------------------------- */
  async function loadTrending() {
    const body = document.getElementById("trendingBody");
    if (!body) return;
    try {
      const stocks = await FinoraAPI.getTrending();
      if (!stocks.length) { body.innerHTML = Finora.emptyRow(6, Finora.API_UNAVAILABLE_MSG); return; }
      body.innerHTML = stocks
        .map((s, i) => {
          const up = s.change >= 0;
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
      stocks.forEach((s, i) => {
        if (s.history) {
          FinoraChart.sparkline(document.getElementById(`rowChart${i}`), s.history, s.change >= 0 ? C("--bull") : C("--bear"), { responsive: false });
        }
      });
    } catch {
      body.innerHTML = Finora.emptyRow(6, Finora.API_UNAVAILABLE_MSG);
    }
  }

  /* ------------------------- Hero card ---------------------------- */
  async function loadHero() {
    const card = document.getElementById("heroCard");
    if (!card) return;
    try {
      const trending = await FinoraAPI.getTrending();
      const symbol = trending[0]?.symbol;
      if (!symbol) throw new Error("no symbol");
      const s = await FinoraAPI.getStock(symbol);
      if (!s) throw new Error("no stock");

      const up = s.change >= 0;
      const heroAvatar = document.getElementById("heroAvatar");
      const heroLogo = Finora.logoFor(s.symbol);
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
      const badge = document.getElementById("heroChange");
      badge.className = `badge ${up ? "badge-bull" : "badge-bear"}`;
      badge.innerHTML = `<i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${up ? "+" : ""}${s.change.toFixed(2)}%`;
      document.getElementById("heroStats").innerHTML =
        `<span>Open ${s.open ?? "—"}</span><span>High ${s.high ?? "—"}</span><span>Low ${s.low ?? "—"}</span><span>Vol ${s.volume ?? "—"}</span>`;

      const history = await FinoraAPI.getHistory(symbol, "1M");
      if (history.length) {
        FinoraChart.line(document.getElementById("heroChart"), history, { color: C("--accent"), lineWidth: 2.5, fillAlpha: 0.35 });
      } else {
        document.getElementById("heroChartWrap").innerHTML = Finora.apiUnavailableState("bi-graph-up");
      }
    } catch {
      document.getElementById("heroChartWrap").innerHTML = Finora.apiUnavailableState("bi-graph-up");
    }
  }
});
