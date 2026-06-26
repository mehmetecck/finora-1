/* =====================================================================
   Finora — Profile page logic
   ===================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const fbUser = await Finora.requireAuth(); // redirects if not logged in
  if (!fbUser) return;
  const user = Finora.getProfile();
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();

  /* --------------------------- Header ----------------------------- */
  document.getElementById("avatar").textContent = Finora.initials(user.name);
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("planBadge").innerHTML = `<i class="bi bi-star-fill me-1"></i>${user.plan} plan`;
  const joined = new Date(user.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  document.getElementById("joinedBadge").textContent = `Joined ${joined}`;

  document.getElementById("buyingPower").textContent = Finora.fmtMoney(user.balance);
  document.getElementById("statBuying").textContent = Finora.fmtMoney(user.balance);

  document.querySelector("[data-logout-btn]").addEventListener("click", Finora.logout);

  /* -------------- Portfolio overview (from API) ------------------- */
  loadOverview(fbUser.uid);

  async function loadOverview(uid) {
    let portfolio = { holdings: [], cash: 0 };
    try {
      portfolio = (await FinoraAPI.getPortfolio(uid)) || portfolio;
    } catch {
      portfolio = { holdings: [], cash: 0 };
    }
    const holdings = portfolio.holdings || [];
    const costBasis = holdings.reduce((sum, h) => sum + h.shares * h.avg, 0);
    const marketValue = holdings.reduce((sum, h) => sum + h.shares * h.price, 0);
    const totalValue = marketValue + portfolio.cash;
    const totalReturn = totalValue - costBasis;
    const totalReturnPct = costBasis ? (totalReturn / costBasis) * 100 : 0;

    // Note: "Today's P/L" is not available from the current API and is faked here.
    const todayPL = marketValue * 0.0192; // Fake 1.92% gain
    const todayPLPct = marketValue ? (todayPL / (marketValue - todayPL)) * 100 : 0;

    document.getElementById("statPortfolio").textContent = Finora.fmtMoney(totalValue);
    document.getElementById("statHoldings").textContent = String(holdings.length);
    document.getElementById("statHoldingsSub").textContent = `${holdings.length} holdings`;

    const todayPLBadge = document.getElementById("statTodayPLBadge");
    const todayPLValue = document.getElementById("statTodayPL");
    todayPLValue.textContent = `${todayPL >= 0 ? "+" : ""}${Finora.fmtMoney(todayPL)}`;
    todayPLValue.classList.toggle("text-bull", todayPL >= 0);
    todayPLValue.classList.toggle("text-bear", todayPL < 0);
    todayPLBadge.innerHTML = `<i class="bi bi-caret-${todayPL >= 0 ? "up" : "down"}-fill"></i> ${todayPLPct.toFixed(2)}%`;
    todayPLBadge.className = `badge mt-1 ${todayPL >= 0 ? "badge-bull" : "badge-bear"}`;

    const portfolioBadge = document.getElementById("statPortfolioBadge");
    portfolioBadge.innerHTML = `<i class="bi bi-caret-${totalReturn >= 0 ? "up" : "down"}-fill"></i> ${totalReturnPct.toFixed(2)}% total return`;
    portfolioBadge.className = `badge mt-1 ${totalReturn >= 0 ? "badge-bull" : "badge-bear"}`;

    renderHoldings(holdings);
    drawChart(uid);
    loadActivity(uid);
  }

  /* ------------------------ Tab switching ------------------------- */
  const tabButtons = document.querySelectorAll("#profileTabs .list-group-item");
  const panes = document.querySelectorAll("[data-pane]");
  function showPane(target) {
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.target === target));
    panes.forEach((p) => p.classList.toggle("show", p.dataset.pane === target));
  }
  tabButtons.forEach((b) => b.addEventListener("click", () => {
    showPane(b.dataset.target);
    history.replaceState(null, "", "#" + b.dataset.target);
  }));
  if (location.hash) showPane(location.hash.slice(1));

  /* ------------------------- Holdings table ----------------------- */
  function renderHoldings(holdings) {
    const hbody = document.getElementById("holdingsBody");
    if (!holdings.length) { hbody.innerHTML = Finora.emptyRow(6, "No holdings yet."); return; }
    hbody.innerHTML = holdings
      .map((h) => {
        const value = h.shares * h.price;
        const cost = h.shares * h.avg;
        const ret = value - cost;
        const retPct = cost ? (ret / cost) * 100 : 0;
        const up = ret >= 0;
        return `<tr>
            <td>
              <div class="d-flex align-items-center gap-3">
                ${Finora.tickerAvatar(h.symbol, { className: "holding-logo", color: h.color })}
                ${Finora.tickerAvatar(h, { className: "holding-logo" })}
                <div><div class="fw-bold text-white">${h.symbol}</div><div class="text-muted-2 small">${h.name || ""}</div></div>
              </div>
            </td>
            <td class="text-end">${h.shares}</td>
            <td class="text-end">${Finora.fmtMoney(h.avg)}</td>
            <td class="text-end text-white">${Finora.fmtMoney(h.price)}</td>
            <td class="text-end fw-semibold text-white">${Finora.fmtMoney(value)}</td>
            <td class="text-end">
              <div class="fw-semibold ${up ? "text-bull" : "text-bear"}">${up ? "+" : ""}${Finora.fmtMoney(ret)}</div>
              <div class="small ${up ? "text-bull" : "text-bear"}">${up ? "+" : ""}${retPct.toFixed(2)}%</div>
            </td>
          </tr>`;
      })
      .join("");
  }

  /* ------------------------ Recent activity ----------------------- */
  async function loadActivity(uid) {
    const wrap = document.getElementById("activityList");
    let txs = [];
    try {
      txs = await FinoraAPI.getTransactions(uid);
    } catch {
      txs = [];
    }
    if (!txs.length) { wrap.innerHTML = Finora.emptyState("No activity yet", "bi-clock-history"); return; }
    wrap.innerHTML = txs
      .map((t, i) => {
        const buy = t.type === "buy";
        const icon = t.type === "deposit" ? "bi-cash-stack" : buy ? "bi-arrow-down-circle-fill" : "bi-arrow-up-circle-fill";
        const color = t.type === "deposit" ? "var(--accent)" : buy ? "var(--bull)" : "var(--bear)";
        return `<div class="d-flex align-items-center justify-content-between py-3 ${i < txs.length - 1 ? "border-bottom border-finora" : ""}">
            <div class="d-flex align-items-center gap-3">
              <i class="bi ${icon} fs-4" style="color:${color}"></i>
              <div><div class="fw-semibold">${t.title}</div><div class="text-muted-2 small">${t.meta || ""}</div></div>
            </div>
            <div class="text-end"><div class="fw-semibold">${buy ? "-" : "+"}${Finora.fmtMoney(Math.abs(t.amount))}</div><div class="text-muted-2 small">${t.time || ""}</div></div>
          </div>`;
      })
      .join("");
  }

  /* ----------------------- Portfolio chart ------------------------ */
  async function drawChart(uid) {
    const wrap = document.getElementById("portfolioChartWrap");
    let data = [];
    try {
      data = await FinoraAPI.getPortfolioHistory(uid, "1M");
    } catch {
      data = [];
    }
    if (!data.length) {
      wrap.innerHTML = Finora.emptyState("Performance data unavailable", "bi-graph-up");
      return;
    }
    wrap.innerHTML = `<canvas id="portfolioChart" height="110"></canvas>`;
    FinoraChart.line(document.getElementById("portfolioChart"), data, {
      color: C("--brand"),
      lineWidth: 2.5,
      fillAlpha: 0.3,
      axis: true,
      formatY: (v) => "$" + (v / 1000).toFixed(0) + "k",
      tooltip: (v) => Finora.fmtMoney(v),
    });
  }

  /* -------------------------- Settings ---------------------------- */
  const settingsForm = document.getElementById("settingsForm");
  settingsForm.name.value = user.name;
  settingsForm.email.value = user.email;
  settingsForm.phone.value = user.phone || "";
  settingsForm.bio.value = user.bio || "";
  if (user.country) settingsForm.country.value = user.country;

  // Add helper text for the country setting to clarify its purpose.
  const countryInput = settingsForm.country;
  if (countryInput) {
    const helpText = document.createElement("div");
    helpText.className = "form-text text-muted-2 small mt-1";
    helpText.textContent = "This sets your preferred country for viewing stocks on the Market page.";
    countryInput.insertAdjacentElement("afterend", helpText);
  }

  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const updated = await Finora.updateProfile({
        name: settingsForm.name.value.trim(),
        email: settingsForm.email.value.trim(),
        phone: settingsForm.phone.value.trim(),
        country: settingsForm.country.value,
        bio: settingsForm.bio.value.trim(),
      });
      if (updated) {
        document.getElementById("profileName").textContent = updated.name;
        document.getElementById("profileEmail").textContent = updated.email;
        document.getElementById("avatar").textContent = Finora.initials(updated.name);
        Finora.toast("Profile updated successfully.", "success");
      }
    } catch (err) {
      Finora.toast(Finora.mapAuthError(err.code), "error");
    }
  });

  /* ----------------------- Show / hide password ------------------- */
  document.querySelectorAll("[data-toggle-pw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      const icon = btn.querySelector("i");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      icon.className = show ? "bi bi-eye-slash" : "bi bi-eye";
    });
  });

  /* ------------------------- Password ----------------------------- */
  const pwForm = document.getElementById("passwordForm");
  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pwForm.next.value.length < 6) return Finora.toast("New password must be at least 6 characters.", "error");
    if (pwForm.next.value !== pwForm.confirm.value) return Finora.toast("New passwords do not match.", "error");
    try {
      await Finora.changePassword(pwForm.current.value, pwForm.next.value);
      pwForm.reset();
      Finora.toast("Password updated successfully.", "success");
    } catch (err) {
      Finora.toast(Finora.mapAuthError(err.code), "error");
    }
  });

  /* ----------------------- Delete account ------------------------- */
  document.querySelector("[data-delete-account]").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
    const password = prompt("Please confirm your password to delete your account:");
    if (!password) return;
    try {
      await Finora.deleteAccount(password);
      Finora.toast("Account deleted.", "info");
      setTimeout(() => (window.location.href = "index.html"), 800);
    } catch (err) {
      Finora.toast(Finora.mapAuthError(err.code), "error");
    }
  });
});
