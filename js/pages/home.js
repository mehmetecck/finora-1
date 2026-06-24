/* =====================================================================
   Finora — Home dashboard logic
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  var user = await Finora.requireAuth();
  if (!user) return;
  var profile = Finora.getProfile();

  renderGreeting(profile);
  renderWatchlistStats(profile);
  loadPortfolioStat(user);
  loadTrendingPreview();
  loadWatchlistPreview(profile);
  loadIndicesPreview();

  function renderGreeting(profile) {
    var greetingEl = document.getElementById("dashGreeting");
    var subEl = document.getElementById("dashSub");
    var firstName = profile.name ? profile.name.split(" ")[0] : "there";
    greetingEl.textContent = "Welcome back, " + firstName;
    subEl.textContent = "Here is your Finora summary for today.";
  }

  function renderWatchlistStats(profile) {
    var count = Finora.getWatchlist(profile.uid).length;
    document.getElementById("statWatchlist").textContent = String(count);
  }

  async function loadPortfolioStat(user) {
    var valueEl = document.getElementById("statPortfolio");
    var subEl = document.getElementById("statPortfolioSub");
    try {
      var portfolio = await FinoraAPI.getPortfolio(user.uid);
      var holdings = portfolio.holdings || [];
      var cash = portfolio.cash || 0;
      var value = holdings.reduce(function(sum, h) { return sum + h.shares * h.price; }, 0) + cash;
      valueEl.textContent = Finora.fmtMoney(value);
      subEl.textContent = holdings.length ? holdings.length + " holdings" : "No holdings yet";
    } catch (err) {
      valueEl.textContent = Finora.fmtMoney(0);
      subEl.textContent = "No holdings yet";
    }
  }

  async function loadTrendingPreview() {
    var wrap = document.getElementById("dashTrending");
    var statEl = document.getElementById("statTrending");
    try {
      var stocks = await FinoraAPI.getTrending();
      if (!stocks.length) throw new Error("empty");
      statEl.textContent = String(stocks.length);
      wrap.innerHTML = stocks.slice(0, 5).map(function(s) {
        var up = (s.change || 0) >= 0;
        return `<a href="market.html?symbol=${s.symbol}" class="dash-list-item">
            ${Finora.tickerAvatar(s.symbol, { size: "sm", color: s.color })}
            <span class="flex-grow-1 min-w-0">
              <span class="d-block fw-semibold text-white text-truncate">${s.symbol}</span>
              <span class="d-block text-muted-2 small text-truncate">${s.name || ""}</span>
            </span>
            <span class="text-end">
              <span class="d-block fw-semibold text-white">${s.price != null ? Finora.fmtMoney(s.price) : "—"}</span>
              <span class="d-block small ${up ? "text-bull" : "text-bear"}">${s.change != null ? (up ? "+" : "") + s.change.toFixed(2) + "%" : "—"}</span>
            </span>
          </a>`;
      }).join("");
    } catch (err) {
      statEl.textContent = "—";
      wrap.innerHTML = Finora.emptyState(Finora.API_UNAVAILABLE_MSG, "bi-graph-up");
    }
  }

  async function loadWatchlistPreview(profile) {
    var wrap = document.getElementById("dashWatchlist");
    var items = Finora.getWatchlist(profile.uid);
    if (!items.length) {
      wrap.innerHTML = `<div class="text-center text-muted-2 py-4">
          <i class="bi bi-star d-block mb-2" style="font-size:1.6rem;opacity:.55"></i>
          <div class="mb-2">No stocks saved yet</div>
          <a href="market.html" class="btn btn-sm btn-brand">Browse market</a>
        </div>`;
      return;
    }

    wrap.innerHTML = `<div class="text-muted-2 small py-3">Loading watchlist…</div>`;
    var rows = [];
    var slice = items.slice(0, 5);
    for (var i = 0; i < slice.length; i++) {
      var item = slice[i];
      var symbol = typeof item === "string" ? item : item.symbol;
      var name = typeof item === "string" ? symbol : (item.name || symbol);
      var quote = null;
      try {
        quote = await FinoraAPI.getStock(symbol);
      } catch (err) {
        quote = null;
      }
      rows.push({
        symbol: symbol,
        name: quote && quote.name ? quote.name : name,
        price: quote ? quote.price : null,
        change: quote ? quote.change : null,
      });
    }

    wrap.innerHTML = rows.map(function(s) {
      var up = (s.change || 0) >= 0;
      var hasChange = s.change != null && Number.isFinite(s.change);
      return `<a href="watchlist.html?symbol=${encodeURIComponent(s.symbol)}" class="dash-list-item">
          ${Finora.tickerAvatar(s.symbol, { size: "sm" })}
          <span class="flex-grow-1 min-w-0">
            <span class="d-block fw-semibold text-white text-truncate">${s.symbol}</span>
            <span class="d-block text-muted-2 small text-truncate">${s.name}</span>
          </span>
          <span class="text-end">
            <span class="d-block fw-semibold text-white">${s.price != null ? Finora.fmtMoney(s.price) : "—"}</span>
            <span class="d-block small ${hasChange ? (up ? "text-bull" : "text-bear") : "text-muted-2"}">${hasChange ? (up ? "+" : "") + s.change.toFixed(2) + "%" : "—"}</span>
          </span>
        </a>`;
    }).join("");
  }

  async function loadIndicesPreview() {
    var row = document.getElementById("dashIndices");
    var statEl = document.getElementById("statIndices");
    var subEl = document.getElementById("statIndicesSub");
    try {
      var indices = await FinoraAPI.getIndices();
      if (!indices.length) throw new Error("empty");
      statEl.textContent = String(indices.length);
      var avg = indices.reduce(function(sum, idx) { return sum + (idx.change || 0); }, 0) / indices.length;
      subEl.textContent = (avg >= 0 ? "+" : "") + avg.toFixed(2) + "% avg today";
      row.innerHTML = indices.map(function(idx) {
        var up = (idx.change || 0) >= 0;
        return `<div class="col-6 col-lg-3">
            <div class="dash-index-card">
              <div class="text-muted-2 small fw-semibold mb-1">${idx.name}</div>
              <div class="fs-5 fw-bold mb-1">${idx.value != null ? Finora.fmtNumber(idx.value) : "—"}</div>
              <span class="badge ${up ? "badge-bull" : "badge-bear"}">
                <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${idx.change != null ? Math.abs(idx.change).toFixed(2) + "%" : "—"}
              </span>
            </div>
          </div>`;
      }).join("");
    } catch (err) {
      statEl.textContent = "—";
      subEl.textContent = "Unavailable";
      row.innerHTML = `<div class="col-12">${Finora.apiUnavailableState()}</div>`;
    }
  }
});
