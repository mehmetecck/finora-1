/* =====================================================================
   Finora — Home page logic
   Pulls live data from FinoraAPI. Renders empty states until the market
   data API is configured (js/core/api.js).
   ===================================================================== */

document.addEventListener("DOMContentLoaded", function() {
  var css = getComputedStyle(document.documentElement);
  function C(n) { return css.getPropertyValue(n).trim(); }

  loadTicker();
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
