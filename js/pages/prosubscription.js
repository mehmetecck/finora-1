/* =====================================================================
   Finora — Pricing / Premium page
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const plans = [
    {
      id: "Free", name: "Free", monthly: 0,
      tagline: "For getting started", featured: false,
      cta: "Your current plan",
      features: ["Real-time quotes", "Basic charts", "1 watchlist"],
    },
    {
      id: "Premium", name: "Premium", monthly: 14.99,
      tagline: "For professionals", featured: true,
      cta: "Upgrade to Premium",
      features: [
        "Everything in Free",
        "Advanced charts & indicators",
        "Unlimited watchlists",
        "AI insights & signals",
        "Level 2 market data",
        "Portfolio automation",
        "Options analytics",
        "API access",
      ],
    },
  ];

  let billing = "monthly"; // or "yearly" (20% off)
  const row = document.getElementById("plansRow");

  function priceFor(plan) {
    if (plan.monthly === 0) return { big: "$0", sub: "forever" };
    if (billing === "yearly") {
      const perMonth = plan.monthly * 0.8;
      return { big: `$${perMonth.toFixed(2)}`, sub: `/mo · billed $${(perMonth * 12).toFixed(0)}/yr` };
    }
    return { big: `$${plan.monthly.toFixed(2)}`, sub: "/mo" };
  }

  function render() {
    const current = (Finora.getProfile() && Finora.getProfile().plan) || "Free";
    row.innerHTML = plans
      .map((plan) => {
        const p = priceFor(plan);
        const isCurrent = plan.id === current;
        const cta = isCurrent ? "Current plan" : plan.cta;
        return `<div class="col-md-6 col-lg-5">
            <div class="card-finora plan-card h-100 p-4 ${plan.featured ? "featured" : ""}">
              ${plan.featured ? `<span class="badge badge-premium plan-badge">Most popular</span>` : ""}
              <h4 class="fw-bold mb-1">${plan.name}</h4>
              <p class="text-muted-2 mb-3">${plan.tagline}</p>
              <div class="mb-3">
                <span class="display-6 fw-bold">${p.big}</span>
                <span class="text-muted-2">${p.sub}</span>
              </div>
              <button class="btn ${plan.featured ? "btn-premium" : "btn-outline-brand"} w-100 mb-3"
                ${isCurrent ? "disabled" : ""} data-buy="${plan.id}">
                ${cta}
              </button>
              <ul class="list-unstyled d-grid gap-2 mb-0">
                ${plan.features
                  .map((f) => `<li class="d-flex align-items-start gap-2"><i class="bi bi-check-circle-fill text-brand mt-1"></i><span class="text-secondary-2">${f}</span></li>`)
                  .join("")}
              </ul>
            </div>
          </div>`;
      })
      .join("");

    row.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => buy(btn.dataset.buy));
    });
  }

  async function buy(planId) {
    const user = Finora.getProfile();
    if (!user) {
      Finora.toast("Please log in to upgrade.", "info");
      setTimeout(() => (window.location.href = "login.html?next=prosubscription.html"), 800);
      return;
    }
    // Demo checkout — just update the stored plan.
    await Finora.updateProfile({ plan: planId });
    Finora.toast(`You're now on the ${planId} plan! (demo)`, "success");
    render();
  }

  document.querySelectorAll("#billingToggle button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#billingToggle button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      billing = b.dataset.billing;
      render();
    });
  });

  // Wait for auth state so the "current plan" reflects the logged-in user.
  Finora.authReady.then(render);
});
