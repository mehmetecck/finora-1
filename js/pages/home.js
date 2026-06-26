/* =====================================================================
   Finora — Home dashboard logic
   Pulls live data from FinoraAPI. Renders empty states until the market
   data API is configured (js/core/api.js).
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  // First, ensure the user is authenticated. If not, they will be redirected.
  const fbUser = await Finora.requireAuth();
  if (!fbUser) return;

  // Get the normalized user profile, which contains name, plan, etc.
  const profile = Finora.getProfile();

  checkAndSetLocation(profile);

  renderGreeting(profile);
  renderWatchlistStats(profile);
  loadPortfolioStat(profile);
  loadTrendingPreview();
  loadWatchlistPreview(profile);
  loadIndicesPreview();

  /**
   * Checks if the user's country is set, and if not, prompts for geolocation
   * to set it automatically. This is a one-time operation.
   * @param {object} profile The user's profile object.
   */
  function checkAndSetLocation(profile) {
    const askedForLocation = localStorage.getItem("finora_location_prompted");

    // Only ask if country isn't set and we haven't prompted before.
    if (profile && !profile.country && !askedForLocation) {
      localStorage.setItem("finora_location_prompted", "true"); // Ask only once

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            // On success, use a reverse geocoding API to get the country.
            // NOTE: This example uses a free public API. A production app
            // should use a robust service with an API key (e.g., Google, Mapbox).
            try {
              const { latitude, longitude } = position.coords;
              const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
              const data = await response.json();

              if (data && data.address && data.address.country_code) {
                const countryCode = data.address.country_code.toUpperCase();
                await Finora.updateProfile({ country: countryCode });
                Finora.toast(`Location set to ${countryCode}. You can change this in your profile.`, "info");
              }
            } catch (error) {
              console.error("Reverse geocoding failed:", error);
            }
          },
          (error) => {
            // User denied permission or an error occurred. Do nothing.
            console.warn(`Geolocation error (${error.code}): ${error.message}`);
          }
        );
      }
    }
  }

  /**
   * Personalizes the dashboard greeting with the user's first name.
   */
  function renderGreeting(profile) {
    const greetingEl = document.getElementById("dashGreeting");
    const subEl = document.getElementById("dashSub");
    if (greetingEl && subEl && profile) {
      const firstName = profile.name ? profile.name.split(" ")[0] : "there";
      greetingEl.textContent = `Welcome back, ${firstName}`;
      subEl.textContent = "Here is your Finora summary for today.";
      greetingEl.classList.remove("loading");
    }
  }

  /**
   * Updates the "Watchlist" stat card with the number of saved symbols.
   */
  function renderWatchlistStats(profile) {
    if (profile) {
      const count = Finora.getWatchlist(profile.uid).length;
      document.getElementById("statWatchlist").textContent = String(count);
    }
  }

  /**
   * Fetches portfolio data to populate the "Portfolio value" stat card.
   * Note: This is a placeholder as the API currently returns empty data.
   */
  async function loadPortfolioStat(profile) {
    const valueEl = document.getElementById("statPortfolio");
    const subEl = document.getElementById("statPortfolioSub");
    try {
      const portfolio = await FinoraAPI.getPortfolio(profile.uid);
      const holdings = portfolio.holdings || [];
      const cash = portfolio.cash || 0;
      const value = holdings.reduce((sum, h) => sum + h.shares * h.price, 0) + cash;
      valueEl.textContent = Finora.fmtMoney(value);
      subEl.textContent = holdings.length ? `${holdings.length} holdings` : "No holdings yet";
    } catch (err) {
      valueEl.textContent = Finora.fmtMoney(0);
      subEl.textContent = "No holdings yet";
    }
  }

  /**
   * Fetches trending stocks and populates the "Market snapshot" card.
   */
  async function loadTrendingPreview() {
    const wrap = document.getElementById("dashTrending");
    const statEl = document.getElementById("statTrending");
    try {
      const stocks = await FinoraAPI.getTrending();
      if (!stocks.length) throw new Error("empty");
      statEl.textContent = String(stocks.length);
      wrap.innerHTML = stocks
        .slice(0, 5)
        .map((s) => {
          const up = (s.change || 0) >= 0;
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
        })
        .join("");
    } catch (err) {
      statEl.textContent = "—";
      wrap.innerHTML = Finora.emptyState(Finora.API_UNAVAILABLE_MSG, "bi-graph-up");
    }
  }

  /**
   * Fetches quotes for the user's watchlist and populates the "Your watchlist" card.
   */
  async function loadWatchlistPreview(profile) {
    const wrap = document.getElementById("dashWatchlist");
    const items = Finora.getWatchlist(profile.uid);
    if (!items.length) {
      wrap.innerHTML = `<div class="text-center text-muted-2 py-4">
          <i class="bi bi-star d-block mb-2" style="font-size:1.6rem;opacity:.55"></i>
          <div class="mb-2">No stocks saved yet</div>
          <a href="market.html" class="btn btn-sm btn-brand">Browse market</a>
        </div>`;
      return;
    }

    wrap.innerHTML = `<div class="text-muted-2 small py-3">Loading watchlist…</div>`;
    const quotePromises = items.slice(0, 5).map(async (item) => {
      const symbol = typeof item === "string" ? item : item.symbol;
      try {
        return await FinoraAPI.getStock(symbol);
      } catch {
        return { symbol, name: item.name || symbol, price: null, change: null };
      }
    });
    const rows = await Promise.all(quotePromises);

    wrap.innerHTML = rows
      .map((s) => {
        const up = (s.change || 0) >= 0;
        const hasChange = s.change != null && Number.isFinite(s.change);
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
      })
      .join("");
  }

  /**
   * Fetches major market indices and populates the "Major indices" section.
   */
  async function loadIndicesPreview() {
    const row = document.getElementById("dashIndices");
    const statEl = document.getElementById("statIndices");
    const subEl = document.getElementById("statIndicesSub");
    try {
      const indices = await FinoraAPI.getIndices();
      if (!indices.length) throw new Error("empty");
      statEl.textContent = String(indices.length);
      const avg = indices.reduce((sum, idx) => sum + (idx.change || 0), 0) / indices.length;
      subEl.textContent = `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}% avg today`;
      row.innerHTML = indices
        .map((idx) => {
          const up = (idx.change || 0) >= 0;
          return `<div class="col-6 col-lg-3">
            <div class="dash-index-card">
              <div class="text-muted-2 small fw-semibold mb-1">${idx.name}</div>
              <div class="fs-5 fw-bold mb-1">${idx.value != null ? Finora.fmtNumber(idx.value) : "—"}</div>
              <span class="badge ${up ? "badge-bull" : "badge-bear"}">
                <i class="bi bi-caret-${up ? "up" : "down"}-fill"></i> ${idx.change != null ? Math.abs(idx.change).toFixed(2) + "%" : "—"}
              </span>
            </div>
          </div>`;
        })
        .join("");
    } catch (err) {
      statEl.textContent = "—";
      subEl.textContent = "Unavailable";
      row.innerHTML = `<div class="col-12">${Finora.apiUnavailableState()}</div>`;
    }
  }
});
